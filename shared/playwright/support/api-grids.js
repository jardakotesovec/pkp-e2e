/**
 * @file shared/playwright/support/api-grids.js
 *
 * Reads the two public halves of an API permission check
 * (docs/process/api.md "Permission grids"):
 *
 * - the route registry, docs/tracking/api-routes.md: each route's method,
 *   path, apps and Gate, the grid that says who may call it;
 * - a permission grid in the spec that owns the rule: the table right after
 *   `<a id="api-grid-<name>"></a>`, one row per persona (the labels of
 *   support/personas.js, optionally with an app badge such as `{OJS OMP}`),
 *   one column per state (`Unpublished`, `Published`, `Review`, a route's
 *   own `Draft`, or `Context` and `Site` for a rule with no submission),
 *   each cell `✓` (allowed), `—` (refused) or
 *   `?` (an open question, not checked; the cell links its register entry).
 *
 * The checks that sweep the grids are private (docs/process/api.md);
 * `npm run api-routes -- --check` uses this file to lint them.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../..');
const REGISTRY = path.join(REPO, 'docs/tracking/api-routes.md');

/** Table rows of a markdown block as arrays of trimmed cells. */
function tableRows(lines) {
    return lines
        .filter((line) => line.trim().startsWith('|'))
        .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
}

/**
 * Every row of the route registry, in file order. `key` is the route's
 * name, or `METHOD path` for an unnamed route; `scope` the app whose own
 * controller subclass lists it (`pkp` for the shared ones); `line` the row
 * as written.
 *
 * @returns {{scope: string, key: string, method: string, path: string, apps: string[], roles: string, owner: string, gate: string, line: string}[]}
 */
function registryRows(registryFile = REGISTRY) {
    const rows = [];
    let scope = 'pkp';
    for (const line of fs.readFileSync(registryFile, 'utf8').split('\n')) {
        const heading = line.match(/^### .* — \w+(?: \[(\w+)\])?/);
        if (heading) {
            scope = heading[1] || 'pkp';
            continue;
        }
        const c = line.split('|').map((cell) => cell.trim());
        if (c.length !== 9 || !/^[A-Z]+$/.test(c[2])) {
            continue;
        }
        const name = c[1].replace(/`/g, '');
        const routePath = c[3].replace(/`/g, '');
        rows.push({
            scope,
            key: name === '—' ? `${c[2]} ${routePath}` : name,
            method: c[2],
            path: routePath,
            apps: c[4].split(/\s+/),
            roles: c[5],
            owner: c[6],
            gate: c[7],
            line,
        });
    }
    return rows;
}

/**
 * The routes a permission grid covers: a Gate that is neither `—` nor
 * `none: …`. A Gate ending in `!` (`U61#administration!`) follows its grid
 * for refusals only (`refusalsOnly`, the `!` dropped from `gate`): an
 * allowed call would harm the shared installs, so it is never made.
 */
function gatedRoutes(registryFile = REGISTRY) {
    return registryRows(registryFile)
        .filter((r) => r.gate && r.gate !== '—' && !r.gate.startsWith('none: '))
        .map((r) => (r.gate.endsWith('!') ? {...r, gate: r.gate.slice(0, -1), refusalsOnly: true} : r));
}

const CELL = {'✓': true, '—': false, '?': null};

/**
 * The grid a gate reference names (`U40#edit-gate`).
 *
 * @returns {{ref: string, file: string, states: string[], rows: {persona: string, apps: string[]|null, cells: Object<string, boolean|null>}[]}}
 */
function loadGrid(ref, specsDir = path.join(REPO, 'docs/specs')) {
    const [feature, name] = ref.split('#');
    const file = fs.readdirSync(specsDir).find((f) => f.startsWith(`${feature}-`) && f.endsWith('.md'));
    if (!file || !name) {
        throw new Error(`api-grids: no spec for gate "${ref}"`);
    }
    const lines = fs.readFileSync(path.join(specsDir, file), 'utf8').split('\n');
    const anchor = lines.findIndex((line) => line.includes(`<a id="api-grid-${name}"></a>`));
    if (anchor < 0) {
        throw new Error(`api-grids: ${file} has no <a id="api-grid-${name}"></a>`);
    }
    const start = lines.findIndex((line, i) => i > anchor && line.trim().startsWith('|'));
    const end = lines.findIndex((line, i) => i > start && !line.trim().startsWith('|'));
    const [header, , ...body] = tableRows(lines.slice(start, end < 0 ? undefined : end));
    const states = header.slice(1).map((state) => state.toLowerCase());
    const rows = body.map((cells) => {
        const badge = cells[0].match(/\{([A-Z ]+)\}/);
        const persona = cells[0].replace(/\{[A-Z ]+\}/, '').trim();
        const row = {persona, apps: badge ? badge[1].toLowerCase().split(/\s+/) : null, cells: {}};
        states.forEach((state, i) => {
            const mark = (cells[i + 1] || '').charAt(0);
            if (!(mark in CELL)) {
                throw new Error(`api-grids: ${ref}, row "${persona}", column "${state}": "${cells[i + 1]}" is not ✓, — or ?`);
            }
            row.cells[state] = CELL[mark];
        });
        return row;
    });
    return {ref, file, states, rows};
}

module.exports = {registryRows, gatedRoutes, loadGrid};
