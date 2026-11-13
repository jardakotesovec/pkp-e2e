#!/usr/bin/env node
// backlog.mjs — the housekeeping session's queue: everything waiting to be
// worked on, read from where each kind of work lives, in the order the session
// works it (MAINTENANCE "The housekeeping session"). Nothing here is kept by
// hand, so the queue cannot drift from the specs and tracking files.
// run: npm run backlog [-- --all]   (--all lists every item, not the first few)
//      npm run backlog -- --items U10   (a spec's ready Planned items, the revision sheet's rows)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');
const itemsOf = process.argv.includes('--items') ? process.argv[process.argv.indexOf('--items') + 1] : null;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const specFiles = fs.readdirSync(path.join(root, 'docs/specs'))
    .filter((f) => /^U\d{2}-.*\.md$/.test(f)).sort();

// The entries a report covers, from its "Tracked in" bullet's links: an issue
// report under docs/issues/, or an open report under docs/reports/ or
// docs/reports/pr-review/ (the entry waits for it).
function trackedIn(dir) {
    const map = new Map();
    for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith('.md'))) {
        const m = read(`${dir}/${f}`).match(/^- \*\*Tracked in\*\*[\s\S]*?(?=\n- \*\*|\n\n)/m);
        for (const [, spec, anchor] of (m ? m[0] : '').matchAll(/specs\/(U\d{2})-[\w-]+\.md#([a-z0-9-]+)/g)) {
            map.set(`${spec}#${anchor}`, `${dir}/${f}`);
        }
    }
    return map;
}
const reported = trackedIn('docs/issues');
const openReports = new Map([...trackedIn('docs/reports'), ...trackedIn('docs/reports/pr-review')]);

// An entry's body: from its anchor to the next anchor or heading.
function bodies(text) {
    const out = {};
    let id = null;
    for (const line of text.split('\n')) {
        const m = line.match(/^<a id="([a-z0-9-]+)"><\/a>/);
        if (m) { id = m[1]; out[id] = ''; continue; }
        if (/^#/.test(line)) id = null;
        if (id) out[id] += line + '\n';
    }
    return out;
}

function table(p) {
    if (!exists(p)) return [];
    return read(p).split('\n').filter((l) => /^\| /.test(l) && !/^\|[- |]+\|$/.test(l)).slice(1)
        .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}
const incidentals = table('docs/tracking/incidentals.md');
const friction = read('docs/tracking/friction.md').split('\n').filter((l) => /^\d{4}-\d{2}-\d{2} · /.test(l));
const progress = table('docs/tracking/PROGRESS.md').filter((r) => /^U\d{2}$/.test(r[0]));
const midway = progress.filter((r) => r.includes('in_progress'));
const pending = progress.filter((r) => r.includes('pending'));
// A revision left mid-way keeps its sheet (RUNBOOK "Revising a shipped feature").
const sheets = exists('docs/tracking/coverage-revision')
    ? fs.readdirSync(path.join(root, 'docs/tracking/coverage-revision')).filter((f) => /^U\d{2}\.md$/.test(f)).map((f) => f.slice(0, 3))
    : [];

const refreshes = []; const owed = []; const held = []; const planned = [];
// The open 🐞 IDs of a spec's register, from its text or its file name.
const bugCache = new Map();
function openBugs(textOrFile) {
    const text = textOrFile.endsWith('.md') && !textOrFile.includes('\n') ? read(`docs/specs/${textOrFile}`) : textOrFile;
    if (!bugCache.has(text)) bugCache.set(text, new Set([...text.matchAll(/^\| \[([A-Z]{1,4}\d+)\]\(#[a-z0-9-]+\) \| .* \| 🐞 \|/gm)].map((x) => x[1])));
    return bugCache.get(text);
}

for (const f of specFiles) {
    const text = read(`docs/specs/${f}`);
    const spec = f.slice(0, 3);
    const body = bodies(text);
    const seen = new Set();
    for (const line of text.split('\n')) {
        const m = line.match(/^\| \[([A-Z]{1,4}\d+)\]\(#([a-z0-9-]+)\) \| (.*) \| (🐞|❓|✅) \| ([^|]*)\|/);
        if (!m || m[4] !== '🐞' || seen.has(m[1])) continue;
        seen.add(m[1]);
        const [, id, anchor, finding, , impact] = m;
        const b = body[anchor] || '';
        const item = { spec, file: f, id, finding, impact: impact.trim() };
        // The entry's "Report:" line (MAINTENANCE "Keeping a report in step").
        const refresh = b.match(/^Report: refresh owed — (.*)$/m);
        const paused = b.match(/^Report: paused — (.*)$/m);
        if (refresh) { refreshes.push({ ...item, why: refresh[1] }); continue; }
        if (reported.has(`${spec}#${anchor}`)) continue;
        // No report by a ruling: the line, or a Reviewed "risk accepted".
        if (/^Report: none — /m.test(b) || /^> \*\*Reviewed[^\n]*risk accepted/m.test(b)) continue;
        // A finding another spec holds in full is reported there.
        if (/holds the full entry/.test(b)) continue;
        // Older reports name no entries: their pointer sits in the entry's footnotes.
        const fn = [...b.matchAll(/<sup>\[?([\w-]+)\]?/g)]
            .map(([, k]) => (text.match(new RegExp(`^\\*\\*${k}\\*\\*.*(?:\\n(?!<a id=|\\*\\*|#).*)*`, 'm')) || [''])[0])
            .join('\n');
        // A footnote naming a filed report whose "Tracked in" lacks the entry:
        // the three places disagree, a header-only fix.
        const filed = [...(b + fn).matchAll(/^Issue report: .*?(docs\/issues\/[\w.-]+\.md)/gm)]
            .map((x) => x[1]).find(exists);
        if (filed) { refreshes.push({ ...item, why: `${filed}: its "Tracked in" lacks the entry` }); continue; }
        // Its issue closed as fixed and its report deleted: the entry waits for the fix
        // to show on every app (MAINTENANCE "A report's life"), it owes no report.
        const closed = (b + fn).match(/^Issue report: \[pkp-e2e#(\d+)\]\([^)]*\) \(closed\b/m);
        if (closed) { held.push({ ...item, why: `pkp-e2e#${closed[1]} closed, the fix not yet on every app` }); continue; }
        // A regression report the upstream session deleted as acted on: the same wait.
        const actedOn = (b + fn).match(/(docs\/reports\/[\w.-]+\.md)`? \(deleted [\d-]+ as acted on/);
        if (actedOn && !exists(actedOn[1])) { held.push({ ...item, why: `${actedOn[1]} acted on, the fix not yet on every app` }); continue; }
        const report = openReports.get(`${spec}#${anchor}`)
            || ((b + fn).match(/docs\/reports\/[\w.-]+\.md/g) || []).find(exists);
        const incidental = incidentals.find((r) => r[0].startsWith(spec)
            && new RegExp(`\\b${id}\\b`).test(r[2]) && /no longer shows|not reproduced|fixed/i.test(r[2]));
        if (paused) held.push({ ...item, why: `paused: ${paused[1]}` });
        else if (report) held.push({ ...item, why: `open report ${report}` });
        else if (incidental) held.push({ ...item, why: 'an incidentals row to retire it' });
        else owed.push(item);
    }
    const left = text.match(/^- \*\*Planned\*\*:\n((?: {2,}.*\n?)*)/m);
    if (left) {
        // A guard an issue report proposes asserts the fixed behavior, so it
        // waits while an entry it cites is still an open 🐞; the rest is
        // coverage a test can assert today.
        const open = openBugs(text);
        const items = left[1].split(/^ {2}- /m).slice(1);
        // An item "once <ID> is settled" waits while that entry is still a ❓.
        const question = new Set([...text.matchAll(/^\| \[([A-Z]{1,4}\d+)\]\(#[a-z0-9-]+\) \| .* \| ❓ \|/gm)].map((x) => x[1]));
        // An ID linked into another spec (`U28-….md#omp2`) is read in that spec's register.
        const linked = (i) => [...i.matchAll(/\((U\d+-[\w-]+\.md)#([a-z]{1,4}\d+)\)/g)]
            .some(([, other, id]) => specFiles.includes(other) && openBugs(other).has(id.toUpperCase()));
        // An item that says "waits for …" (TEMPLATE "Coverage") waits for something
        // outside the registers, such as a rebuild upstream.
        const waits = (i) => /\bwaits\s+for\b/i.test(i) || (/guard|issue report|docs\/issues\/|once fixed/i.test(i)
            && ([...i.matchAll(/(?<![#\w])((?:A|OJS|OMP|OPS)\d+)\b/g)].some(([, id]) => open.has(id)) || linked(i)))
            || [...i.matchAll(/\bonce ((?:A|OJS|OMP|OPS)\d+) is settled\b/g)].some(([, id]) => question.has(id));
        // Each item ends "[<source> <date>]" (lint-spec checks it). A report's guard
        // that cites a still-open 🐞 waits whatever its wording.
        const tag = (i) => (i.trim().match(/\[(upstream|report|sweep|incidental|request|other) (20\d\d-\d\d-\d\d)\]$/) || []);
        const citesOpen = (i) => [...i.matchAll(/(?<![#\w])((?:A|OJS|OMP|OPS)\d+)\b/g)].some(([, id]) => open.has(id));
        const readyItems = items.filter((i) => !waits(i) && !(tag(i)[1] === 'report' && citesOpen(i)));
        // First come the items that keep the suites in step with the apps: behavior
        // the team shipped, a guard whose bug is now fixed, a coverage request.
        const first = readyItems.filter((i) => ['upstream', 'report', 'request'].includes(tag(i)[1]));
        const oldest = (list) => list.map((i) => tag(i)[2] || '0000').sort()[0];
        if (itemsOf === spec) {
            const show = (list) => list.map((i) => `  - ${i.trim().replace(/\n\s+/g, ' ')}\n`).join('');
            process.stdout.write(`${spec}: ${readyItems.length} ready\n${show(readyItems)}`
                + `waiting (${items.length - readyItems.length}):\n${show(items.filter((i) => !readyItems.includes(i)))}`);
            process.exit(0);
        }
        if (items.length) {
            planned.push({ spec, file: f, n: readyItems.length, waiting: items.length - readyItems.length,
                first: first.length, firstOldest: oldest(first), oldest: oldest(readyItems) });
        }
    }
}

// Reports owed: one spec at a time, the spec with the most severe entries first.
const rank = (i) => (/crash/.test(i.impact) ? 0 : 1) * 10
    + ['critical', 'high', 'user-visible', 'medium', 'minor', 'low', 'latent'].indexOf(i.impact.split(' ')[0]) + 1;
const bySpec = new Map();
for (const i of owed) bySpec.set(i.spec, [...(bySpec.get(i.spec) || []), i]);
const owedSpecs = [...bySpec.entries()]
    .map(([spec, items]) => ({ spec, items, key: Math.min(...items.map(rank)) * 100 - items.length }))
    .sort((a, b) => a.key - b.key);


const cap = (list) => (all ? list : list.slice(0, 5));
const more = (list) => (!all && list.length > 5 ? `  … ${list.length - 5} more (--all)\n` : '');
let out = '';
const section = (title, count, body) => { out += `\n${title} (${count})\n${body}`; };

// A header fix needs no walk: a join, or a "Tracked in" that lacks the entry.
const header = (i) => /^joins |"Tracked in" lacks/.test(i.why);
refreshes.sort((a, b) => header(b) - header(a));
// Specs with first-class items lead, the oldest such item first; then the rest, oldest first.
const ready = planned.filter((s) => s.n).sort((a, b) => (b.first > 0) - (a.first > 0)
    || (a.first ? a.firstOldest : a.oldest).localeCompare(b.first ? b.firstOldest : b.oldest)
    || b.first - a.first || a.spec.localeCompare(b.spec));
// A ready item dated today is this morning's own, owed to "Write the coverage", not left over.
const today = new Date().toISOString().slice(0, 10);
const ownToday = ready.filter((s) => s.oldest >= today && (!s.first || s.firstOldest >= today));
const leftBehind = ready.filter((s) => !ownToday.includes(s));
section('1. Left over, finished first',
    `${midway.length} builds and ${sheets.length} revisions mid-way; ${leftBehind.reduce((n, s) => n + s.n, 0)} ready Planned items in ${leftBehind.length} specs; `
    + `${planned.reduce((n, s) => n + s.waiting, 0)} items wait, nearly all guards for their bug's fix`,
    midway.map((r) => `  ${r[0]} ${r[1]}: build mid-way\n`).join('')
    + sheets.map((u) => `  ${u}: revision mid-way (docs/tracking/coverage-revision/${u}.md)\n`).join('')
    + cap(leftBehind).map((s) => `  ${s.spec}: ${s.n}`
        + (s.first ? `, ${s.first} from upstream, a fixed bug or a request (oldest ${s.firstOldest})` : ` (oldest ${s.oldest})`)
        + `${s.waiting ? ` (+${s.waiting} waiting)` : ''}\n`).join('') + more(leftBehind)
    + (ownToday.length ? `  written down today, for "Write the coverage": ${ownToday.map((s) => s.spec).join(', ')}\n` : ''));
section('2. New features to build, oldest first', pending.length,
    pending.map((r) => `  ${r[0]} ${r[1]}\n`).join(''));
section('3. Incidentals, oldest first', incidentals.length,
    cap(incidentals).map((r) => `  ${r[0]}: ${r[1].slice(0, 90)}\n`).join('') + more(incidentals));
section('4. Reports owed, one spec at a time', `${owed.length} entries in ${owedSpecs.length} specs`,
    cap(owedSpecs).map((s) => `  ${s.spec}: ${s.items.map((i) => `${i.id} [${i.impact}]`).join(', ')}\n`).join('')
    + more(owedSpecs)
    + (!held.length ? '' : all
        ? held.map((i) => `  held: ${i.spec} ${i.id}, ${i.why}\n`).join('')
        : `  held, skipped: ${held.length} (--all)\n`));
section('5. Report refreshes, every one', `${refreshes.filter(header).length} header fixes, `
    + `${refreshes.filter((i) => !header(i)).length} needing a walk`,
    cap(refreshes).map((i) => `  ${i.spec} ${i.id}${header(i) ? ' [header]' : ''}: ${i.why}\n`).join('') + more(refreshes));
// Every session writes its own coverage before it ends, so what is listed here was
// left over and is finished first (MAINTENANCE "The housekeeping session", "What was left over").
const leftOver = midway.length + sheets.length + leftBehind.length;
out = 'In this order, after flakes, security and filed issues: '
    + (leftOver ? 'what was left over (1) before anything else; ' : '')
    + (pending.length ? 'the new feature to build (2), which takes the morning'
        : 'incidentals (3), reports owed (4), report refreshes (5)')
    + '; when the four hours allow, the day\'s drift sweep (`npm run hk -- swept` names the spec) and friction (6);'
    + ' then the tests for the coverage the morning found owing.\n'
    + out;
section('6. Friction rows to fold', friction.length, '');
process.stdout.write(out);
