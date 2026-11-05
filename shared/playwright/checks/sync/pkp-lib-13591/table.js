// node table.js: one row per walk from the recorded facts files.
const fs = require('fs'), path = require('path');
const files = fs.readdirSync('.reports').filter((d) => d.startsWith('pr13591-')).flatMap((d) => {
    const p = path.join('.reports', d, 'pr13591');
    return fs.existsSync(p) ? fs.readdirSync(p).filter((f) => /-facts-.*\.json$/.test(f)).map((f) => path.join(p, f)) : [];
});
const rows = files.map((f) => {
    const j = JSON.parse(fs.readFileSync(f)); const a = j['7 after the background deposit'] || {}; const h = j['8 has error filter'] || {};
    const ds = (f.match(/-(ds\d)-/) || [])[1];
    const kind = j.walk === 'datacite' ? 'DataCite' : ds === 'ds3' ? 'Crossref no-answer' : 'Crossref';
    const msg = ((a.errorSettings || [])[0] || '').split('|')[2] || '';
    return [j.line, (j.run || '').split('-').slice(-2, -1)[0], j.app, kind, a.badge, a.viewErrorCount, (a.failedJobs || []).length, (h.rows || []).length, a.neighbourBadge, (msg.match(/cURL error \d+/) || [''])[0]].join(' | ');
}).sort();
console.log('line | ref | app | case | badge | View Error | failed jobs | Has Error rows | control | stored message');
console.log(rows.join('\n'));
