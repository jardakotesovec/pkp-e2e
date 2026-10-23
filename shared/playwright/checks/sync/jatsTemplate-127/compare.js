// PR review check — pkp/pkp-lib#13607: the XML files editors.js wrote at the base and at the head, compared with
// journal-meta's contrib-group cut out of the base's. Prints one line per file: "same" when the rest is the same
// bytes, else the first line that differs.
//   node compare.js <base dir> <head dir>
const fs = require('fs');
const path = require('path');

const [baseDir, headDir] = process.argv.slice(2);
/** journal-meta with its contrib-group (and the line it stood on) cut out. */
const cut = (xml) => xml.replace(/<journal-meta>[\s\S]*?<\/journal-meta>/, (jm) => jm.replace(/\n?[ \t]*<contrib-group>[\s\S]*?<\/contrib-group>/, ''));
let same = 0, differ = 0, cutCount = 0;
for (const name of fs.readdirSync(baseDir).filter((f) => f.endsWith('.xml')).sort()) {
    const headFile = path.join(headDir, name);
    if (!fs.existsSync(headFile)) { console.log(`${name}: not at the head`); differ++; continue; }
    const base = fs.readFileSync(path.join(baseDir, name), 'utf8');
    const head = fs.readFileSync(headFile, 'utf8');
    const b = cut(base);
    if (b !== base) cutCount++;
    // the OAI record carries its response date and the record's datestamp, the time of the run
    const norm = (s) => s.replace(/<responseDate>[^<]*<\/responseDate>/, '').replace(/<datestamp>[^<]*<\/datestamp>/, '');
    if (norm(b) === norm(head)) { same++; console.log(`${name}: same${b !== base ? ' (journal-meta contrib-group cut from the base)' : ''}`); continue; }
    differ++;
    const bl = norm(b).split('\n'), hl = norm(head).split('\n');
    const i = bl.findIndex((l, n) => l !== hl[n]);
    console.log(`${name}: differs at line ${i + 1}\n  base: ${(bl[i] ?? '<end>').trim().slice(0, 200)}\n  head: ${(hl[i] ?? '<end>').trim().slice(0, 200)}`);
}
console.log(`${same} same, ${differ} differ; journal-meta contrib-group cut from ${cutCount} base files`);
