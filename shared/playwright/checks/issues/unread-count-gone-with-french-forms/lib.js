// Helpers for walk.js (U05 A15). Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** The number on the editorial header's "Tasks" button ("Tasks 26" → "26"; "Tasks" alone → "0"). */
async function bellCount(page) {
    const bell = page.getByRole('button', {name: /^Tasks/}).first();
    await bell.waitFor({state: 'visible', timeout: T});
    const text = flat(await bell.innerText());
    const m = /(\d+)/.exec(text);
    return {text, count: m ? m[1] : '0'};
}

/**
 * The reader-side header's user menu as the page holds it: the name link's
 * text as displayed and its markup, and every `.task_count` with whether it
 * is displayed (a hidden one has no client rects).
 */
async function userNav(page) {
    return page.evaluate(() => {
        const wrap = document.querySelector('#navigationUserWrapper');
        const name = wrap ? wrap.querySelector('#navigationUser > li > a') : null;
        const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
        return {
            nameShown: name ? name.innerText.replace(/\s+/g, ' ').trim() : null,
            nameHTML: name ? name.innerHTML.replace(/\s+/g, ' ').trim() : null,
            nameHasCount: name ? !!name.querySelector('.task_count') : null,
            counts: wrap ? [...wrap.querySelectorAll('.task_count')].map((e) => ({
                text: e.textContent.trim(),
                displayed: shown(e),
                under: e.closest('ul ul') ? 'Dashboard entry' : 'name',
            })) : [],
            entries: wrap ? [...wrap.querySelectorAll('ul ul a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()) : [],
        };
    });
}

/** Open a page by its address and wait for it to settle. */
async function open(page, url) {
    await page.goto(url);
    await idle(page).catch(() => {});
}

module.exports = {T, flat, bellCount, userNav, open};
