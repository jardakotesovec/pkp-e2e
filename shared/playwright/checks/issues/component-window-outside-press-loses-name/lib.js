// Helpers for block.js (the custom block window's walk, spec U09 A21). Copied, not required, from
// setup-save-refused-disabled-block/lib.js (setPluginEnabled) and static-page-content-change-lost-on-close/lib.js
// (the shade's point), so this folder stays self-contained. Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rowOf = (page, plugin) => page.locator(`tr.gridRow[id$="-row-${plugin}"]`).first();

/** On Settings › Website › "Plugins" (already open): tick a plugin's box; returns the grid's answer and the box. */
async function enablePlugin(page, plugin) {
    const row = rowOf(page, plugin);
    await row.waitFor({timeout: T});
    const box = row.getByRole('checkbox').first();
    if (await box.isChecked()) return {already: true};
    const answered = page.waitForResponse((r) => /plugin-grid\/enable/.test(r.url()), {timeout: T});
    await box.click();
    const r = await answered;
    await idle(page);
    await sleep(500);
    return {status: r.status(), now: await rowOf(page, plugin).getByRole('checkbox').first().isChecked()};
}

/**
 * A point on the shaded page left of the open side windows, half way down: the first x from the left edge
 * where the top element is the shade (`div.DialogOverlay`). Returns the point and what lies there.
 */
async function shadePoint(page) {
    return page.evaluate(() => {
        const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className);
        const y = Math.round(window.innerHeight / 2);
        for (let x = 8; x < window.innerWidth / 2; x += 8) {
            const top = document.elementFromPoint(x, y);
            if (top && /DialogOverlay/.test(cls(top))) return {x, y, shade: true};
        }
        const top = document.elementFromPoint(12, y);
        return {x: 12, y, shade: false, met: top ? `${top.tagName.toLowerCase()}.${cls(top).slice(0, 60)}` : null};
    });
}

/** The element holding the focus, as a short selector-like string. */
async function focused(page) {
    return page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return `${el.tagName.toLowerCase()}${el.name ? `[name="${el.name}"]` : ''}${el.id ? `#${el.id}` : ''}`;
    });
}

module.exports = {T, sleep, enablePlugin, shadePoint, focused};
