// ==========================================
// Cedar Brook Tax Appraisal Dashboard
// ==========================================

let data = null;
let sortColumn = 'total2026';
let sortDirection = 'desc';
let detailChart = null;
let detailBreakdownChart = null;
let trendChartInstance = null;
let distChartInstance = null;

// ---- Utilities ----

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function obfuscateName(name) {
  if (!name || name === 'Redacted' || name === 'Unknown Owner') return name;
  return name.split(' ').map(word => {
    if (word.length <= 1 || word === '&') return word;
    return word[0] + '*'.repeat(word.length - 1);
  }).join(' ');
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function parseChangeNum(changeStr) {
  if (!changeStr) return 0;
  const match = changeStr.match(/([+-]?\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getLatestAppraisal(property, year = 2026) {
  return property.appraisals.find(a => a.year === year);
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cleanAddress(addr) {
  return addr.replace(/\s+/g, ' ').trim();
}

// ---- Data Loading & Processing ----

async function loadData() {
  try {
    const isPropertiesPage = window.location.pathname.includes('properties') || window.location.pathname.includes('admin');
    const endpoint = isPropertiesPage ? '/api/admin/data' : '/api/data';
    
    const res = await fetch(`${endpoint}?t=${new Date().getTime()}`);
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error('Authentication required. Cloudflare Access might not be configured correctly, or your session expired.');
        if (isPropertiesPage) {
          // Cloudflare Access will usually handle redirects, but just in case
          document.body.innerHTML = '<div style="padding: 2rem; text-align: center; color: white;"><h2>Access Denied</h2><p>You must be authenticated via Cloudflare Access to view this page. Please refresh to log in.</p></div>';
        }
        return;
      }
      throw new Error(`Failed to load data: ${res.statusText}`);
    }

    data = await res.json();

    const trendPropCount = document.getElementById('trendPropertyCount');
    if (trendPropCount) {
      trendPropCount.textContent = data.totalProperties;
    }

    populateSummaryCards();
    renderTrendChart();
    renderDistributionChart();
    renderPropertyTable();
    setupEventListeners();
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

function populateSummaryCards() {
  if (!document.getElementById('avgAppraisal')) return;

  const latestYear = 2026;
  const totals = data.properties
    .map(p => getLatestAppraisal(p, latestYear))
    .filter(a => a && a.total > 0)
    .map(a => a.total);

  if (totals.length === 0) return;

  const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
  const changes = data.properties
    .map(p => getLatestAppraisal(p, latestYear))
    .filter(Boolean)
    .map(a => parseChangeNum(a.change));

  const totalIndexedEl = document.getElementById('totalIndexed');
  if (totalIndexedEl) totalIndexedEl.textContent = data.properties.length.toLocaleString();

  document.getElementById('avgAppraisal').textContent = formatCurrency(avg);
  document.getElementById('medianChange').textContent = `+${median(changes)}%`;
  document.getElementById('highestAppraisal').textContent = formatCurrency(Math.max(...totals));
  document.getElementById('lowestAppraisal').textContent = formatCurrency(Math.min(...totals));

  // Calculate Average Improvement vs Land split
  const propertiesWithTotals = data.properties.map(p => getLatestAppraisal(p, latestYear)).filter(a => a && a.total > 0);
  if (propertiesWithTotals.length > 0) {
    const totalImpr = propertiesWithTotals.reduce((sum, a) => sum + (a.improvements || 0), 0);
    const totalAppraisal = propertiesWithTotals.reduce((sum, a) => sum + a.total, 0);
    const imprPercent = Math.round((totalImpr / totalAppraisal) * 100);
    const landPercent = 100 - imprPercent;
    document.getElementById('avgImprovementRatio').textContent = `${imprPercent}% / ${landPercent}%`;
  }

  // Find year with biggest average YoY jump
  if (data.properties[0] && data.properties[0].appraisals) {
    const years = [...new Set(data.properties[0].appraisals.map(a => a.year))].sort();
    let biggestJump = { year: null, avg: 0 };
    for (let i = 1; i < years.length; i++) {
      const yr = years[i];
      const prevYr = years[i - 1];
      const diffs = data.properties.map(p => {
        const cur = p.appraisals.find(a => a.year === yr);
        const prev = p.appraisals.find(a => a.year === prevYr);
        if (cur && prev && prev.total > 0) return ((cur.total - prev.total) / prev.total) * 100;
        return null;
      }).filter(v => v !== null && v <= 50);
      
      if (diffs.length > 0) {
        const avgChange = diffs.reduce((s, v) => s + v, 0) / diffs.length;
        if (avgChange > biggestJump.avg) {
          biggestJump = { year: yr, avg: avgChange };
        }
      }
    }
    if (biggestJump.year) {
      document.getElementById('biggestJumpYear').textContent = biggestJump.year;
      document.getElementById('biggestJumpLabel').textContent =
        `Biggest YoY Jump (+${Math.round(biggestJump.avg)}% avg)`;
    }
  }
}

// ---- Charts ----

function renderTrendChart() {
  if (!document.getElementById('trendChart')) return;
  if (!data.properties[0] || !data.properties[0].appraisals) return;

  const years = [...new Set(data.properties[0].appraisals.map(a => a.year))].sort();

  const avgByYear = years.map(year => {
    const totals = data.properties
      .map(p => p.appraisals.find(a => a.year === year))
      .filter(Boolean)
      .map(a => a.total);
    if (totals.length === 0) return 0;
    return totals.reduce((s, v) => s + v, 0) / totals.length;
  });

  if (trendChartInstance) trendChartInstance.destroy();
  const ctx = document.getElementById('trendChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(45, 212, 191, 0.2)');
  gradient.addColorStop(1, 'rgba(45, 212, 191, 0)');

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Avg Appraisal',
        data: avgByYear,
        borderColor: '#2dd4bf',
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: '#2dd4bf',
        pointBorderColor: '#0a0e1a',
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(26, 34, 54, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: (ctx) => `Average: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { size: 12 } },
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: {
            color: '#64748b',
            font: { size: 12 },
            callback: (v) => formatCurrency(v),
          },
        },
      },
    },
  });
}

function renderDistributionChart() {
  if (!document.getElementById('distributionChart')) return;

  const changes = data.properties
    .map(p => {
      const a = getLatestAppraisal(p, 2026);
      return a ? parseChangeNum(a.change) : null;
    })
    .filter(v => v !== null);

  const buckets = {};
  changes.forEach(c => {
    const key = `+${c}%`;
    buckets[key] = (buckets[key] || 0) + 1;
  });

  const sortedKeys = Object.keys(buckets).sort((a, b) => parseChangeNum(a) - parseChangeNum(b));
  const colors = sortedKeys.map(k => {
    const val = parseChangeNum(k);
    if (val >= 20) return '#d32f2f'; // Dark red for big increases
    if (val >= 10) return '#ff5500'; // Squeeze Orange
    return '#2e7d32'; // Forest green
  });

  if (distChartInstance) distChartInstance.destroy();
  const ctx = document.getElementById('distributionChart').getContext('2d');
  distChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedKeys,
      datasets: [{
        label: 'Properties',
        data: sortedKeys.map(k => buckets[k]),
        backgroundColor: colors.map(c => c),
        borderColor: '#111111',
        borderWidth: 1,
        borderRadius: 0,
        maxBarThickness: 60,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#111111',
          bodyColor: '#444444',
          borderColor: '#111111',
          borderWidth: 1,
          cornerRadius: 0,
          padding: 12,
          titleFont: { family: "'Instrument Serif', serif", size: 16 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 13 },
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} properties`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: true, borderColor: '#111111' },
          ticks: { color: '#777777', font: { family: "'JetBrains Mono', monospace", size: 12 } },
        },
        y: {
          grid: { color: '#dcd7cb', drawBorder: false },
          ticks: {
            color: '#777777',
            font: { family: "'JetBrains Mono', monospace", size: 12 },
            stepSize: 5,
          },
        },
      },
    },
  });
}

// ---- Property Table ----

function getPropertySortValue(property) {
  const latest = getLatestAppraisal(property, 2026);
  const prev = getLatestAppraisal(property, 2025);

  switch (sortColumn) {
    case 'address': return cleanAddress(property.address);
    case 'owner': return property.owner || '';
    case 'total2026': return latest?.total || 0;
    case 'total2025': return prev?.total || 0;
    case 'change': return latest ? parseChangeNum(latest.change) : 0;
    case 'changeDollar': return (latest && prev) ? latest.total - prev.total : 0;
    case 'land': return latest?.land || 0;
    case 'improvements': return latest?.improvements || 0;
    case 'avgCompSale': return property.comparableSales?.avgMktAdjSalePrice || 0;
    default: return 0;
  }
}

function renderPropertyTable(filter = '') {
  const tbody = document.getElementById('propertyTableBody');
  if (!tbody) return;

  let properties = [...data.properties];

  if (filter) {
    const normalizedFilter = filter.toLowerCase().replace(/\bmt\b/g, 'mount');
    const terms = normalizedFilter.split(/\s+/).filter(Boolean);

    properties = properties.filter(p => {
      const addr = cleanAddress(p.address).toLowerCase().replace(/\bmt\b/g, 'mount');
      const owner = (p.owner || '').toLowerCase();
      const pin = p.pin.toLowerCase();

      // Ensure every search term is found in either the address, owner, or pin
      return terms.every(term => 
        addr.includes(term) || owner.includes(term) || pin.includes(term)
      );
    });
  }

  properties.sort((a, b) => {
    let aVal = getPropertySortValue(a);
    let bVal = getPropertySortValue(b);

    if (typeof aVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  tbody.innerHTML = properties.map(p => {
    const latest = getLatestAppraisal(p, 2026);
    const prev = getLatestAppraisal(p, 2025);
    const changeNum = latest ? parseChangeNum(latest.change) : 0;
    const changeClass = changeNum > 10 ? 'change-positive' : changeNum < 0 ? 'change-negative' : 'change-neutral';
    const dollarDiff = (latest && prev) ? latest.total - prev.total : null;

    const countyUrl = `https://ssc.sedgwickcounty.org/propertytax/realpropertyvalues.aspx?pin=${p.pin}`;

    return `
      <tr data-pin="${escapeHTML(p.pin)}">
        <td>${escapeHTML(cleanAddress(p.address))} <a href="${countyUrl}" target="_blank" rel="noopener" class="county-link" title="View on Sedgwick County" onclick="event.stopPropagation()">↗</a></td>
        <td>${escapeHTML(obfuscateName(p.owner)) || '—'}</td>
        <td>${latest ? formatCurrency(latest.total) : '—'}</td>
        <td>${prev ? formatCurrency(prev.total) : '—'}</td>
        <td class="${changeClass}">${latest?.change || '—'}</td>
        <td class="${changeClass}">${dollarDiff !== null ? (dollarDiff >= 0 ? '+' : '') + formatCurrency(dollarDiff) : '—'}</td>
        <td>${latest ? formatCurrency(latest.land) : '—'}</td>
        <td>${latest ? formatCurrency(latest.improvements) : '—'}</td>
        <td>${p.comparableSales?.avgMktAdjSalePrice ? formatCurrency(p.comparableSales.avgMktAdjSalePrice) : '—'}</td>
      </tr>
    `;
  }).join('');
}

// ---- Property Details Rendering (Modal or Inline) ----

function renderPropertyDetails(pin) {
  const property = data.properties.find(p => p.pin === pin);
  if (!property) return;

  const titleEl = document.getElementById('modalTitle') || document.getElementById('searchResultTitle');
  const subtitleEl = document.getElementById('modalSubtitle') || document.getElementById('searchResultSubtitle');
  
  if (titleEl) titleEl.textContent = cleanAddress(property.address);
  if (subtitleEl) subtitleEl.textContent = `PIN: ${property.pin} • ${obfuscateName(property.owner) || 'Unknown Owner'}`;

  const prefix = document.getElementById('modalTaxBreakdown') ? 'modal' : 'inline';
  const taxSection = document.getElementById(`${prefix}TaxBreakdown`);

  if (taxSection && property.taxBill) {
    const latestAppraisal = getLatestAppraisal(property, 2026);
    const prevAppraisal = getLatestAppraisal(property, 2025);
    
    if (latestAppraisal && prevAppraisal && prevAppraisal.total > 0) {
      taxSection.style.display = 'block';
      const percentIncrease = (latestAppraisal.total - prevAppraisal.total) / prevAppraisal.total;
      
      const currentTax = property.taxBill.amount;

      let estNewTax = 0;
      let formulaHTML = "";

      const genTax = property.taxBill.genTax;
      const specials = property.taxBill.specials;

      if (typeof genTax === 'number' && typeof specials === 'number') {
        const estNewGenTax = genTax * (1 + percentIncrease);
        estNewTax = estNewGenTax + specials;
        const pctStr = percentIncrease >= 0 ? `+${Math.round(percentIncrease * 100)}%` : `${Math.round(percentIncrease * 100)}%`;
        formulaHTML = `[${formatCurrency(genTax)} <span style="opacity:0.5;">(Gen Tax)</span> &times; ${(1 + percentIncrease).toFixed(3)} <span style="opacity:0.5;">(${pctStr} Appr. Change)</span>] + ${formatCurrency(specials)} <span style="opacity:0.5;">(Specials)</span> = <strong>${formatCurrency(estNewTax)}</strong>`;
      } else {
        estNewTax = currentTax * (1 + percentIncrease);
        const pctStr = percentIncrease >= 0 ? `+${Math.round(percentIncrease * 100)}%` : `${Math.round(percentIncrease * 100)}%`;
        formulaHTML = `${formatCurrency(currentTax)} <span style="opacity:0.5;">(${property.taxBill.year} Tax)</span> &times; ${(1 + percentIncrease).toFixed(3)} <span style="opacity:0.5;">(${pctStr} YoY Appr. Change)</span> = <strong>${formatCurrency(estNewTax)}</strong>`;
      }

      const monthlyDiff = (estNewTax - currentTax) / 12;

      document.getElementById(`${prefix}CurrentTaxYear`).textContent = property.taxBill.year;
      document.getElementById(`${prefix}CurrentTaxTotal`).textContent = formatCurrency(currentTax);
      document.getElementById(`${prefix}CurrentTaxMonthly`).textContent = formatCurrency(currentTax / 12);
      document.getElementById(`${prefix}CurrentTaxHalf`).textContent = formatCurrency(currentTax / 2);

      document.getElementById(`${prefix}EstTaxTotal`).textContent = formatCurrency(estNewTax);
      document.getElementById(`${prefix}EstTaxMonthly`).textContent = formatCurrency(estNewTax / 12);

      const diffEl = document.getElementById(`${prefix}EstTaxDiff`);
      if (monthlyDiff > 0) {
        diffEl.textContent = `(+${formatCurrency(monthlyDiff)}/mo)`;
        diffEl.style.color = 'var(--accent-rose)';
      } else if (monthlyDiff < 0) {
        diffEl.textContent = `(${formatCurrency(monthlyDiff)}/mo)`;
        diffEl.style.color = 'var(--accent-green)';
      } else {
        diffEl.textContent = '(No change)';
        diffEl.style.color = 'var(--text-muted)';
      }

      const formulaEl = document.getElementById(`${prefix}EstTaxFormula`);
      if (formulaEl) {
        formulaEl.innerHTML = formulaHTML;
      }
    } else {
      taxSection.style.display = 'none';
    }
  } else if (taxSection) {
    taxSection.style.display = 'none';
  }

  const appraisals = [...property.appraisals].sort((a, b) => a.year - b.year);
  const years = appraisals.map(a => a.year);

  // Total appraisal trend
  if (detailChart) detailChart.destroy();
  const ctx1El = document.getElementById('detailChart');
  if (ctx1El) {
    const ctx1 = ctx1El.getContext('2d');

    detailChart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'Total Appraisal',
          data: appraisals.map(a => a.total),
          borderColor: '#111111',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#111111',
          pointBorderColor: '#111111',
          pointBorderWidth: 2,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Total Appraisal Over Time',
            color: '#111111',
            font: { family: "'Instrument Serif', serif", size: 18, weight: 400 },
            padding: { bottom: 12 },
          },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#111111',
            bodyColor: '#444444',
            borderColor: '#111111',
            borderWidth: 1,
            cornerRadius: 0,
            padding: 12,
            titleFont: { family: "'Instrument Serif', serif", size: 16 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 13 },
            callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) },
          },
        },
        scales: {
          x: { 
            grid: { display: false, drawBorder: true, borderColor: '#111111' }, 
            ticks: { color: '#777777', font: { family: "'JetBrains Mono', monospace", size: 12 } } 
          },
          y: {
            grid: { color: '#dcd7cb', drawBorder: false },
            ticks: { color: '#777777', font: { family: "'JetBrains Mono', monospace", size: 12 }, callback: (v) => formatCurrency(v) },
          },
        },
      },
    });
  }

  // Land vs Improvements breakdown
  if (detailBreakdownChart) detailBreakdownChart.destroy();
  const ctx2El = document.getElementById('detailBreakdownChart');
  if (ctx2El) {
    const ctx2 = ctx2El.getContext('2d');

    detailBreakdownChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: years,
        datasets: [
          {
            label: 'Land',
            data: appraisals.map(a => a.land),
            backgroundColor: '#ff5500',
            borderColor: '#111111',
            borderWidth: 1,
            borderRadius: 0,
          },
          {
            label: 'Improvements',
            data: appraisals.map(a => a.improvements),
            backgroundColor: '#111111',
            borderColor: '#111111',
            borderWidth: 1,
            borderRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#444444', font: { family: "'JetBrains Mono', monospace", size: 12 }, usePointStyle: true, pointStyle: 'rect' },
          },
          title: {
            display: true,
            text: 'Land vs Improvements',
            color: '#111111',
            font: { family: "'Instrument Serif', serif", size: 18, weight: 400 },
            padding: { bottom: 12 },
          },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#111111',
            bodyColor: '#444444',
            borderColor: '#111111',
            borderWidth: 1,
            cornerRadius: 0,
            padding: 12,
            titleFont: { family: "'Instrument Serif', serif", size: 16 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 13 },
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false, drawBorder: true, borderColor: '#111111' },
            ticks: { color: '#777777', font: { family: "'JetBrains Mono', monospace", size: 12 } },
          },
          y: {
            stacked: true,
            grid: { color: '#dcd7cb', drawBorder: false },
            ticks: { color: '#777777', font: { family: "'JetBrains Mono', monospace", size: 12 }, callback: (v) => formatCurrency(v) },
          },
        },
      },
    });
  }

  // Detail table
  const detailTbody = document.getElementById('detailTableBody');
  if (detailTbody) {
    detailTbody.innerHTML = [...property.appraisals]
      .sort((a, b) => b.year - a.year)
      .map(a => {
        const changeNum = parseChangeNum(a.change);
        const cls = changeNum > 10 ? 'change-positive' : changeNum < 0 ? 'change-negative' : 'change-neutral';
        return `
          <tr>
            <td><strong>${a.year}</strong></td>
            <td>${formatCurrency(a.land)}</td>
            <td>${formatCurrency(a.improvements)}</td>
            <td><strong>${formatCurrency(a.total)}</strong></td>
            <td class="${cls}">${a.change || '—'}</td>
          </tr>
        `;
      }).join('');
  }

  // Comparable Sales section
  const compSection = document.getElementById('compSalesSection');
  const compSummary = document.getElementById('compSalesSummary');
  const compBody = document.getElementById('compSalesBody');

  console.log("Comp section debug:", {
    hasCompSection: !!compSection,
    hasCompSummary: !!compSummary,
    hasCompBody: !!compBody,
    comparableSales: property.comparableSales
  });

  if (compSection && compSummary && compBody) {
    if (property.comparableSales?.comps?.length > 0) {
      const cs = property.comparableSales;
      compSection.style.display = 'block';
      const tableWrapper = compSection.querySelector('.modal-table-wrapper');
      if (tableWrapper) tableWrapper.style.display = 'block';

      compSummary.innerHTML = `
        <div class="comp-stats">
          <div class="comp-stat">
            <span class="comp-stat-value">${cs.avgMktAdjSalePrice ? formatCurrency(cs.avgMktAdjSalePrice) : '—'}</span>
            <span class="comp-stat-label">Avg MKT Adj Sale Price</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-value">${cs.compSalesValue ? formatCurrency(cs.compSalesValue) : '—'}</span>
            <span class="comp-stat-label">Comp Sales Value</span>
          </div>
          <div class="comp-stat">
            <span class="comp-stat-value">${cs.comps.length}</span>
            <span class="comp-stat-label">Comparables Used</span>
          </div>
        </div>
      `;

      compBody.innerHTML = cs.comps.map(c => `
        <tr>
          <td><strong>${escapeHTML(c.quickRef) || '—'}</strong></td>
          <td>${c.address ? `<a href="https://www.google.com/search?q=${encodeURIComponent(c.address)}" target="_blank" rel="noopener noreferrer">${escapeHTML(c.address)}</a>` : '—'}</td>
          <td>${escapeHTML(c.yearBuilt) || '—'}</td>
          <td>${c.mktAdjSalePrice ? formatCurrency(c.mktAdjSalePrice) : '—'}</td>
        </tr>
      `).join('');
    } else {
      compSection.style.display = 'block';
      compSummary.innerHTML = '<p style="color: var(--text-muted); font-style: italic; text-align: center; padding: 1rem 0;">No comparable sales records exist for this property in the county database.</p>';
      compBody.innerHTML = '';
      const tableWrapper = compSection.querySelector('.modal-table-wrapper');
      if (tableWrapper) tableWrapper.style.display = 'none';
    }
  }

  // Check if we are showing it inline on homepage or opening a modal on properties page
  const overlay = document.getElementById('modalOverlay');
  const inlineDetails = document.getElementById('searchedPropertyDetails');

  if (overlay) {
    overlay.classList.add('active');
    overlay.scrollTop = 0;
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      overlay.scrollTop = 0;
      setTimeout(() => { overlay.scrollTop = 0; }, 100);
    });
  } else if (inlineDetails) {
    inlineDetails.style.display = 'block';
    document.body.classList.add('has-active-property');
    inlineDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearActiveProperty() {
  const inlineDetails = document.getElementById('searchedPropertyDetails');
  if (inlineDetails) {
    inlineDetails.style.display = 'none';
    document.body.classList.remove('has-active-property');
    
    // Optionally scroll back up to the search bar
    const searchSection = document.querySelector('.search-section');
    if (searchSection) {
      searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  const aboutOverlay = document.getElementById('aboutModalOverlay');
  const helpOverlay = document.getElementById('helpModalOverlay');
  const changelogOverlay = document.getElementById('changelogModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  if (aboutOverlay) {
    aboutOverlay.classList.remove('active');
  }
  if (helpOverlay) {
    helpOverlay.classList.remove('active');
  }
  if (changelogOverlay) {
    changelogOverlay.classList.remove('active');
  }
  document.body.style.overflow = '';
}

// ---- Event Listeners ----

function setupEventListeners() {
  // Ad-hoc scrape (only on homepage)
  const adHocBtn = document.getElementById('adHocBtn');
  const adHocAddress = document.getElementById('adHocAddress');
  const progressContainer = document.getElementById('scrapeProgressContainer');
  const progressTitle = document.getElementById('progressTitle');
  const progressSteps = document.getElementById('progressSteps');
  const validationPopup = document.getElementById('validationPopup');
  const validationResults = document.getElementById('validationResults');
  const cancelValidationBtn = document.getElementById('cancelValidationBtn');

  function resetProgressSteps() {
    if (progressSteps) progressSteps.style.display = 'flex';
    document.querySelectorAll('.step').forEach(el => {
      el.className = 'step pending';
    });
    if (progressTitle) {
      progressTitle.textContent = 'Fetching Property Data...';
      progressTitle.style.color = 'var(--text-primary)';
    }
  }

  function markStepActive(id) {
    document.querySelectorAll('.step').forEach(el => {
      if (el.classList.contains('active')) {
        el.classList.remove('active');
        el.classList.add('done');
      }
    });
    const step = document.getElementById(id);
    if (step) {
      step.classList.remove('pending');
      step.classList.add('active');
    }
  }

  function markStepError(errorMsg) {
    const step = document.querySelector('.step.active') || document.querySelector('.step.pending');
    if (step) {
      step.classList.remove('active', 'pending');
      step.classList.add('error');
    }
    if (progressTitle) {
      progressTitle.textContent = `Error: ${errorMsg}`;
      progressTitle.style.color = 'var(--accent-rose)';
    }
  }

  function markStepDone(id) {
    const step = document.getElementById(id);
    if (step) {
      step.classList.remove('active', 'pending');
      step.classList.add('done');
    }
  }

  function showError(msg) {
    if (progressContainer && progressTitle) {
      progressContainer.style.display = 'block';
      if (progressSteps) progressSteps.style.display = 'none';
      progressTitle.textContent = `Error: ${msg}`;
      progressTitle.style.color = 'var(--accent-rose)';
      setTimeout(() => { progressContainer.style.display = 'none'; }, 5000);
    }
  }

  if (adHocBtn) {
    adHocBtn.addEventListener('click', async () => {
      const address = adHocAddress.value.trim();
      if (!address) return;
      if (address.includes('-')) {
        alert('Range addresses are not supported. Please enter a single address.');
        return;
      }

      adHocBtn.disabled = true;
      const origText = adHocBtn.textContent;
      adHocBtn.textContent = 'Searching...';
      if (progressContainer) progressContainer.style.display = 'none';
      validationPopup.style.display = 'none';

      try {
        const res = await fetch(`/api/scrape/search?address=${encodeURIComponent(address)}`);
        const resultData = await res.json();

        if (resultData.error) throw new Error(resultData.error);
        if (!resultData.properties || resultData.properties.length === 0) throw new Error('No properties found. Try an exact address, PIN, or AIN.');

        validationResults.innerHTML = resultData.properties.map(p => `
          <div class="validation-item">
            <div>
              <strong>${escapeHTML(p.address)}</strong>
              <span class="validation-owner">${escapeHTML(obfuscateName(p.owner) || 'Unknown Owner')}</span>
            </div>
            <button class="btn btn-small confirm-scrape-btn" data-pin="${escapeHTML(p.pin)}" data-address="${escapeHTML(p.address)}" data-owner="${escapeHTML(p.owner)}">Fetch Details</button>
          </div>
        `).join('');

        validationPopup.style.display = 'block';

        document.querySelectorAll('.confirm-scrape-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            validationPopup.style.display = 'none';
            startDetailedScrape(e.target.dataset.pin, e.target.dataset.address, e.target.dataset.owner);
          });
        });

      } catch (err) {
        showError(err.message);
      } finally {
        adHocBtn.disabled = false;
        adHocBtn.textContent = origText;
      }
    });
  }

  if (cancelValidationBtn) {
    cancelValidationBtn.addEventListener('click', () => {
      validationPopup.style.display = 'none';
    });
  }

  function startDetailedScrape(pin, address, owner) {
    adHocBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = 'block';
    resetProgressSteps();
    markStepActive('step-disclaimer');

    const eventSource = new EventSource(`/api/scrape/stream?pin=${pin}&address=${encodeURIComponent(address)}&owner=${encodeURIComponent(owner)}`);

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.error) {
        markStepError(payload.error);
        eventSource.close();
        adHocBtn.disabled = false;
        setTimeout(() => { progressContainer.style.display = 'none'; }, 5000);
      } else if (payload.status) {
        if (payload.status.includes('disclaimer')) {
          markStepActive('step-disclaimer');
        } else if (payload.status.includes('Fetching details')) {
          markStepActive('step-details');
        } else if (payload.status.includes('comparable sales')) {
          markStepActive('step-comps');
        } else if (payload.status.includes('tax records')) {
          markStepActive('step-tax');
        }
      } else if (payload.complete) {
        markStepDone('step-tax');
        markStepActive('step-calculations');
        
        eventSource.close();
        adHocBtn.disabled = false;
        
        if (payload.property) {
          const existingIndex = data.properties.findIndex(p => p.pin === payload.property.pin);
          if (existingIndex !== -1) {
            data.properties[existingIndex] = payload.property;
          } else {
            data.properties.push(payload.property);
            data.totalProperties = data.properties.length;
          }
          
          const trendPropCount = document.getElementById('trendPropertyCount');
          if (trendPropCount) trendPropCount.textContent = data.totalProperties;
          
          populateSummaryCards();
          renderTrendChart();
          renderDistributionChart();
          
          // Re-render table if we are on properties.html
          renderPropertyTable(document.getElementById('searchInput')?.value || '');
          
          try {
            renderPropertyDetails(payload.property.pin);
          } catch (error) {
            alert("Error rendering property details: " + error.message);
          }
        }
        
        markStepDone('step-calculations');
        if (progressTitle) {
          progressTitle.textContent = 'Complete!';
          progressTitle.style.color = 'var(--accent-green)';
        }

        setTimeout(() => { 
          progressContainer.style.display = 'none'; 
          adHocAddress.value = ''; 
        }, 3000);
      }
    };
    
    eventSource.onerror = () => {
      markStepError('Connection error.');
      eventSource.close();
      adHocBtn.disabled = false;
      setTimeout(() => { progressContainer.style.display = 'none'; }, 5000);
    };
  }

  // Search in table (only on properties page)
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderPropertyTable(e.target.value);
    });
  }

  // Sort table (only on properties page)
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = 'desc';
      }

      document.querySelectorAll('th.sortable').forEach(t => {
        t.classList.remove('asc', 'desc', 'active');
      });
      th.classList.add('active', sortDirection);

      renderPropertyTable(document.getElementById('searchInput').value);
    });
  });

  // Table row click => open modal (only on properties page)
  const propertyTableBody = document.getElementById('propertyTableBody');
  if (propertyTableBody) {
    propertyTableBody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (row?.dataset.pin) {
        renderPropertyDetails(row.dataset.pin);
      }
    });
  }

  // Close inline property details
  const closeDetailsBtn = document.getElementById('closePropertyDetailsBtn');
  if (closeDetailsBtn) {
    closeDetailsBtn.addEventListener('click', clearActiveProperty);
  }

  // Close modal
  const modalClose = document.getElementById('modalClose');
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function setupAboutModal() {
  const aboutLink = document.getElementById('aboutLink');
  const aboutModalOverlay = document.getElementById('aboutModalOverlay');
  const aboutModalClose = document.getElementById('aboutModalClose');

  if (aboutLink && aboutModalOverlay) {
    aboutLink.addEventListener('click', (e) => {
      e.preventDefault();
      aboutModalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }
  
  if (aboutModalClose) {
    aboutModalClose.addEventListener('click', closeModal);
  }
  
  if (aboutModalOverlay) {
    aboutModalOverlay.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }
}

function populateDate() {
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = new Date().toLocaleDateString('en-US', options).toUpperCase();
  }
}

function setupHelpModal() {
  const helpModalOverlay = document.getElementById('helpModalOverlay');
  const helpModalClose = document.getElementById('helpModalClose');

  const triggers = [
    document.getElementById('helpLink'),
    document.getElementById('headerHelpBtn'),
    document.getElementById('searchHelpLink')
  ];

  triggers.forEach(trigger => {
    if (trigger && helpModalOverlay) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        helpModalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    }
  });
  
  if (helpModalClose) {
    helpModalClose.addEventListener('click', closeModal);
  }
  
  if (helpModalOverlay) {
    helpModalOverlay.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  // Changelog Modal
  const changelogLink = document.getElementById('changelogLink');
  const changelogModalOverlay = document.getElementById('changelogModalOverlay');
  const changelogModalClose = document.getElementById('changelogModalClose');
  const changelogContent = document.getElementById('changelogContent');

  if (changelogLink) {
    changelogLink.addEventListener('click', async () => {
      changelogModalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      try {
        const res = await fetch('/changelog.json?t=' + new Date().getTime());
        if (!res.ok) throw new Error('Failed to load changelog');
        const commits = await res.json();
        
        if (commits.length === 0) {
          changelogContent.innerHTML = '<p>No changelog entries found.</p>';
          return;
        }

        let html = '<div class="changelog-list" style="display: flex; flex-direction: column; gap: 1rem;">';
        commits.forEach(c => {
          html += `
            <div class="changelog-entry" style="border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem;">
                <h3 style="color: var(--text-primary); font-size: 1rem; margin: 0;">${escapeHTML(c.subject)}</h3>
                <span style="color: var(--text-muted); font-size: 0.75rem; font-family: var(--font-mono);">${escapeHTML(c.date)}</span>
              </div>
              ${c.body ? `<p style="margin-top: 0.5rem; margin-bottom: 0; font-size: 0.85rem; opacity: 0.8; white-space: pre-wrap;">${escapeHTML(c.body)}</p>` : ''}
            </div>
          `;
        });
        html += '</div>';
        changelogContent.innerHTML = html;
      } catch (err) {
        changelogContent.innerHTML = '<p style="color: var(--accent-rose);">Failed to load changelog. Try again later.</p>';
      }
    });
  }

  if (changelogModalClose) {
    changelogModalClose.addEventListener('click', closeModal);
  }
  
  if (changelogModalOverlay) {
    changelogModalOverlay.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }
}

// ---- Init ----

function init() {
  populateDate();
  setupAboutModal();
  setupHelpModal();
  loadData();
}

init();
