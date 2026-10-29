/**
 * @file shared/playwright/support/api-traffic.js
 *
 * The traffic recorder (docs/process/api.md "The traffic map"): with
 * PKP_API_TRAFFIC=1, every REST API response a test's browser contexts
 * receive, and every call an API check makes through `apiAs`, is logged as
 * one JSON line in `<suite>/.api-traffic/<pid>.jsonl`:
 *
 *   {"app":"ojs","m":"GET","p":"submissions/12/publications/12/funders",
 *    "c":"publicknowledge","s":200,"u":"manager.maya","f":"tests/U43-funding.spec.js",
 *    "via":"screen"}
 *
 * `npm run api-traffic` maps the lines onto the route registry. Off by
 * default (CI turns it on), so a local run pays nothing. The test-only
 * namespace (`_test`) is never logged.
 */
const fs = require('fs');
const path = require('path');

const ENABLED = process.env.PKP_API_TRAFFIC === '1';
const API = /\/index\.php\/([^/]+)\/api\/v1\/(.+)$/;

let current = {file: null};
let buffer = [];

/** The test now running in this worker (one at a time), for attribution. */
function setCurrentTest(file) {
    current = {file};
}

function record({method, url, status, user, via}) {
    if (!ENABLED) {
        return;
    }
    const match = new URL(url).pathname.match(API);
    if (!match || match[2].startsWith('_test')) {
        return;
    }
    buffer.push({
        app: process.env.PKP_APP_NAME,
        m: method,
        p: match[2],
        c: match[1],
        s: status,
        u: user || null,
        f: current.file,
        via,
    });
}

/**
 * Log the API responses a browser context receives, as the user a fixture
 * signed it in as (`context.__pkpUser`, set by base-test.js).
 */
function watchContext(context) {
    if (!ENABLED || context.__pkpTraffic) {
        return;
    }
    context.__pkpTraffic = true;
    context.on('response', (response) => {
        const request = response.request();
        record({
            // The screens send PUT and DELETE as a POST that names the
            // method in X-Http-Method-Override; the app routes it as named.
            method: (request.headers()['x-http-method-override'] || request.method()).toUpperCase(),
            url: response.url(),
            status: response.status(),
            user: context.__pkpUser,
            via: 'screen',
        });
    });
}

/** Append what this test logged to the worker's file. */
function flush(suiteDir) {
    if (!ENABLED || buffer.length === 0) {
        return;
    }
    const dir = path.join(suiteDir, '.api-traffic');
    fs.mkdirSync(dir, {recursive: true});
    fs.appendFileSync(path.join(dir, `${process.pid}.jsonl`), buffer.map((line) => JSON.stringify(line)).join('\n') + '\n');
    buffer = [];
}

module.exports = {ENABLED, setCurrentTest, record, watchContext, flush};
