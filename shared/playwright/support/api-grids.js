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
 *   one column per state (`Unpublished`, `Published`, or `Allowed` for a
 *   rule with no submission), each cell `✓` (allowed), `—` (refused) or
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
 * Every registry route whose Gate is set.
 *
 * @returns {{key: string, method: string, path: string, apps: string[], owner: string, gate: string}[]}
 */
function gatedRoutes(registryFile = REGISTRY) {
    const routes = [];
    for (const cells of tableRows(fs.readFileSync(registryFile, 'utf8').split('\n'))) {
        if (cells.length !== 7 || cells[0] === 'Route' || /^-+$/.test(cells[0])) {
            continue;
        }
        const [key, method, routePath, apps, , owner, gate] = cells.map((cell) => cell.replace(/`/g, ''));
        if (gate && gate !== '—') {
            routes.push({key, method, path: routePath, apps: apps.split(/\s+/), owner, gate});
        }
    }
    return routes;
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

module.exports = {gatedRoutes, loadGrid};
