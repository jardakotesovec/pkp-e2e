// Prints the base and head records of matrix.sh side by side, one line per step: the status and the
// fields that decide each walk (screens dropped). node shared/playwright/checks/sync/pkp-lib-13550/summary.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../../../../.reports/issues-r13539');
const DROP = new Set(['screen', 'serverLog', 'aria', 'text']);
const squeeze = (v, depth = 0) => {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => squeeze(x, depth + 1));
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!DROP.has(k)) o[k] = squeeze(x, depth + 1);
    return o;
};
for (const side of ['base', 'head']) {
    const dir = path.join(root, side);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => /^(h15[fgh]|xctx|extras)-.*\.json$/.test(f)).sort()) {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        console.log(`\n### ${side} ${f}`);
        for (const [k, v] of Object.entries(d)) {
            if (k === 'serverLog') { console.log(`  serverLog: ${(v || []).length} line(s) ${JSON.stringify(v || []).slice(0, 400)}`); continue; }
            console.log(`  ${k}: ${JSON.stringify(squeeze(v)).slice(0, 700)}`);
        }
    }
}
