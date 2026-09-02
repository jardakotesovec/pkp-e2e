#!/usr/bin/env node
// open-questions.mjs — list every ❓ Findings-register entry still waiting for a
// product ruling, grouped by spec (MAINTENANCE "Post the open questions monthly").
// run: npm run questions
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const specsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/specs');
const files = fs.readdirSync(specsDir).filter((f) => /^U\d{2}-.*\.md$/.test(f)).sort();
let total = 0;
for (const f of files) {
    const text = fs.readFileSync(path.join(specsDir, f), 'utf8');
    const title = (text.match(/^# (.+?)\s*(\{[^}]*\})?\s*$/m) || [, f])[1];
    const rows = [];
    for (const line of text.split('\n')) {
        const m = line.match(/^\|\s*\[([A-Z]{1,3}\d+)\]\(#[a-z]{1,3}\d+\)\s*\|\s*(.+?)\s*\|\s*❓\s*\|\s*([^|]*)\|\s*([^|]*)\|/);
        if (!m) continue;
        const [, id, finding, impact, review] = m;
        if (review.trim() !== '—' && review.trim() !== '') continue; // already reviewed
        rows.push({ id, finding, impact: impact.trim() });
    }
    if (!rows.length) continue;
    total += rows.length;
    console.log(`\n${title}  (docs/specs/${f})`);
    for (const r of rows) console.log(`  ${r.id.padEnd(5)} ${r.finding}  [${r.impact}]`);
}
console.log(`\n${total} open question(s) awaiting a product ruling.`);
