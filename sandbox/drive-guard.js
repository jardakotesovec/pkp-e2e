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
 * other options go to `browser.newContext()`.
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
    return context;
}

module.exports = {newGuardedContext};
