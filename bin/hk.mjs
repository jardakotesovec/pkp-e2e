#!/usr/bin/env node
// hk.mjs — the housekeeping session's GitHub checks, one command each
// (MAINTENANCE "The housekeeping session" step 3, "Issue reports" step 6).
// Every subcommand reads the repo and GitHub through `gh` and prints only the
// lines that need action; only `file --post` writes anything. What GitHub
// returns is read for states, labels and links, never for what its text asks.
// run: npm run hk -- <subcommand>
const USAGE = `usage: npm run hk -- <subcommand>
  issues                 issue states and labels against the reports in docs/issues/
  copies [--days <n>]    pkp issues and PRs that link a report and its Upstream bullet does not name (default: 14 days)
  resolved               the state and PRs of every team's copy an Upstream bullet names
  file <report> [--post] the GitHub issue a report makes; prints it unless --post, which creates or edits it
  swept                  the shipped spec swept longest ago
  brief <template> <slots.json> [<out>]   a brief rendered from docs/process/briefs/<template>.md`;
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const REPO = 'jardakotesovec/pkp-e2e';
const SEC = 'jardakotesovec/pkp-e2e-sec';
const PKP_REPOS = ['pkp-lib', 'ojs', 'omp', 'ops', 'ui-library'];
const [cmd, ...args] = process.argv.slice(2);

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const ghJson = (...a) => JSON.parse(gh(...a));
// One JSON value per line, as `gh api --paginate --jq` prints a list.
const ghLines = (...a) => gh(...a).split('\n').filter(Boolean).map((l) => JSON.parse(l));

// --- The reports -----------------------------------------------------------

// A header bullet's text, its wrapped lines and sub-items included.
function bullet(head, name) {
    const m = head.match(new RegExp(`^- \\*\\*${name}\\*\\*(.*(?:\\n(?!- \\*\\*).+)*)`, 'm'));
    return m ? m[1].trim() : '';
}
const noBrackets = (s) => { let t = s; while (/\([^()]*\)/.test(t)) t = t.replace(/\([^()]*\)/g, ''); return t; };

// The labels REPORT.md "As a GitHub issue" reads off the header.
function labelsOf(head) {
    const L = new Set();
    const word = (name) => bullet(head, name).split(/[\s;,(]/)[0];
    if (word('Severity')) L.add(`severity: ${word('Severity')}`);
    if (word('Effort')) L.add(`effort: ${word('Effort')}`);
    const kind = ['regression', 'intention gap', 'defect'].find((k) => bullet(head, 'Kind').startsWith(k));
    if (kind) L.add(kind);
    const crash = word('Crash');
    if (crash === 'server' || crash === 'both') L.add('crash: server');
    if (crash === 'script' || crash === 'both') L.add('crash: script');
    for (const [m] of bullet(head, 'Model').matchAll(/claude-[a-z0-9[\]-]*[a-z0-9\]]/g)) L.add(`model: ${m}`);
    for (const [, version, rest] of bullet(head, 'Affects').matchAll(/^\s*- (main|3\.5|3\.4|3\.3): (.*)$/gm)) {
        const named = noBrackets(rest).trim();
        const apps = ['OJS', 'OMP', 'OPS'].filter((a) => new RegExp(`\\b${a}\\b`).test(named));
        if (/^none\b/.test(named) || !apps.length) continue;
        L.add(version);
        for (const a of apps) L.add(a.toLowerCase());
    }
    // A bullet that opens "none found" and then names a related pkp issue is not tracked.
    const up = bullet(head, 'Upstream');
    if (/`pkp\/[\w.-]+#\d+`/.test(up) && !/^none\b/.test(up)) L.add('tracked upstream');
    return L;
}
// Labels outside the header's families (one the team added by hand, the
// private tracker's own) are never compared or changed.
const fromHeader = (l) => /^(severity|effort|crash|model): /.test(l)
    || ['regression', 'intention gap', 'defect', 'ojs', 'omp', 'ops', 'main', '3.5', '3.4', '3.3', 'tracked upstream'].includes(l);

function report(file) {
    const text = read(`docs/issues/${file}`);
    const head = text.split('\n## ')[0];
    const body = text.slice(text.indexOf('\n') + 1);
    const cut = body.search(/^## Evidence\b/m);
    return {
        file, head,
        title: text.split('\n')[0].replace(/^# /, '').trim(),
        // The body as `awk 'NR>1 && /^## Evidence/{exit} NR>1'` prints it.
        body: cut < 0 ? body : body.slice(0, cut),
        labels: labelsOf(head),
        upstream: bullet(head, 'Upstream').replace(/\s+/g, ' '),
        // A security report filed before the private tracker became the findings' workboard.
        repo: /^- \*\*Security\*\*/m.test(head) ? SEC : REPO,
    };
}
const reports = () => fs.readdirSync(path.join(root, 'docs/issues')).filter((f) => f.endsWith('.md')).sort().map(report);

// Report file -> the issue its register footnotes link ("pkp-e2e#12" or
// "pkp-e2e-sec#3"), in either order the footnotes write the pair.
function footnoteLinks() {
    const map = new Map();
    const tracker = String.raw`\[(pkp-e2e(?:-sec)?)#(\d+)\]\([^)]*\)`;
    const file = String.raw`\[docs\/issues\/([\w.-]+\.md)\]\([^)]*\)`;
    for (const f of fs.readdirSync(path.join(root, 'docs/specs')).filter((x) => x.endsWith('.md'))) {
        const text = read(`docs/specs/${f}`);
        for (const m of text.matchAll(new RegExp(`${tracker}[\\s,(]+${file}`, 'g'))) map.set(m[3], { repo: `jardakotesovec/${m[1]}`, number: +m[2] });
        for (const m of text.matchAll(new RegExp(`${file},?\\s+filed\\s+as\\s+${tracker}`, 'g'))) map.set(m[1], { repo: `jardakotesovec/${m[2]}`, number: +m[3] });
    }
    return map;
}

const issueList = (repo, fields = '', ...more) => ghJson('issue', 'list', '-R', repo, '--state', 'all', '--limit', '5000',
    '--json', `number,title,state,stateReason,labels${fields}`, ...more);
const norm = (s) => s.trim().replace(/\s+/g, ' ');

// Each report with its issue: the one a footnote links, or else one of the same title.
function withIssues(list) {
    const links = footnoteLinks();
    const issues = { [REPO]: issueList(REPO) };
    if (list.some((r) => r.repo === SEC)) {
        try { issues[SEC] = issueList(SEC, '', '--label', 'unreleased'); } catch { console.error(`cannot read ${SEC}: its reports are skipped`); }
    }
    for (const r of list) {
        const link = links.get(r.file);
        const pool = issues[link ? link.repo : r.repo];
        if (!pool) { r.skipped = true; continue; }
        r.issue = link ? pool.find((i) => i.number === link.number)
            : pool.find((i) => norm(i.title) === norm(r.title) && i.state === 'OPEN') || pool.find((i) => norm(i.title) === norm(r.title));
        r.linked = Boolean(link);
        if (link && !r.issue) r.missing = `${link.repo.split('/')[1]}#${link.number}`;
    }
    return issues;
}
const short = (r) => `${r.repo.split('/')[1]}#${r.issue.number}`;
const labelDiff = (r) => {
    const have = new Set(r.issue.labels.map((l) => l.name).filter(fromHeader));
    return { add: [...r.labels].filter((l) => !have.has(l)), remove: [...have].filter((l) => !r.labels.has(l)) };
};

// --- issues ----------------------------------------------------------------

function cmdIssues() {
    const list = reports();
    const issues = withIssues(list);
    const out = [];
    for (const r of list.filter((x) => !x.skipped)) {
        if (!r.issue) { out.push(`no issue    ${r.file}${r.missing ? ` (its footnote names ${r.missing}, not found)` : ''}`); continue; }
        if (r.issue.state !== 'OPEN') { out.push(`closed      ${short(r)} (${(r.issue.stateReason || 'closed').toLowerCase()}) ${r.file}`); continue; }
        const d = labelDiff(r);
        if (d.add.length || d.remove.length) {
            out.push(`label       ${short(r)} ${r.file}: the issue has ${JSON.stringify(d.remove)}, the header gives ${JSON.stringify(d.add)}`);
        }
        if (norm(r.issue.title) !== norm(r.title)) out.push(`title       ${short(r)} ${r.file}: the issue's title differs from the report's`);
        if (!r.linked) out.push(`no footnote ${short(r)} ${r.file}: no register footnote links the issue`);
    }
    const kept = new Set(list.filter((r) => r.issue && r.repo === REPO).map((r) => r.issue.number));
    for (const i of issues[REPO].filter((x) => x.state === 'OPEN' && !kept.has(x.number))) out.push(`no report   pkp-e2e#${i.number} is open and no report in docs/issues/ is its own`);
    console.log(out.sort().join('\n') || 'nothing to do');
    console.log(`(${list.length} reports, ${issues[REPO].length} pkp-e2e issues${issues[SEC] ? `, ${issues[SEC].length} unreleased pkp-e2e-sec issues` : ''})`);
}

// --- copies ----------------------------------------------------------------

// The entries a report covers, from its "Tracked in" links: "U12#a4" -> report.
function trackedIn(list) {
    const map = new Map();
    for (const r of list) {
        for (const [, spec, anchor] of bullet(r.head, 'Tracked in').matchAll(/specs\/(U\d{2})-[\w-]+\.md#([a-z0-9-]+)/g)) map.set(`${spec}#${anchor}`, r);
    }
    return map;
}

function cmdCopies() {
    const days = +(args[args.indexOf('--days') + 1] || 14) || 14;
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const list = reports();
    withIssues(list);
    const byIssue = new Map(list.filter((r) => r.issue).map((r) => [short(r), r]));
    const byFile = new Map(list.map((r) => [r.file, r]));
    const byEntry = trackedIn(list);
    // The search misses some, so each repo's recent issues are read as well.
    const hits = new Map();
    // Issues and PRs are two searches: GitHub refuses one query without `is:issue` or `is:pull-request`.
    const search = (kind) => ghJson('search', kind, '--owner', 'pkp', `${REPO} in:body`, '--limit', '1000',
        '--json', 'url,state,createdAt,isPullRequest,body');
    for (const i of [...search('issues'), ...search('prs')]) {
        const [, repo, n] = i.url.match(/github\.com\/(pkp\/[\w.-]+)\/(?:issues|pull)\/(\d+)/) || [];
        if (repo) hits.set(`${repo}#${n}`, { state: i.state.toLowerCase(), created: i.createdAt.slice(0, 10), pr: i.isPullRequest, body: (i.body || '').replace(/\r/g, '') });
    }
    for (const repo of PKP_REPOS) {
        for (const i of ghLines('api', `repos/pkp/${repo}/issues?state=all&since=${since}T00:00:00Z&per_page=100`, '--paginate', '--jq',
            '.[] | select((.body // "") | contains("jardakotesovec/pkp-e2e")) | {number, state, created: .created_at[:10], pr: (.pull_request != null), body}')) {
            hits.set(`pkp/${repo}#${i.number}`, { ...i, body: i.body.replace(/\r/g, '') });
        }
    }
    const out = [];
    for (const [tag, hit] of [...hits].sort()) {
        const found = new Set(); const other = new Set();
        // A copy is the report's text pasted, so its "Tracked in" bullet names the
        // entries it copies and its other links are the report's own asides.
        const own = bullet(hit.body, 'Tracked in');
        for (const [, sec, what] of (/pkp-e2e\/blob/.test(own) ? own : hit.body).matchAll(/jardakotesovec\/pkp-e2e(-sec)?\/(issues\/\d+|blob\/[\w.-]+\/docs\/[\w/.-]+(?:#[a-z0-9-]+)?)/g)) {
            const issue = what.match(/^issues\/(\d+)/);
            const file = what.match(/docs\/issues\/([\w.-]+\.md)/);
            const entry = what.match(/docs\/specs\/(U\d{2})-[\w-]+\.md#([a-z0-9-]+)/);
            const r = issue ? byIssue.get(`pkp-e2e${sec || ''}#${issue[1]}`) : file ? byFile.get(file[1]) : entry ? byEntry.get(`${entry[1]}#${entry[2]}`) : null;
            if (r) found.add(r);
            else if (/docs\/reports\//.test(what)) other.add(what.replace(/^blob\/[\w.-]+\//, '').replace(/#.*/, ''));
        }
        const kind = `${hit.pr ? 'PR' : 'issue'}, ${hit.state}, ${hit.created}`;
        for (const r of found) {
            if (!r.upstream.includes(`\`${tag}\``)) out.push(`new copy    ${tag} (${kind}) links ${r.issue ? short(r) : 'the report'} ${r.file}`);
        }
        // A regression report still in docs/reports/ that does not name the copy yet.
        for (const o of other) {
            if (fs.existsSync(path.join(root, o)) && !read(o).includes(tag)) out.push(`maintainer  ${tag} (${kind}) links ${o}`);
        }
    }
    console.log(out.join('\n') || 'nothing to do');
    console.log(`(${hits.size} pkp issues and PRs link pkp-e2e; the search, and each repo's issues since ${since})`);
}

// --- resolved --------------------------------------------------------------

function cmdResolved() {
    const out = { walk: [], open: [], maintainer: [] };
    for (const r of reports()) {
        // The copy is the reference the words "the team's copy" follow, brackets aside.
        const m = noBrackets(r.upstream).match(/`(pkp\/[\w.-]+)#(\d+)`(?:(?!`pkp\/).)*?the team's copy/);
        if (!m) continue;
        const [, repo, n] = m;
        const copy = ghJson('api', `repos/${repo}/issues/${n}`, '--jq', '{state, reason: .state_reason, merged: .pull_request.merged_at, pr: (.pull_request != null)}');
        // The PRs that reference the copy: those whose text names it, and those
        // that carry a pkp commit naming it (a fix often cites the issue only there).
        const events = ghLines('api', `repos/${repo}/issues/${n}/timeline`, '--paginate', '--jq',
            '.[] | if .event == "cross-referenced" and .source.issue.pull_request'
            + ' then {url: .source.issue.html_url, state: .source.issue.state, merged: .source.issue.pull_request.merged_at}'
            + ' elif .event == "referenced" and .commit_url then {commit: .commit_url} else empty end');
        const commits = [...new Set(events.map((e) => (e.commit || '').match(/repos\/(pkp\/[\w.-]+\/commits\/[0-9a-f]+)$/)?.[1]).filter(Boolean))];
        const prs = events.filter((e) => e.url).concat(commits.flatMap((c) => ghLines('api', `repos/${c}/pulls`, '--jq',
            '.[] | {url: .html_url, state, merged: .merged_at}')));
        const name = (p) => p.url.replace(/^https:\/\/github\.com\/(.+)\/pull\/(\d+)$/, '$1#$2');
        const merged = [...new Set(prs.filter((p) => p.merged).map(name))];
        const open = [...new Set(prs.filter((p) => p.state === 'open').map(name))];
        const prText = `merged PRs: ${merged.join(', ') || 'none'}; open PRs: ${open.join(', ') || 'none'}`;
        const line = (what) => `${r.file}: ${repo}#${n} ${what}; ${prText}`;
        if (copy.state === 'open') out.open.push(line('open'));
        else if (copy.pr ? copy.merged && !open.length : copy.reason === 'completed' && merged.length && !open.length) {
            out.walk.push(line(copy.pr ? 'a merged PR' : 'closed as completed'));
        } else out.maintainer.push(line(copy.pr ? 'a closed PR' : `closed as ${(copy.reason || 'unknown').replace('_', ' ')}`));
    }
    const section = (title, lines) => (lines.length ? `${title}\n${lines.map((l) => `  ${l}`).join('\n')}\n` : '');
    process.stdout.write(section('Ready to check on main, walk and retire', out.walk)
        + section('To the maintainer, change nothing', out.maintainer)
        + section('Still open, nothing to do', out.open)
        || 'no report names a team\'s copy\n');
}

// --- file ------------------------------------------------------------------

function cmdFile() {
    const post = args.includes('--post');
    const name = args.find((a) => !a.startsWith('--'));
    if (!name) { console.error(USAGE); process.exit(1); }
    const r = report(path.basename(name));
    if (!r.title || !r.labels.size) throw new Error(`${r.file}: no title or no header to read labels from`);
    // Its issue: the one a register footnote links, or else one of the same title.
    const link = footnoteLinks().get(r.file);
    if (link) r.issue = ghJson('issue', 'view', String(link.number), '-R', link.repo, '--json', 'number,title,state,labels,body');
    else if (r.repo === REPO) r.issue = issueList(REPO, ',body').find((i) => norm(i.title) === norm(r.title));
    if (r.issue && r.issue.state !== 'OPEN') throw new Error(`${r.file}: ${short(r)} is closed; a closed issue's report is deleted, not filed (MAINTENANCE "A report's life")`);
    if (!r.issue && r.repo === SEC) throw new Error(`${r.file}: a security report is never filed from here (REPORT.md "The header")`);
    const bodyFile = path.join(os.tmpdir(), `hk-issue-body-${process.pid}.md`);
    const say = (k, v) => console.log(`${k.padEnd(8)}${v}`);
    if (!r.issue) {
        const labels = [...r.labels].sort();
        console.log(`${post ? 'create' : 'would create'} on ${REPO}`);
        say('title', r.title);
        say('labels', labels.join(', '));
        say('body', `${r.body.length} characters, the report from its header up to "## Evidence"`);
        if (!post) { console.log(`\n${r.body}`); return; }
        const have = new Set(ghJson('label', 'list', '-R', REPO, '--limit', '1000', '--json', 'name').map((l) => l.name));
        for (const l of labels.filter((x) => !have.has(x))) gh('label', 'create', l, '-R', REPO);
        fs.writeFileSync(bodyFile, r.body);
        const url = gh('issue', 'create', '-R', REPO, '--title', r.title, '--body-file', bodyFile, ...labels.flatMap((l) => ['--label', l])).trim().split('\n').pop();
        fs.rmSync(bodyFile);
        const n = url.split('/').pop();
        // The register footnotes take the issue's link.
        const bare = `Issue report: [docs/issues/${r.file}](../issues/${r.file}).`;
        const linked = `Issue report: [pkp-e2e#${n}](${url}) ([docs/issues/${r.file}](../issues/${r.file})).`;
        const specs = fs.readdirSync(path.join(root, 'docs/specs')).filter((f) => f.endsWith('.md') && read(`docs/specs/${f}`).includes(bare));
        for (const f of specs) fs.writeFileSync(path.join(root, 'docs/specs', f), read(`docs/specs/${f}`).split(bare).join(linked));
        say('filed', url);
        console.log(specs.length ? `footnotes linked in ${specs.join(', ')}` : `no footnote reads "${bare}"; write this line into the entry's footnote:\n${linked}`);
        return;
    }
    const now = r.issue;
    const d = labelDiff(r);
    const lf = (s) => s.replace(/\r\n/g, '\n').trim();
    const changes = [
        norm(now.title) !== norm(r.title) && `title -> ${r.title}`,
        lf(now.body) !== lf(r.body) && 'body -> the report\'s, from its header up to "## Evidence"',
        d.add.length && `add labels ${d.add.join(', ')}`,
        d.remove.length && `remove labels ${d.remove.join(', ')}`,
    ].filter(Boolean);
    console.log(`${post ? 'edit' : 'would edit'} ${short(r)}`);
    console.log(changes.map((c) => `  ${c}`).join('\n') || '  nothing: the issue already says what the report says');
    if (!post || !changes.length) return;
    const have = new Set(ghJson('label', 'list', '-R', r.repo, '--limit', '1000', '--json', 'name').map((l) => l.name));
    for (const l of d.add.filter((x) => !have.has(x))) gh('label', 'create', l, '-R', r.repo);
    fs.writeFileSync(bodyFile, r.body);
    gh('issue', 'edit', String(r.issue.number), '-R', r.repo, '--title', r.title, '--body-file', bodyFile,
        ...d.add.flatMap((l) => ['--add-label', l]), ...d.remove.flatMap((l) => ['--remove-label', l]));
    fs.rmSync(bodyFile);
}

// --- swept -----------------------------------------------------------------

// The shipped spec whose PROGRESS note has the oldest "Swept <date>." mark; none counts as oldest.
function cmdSwept() {
    const rows = read('docs/tracking/PROGRESS.md').split('\n')
        .map((l) => l.split('|').slice(1).map((c) => c.trim()))
        .filter((c) => /^U\d{2}$/.test(c[0] || '') && c[4] === 'done')
        .map((c) => ({ row: c[0], feature: c[1], swept: (c.slice(5).join('|').match(/Swept (\d{4}-\d{2}-\d{2})\./) || [])[1] || '' }));
    const never = rows.filter((r) => !r.swept);
    const next = [...rows].sort((a, b) => a.swept.localeCompare(b.swept))[0];
    if (!next) { console.log('no shipped spec in PROGRESS'); return; }
    console.log(`${next.row} ${next.feature}: ${next.swept ? `swept ${next.swept}` : 'never swept'}`);
    console.log(`(${rows.length} shipped specs, ${never.length} never swept)`);
}

// --- brief -----------------------------------------------------------------

// Fills a template's {{slots}} from a JSON file (briefs/README.md "How to
// render a brief"). `repo_root` and `frame` fill themselves; a value
// "@file:<path>" is that file's text. An unfilled slot is an error.
function cmdBrief() {
    const [template, slotsFile, outFile] = args;
    if (!template || !slotsFile) { console.error(USAGE); process.exit(1); }
    const strip = (t) => t.replace(/^<!--[\s\S]*?-->\n/, '');
    let text = strip(read(`docs/process/briefs/${template.replace(/\.md$/, '')}.md`));
    const slots = { repo_root: root, frame: strip(read('docs/process/briefs/frame.md')).trim(), ...JSON.parse(fs.readFileSync(slotsFile, 'utf8')) };
    for (const [k, v] of Object.entries(slots)) {
        const value = String(v).startsWith('@file:') ? fs.readFileSync(String(v).slice(6), 'utf8').trim() : String(v);
        text = text.split(`{{${k}}}`).join(value);
    }
    const left = [...new Set(text.match(/\{\{\w+\}\}/g) || [])];
    if (left.length) { console.error(`unfilled: ${left.join(' ')}`); process.exit(1); }
    if (!outFile) { process.stdout.write(text); return; }
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, text);
    console.log(`${outFile} (${text.length} characters)`);
}

const commands = { issues: cmdIssues, copies: cmdCopies, resolved: cmdResolved, file: cmdFile, swept: cmdSwept, brief: cmdBrief };
if (!commands[cmd]) { console.error(USAGE); process.exit(cmd ? 1 : 0); }
try { commands[cmd](); } catch (e) { console.error(String(e.stderr || '').trim() || e.message); process.exit(1); }
