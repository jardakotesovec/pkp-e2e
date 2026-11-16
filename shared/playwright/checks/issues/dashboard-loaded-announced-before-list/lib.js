// Helpers for the U23 A19 issue walk (walk.js beside it). Requiring this file runs nothing.

/**
 * DevTools-style network throttling through the Chrome DevTools protocol, the same call DevTools'
 * throttling menu makes: `kbitDown`/`kbitUp` as in a custom profile, or null for "No throttling".
 * (Copied from language-panel-title-typed-early-lost/lib.js.)
 */
async function throttle(cdp, profile) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', profile
        ? {offline: false, latency: profile.latency || 0, downloadThroughput: (profile.kbitDown * 1000) / 8, uploadThroughput: (profile.kbitUp * 1000) / 8}
        : {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
}

/** Chrome DevTools' "Slow 4G" preset: 562.5 ms latency, 1.44 Mbit/s down, 675 kbit/s up. */
const SLOW_4G = {latency: 562.5, kbitDown: 1440, kbitUp: 675};

/**
 * Installed with page.addInitScript: watches the page's screen-reader region `#announcer` (what a
 * screen reader speaks) and logs every change of its text, with the time and what the list shows
 * at that moment: the heading, whether its spinner turns, the first row's ID and the row count.
 * The log is `window.__a19`, fresh on every page load.
 */
function announcerLogInit() {
    window.__a19 = [];
    const state = () => {
        const h1 = document.querySelector('h1');
        const spin = h1 && h1.querySelector('.ms-3 > *');
        const rows = [...document.querySelectorAll('table tbody tr')];
        const firstCell = rows[0] && rows[0].querySelector('td');
        return {
            heading: h1 ? h1.innerText.replace(/\s+/g, ' ').trim() : null,
            spinner: spin ? !spin.classList.contains('invisible') : null,
            rows: rows.length,
            firstRow: firstCell ? firstCell.innerText.trim() : null,
        };
    };
    // The page holds two elements with id "announcer": @vue-a11y/announcer's (aria-atomic="true",
    // first in the page) and the ui-library's Announcer.vue (no aria-atomic), which the dashboard
    // speaks through. Both are watched, each entry naming which ('pkp' or 'vue').
    const watched = new Set();
    const read = () => {
        document.querySelectorAll('[id="announcer"]').forEach((el) => {
            if (watched.has(el)) return;
            watched.add(el);
            const which = el.hasAttribute('aria-atomic') ? 'vue' : 'pkp';
            const entry = (extra) => ({t: Date.now(), which, text: el.textContent, live: el.getAttribute('aria-live'), ...extra, ...state()});
            window.__a19.push(entry({found: true}));
            new MutationObserver(() => window.__a19.push(entry({})))
                .observe(el, {childList: true, characterData: true, subtree: true, attributes: true});
        });
    };
    new MutationObserver(read).observe(document, {childList: true, subtree: true});
    document.addEventListener('DOMContentLoaded', read);
}

/** The list's own request (not the sidebar's counts): `…/_submissions[/<op>]?…`. */
const isListRequest = (url) => /\/_submissions(\/[a-z-]+)?\?/.test(url) && !/viewsCount/.test(url);
const isCountRequest = (url) => /\/_submissions\/viewsCount/.test(url);

/** Records the start and end times of the list's and the counts' requests on a page. */
function watchRequests(page) {
    const log = [];
    page.on('request', (r) => {
        const u = r.url();
        if (isListRequest(u) || isCountRequest(u)) log.push({kind: isListRequest(u) ? 'list' : 'counts', url: u.replace(/^https?:\/\/[^/]+/, ''), start: Date.now(), r});
    });
    const done = (r, how) => {
        const e = log.find((x) => x.r === r && !x.end);
        if (e) { e.end = Date.now(); e.how = how; }
    };
    page.on('requestfinished', (r) => done(r, 'finished'));
    page.on('requestfailed', (r) => done(r, `failed: ${r.failure() && r.failure().errorText}`));
    return {
        mark: () => Date.now(),
        since: (from) => log.filter((e) => e.start >= from).map(({r, ...e}) => e),
    };
}

/** The announcer log entries since `from` (a Date.now() taken before the action). */
async function announcerSince(page, from, which = 'pkp') {
    return (await page.evaluate(() => window.__a19 || [])).filter((e) => e.t >= from && e.which === which);
}

/** Wait until the list's requests since `from` have all ended and the spinner is gone, then `extraMs`. */
async function listSettled(page, reqs, from, extraMs = 1500, timeout = 60_000) {
    const until = Date.now() + timeout;
    await page.waitForTimeout(300);
    while (Date.now() < until) {
        const lists = reqs.since(from).filter((e) => e.kind === 'list');
        const spinning = await page.evaluate(() => {
            const s = document.querySelector('h1 .ms-3 > *');
            return s ? !s.classList.contains('invisible') : false;
        }).catch(() => true);
        if (lists.length && lists.every((e) => e.end) && !spinning) break;
        await page.waitForTimeout(100);
    }
    await page.waitForTimeout(extraMs);
}

/**
 * What a step shows: the region's changes since `from`, the list requests, and whether "Loaded"
 * came before the last list request answered (t relative to `from`, in ms).
 */
function summarize(from, ann, reqs) {
    const lists = reqs.filter((e) => e.kind === 'list');
    const counts = reqs.filter((e) => e.kind === 'counts');
    const rel = (t) => (t == null ? null : t - from);
    const lastList = lists[lists.length - 1];
    const loaded = ann.filter((e) => e.text === 'Loaded');
    const firstLoaded = loaded[0];
    return {
        announcer: ann.map((e) => ({t: rel(e.t), text: e.text, live: e.live, heading: e.heading, spinner: e.spinner, rows: e.rows, firstRow: e.firstRow, ...(e.found ? {found: true} : {})})),
        listRequests: lists.map((e) => ({url: e.url, start: rel(e.start), end: rel(e.end), how: e.how})),
        countRequests: counts.length,
        loadedHeard: loaded.length > 0,
        loadedAt: firstLoaded ? rel(firstLoaded.t) : null,
        listAnsweredAt: lastList ? rel(lastList.end) : null,
        loadedBeforeListAnswered: firstLoaded && lastList && lastList.end ? firstLoaded.t < lastList.end : null,
        loadedAfterListAnswered: lastList && lastList.end ? loaded.some((e) => e.t >= lastList.end) : null,
        atLoaded: firstLoaded ? {heading: firstLoaded.heading, spinner: firstLoaded.spinner, rows: firstLoaded.rows, firstRow: firstLoaded.firstRow} : null,
    };
}

/** The list as it is on screen now. */
async function listNow(page) {
    return page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const rows = [...document.querySelectorAll('table tbody tr')];
        const a = [...document.querySelectorAll('[id="announcer"]')].find((x) => !x.hasAttribute('aria-atomic'));
        const v = [...document.querySelectorAll('[id="announcer"]')].find((x) => x.hasAttribute('aria-atomic'));
        return {
            heading: h1 ? h1.innerText.replace(/\s+/g, ' ').trim() : null,
            rows: rows.length,
            firstRow: rows[0] && rows[0].querySelector('td') ? rows[0].querySelector('td').innerText.trim() : null,
            announcer: a ? a.textContent : null,
            live: a ? a.getAttribute('aria-live') : null,
            announcers: document.querySelectorAll('[id="announcer"]').length,
            vueAnnouncer: v ? v.textContent : null,
        };
    });
}

/** Strips the origin from a URL. */
const path = (u) => u.replace(/^https?:\/\/[^/]+/, '');

/** The console snippet of the report's step 3, verbatim: run in the page by the walk. */
const SNIPPET = String.raw`const region = document.querySelector('[id="announcer"]:not([aria-atomic])');
new MutationObserver(() => console.log(Math.round(performance.now()), 'region:', region.textContent))
  .observe(region, {childList: true, characterData: true, subtree: true});
new PerformanceObserver((list) => list.getEntries()
  .filter((e) => /\/_submissions(\/[\w-]+)?\?/.test(e.name) && !e.name.includes('viewsCount'))
  .forEach((e) => console.log(Math.round(e.startTime), 'list request sent,', Math.round(e.responseEnd), 'answered')))
  .observe({type: 'resource'});`;

module.exports = {SNIPPET, throttle, SLOW_4G, announcerLogInit, watchRequests, announcerSince, listSettled, summarize, listNow, path, isListRequest, isCountRequest};
