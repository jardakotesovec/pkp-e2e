// Kept check of the PR review of pkp/pkp-lib#13497 (issue pkp/pkp-lib#12874, "Review invitation
// locale file"; the 3.5 twin is pkp/pkp-lib#13496), 2026-10-10. Reads the code only, no install.
//
// For the pkp-lib checkout of one app, between two commits, it answers:
//   1. per .po file the range touches: which keys were removed, added or reworded, and which keys the
//      file defines twice on each side (with whether the two definitions read the same);
//   2. for every key removed from the English files: who still names it, in pkp-lib, ui-library, the
//      app and its plugins (a hit is a text that would turn into "##key##");
//   3. every invitation key the code names (`invitation.`, `userInvitation.`, `acceptInvitation.`,
//      `reviewerInvitation.`): is it defined in English, in pkp-lib or in the app, on each side;
//   4. every `{name}` without its `$` left in any language's invitation.po, the fault the issue names.
//
// Run:  node shared/playwright/checks/sync/pkp-lib-13497/po-check.js <app root> <base> <head> [out.json]
//       (base and head are commits of <app root>/lib/pkp; nothing is checked out)
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const [appRoot, base, head, outFile] = process.argv.slice(2);
if (!appRoot || !base || !head) {
    console.error('usage: po-check.js <app root> <base> <head> [out.json]');
    process.exit(2);
}
const lib = path.join(appRoot, 'lib', 'pkp');
const git = (...args) => execFileSync('git', ['-C', lib, ...args], {encoding: 'utf8', maxBuffer: 256 << 20});
const show = (rev, file) => {
    try {
        return git('show', `${rev}:${file}`);
    } catch {
        return null;
    }
};

/** A .po file as {entries: key -> text, all: key -> [every definition's text]}. */
function parse(text) {
    const all = {};
    let id = null;
    let str = null;
    let mode = null;
    const flush = () => {
        if (id) (all[id] = all[id] || []).push(str || '');
        id = str = mode = null;
    };
    for (const raw of (text || '').split('\n')) {
        const line = raw.trim();
        if (line === '') {
            flush();
            continue;
        }
        if (line.startsWith('#')) continue;
        let m = line.match(/^(msgid|msgstr)\s+"(.*)"$/);
        if (m) {
            if (m[1] === 'msgid') {
                flush();
                id = m[2];
                mode = 'id';
            } else {
                str = m[2];
                mode = 'str';
            }
            continue;
        }
        m = line.match(/^"(.*)"$/);
        if (m && mode === 'id') id += m[1];
        else if (m && mode === 'str') str += m[1];
    }
    flush();
    const entries = {};
    // the loader keeps the last definition of a key
    for (const [k, v] of Object.entries(all)) entries[k] = v[v.length - 1];
    return {entries, all};
}

const mergeBase = git('merge-base', base, head).trim();
const out = {appRoot, base: git('rev-parse', base).trim(), head: git('rev-parse', head).trim(), mergeBase, files: {}};

// 1. the .po files of the range
const files = git('diff', '--name-only', `${mergeBase}..${head}`, '--', '*.po').split('\n').filter(Boolean);
const removedEnglish = new Set();
for (const file of files) {
    const b = parse(show(mergeBase, file));
    const h = parse(show(head, file));
    const dupes = (side) =>
        Object.entries(side.all)
            .filter(([, v]) => v.length > 1)
            .map(([key, v]) => ({key, definitions: v.length, same: new Set(v).size === 1}));
    const removed = Object.keys(b.entries).filter((k) => !(k in h.entries)).sort();
    const added = Object.keys(h.entries).filter((k) => !(k in b.entries)).sort();
    const reworded = Object.keys(b.entries)
        .filter((k) => k in h.entries && b.entries[k] !== h.entries[k])
        .sort()
        .map((key) => ({key, base: b.entries[key], head: h.entries[key]}));
    out.files[file] = {removed, added, reworded, doubledAtBase: dupes(b), doubledAtHead: dupes(h)};
    if (file.startsWith('locale/en/')) removed.forEach((k) => removedEnglish.add(k));
}

// the working trees are read for the uses; they must sit at one of the two commits
const treeAt = git('rev-parse', 'HEAD').trim();
out.treeAt = treeAt;
const SKIP = new Set(['node_modules', 'vendor', '.git', 'cache', 'dist', 'build', 'locale', 'cypress', 'public', 'mocks', 'registry']);
const EXT = /\.(php|tpl|js|vue|ts|xml|json)$/;
function* walk(dir) {
    let list;
    try {
        list = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
        return;
    }
    for (const e of list) {
        if (e.name.startsWith('.') && e.name !== '.') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!SKIP.has(e.name)) yield* walk(p);
        } else if (EXT.test(e.name) && !/\.stories\.|\.min\.js$|package-lock/.test(e.name)) yield p;
    }
}
const sources = [...walk(appRoot)].map((p) => ({p: path.relative(appRoot, p), text: fs.readFileSync(p, 'utf8')}));
out.sourceFiles = sources.length;

// 2. who names a key the English files lost
out.removedEnglishKeys = {};
for (const key of [...removedEnglish].sort()) {
    out.removedEnglishKeys[key] = sources.filter((s) => s.text.includes(key)).map((s) => s.p);
}

// 3. every invitation key the code names, against the English texts on each side
const named = {};
const KEY = /['"`]((?:invitation|userInvitation|acceptInvitation|reviewerInvitation)\.[A-Za-z0-9_.]*[A-Za-z0-9_])['"`]/g;
// a route's own name (`->name('invitation.add')`) is no text
const keysOf = (text) => [...text.matchAll(KEY)].filter((m) => !/name\($/.test(text.slice(Math.max(0, m.index - 5), m.index))).map((m) => m[1]);
for (const s of sources) {
    for (const k of keysOf(s.text)) (named[k] = named[k] || new Set()).add(s.p);
}
function english(rev) {
    const keys = new Set();
    // pkp-lib's English files at the commit, and the app's own as checked out
    for (const f of git('ls-tree', '-r', '--name-only', rev, '--', 'locale/en').split('\n').filter(Boolean)) {
        Object.keys(parse(show(rev, f)).entries).forEach((k) => keys.add(k));
    }
    const walkPo = (dir) => {
        for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}) : []) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (!['node_modules', 'vendor', '.git', 'pkp', 'ui-library'].includes(e.name)) walkPo(p);
            } else if (e.name.endsWith('.po') && /[\\/]locale[\\/]en[\\/]/.test(p)) {
                Object.keys(parse(fs.readFileSync(p, 'utf8')).entries).forEach((k) => keys.add(k));
            }
        }
    };
    walkPo(appRoot);
    return keys;
}
const enBase = english(mergeBase);
const enHead = english(head);
out.namedInvitationKeys = Object.keys(named).length;
out.undefinedInEnglish = {base: {}, head: {}};
// the PHP of the two sides differs, so each side's own file texts are read for the PHP the range touches
const phpTouched = git('diff', '--name-only', `${mergeBase}..${head}`, '--', '*.php').split('\n').filter(Boolean);
const namedAt = (rev) => {
    const set = {};
    for (const [k, v] of Object.entries(named)) {
        const rest = [...v].filter((p) => !phpTouched.includes(p.replace(/^lib\/pkp\//, '')));
        if (rest.length) set[k] = new Set(rest);
    }
    for (const f of phpTouched) {
        for (const k of keysOf(show(rev, f) || '')) (set[k] = set[k] || new Set()).add(`lib/pkp/${f}`);
    }
    return set;
};
for (const [side, rev, en] of [['base', mergeBase, enBase], ['head', head, enHead]]) {
    for (const [k, v] of Object.entries(namedAt(rev))) {
        if (!en.has(k)) out.undefinedInEnglish[side][k] = [...v].sort();
    }
}

// 4. `{name}` without `$` in any language's invitation.po
out.bareVariables = {base: [], head: []};
for (const [side, rev] of [['base', mergeBase], ['head', head]]) {
    for (const f of git('ls-tree', '-r', '--name-only', rev, '--', 'locale').split('\n').filter((x) => x.endsWith('/invitation.po'))) {
        for (const [key, text] of Object.entries(parse(show(rev, f)).entries)) {
            const hits = text.match(/\{[A-Za-z_]+\}/g);
            if (hits) out.bareVariables[side].push({file: f, key, variables: [...new Set(hits)]});
        }
    }
}

if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));

// the summary
const en = Object.entries(out.files).filter(([f]) => f.startsWith('locale/en/'));
console.log(`pkp-lib ${out.mergeBase.slice(0, 10)} -> ${out.head.slice(0, 10)}, tree at ${treeAt.slice(0, 10)}, ${sources.length} source files of ${appRoot}`);
for (const [f, r] of en) {
    console.log(`${f}: removed ${r.removed.length}, added ${r.added.length}, reworded ${r.reworded.length}, defined twice at base ${r.doubledAtBase.length} (differing ${r.doubledAtBase.filter((d) => !d.same).length}), at head ${r.doubledAtHead.length}`);
    for (const w of r.reworded) console.log(`   ~ ${w.key}\n       base: ${w.base}\n       head: ${w.head}`);
}
const other = Object.entries(out.files).filter(([f]) => !f.startsWith('locale/en/'));
const shape = {};
for (const [f, r] of other) {
    const sig = `removed ${r.removed.length}, added ${r.added.length}, reworded ${r.reworded.map((w) => w.key).join(' ') || 'none'}, twice at base ${r.doubledAtBase.length} / head ${r.doubledAtHead.length}`;
    (shape[sig] = shape[sig] || []).push(f.split('/')[1]);
}
for (const [sig, langs] of Object.entries(shape)) console.log(`translations [${langs.join(' ')}]: ${sig}`);
console.log('removed from English, and who still names them:');
for (const [k, v] of Object.entries(out.removedEnglishKeys)) console.log(`   ${k}: ${v.length ? v.join(', ') : 'nobody'}`);
for (const side of ['base', 'head']) {
    const u = out.undefinedInEnglish[side];
    console.log(`invitation keys the code names with no English text at the ${side} (${Object.keys(u).length} of ${out.namedInvitationKeys}):`);
    for (const [k, v] of Object.entries(u)) console.log(`   ${k}: ${v.join(', ')}`);
}
for (const side of ['base', 'head']) {
    console.log(`"{name}" without "$" in invitation.po at the ${side}: ${out.bareVariables[side].length}`);
    for (const b of out.bareVariables[side]) console.log(`   ${b.file} ${b.key}: ${b.variables.join(' ')}`);
}
