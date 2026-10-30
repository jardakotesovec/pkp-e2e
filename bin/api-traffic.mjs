#!/usr/bin/env node
// api-traffic.mjs — the traffic map (docs/process/api.md "The traffic map"):
// the API calls a suite run made, logged by shared/playwright/support/
// api-traffic.js, mapped onto the route registry (docs/tracking/api-routes.md).
//
// run: npm run api-traffic -- <ci-run-id>        a CI run's logs (gh downloads them)
//      npm run api-traffic -- --local            this clone's apps/*/playwright/.api-traffic/
//      npm run api-traffic -- --clear            empty the local logs and exit (before a fresh local run)
//      … --feature U43                           only that feature's routes in the table
//      … --against <run-id>                      mark the server errors that run met too,
//                                                so the daily read judges only new ones
//
// Writes .reports/api-traffic/<run>.md: per feature, each route and who
// reached it (the screens, as which roles; the API checks), the routes nothing
// reached, every 5xx answer with the test that met it, and calls no route
// in the registry matches. Prints the totals.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { REPO_ROOT } = require('./apps.js');
const { registryRows } = require('../shared/playwright/support/api-grids.js');
const REPO = 'jardakotesovec/pkp-e2e';

const args = process.argv.slice(2);
const feature = args.includes('--feature') ? args[args.indexOf('--feature') + 1] : null;
const against = args.includes('--against') ? args[args.indexOf('--against') + 1] : null;
const runId = args.find((a) => /^\d+$/.test(a) && a !== against);
if (args.includes('--clear')) {
    for (const app of ['ojs', 'omp', 'ops']) fs.rmSync(path.join(REPO_ROOT, 'apps', app, 'playwright', '.api-traffic'), { recursive: true, force: true });
    console.log('api-traffic: local logs cleared');
    process.exit(0);
}
if (!runId && !args.includes('--local')) {
    console.error('usage: npm run api-traffic -- <ci-run-id> | --local [--feature U43]');
    process.exit(2);
}

// ---- the logs ----

function logDirs(run) {
    if (!run) return ['ojs', 'omp', 'ops'].map((app) => path.join(REPO_ROOT, 'apps', app, 'playwright', '.api-traffic'));
    const dir = path.join(REPO_ROOT, '.reports', 'api-traffic', run);
    if (!fs.existsSync(dir)) {
        execFileSync('gh', ['run', 'download', run, '-R', REPO, '-p', 'api-traffic-*', '-D', dir], { stdio: 'inherit' });
    }
    return fs.readdirSync(dir).map((d) => path.join(dir, d));
}

/** Every logged call of a run (or of the local logs). */
function loadCalls(run) {
    const out = [];
    for (const dir of logDirs(run).filter((d) => fs.existsSync(d))) {
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
            for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
                if (line.trim()) out.push(JSON.parse(line));
            }
        }
    }
    return out;
}

const calls = loadCalls(runId);
// A server error's shape: app, method and path with its numbers blanked.
const errorShape = (c) => `${c.app} ${c.m} ${c.p.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/{id}')}`;
const seenBefore = new Set(against ? loadCalls(against).filter((c) => c.s >= 500).map(errorShape) : []);

// ---- the registry ----

const routes = registryRows().map((r) => ({
    ...r,
    re: new RegExp(`^${r.path.split('/').map((seg) => (/^\{\w+\}$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))).join('/')}$`),
    literal: r.path.replace(/\{\w+\}/g, '').length, // the more literal, the more specific
    screens: new Map(), api: new Map(), statuses: new Set(), query: new Set(),
}));

/** A roster username's role (`manager.maya` → manager); a scratch account is "scratch". */
const role = (user) =>
    user === null ? 'nobody' : user === '?' ? 'unknown' : user === 'admin' ? 'admin' : user.includes('.') ? user.split('.')[0] : 'scratch';

const errors = [];
const unmatched = new Map();
for (const call of calls) {
    const p = call.p.split('?')[0];
    const route = routes
        .filter((r) => r.method === call.m && r.apps.includes(call.app) && r.re.test(p))
        .sort((a, b) => b.literal - a.literal)[0];
    if (call.s >= 500) errors.push(call);
    if (!route) {
        const k = `${call.m} ${p.replace(/\/\d+(?=\/|$)/g, '/{id}')}`;
        unmatched.set(k, (unmatched.get(k) || 0) + 1);
        continue;
    }
    const seen = call.via === 'api' ? route.api : route.screens;
    seen.set(role(call.u), (seen.get(role(call.u)) || 0) + 1);
    route.statuses.add(call.s);
    if (call.via === 'screen') for (const key of call.q || []) route.query.add(key.replace(/\[\]$/, ''));
}

// ---- the report ----

const out = [`# API traffic: ${runId ? `CI run ${runId}` : 'local logs'}`, ''];
const byOwner = new Map();
for (const r of routes) {
    if (!byOwner.has(r.owner)) byOwner.set(r.owner, []);
    byOwner.get(r.owner).push(r);
}
const count = (list, test) => list.filter(test).length;
const total = {
    routes: routes.length,
    screens: count(routes, (r) => r.screens.size),
    apiOnly: count(routes, (r) => !r.screens.size && r.api.size),
    none: count(routes, (r) => !r.screens.size && !r.api.size),
};
out.push(`${calls.length} calls. Of ${total.routes} routes: ${total.screens} reached by the screens, ${total.apiOnly} by API checks alone, ${total.none} by nothing.`, '');
out.push('| Owner | Routes | Screens | API checks only | Nothing |', '|---|---|---|---|---|');
for (const [owner, list] of [...byOwner].sort()) {
    out.push(`| ${owner} | ${list.length} | ${count(list, (r) => r.screens.size)} | ${count(list, (r) => !r.screens.size && r.api.size)} | ${count(list, (r) => !r.screens.size && !r.api.size)} |`);
}
const fmt = (seen) => [...seen].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—';
for (const [owner, list] of [...byOwner].sort()) {
    if (feature && owner !== feature) continue;
    out.push('', `## ${owner}`, '', '| Route | Method | Screens, by role | Query keys the screens send | API checks | Statuses | Gate |', '|---|---|---|---|---|---|---|');
    for (const r of list) {
        out.push(`| \`${r.key}\` | ${r.method} | ${fmt(r.screens)} | ${[...r.query].sort().join(', ') || '—'} | ${fmt(r.api)} | ${[...r.statuses].sort().join(' ') || '—'} | ${r.gate} |`);
    }
}
out.push('', '## Server errors', '');
if (against) out.push(`Marked "seen in ${against}": the shapes that run met too; the others are new.`, '');
out.push(...(errors.length
    ? errors.map((e) => `- ${e.s} ${e.m} \`${e.p}\` (${e.app}, ${e.f}, as ${role(e.u)})${seenBefore.has(errorShape(e)) ? ` · seen in ${against}` : ''}`)
    : ['None.']));
out.push('', '## Calls no route matches', '');
out.push(...(unmatched.size ? [...unmatched].map(([k, n]) => `- ${k} (${n})`) : ['None.']));

const file = path.join(REPO_ROOT, '.reports', 'api-traffic', `${runId || 'local'}.md`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out.join('\n') + '\n');
console.log(out[2]);
const fresh = errors.filter((e) => !seenBefore.has(errorShape(e))).length;
console.log(`${errors.length} server errors${against ? ` (${fresh} new since ${against})` : ''}, ${unmatched.size} unmatched call shapes; report: ${path.relative(REPO_ROOT, file)}`);
