/**
 * @file sandbox/drive-guard.js
 *
 * A plugin review's drive runs its browser as the bot, outside the
 * sandbox's egress wall (harness.md "The plugin sandbox"). This keeps the
 * browser on the pod's two ports: every request a page makes to any other
 * host is refused and written to the given log, which the drive reports as
 * the plugin's outside contacts from the browser. Make every context with
 * it, never with `browser.newContext()` directly:
 *
 *   const {newGuardedContext} = require('<repo>/sandbox/drive-guard.js');
 *   const context = await newGuardedContext(browser, '<repo>/.reports/plugin-review/pg-<PR>/drive/outside.log');
 *
 * `allow` adds hosts the review's request allowed (host or host:port);
 * other options go to `browser.newContext()`. `readNotices(page)` keeps
 * the page's notification texts (below). API calls go through the
 * page (`page.evaluate(() => fetch(…))`): `page.request` and
 * `context.request` ignore the bypass list and fail on the dead proxy
 * (ECONNREFUSED 127.0.0.1:9) for every host, the pod's included. A POST
 * that 3.5 sends on to its localized URL is warned about on the console.
 *
 * Two layers. The context's proxy is a dead port with only the open hosts
 * bypassed (and `<-loopback>`, so other loopback ports, the slots' apps
 * among them, are refused too): every request to another host fails in
 * the network stack, the hops of a redirect chain included. Playwright's
 * route handler sees only the first request of a chain, so a route alone
 * let the browser follow a pod's 302 to an outside host (2026-11-06).
 * The route still aborts and logs a page's direct requests;
 * `requestfailed` logs what the proxy refused (a redirect hop names the
 * URL it came from).
 */
const fs = require('fs');

const POD = ['127.0.0.1:19000', '127.0.0.1:19025'];
const DEAD_PROXY = 'http://127.0.0.1:9'; // discard port, nothing listens

function pageOf(request) {
    try {
        return request.frame().page().url();
    } catch {
        return '?'; // a request with no frame (a worker's)
    }
}

async function newGuardedContext(browser, logFile, {allow = [], ...options} = {}) {
    const open = [...POD, ...allow];
    const context = await browser.newContext({
        ...options,
        serviceWorkers: 'block',
        proxy: {server: DEAD_PROXY, bypass: ['<-loopback>', ...open].join(',')},
    });
    const openSet = new Set(open);
    const isOpen = (url) => !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || openSet.has(url.host) || openSet.has(url.hostname);
    const log = (request, note) => fs.appendFileSync(logFile,
        `${new Date().toISOString()} ${request.resourceType()} ${request.method()} ${request.url().slice(0, 500)}${note} (page ${pageOf(request)})\n`);
    await context.route('**/*', (route) => {
        const request = route.request();
        if (isOpen(new URL(request.url()))) {
            return route.continue();
        }
        log(request, '');
        return route.abort('blockedbyclient');
    });
    context.on('requestfailed', (request) => {
        const failure = (request.failure() || {}).errorText || '';
        if (failure.includes('BLOCKED_BY_CLIENT')) {
            return; // the route above logged it
        }
        if (isOpen(new URL(request.url())) && !failure.includes('PROXY')) {
            return; // an ordinary failure on the pod
        }
        const from = request.redirectedFrom();
        log(request, ` [${failure}]${from ? ` (redirect from ${from.url().slice(0, 200)})` : ''}`);
    });
    context.on('response', (response) => {
        const request = response.request();
        const to = response.headers().location;
        if (request.method() !== 'POST' || ![301, 302, 303].includes(response.status()) || !to) {
            return;
        }
        // 3.5 sends an unlocalized URL to its localized one; the browser
        // follows with a GET, so the POST's body never lands, silently.
        const from = new URL(request.url()).pathname.split('/');
        const into = new URL(to, request.url()).pathname.split('/');
        const i = into.findIndex((part, n) => part !== from[n]);
        if (i > 0 && /^[a-z]{2}(_[A-Z]{2})?$/.test(into[i]) && [...into.slice(0, i), ...into.slice(i + 1)].join('/') === from.join('/')) {
            console.warn(`drive-guard: POST ${request.url()} was sent on to ${to} and became a GET; post to the localized URL (page.url() after a GET)`);
        }
    });
    return context;
}

/**
 * The page's trivial notifications ("Plugin installed", "Your changes have
 * been saved"), as they arrive. Each is handed out once, in the next
 * `fetchNotification` answer, and the page removes it within seconds, so a
 * DOM read after an install or a settings save often finds nothing; this
 * keeps every answer's text. Call it right after `context.newPage()`:
 *
 *   const notices = readNotices(page);   // later: notices.map((n) => n.text)
 */
function readNotices(page) {
    const notices = [];
    const texts = (value, out = []) => {
        if (typeof value === 'string') {
            const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text) out.push(text);
        } else if (value && typeof value === 'object') {
            Object.values(value).forEach((v) => texts(v, out));
        }
        return out;
    };
    page.on('response', async (response) => {
        if (!response.url().includes('fetchNotification')) return;
        try {
            const body = await response.json();
            const general = body?.content?.general;
            if (general && texts(general).length) {
                notices.push({at: new Date().toISOString(), page: page.url(), text: texts(general).join(' | ')});
            }
        } catch {
            // not JSON: the page navigated away before the body was read
        }
    });
    return notices;
}

module.exports = {newGuardedContext, readNotices};
