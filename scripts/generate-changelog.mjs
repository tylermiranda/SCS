import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

try {
  const output = execSync('git log -n 50 --pretty=format:"%h%n%ad%n%s%n%b%n---END_COMMIT---" --date=short').toString();
  const rawCommits = output.split('---END_COMMIT---');
  
  const changelog = [];
  for (const rawCommit of rawCommits) {
    const lines = rawCommit.trim().split('\n');
    if (lines.length < 3) continue;
    
    const hash = lines[0];
    const date = lines[1];
    const subject = lines[2];
    const body = lines.slice(3).join('\n').trim();
    
    // Filters: exclude trivial commits
    const lowerSubject = subject.toLowerCase();
    if (lowerSubject.startsWith('chore') || 
        lowerSubject.startsWith('style') || 
        lowerSubject.startsWith('build') ||
        lowerSubject.startsWith('merge pull request') ||
        lowerSubject.startsWith('merge branch')) {
      continue;
    }
    
    changelog.push({ hash, date, subject, body });
  }
  
  const outputPath = path.join(process.cwd(), 'dashboard', 'public', 'changelog.json');
  // Ensure public directory exists
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(changelog, null, 2));
  console.log(`Generated changelog with ${changelog.length} entries.`);
} catch (error) {
  console.error('Error generating changelog:', error.message);
  const outputPath = path.join(process.cwd(), 'dashboard', 'public', 'changelog.json');
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify([], null, 2));
}
