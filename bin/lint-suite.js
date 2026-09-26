#!/usr/bin/env node
/**
 * Suite lint: patterns that made tests flaky by construction (the
 * 2026-09-26 flake audit, `.reports/flake-s26/`, patterns.md "Waiting
 * strategy"). Scans apps/<app>/playwright and shared/playwright (the kept
 * checks under shared/playwright/checks excluded). Exit 1 on any hit.
 *
 * 1. `isVisible|isHidden|isChecked|isEnabled|isDisabled|isEditable({... timeout ...})`:
 *    Playwright ignores the timeout of these (deprecated), so the call is a
 *    one-shot read, not a wait (U30's `openResponseWindow`). Use
 *    `locator.waitFor({state, timeout})` or a web-first assertion.
 * 2. `page.keyboard.press('Escape')`: right after a headlessui "More
 *    Actions" menu opens, focus moves into it two frames later, so an
 *    Escape sent to the page lands on the page and closes the enclosing
 *    workflow panel instead (U01 S7 2026-09-13, U30 S4 2026-09-26). Close
 *    menus with `closeMenu()` (shared/playwright/support/menus.js). An
 *    Escape that is meant for the page carries `// lint-ok: escape <reason>`
 *    on its line or the line above.
 *
 * Usage: npm run lint:suite
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dirs = ['apps/ojs/playwright', 'apps/omp/playwright', 'apps/ops/playwright', 'shared/playwright'];
const skip = /[\\/](checks|node_modules|test-results|\.server-logs|timings)[\\/]/;

const rules = [
    {
        id: 'ignored-timeout',
        re: /\.(isVisible|isHidden|isChecked|isEnabled|isDisabled|isEditable)\(\s*\{[^}]*\btimeout\b/,
        message: 'the timeout of this call is ignored: it reads once (use waitFor or a web-first assertion)',
    },
    {
        id: 'page-escape',
        re: /\.keyboard\.press\(\s*['"]Escape['"]\s*\)/,
        allow: /lint-ok:\s*escape\b/,
        message: 'a page-level Escape: close a menu with closeMenu(), or mark an intended one "// lint-ok: escape <reason>"',
    },
];

function* files(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (skip.test(full + path.sep)) continue;
        if (entry.isDirectory()) yield* files(full);
        else if (entry.name.endsWith('.js')) yield full;
    }
}

let hits = 0;
for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of files(abs)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            for (const rule of rules) {
                if (!rule.re.test(line)) continue;
                if (rule.allow && (rule.allow.test(line) || rule.allow.test(lines[i - 1] || ''))) continue;
                if (file.endsWith(path.join('support', 'menus.js')) && rule.id === 'page-escape') continue;
                console.log(`${path.relative(root, file)}:${i + 1}: [${rule.id}] ${rule.message}`);
                hits++;
            }
        });
    }
}
if (hits) {
    console.log(`lint:suite: ${hits} finding(s)`);
    process.exit(1);
}
console.log('lint:suite: clean');
