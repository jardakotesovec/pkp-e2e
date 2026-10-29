#!/usr/bin/env node
// api-routes.mjs — the REST API route registry (docs/tracking/api-routes.md):
// every route the OJS, OMP and OPS checkouts register under /api/v1/, read
// statically from the controllers, with the feature that owns each one.
//
// Code side: each app's api/v1/*/index.php says which controllers it mounts;
// each controller's getHandlerPath() gives the base path and getGroupRoutes()
// the Route::get|post|put|delete|patch calls (with ->name() and the
// roleAuthorizer list of the enclosing middleware groups). App subclasses that
// call parent::getGroupRoutes() list only their own routes. The `_test`
// controllers (harness plumbing) are left out.
//
// run: npm run api-routes              print the counts and anything odd
//      npm run api-routes -- --write   regenerate the file, keeping the hand
//                                      columns (Owner, Gate) by route key
//      npm run api-routes -- --gate U40#edit-gate funders.add funders.edit
//                                      set the Gate of those routes (`—` clears;
//                                      'none: <reason>' says why a route has none)
//      npm run api-routes -- --check   lint: exit 1 when file and code differ,
//                                      an Owner is not a feature, or a Gate's
//                                      grid does not parse
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { REPO_ROOT, resolveApp } = require('./apps.js');
const { loadGrid, registryRows } = require('../shared/playwright/support/api-grids.js');
const { LABELS: PERSONA_LABELS } = require('../shared/playwright/support/personas.js');
const APPS = ['ojs', 'omp', 'ops'];
const FILE = 'docs/tracking/api-routes.md';
const METHODS = ['get', 'post', 'put', 'delete', 'patch'];
const ROLES = { SITE_ADMIN: 'admin', MANAGER: 'manager', SUB_EDITOR: 'subEditor', ASSISTANT: 'assistant',
    AUTHOR: 'author', REVIEWER: 'reviewer', READER: 'reader' };
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const odd = [];

// ---- a small PHP reader: comments out, strings kept, brackets matched ----

function stripComments(src) {
    let out = '', i = 0;
    while (i < src.length) {
        const c = src[i], n = src[i + 1];
        if (c === "'" || c === '"') {
            let j = i + 1;
            while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
            out += src.slice(i, j + 1); i = j + 1;
        } else if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 2;
        } else if ((c === '/' && n === '/') || c === '#') { while (i < src.length && src[i] !== '\n') i++;
        } else { out += c; i++; }
    }
    return out;
}

// Index of the bracket closing the one at `open` (strings skipped).
function closing(src, open) {
    const pair = { '(': ')', '[': ']', '{': '}' };
    const stack = [];
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === "'" || c === '"') { let j = i + 1; while (src[j] !== c) j += src[j] === '\\' ? 2 : 1; i = j; continue; }
        if (pair[c]) stack.push(pair[c]);
        else if (c === stack[stack.length - 1] && stack.pop() && !stack.length) return i;
    }
    throw new Error(`unbalanced bracket at ${open}`);
}

const firstString = (s) => (s.match(/^\s*(['"])(.*?)\1/) || [])[2];

// One `Route::x(...)->y(...)...;` chain as a list of calls.
function readChain(src, at) {
    const calls = [];
    const re = /\s*(?:Route::|->)(\w+)\s*\(/y;
    let end = re.lastIndex = at, m;
    while ((m = re.exec(src))) {
        const open = re.lastIndex - 1, close = closing(src, open);
        calls.push({ fn: m[1], args: src.slice(open + 1, close) });
        end = re.lastIndex = close + 1;
    }
    return { calls, end };
}

function rolesIn(args) {
    if (!args.includes('roleAuthorizer')) return null;
    const found = [...args.matchAll(/ROLE_ID_(\w+)/g)].map((m) => ROLES[m[1]] || '?');
    return found.length ? found : ['?'];
}
const intersect = (a, b) => (!a ? b : !b ? a : a.includes('?') || b.includes('?') ? ['?'] : a.filter((r) => b.includes(r)));

// Routes registered in a getGroupRoutes() body, with prefix and roles from the
// groups around them.
function walk(body, ctx, routes) {
    const re = /Route::\w+\s*\(|parent::getGroupRoutes\s*\(/g;
    let m;
    while ((m = re.exec(body))) {
        if (m[0].startsWith('parent')) { routes.parent = true; continue; }
        const { calls, end } = readChain(body, m.index);
        re.lastIndex = end;
        let { prefix, roles } = ctx, group = null, route = null;
        for (const c of calls) {
            if (METHODS.includes(c.fn) && c === calls[0]) {
                const p = firstString(c.args);
                if (p === undefined) odd.push(`unreadable path: Route::${c.fn}(${c.args.slice(0, 40)}…)`);
                route = { method: c.fn.toUpperCase(), path: p ?? '?' };
            } else if (c.fn === 'name' && route) route.name = firstString(c.args);
            else if (c.fn === 'prefix') prefix = [...prefix, firstString(c.args)];
            else if (c.fn === 'middleware') roles = intersect(roles, rolesIn(c.args));
            else if (c.fn === 'group') group = c.args.slice(c.args.indexOf('{') + 1, c.args.lastIndexOf('}'));
        }
        if (route) routes.push({ ...route, rel: [...prefix, route.path].join('/').split('/').filter(Boolean).join('/'), roles });
        if (group !== null) walk(group, { prefix, roles }, routes);
    }
}

// ---- classes: file, parent, handler path, own routes ----

const classCache = new Map();
function loadClass(app, fqcn) {
    const key = fqcn.startsWith('PKP\\') ? fqcn : `${app}:${fqcn}`;
    if (classCache.has(key)) return classCache.get(key);
    const m = fqcn.match(/^(PKP|APP)\\API\\v1\\(.+)$/);
    const root = resolveApp(app).root;
    const rel = m && `${m[1] === 'PKP' ? 'lib/pkp/' : ''}api/v1/${m[2].replace(/\\/g, '/')}.php`;
    if (!rel || !fs.existsSync(path.join(root, rel))) { classCache.set(key, null); return null; }
    const src = stripComments(fs.readFileSync(path.join(root, rel), 'utf8'));
    const uses = Object.fromEntries([...src.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)]
        .map(([, full, alias]) => [alias || full.split('\\').pop(), full]));
    const ns = (src.match(/^namespace\s+([\w\\]+);/m) || [])[1];
    const ext = (src.match(/class\s+\w+\s+extends\s+([\w\\]+)/) || [])[1];
    const resolve = (n) => n.startsWith('\\') ? n.slice(1) : uses[n.split('\\')[0]]
        ? [uses[n.split('\\')[0]], ...n.split('\\').slice(1)].join('\\') : `${ns}\\${n}`;
    const cls = { key, fqcn, short: fqcn.split('\\').pop(), app: m[1] === 'PKP' ? null : app, file: rel,
        parent: ext ? loadClass(app, resolve(ext)) : null };
    const hp = src.match(/function\s+getHandlerPath\s*\([^)]*\)[^{]*\{\s*return\s+(['"])(.*?)\1/);
    cls.base = hp ? hp[2] : cls.parent?.base;
    const mw = src.search(/function\s+getRouteGroupMiddleware\s*\(/);
    const mwBody = mw >= 0 && src.slice(src.indexOf('{', mw), closing(src, src.indexOf('{', mw)));
    cls.roles = mw < 0 ? cls.parent?.roles : /\bif\s*\(/.test(mwBody) && mwBody.includes('roleAuthorizer') ? ['?'] : rolesIn(mwBody);
    const gr = src.search(/function\s+getGroupRoutes\s*\(/);
    if (gr >= 0) {
        const open = src.indexOf('{', gr);
        cls.routes = [];
        walk(src.slice(open + 1, closing(src, open)), { prefix: [], roles: null }, cls.routes);
    }
    classCache.set(key, cls);
    return cls;
}

// The routes a mounted class serves, each tagged with the class that declares it.
function served(cls) {
    if (!cls) return [];
    if (!cls.routes) return served(cls.parent);
    const own = cls.routes.map((r) => ({ ...r, cls }));
    return cls.routes.parent ? [...served(cls.parent), ...own] : own; // parent first: a route registered again is listed under the parent
}

// ---- the code side: every mounted route, per app ----

function scanCode() {
    const rows = new Map(); // `${scope}|${key}` -> row
    const declared = new Set(), mounted = new Set();
    for (const app of APPS) {
        const root = resolveApp(app).root;
        for (const rel of ['lib/pkp/api/v1', 'api/v1']) {
            for (const f of fs.readdirSync(path.join(root, rel), { recursive: true })) {
                if (!f.endsWith('Controller.php') || f.split(path.sep).includes('_test')) continue;
                declared.add(`${rel === 'api/v1' ? `${app}:APP` : 'PKP'}\\API\\v1\\${f.slice(0, -4).split(path.sep).join('\\')}`);
            }
        }
        const seen = new Map();
        for (const dir of fs.readdirSync(path.join(root, 'api/v1')).filter((d) => d !== '_test')) {
            const entry = path.join(root, 'api/v1', dir, 'index.php');
            if (!fs.existsSync(entry)) continue;
            const src = stripComments(fs.readFileSync(entry, 'utf8'));
            const uses = Object.fromEntries([...src.matchAll(/^use\s+([\w\\]+);/gm)].map(([, u]) => [u.split('\\').pop(), u]));
            for (const [, name] of src.matchAll(/new\s+\\?([\w\\]+Controller)\s*\(/g)) {
                const cls = loadClass(app, uses[name] || name);
                if (!cls) { odd.push(`${app}: api/v1/${dir}/index.php mounts ${name}, which does not exist`); continue; }
                for (let c = cls; c; c = c.parent) mounted.add(c.key);
                for (const r0 of served(cls)) {
                    const r = { ...r0, roles: intersect(cls.roles, r0.roles) }; // the mounted class's own middleware wraps every route
                    const fullPath = [cls.base, r.rel].filter(Boolean).join('/');
                    const key = r.name || `${r.method} ${fullPath}`;
                    const prev = seen.get(key);
                    if (prev && prev.method === r.method && prev.path === fullPath) {
                        odd.push(`${app}: ${r.cls.short} registers ${key} again, as ${prev.cls.short} does; listed once, under ${prev.cls.short}`);
                        continue;
                    }
                    if (prev) { odd.push(`${app}: key collision ${key}: ${prev.method} ${prev.path} and ${r.method} ${fullPath}`); continue; }
                    const scope = r.cls.app || 'pkp';
                    seen.set(key, { method: r.method, path: fullPath, cls: r.cls });
                    const id = `${scope}|${key}`;
                    const row = rows.get(id) || { scope, key, name: r.name, method: r.method, path: fullPath,
                        roles: r.roles ? Object.values(ROLES).concat('?').filter((x) => r.roles.includes(x)).join(' ') : 'none', apps: [], cls: r.cls };
                    if (rows.has(id) && (row.method !== r.method || row.path !== fullPath)) {
                        odd.push(`${app}: ${key} differs from another app's (${row.method} ${row.path} vs ${r.method} ${fullPath})`);
                    }
                    row.apps.push(app);
                    rows.set(id, row);
                }
            }
        }
    }
    for (const k of declared) if (!mounted.has(k)) odd.push(`no app mounts ${k.replace(/^\w+:/, '')}${k.includes(':') ? ` (${k.split(':')[0]})` : ''}`);
    return rows;
}

// ---- the tracking side: feature claims, the file itself ----


function sectionTitle(cls) {
    return `${cls.base} — ${cls.short}${cls.app ? ` [${cls.app}]` : ''}`;
}

function hasGrid(owner) {
    const spec = /^U\d{2}$/.test(owner) && fs.readdirSync(path.join(REPO_ROOT, 'docs/specs')).find((f) => f.startsWith(`${owner}-`));
    return !!spec && read(`docs/specs/${spec}`).includes('<a id="api-grid-');
}

function features() {
    const ids = new Set([...read('docs/tracking/FEATURE-MAP.md').matchAll(/^### (U\d{2}) —/gm)].map((m) => m[1]));
    return ids;
}

function parseFile() {
    if (!fs.existsSync(path.join(REPO_ROOT, FILE))) return new Map();
    return new Map(registryRows().map((r) => [`${r.scope}|${r.key}`, { ...r, apps: r.apps.join(' ') }]));
}

const cell = (r) => [r.name ? `\`${r.name}\`` : '—', r.method, `\`${r.path}\``, r.apps.join(' '), r.roles];

function render(rows, kept) {
    const sections = new Map();
    for (const [id, r] of rows) {
        const t = sectionTitle(r.cls);
        if (!sections.has(t)) sections.set(t, []);
        const k = kept.get(id);
        sections.get(t).push(`| ${[...cell(r), k?.owner ?? '', k?.gate || '—'].join(' | ')} |`.replace(/ {2}\|/g, ' |'));
    }
    const out = [read(FILE).split('\n### ')[0].trimEnd(), ''];
    for (const t of [...sections.keys()].sort()) {
        out.push(`### ${t}`, '', '| Route | Method | Path | Apps | Roles | Owner | Gate |', '|---|---|---|---|---|---|---|', ...sections.get(t), '');
    }
    return out.join('\n');
}

// A gate names a permission grid (docs/process/api.md): it must parse, and
// its rows must be persona labels. Returns the problem, or null.
function gateProblem(gate) {
    if (!/^U\d{2}#[a-z0-9-]+$/.test(gate)) return 'is not of the form U40#edit-gate';
    try {
        const grid = loadGrid(gate);
        const unknown = grid.rows.map((r) => r.persona).filter((p) => !PERSONA_LABELS.includes(p));
        if (unknown.length) return `has rows that are no persona: ${unknown.join(', ')}`;
        // A column nobody may call would read every refusal as agreement,
        // even one a broken maker caused (a wrong path answers 404).
        const empty = grid.states.filter((s) => !grid.rows.some((r) => r.cells[s] === true));
        return empty.length ? `has a column with no ✓: ${empty.join(', ')}` : null;
    } catch (e) {
        return e.message;
    }
}

function check(rows, kept) {
    const problems = [];
    const known = features();
    for (const [id, r] of rows) {
        const k = kept.get(id);
        if (!k) { problems.push(`missing from the file: ${r.method} ${r.path} (${r.key})`); continue; }
        if (k.method !== r.method || k.path !== r.path || k.apps !== r.apps.join(' ') || k.roles !== r.roles) {
            problems.push(`out of date (run --write): ${r.key}`);
        }
    }
    for (const [id, k] of kept) {
        if (!rows.has(id)) { problems.push(`no longer in code: ${k.method} ${k.path} (${id.split('|')[1]})`); continue; }
        if (!k.owner) problems.push(`Owner is blank: ${id.split('|')[1]}`);
        else if (k.owner !== 'parked' && !known.has(k.owner)) problems.push(`Owner "${k.owner}" is not a feature ID or parked: ${id.split('|')[1]}`);
        const gateIssue = k.gate === '—' || k.gate.startsWith('none: ') ? null : gateProblem(k.gate);
        if (gateIssue) problems.push(`Gate "${k.gate}" ${gateIssue}: ${id.split('|')[1]}`);
        // A feature that has API coverage (a grid in its spec) gates every
        // route it owns, or says why not (`none: <reason>`).
        if (k.gate === '—' && hasGrid(k.owner)) problems.push(`Gate is blank on a route of ${k.owner}, which has API coverage (a grid, or none: <reason>): ${id.split('|')[1]}`);
    }
    return problems;
}

// The Gate column of the named routes (a name, or `METHOD path` for an
// unnamed one), set in place.
function setGate(gate, keys) {
    let text = read(FILE);
    const done = new Set();
    for (const row of registryRows().filter((r) => keys.includes(r.key))) {
        text = text.replace(row.line, row.line.replace(/\| [^|]+ \|$/, `| ${gate} |`));
        done.add(row.key);
    }
    fs.writeFileSync(path.join(REPO_ROOT, FILE), text);
    const missing = keys.filter((k) => !done.has(k));
    console.log(`gate ${gate} set on ${done.size} route(s)${missing.length ? `; no such route: ${missing.join(', ')}` : ''}`);
    if (missing.length) process.exit(1);
}

// ---- main ----

if (process.argv[2] === '--gate') {
    setGate(process.argv[3], process.argv.slice(4));
    process.exit(0);
}

const rows = scanCode();
const kept = parseFile();
const mode = process.argv[2];
if (mode === '--write') {
    fs.writeFileSync(path.join(REPO_ROOT, FILE), render(rows, kept));
    console.log(`wrote ${FILE}`);
}
for (const o of [...new Set(odd)]) console.log(`note: ${o}`);
const perApp = APPS.map((a) => `${a} ${[...rows.values()].filter((r) => r.apps.includes(a)).length}`).join(', ');
console.log(`${rows.size} rows; routes per app: ${perApp}`);
if (mode === '--check') {
    const problems = check(rows, parseFile());
    for (const p of problems) console.log(`✗ ${p}`);
    if (problems.length) process.exit(1);
    console.log('api-routes: file and code agree');
}
