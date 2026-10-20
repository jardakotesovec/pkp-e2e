#!/usr/bin/env node
// regression-metrics.mjs — the weekly count of the team's write-ups in
// docs/reports/ (MAINTENANCE "Weekly regression count"): how many are open, how
// many were closed in the week and where each closed one went, since a report is
// deleted once acted on and otherwise leaves no trace in the files. Read from git:
// a report is a `.md` file in docs/reports/ (its `.patch`, `.js` and `img/`
// attachments are not counted); open = present at the week's end; closed = deleted
// in the week, with the deleting commit, whose message says what fixed it; new =
// added in the week. Each count is split into regressions (REPORT.md `- **Kind**
// regression…`, or an older report whose header paragraph opens "Regression.")
// and the rest (defects, intention gaps, PR-review verdicts, research notes).
// A week runs Monday to Sunday, by commit date.
// run: npm run regressions [-- --week <YYYY-MM-DD>|today] [--write] [--json]
//   --week: a day inside the week to count (default: the last complete week);
//     `today` counts the current week up to today
//   --write: put the week's row into docs/tracking/regression-metrics.md
//     (replacing a row for the same week)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'docs/reports';
const HISTORY = path.join(root, 'docs/tracking/regression-metrics.md');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const today = new Date(day(new Date()) + 'T00:00:00Z');
const weekArg = opt('--week');
const inside = weekArg === 'today' || !weekArg ? today : new Date(weekArg + 'T00:00:00Z');
const monday = addDays(inside, -((inside.getUTCDay() + 6) % 7));
let since = weekArg ? monday : addDays(monday, -7);
let until = addDays(since, 6);
if (until > today) until = today;

const isReport = (f) => f.startsWith(`${DIR}/`) && f.endsWith('.md') && !f.slice(DIR.length + 1).includes('/');
const kindOf = (text) => {
    const kind = text.match(/^- \*\*Kind\*\*:? (.*)$/m)?.[1];
    if (kind) return /^\**regression/i.test(kind) ? 'regression' : 'other';
    return /^(# )?Regression\b/m.test(text.split('\n').slice(0, 15).join('\n')) ? 'regression' : 'other';
};
const titleOf = (text) => (text.match(/^# (.*)$/m)?.[1] ?? '').trim();
const short = (s, n = 200) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const endRev = git('rev-list', '-1', `--before=${day(until)}T23:59:59`, 'HEAD').trim();
const open = endRev
    ? git('ls-tree', '--name-only', `${endRev}`, `${DIR}/`).split('\n').filter(isReport)
        .map((f) => kindOf(git('show', `${endRev}:${f}`)))
    : [];

// Every add and delete of a report in the week, oldest first.
const log = git('log', '--reverse', '--format=@%h%x09%cd%x09%s', '--date=short', '--name-status',
    `--since=${day(since)}T00:00:00`, `--until=${day(until)}T23:59:59`, '--', `${DIR}/`);
const closed = [];
const added = [];
let commit;
for (const line of log.split('\n')) {
    if (line.startsWith('@')) {
        const [hash, date, subject] = line.slice(1).split('\t');
        commit = { hash, date, subject };
        continue;
    }
    const [status, file, renamed] = line.split('\t');
    if (!status || !file) continue;
    if (status === 'D' && isReport(file)) {
        const text = git('show', `${commit.hash}^:${file}`);
        closed.push({ file: path.basename(file), kind: kindOf(text), title: titleOf(text), ...commit });
    } else if ((status === 'A' && isReport(file)) || (status.startsWith('R') && isReport(renamed) && !isReport(file))) {
        added.push(kindOf(git('show', `${commit.hash}:${renamed ?? file}`)));
    }
}

const split = (kinds) => ({ total: kinds.length, regressions: kinds.filter((k) => k === 'regression').length });
const result = {
    week: `${day(since)} – ${day(until)}`,
    open: split(open),
    closed: split(closed.map((c) => c.kind)),
    new: split(added),
    closedReports: closed,
};

if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
} else {
    const line = (o) => `${o.total} (${o.regressions} regressions, ${o.total - o.regressions} other)`;
    console.log(`docs/reports, week ${result.week}`);
    console.log(`  open at the week's end: ${line(result.open)}`);
    console.log(`  closed in the week:     ${line(result.closed)}`);
    console.log(`  new in the week:        ${line(result.new)}`);
    for (const c of closed) {
        console.log(`  - ${c.file} [${c.kind}] ${short(c.title, 100)}`);
        console.log(`      closed ${c.date} by ${c.hash}: ${short(c.subject)}`);
    }
}

if (args.includes('--write')) {
    const { open: o, closed: c, new: n } = result;
    const gone = closed.filter((r) => r.kind === 'regression');
    const row = `| ${result.week} | ${o.regressions} | ${c.regressions} | ${n.regressions} | ${o.total} / ${c.total} / ${n.total} | ${gone.map((r) => `\`${r.file.replace(/\.md$/, '')}\` (${r.hash}, ${r.date})`).join(', ') || 'none'} |`;
    const lines = fs.readFileSync(HISTORY, 'utf8').split('\n');
    const at = lines.findIndex((l) => l.startsWith(`| ${result.week} |`));
    if (at >= 0) lines[at] = row;
    else {
        // Newest first: in front of the first older week, else at the end of the table.
        const head = lines.findIndex((l) => l.startsWith('|------'));
        let i = head + 1;
        while (i < lines.length && lines[i].startsWith('| ') && lines[i].slice(2, 12) > day(since)) i++;
        lines.splice(i, 0, row);
    }
    fs.writeFileSync(HISTORY, lines.join('\n'));
    console.log(`wrote the row for ${result.week} into ${path.relative(root, HISTORY)}`);
}
