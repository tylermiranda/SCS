import * as cheerio from 'cheerio';
import { Buffer } from 'node:buffer';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const BASE_URL = 'https://ssc.sedgwickcounty.org/propertytax';

const DEFAULT_SEARCH_QUERY = '800-1100 N Cedar Brook';
const DELAY_MS = 400; // Delay to be polite to the server

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let cookiesMap = new Map();

export async function fetchWithCookies(url, options = {}) {
  const headers = { ...options.headers };
  const cookieStr = Array.from(cookiesMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookieStr) headers['Cookie'] = cookieStr;

  const res = await fetch(url, { ...options, headers, redirect: 'manual' });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const cookies = res.headers.getSetCookie();
    cookies.forEach(c => {
      const parts = c.split(';')[0].split('=');
      if (parts.length >= 2) {
        cookiesMap.set(parts[0], parts.slice(1).join('='));
      }
    });
  }
  return res;
}
export async function acceptDisclaimer() {
  let res = await fetchWithCookies(`${BASE_URL}/`);
  if (res.status === 302) {
    const location = res.headers.get('location');
    const redirectUrl = new URL(location, BASE_URL).href;
    
    res = await fetchWithCookies(redirectUrl);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const viewState = $('#__VIEWSTATE').val();
    const viewStateGen = $('#__VIEWSTATEGENERATOR').val();
    const eventValidation = $('#__EVENTVALIDATION').val();
    
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState || '');
    formData.append('__VIEWSTATEGENERATOR', viewStateGen || '');
    formData.append('__EVENTVALIDATION', eventValidation || '');
    formData.append('ctl00$mainContentPlaceHolder$acceptButton', 'I accept the above terms');
    
    await fetchWithCookies(redirectUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': redirectUrl
      }
    });
  }
}

export async function scrapeSearchResults(query) {
  const allProperties = [];
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/?q=${encodeURIComponent(query)}&type=Real${pageNum > 1 ? `&page=${pageNum}` : ''}`;
    const res = await fetchWithCookies(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const properties = [];
    $('table.table-striped tbody tr').each((i, row) => {
      const link = $(row).find('a[href*="realproperty.aspx?pin="]');
      if (!link.length) return;
      
      const href = link.attr('href');
      const pinMatch = href.match(/pin=(\d+)/);
      if (!pinMatch) return;

      const cells = $(row).find('td');
      const address = $(cells[0]).text().replace(/\s+/g, ' ').trim();
      const owner = $(cells[1]).text().replace(/\s+/g, ' ').trim();
      
      const appraisalValueEl = $(row).find('td[id^="appraisalValue_"]');
      const currentAppraisal = appraisalValueEl.text().trim();

      properties.push({
        pin: pinMatch[1],
        address,
        owner,
        currentAppraisal,
      });
    });

    for (const prop of properties) {
      if (!allProperties.find(p => p.pin === prop.pin)) {
        allProperties.push(prop);
      }
    }

    const nextPageLink = $(`a.page-link[href*="page=${pageNum + 1}"]`);
    if (nextPageLink.length > 0) {
      pageNum++;
      await sleep(DELAY_MS);
    } else {
      hasMore = false;
    }
  }

  return allProperties;
}

export async function scrapePropertyValues(pin) {
  const url = `${BASE_URL}/realpropertyvalues.aspx?pin=${encodeURIComponent(pin)}`;
  const res = await fetchWithCookies(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  function parseCurrency(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[$,\s]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  }

  function parseTable(tableEl) {
    if (!tableEl.length) return [];
    const records = [];
    const rows = tableEl.find('> tbody > tr');

    rows.each((i, row) => {
      const allCells = $(row).find('> td, > th');
      if (allCells.length < 3) return;

      const yearText = $(allCells[0]).text().trim();
      const year = parseInt(yearText, 10);
      if (isNaN(year)) return;

      const classType = $(allCells[1]).text().trim();
      const valuesCell = $(allCells[2]);
      const nestedTable = valuesCell.find('table');

      let land = 0, improvements = 0, total = 0, change = null;

      if (nestedTable.length) {
        const nestedRows = nestedTable.find('tr');
        nestedRows.each((ni, nRow) => {
          const nAllCells = $(nRow).find('td, th');
          if (nAllCells.length < 2) return;

          const valueStr = $(nAllCells[0]).text().trim();
          const labelStr = $(nAllCells[1]).text().trim().toLowerCase();
          
          const value = parseCurrency(valueStr);

          if (labelStr.includes('land')) {
            land = value;
          } else if (labelStr.includes('improvement')) {
            improvements = value;
          } else if (labelStr.includes('total')) {
            total = value;
            if (nAllCells.length >= 3) {
              const changeMatch = $(nAllCells[2]).text().match(/([+-]?\d+)%/);
              change = changeMatch ? changeMatch[0] : null;
            }
          }
        });
      }

      records.push({ year, class: classType, land, improvements, total, change });
    });

    return records;
  }

  const tables = $('table.table-striped');
  return {
    appraisals: parseTable(tables.eq(0)),
    assessments: parseTable(tables.eq(1)),
  };
}

export async function scrapeTaxBill(pin) {
  const url = `${BASE_URL}/billsandauthorities.aspx?pin=${encodeURIComponent(pin)}&type=Real`;
  const res = await fetchWithCookies(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  function parseCurrency(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  let taxBill = null;
  
  // The first table usually contains the tax history
  const rows = $('table.table-striped tbody tr');
  rows.each((i, row) => {
    // Only grab the first valid tax year we see (most recent)
    if (taxBill) return;
    
    const cells = $(row).find('td, th');
    if (cells.length >= 7) {
      const yearText = $(cells[0]).text().trim();
      const year = parseInt(yearText, 10);
      
      if (!isNaN(year) && year > 2000) {
        // usually format is: Tax Year, Tax Rate, General Tax, Specials, Tax Interest, Fees, Total, Paid, Balance
        // We look for 'Total' which is typically index 6 or the last few. Let's just find the first valid year.
        // Let's assume the columns based on typical Sedgwick layout: 
        // 0: Year, 1: Rate, 2: Gen Tax, 3: Specials, 4: Interest, 5: Fees, 6: Total
        const amountStr = $(cells[6]).text().trim();
        const amount = parseCurrency(amountStr);
        const rate = parseFloat($(cells[1]).text().trim()) || 0;
        const genTax = parseCurrency($(cells[2]).text().trim());
        const specials = parseCurrency($(cells[3]).text().trim());
        if (amount > 0) {
          taxBill = {
            year,
            amount,
            rate,
            genTax,
            specials
          };
        }
      }
    }
  });

  return taxBill;
}

export async function scrapeComparableSales(pin) {
  try {
    // Prime the ASP.NET session with the property
    const propUrl = `${BASE_URL}/realproperty.aspx?pin=${encodeURIComponent(pin)}`;
    await fetchWithCookies(propUrl);

    const reportsUrl = `${BASE_URL}/RealPropertyReports.aspx?pin=${encodeURIComponent(pin)}`;
    const reportsRes = await fetchWithCookies(reportsUrl);
    const reportsHtml = await reportsRes.text();
    const $r = cheerio.load(reportsHtml);
    let pdfUrl = '';
    $r('a').each((i, el) => {
      if ($r(el).text().trim() === 'Residential Comparable Sales Report') {
        pdfUrl = $r(el).attr('href');
      }
    });

    if (!pdfUrl) return null;
    if (!pdfUrl.startsWith('http')) pdfUrl = new URL(pdfUrl, BASE_URL).href;

    const pdfRes = await fetchWithCookies(pdfUrl, {
      headers: {
        'Referer': reportsUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      }
    });
    
    if (pdfRes.status !== 200) {
      console.warn(`Warning: PDF fetch returned status ${pdfRes.status} for URL: ${pdfUrl}`);
      return null;
    }

    const buffer = await pdfRes.arrayBuffer();
    const str = Buffer.from(buffer).toString('binary');
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/gm;
    let match;
    let text = "";

    while ((match = streamRegex.exec(str)) !== null) {
      try {
        const inflated = zlib.inflateSync(Buffer.from(match[1], "binary")).toString("binary");
        const textMatches = inflated.match(/\((?:[^)(]|\\[)(])*\)/g);
        if (textMatches) {
          text += textMatches.map(m => m.slice(1, -1).replace(/\\(\(|\))/g, "$1")).join(" ") + "\n";
        }
      } catch(e) {
        text += `[zlib error: ${e.message}] `;
      }
    }

    const compSales = {
      comps: [],
      avgMktAdjSalePrice: 0,
      compSalesValue: null
    };

    const quickRefMatch = text.match(/((?:R\d+\s*)+)Quick Ref#/);
    const yearBuiltMatch = text.match(/((?:\d{4}\s*)+)Year Built/);
    const mktAdjMatch = text.match(/((?:\d{1,3}(?:,\d{3})*\s*)+)MKT Adj Sale Price/);
    const compSalesValueMatch = text.match(/([\d,]+)\s*Comp Sales Value/);
    const addressMatch = text.match(/Property ID\s+([\s\S]*?)Address/);

    let addresses = [];
    if (addressMatch) {
      // Heal broken numbers caused by naive PDF extraction (e.g., "1 6 33" -> "1633")
      const rawAddrs = addressMatch[1].replace(/\n/g, ' ').replace(/(\d)\s+(?=\d)/g, '$1').trim();
      // Match each address starting with a number and space, continuing until the next address starts
      const matched = rawAddrs.match(/\d+\s+[a-zA-Z][\s\S]*?(?=\s+\d+\s+[a-zA-Z]|$)/g);
      if (matched) addresses = matched.map(a => a.trim());
    }
    
    if (compSalesValueMatch) {
      compSales.compSalesValue = parseInt(compSalesValueMatch[1].replace(/,/g, ''), 10);
    }

    if (quickRefMatch && mktAdjMatch) {
      const quickRefs = Array.from(quickRefMatch[1].matchAll(/R\d+/g)).map(m => m[0]);
      const years = yearBuiltMatch ? Array.from(yearBuiltMatch[1].matchAll(/\d{4}/g)).map(m => m[0]) : [];
      const prices = Array.from(mktAdjMatch[1].matchAll(/\d{1,3}(?:,\d{3})*/g)).map(m => parseInt(m[0].replace(/,/g, ''), 10));

      const numComps = prices.length;
      let sum = 0;

      for (let i = 0; i < numComps; i++) {
        compSales.comps.push({
          quickRef: quickRefs[i] || '',
          yearBuilt: years[i] || '',
          mktAdjSalePrice: prices[i] || 0,
          address: addresses[i] || 'Unknown Address'
        });
        sum += prices[i];
      }

      if (numComps > 0) {
        compSales.avgMktAdjSalePrice = Math.round(sum / numComps);
      }
    }
    
    return compSales.comps.length > 0 ? compSales : null;
  } catch (err) {
    console.error(`Error scraping comparable sales for PIN ${pin}:`, err.message);
    return null;
  }
}

export async function scrapeQuery(query, onProgress = () => {}) {
  onProgress('Accepting disclaimer...');
  await acceptDisclaimer();
  
  onProgress(`Searching for property: ${query}...`);
  const properties = await scrapeSearchResults(query);
  
  if (properties.length === 0) {
    throw new Error('No properties found for that address.');
  }

  const results = [];
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    onProgress(`Scraping details for ${prop.address} (${i + 1}/${properties.length})...`);
    
    try {
      const values = await scrapePropertyValues(prop.pin);
      const comparableSales = await scrapeComparableSales(prop.pin);
      results.push({
        pin: prop.pin,
        address: prop.address,
        owner: prop.owner,
        appraisals: values.appraisals,
        assessments: values.assessments,
        comparableSales,
      });
    } catch (err) {
      results.push({
        pin: prop.pin,
        address: prop.address,
        owner: prop.owner,
        appraisals: [],
        assessments: [],
        error: err.message,
      });
    }

    if (i < properties.length - 1) {
      await sleep(DELAY_MS);
    }
  }
  
  onProgress('Complete!');
  return results;
}

// Module exported for Cloudflare Workers
