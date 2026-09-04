#!/usr/bin/env node
// session-cost.mjs — price-weighted token spend of one Claude Code session, split
// orchestrator vs subagent roles. Rows paste into docs/tracking/cost-ledger.md.
// run: node bin/session-cost.mjs <session.jsonl> [--label U02] [--append]
// --append writes the table and summary line under "## <label>" at the end of docs/tracking/cost-ledger.md.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: node bin/session-cost.mjs <session.jsonl> [--label U02] [--append]'); process.exit(1); }
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : path.basename(file, '.jsonl').slice(0, 8);

const WEIGHTS = { output: 5, input: 1, cacheCreate: 1.25, cacheRead: 0.1 };
// Matched in order; the first hit wins ("claim-check fold" is a fold, not a claim check).
const ROLES = [
    ['finalize/fold', /finaliz|\bfold\b/i], ['merge', /\bmerge\b/i], ['claim check', /claim[ -]check/i],
    ['spec author', /spec author/i], ['test author', /test author/i], ['probe', /\bprobe\b/i],
    ['digest', /\bdigest\b/i], ['readability/persona', /persona/i], ['rewrite', /rewrite/i],
];
const roleOf = (meta) => {
    if (/^(Plan|Explore)$/.test(meta.agentType || '')) return 'explore/plan';
    const hit = ROLES.find(([, re]) => re.test(meta.description || ''));
    return hit ? hit[0] : `other: ${meta.description || '(no description)'}`;
};

// One API response is written as several lines with the same message.id (one
// per content block) and identical usage; naive summing inflates ~2.5×. Usage
// is taken once per id; tool_use blocks are collected across all its lines.
// "<synthetic>" messages (session-limit notices) are not API calls and are skipped.
function tally(jsonl) {
    const usage = new Map();
    const withTool = new Set();
    for (const line of fs.readFileSync(jsonl, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let row; try { row = JSON.parse(line); } catch { continue; }
        const m = row.message;
        if (row.type !== 'assistant' || !m?.usage || !m.id || m.model === '<synthetic>') continue;
        if (!usage.has(m.id)) usage.set(m.id, m.usage);
        if ((Array.isArray(m.content) ? m.content : []).some((b) => b.type === 'tool_use')) withTool.add(m.id);
    }
    const t = { calls: usage.size, pureText: usage.size - withTool.size, input: 0, cacheCreate: 0, cacheRead: 0, output: 0 };
    for (const u of usage.values()) {
        t.input += u.input_tokens || 0;
        t.cacheCreate += u.cache_creation_input_tokens || 0;
        t.cacheRead += u.cache_read_input_tokens || 0;
        t.output += u.output_tokens || 0;
    }
    return t;
}
const weighted = (t) => Object.entries(WEIGHTS).reduce((s, [k, w]) => s + t[k] * w, 0);
const add = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] || 0) + b[k]; return a; };

const orch = tally(file);
const agentsDir = path.join(path.dirname(file), path.basename(file, '.jsonl'), 'subagents');
const roles = new Map();
let agentCount = 0;
for (const f of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir) : []) {
    if (!/^agent-.*\.jsonl$/.test(f)) continue;
    const metaFile = path.join(agentsDir, f.replace(/\.jsonl$/, '.meta.json'));
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
    const role = roleOf(meta);
    roles.set(role, add(roles.get(role) || { agents: 0 }, { agents: 1, ...tally(path.join(agentsDir, f)) }));
    agentCount++;
}

const total = [...roles.values()].reduce((acc, t) => add(acc, t), add({}, orch));
const wTotal = weighted(total);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (t) => `${((100 * weighted(t)) / wTotal).toFixed(1)}%`;
const row = (...cells) => `| ${cells.join(' | ')} |`;

const lines = [];
lines.push(row('role', 'agents', 'calls', 'pure text', 'input', 'cache creation', 'cache read', 'output', 'weighted', 'share'));
lines.push(row('---', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:'));
lines.push(row('orchestrator', '—', orch.calls, orch.pureText, fmt(orch.input), fmt(orch.cacheCreate), fmt(orch.cacheRead), fmt(orch.output), fmt(weighted(orch)), pct(orch)));
for (const [role, t] of [...roles].sort((a, b) => weighted(b[1]) - weighted(a[1]))) {
    lines.push(row(role, t.agents, t.calls, t.pureText, fmt(t.input), fmt(t.cacheCreate), fmt(t.cacheRead), fmt(t.output), fmt(weighted(t)), pct(t)));
}
lines.push(row('**total**', agentCount, total.calls, total.pureText, fmt(total.input), fmt(total.cacheCreate), fmt(total.cacheRead), fmt(total.output), fmt(wTotal), '100%'));
const summary = `${label} · ${agentCount} agents · ${total.calls - orch.calls} subagent calls · ${orch.calls} orchestrator calls · weighted ${fmt(wTotal)}`;
console.log(lines.join('\n'));
console.log(`\n${summary}`);
if (args.includes('--append')) {
    const ledger = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'docs', 'tracking', 'cost-ledger.md');
    fs.appendFileSync(ledger, `\n## ${label}\n\n${lines.join('\n')}\n\n${summary}\n`);
    console.log(`\nappended to ${path.relative(process.cwd(), ledger)}`);
}
