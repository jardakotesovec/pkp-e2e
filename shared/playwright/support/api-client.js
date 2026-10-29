/**
 * @file shared/playwright/support/api-client.js
 *
 * The app's own REST API (`/index.php/<context>/api/v1/…`), called the way
 * the screens call it: with a signed-in user's session cookie, and on a
 * write the session's CSRF token in `X-Csrf-Token`. API checks
 * (docs/process/api.md) use it through the `apiAs` fixture:
 *
 *   const api = await apiAs('manager.maya');          // the base context
 *   const api = await apiAs('manager.maya', {context: path});
 *   const anon = await apiAs(null);                   // nobody signed in
 *   const res = await api.post('announcements', {title: {en: 'Hi'}});
 *   expect(res.status).toBe(200);
 *   res.body                                           // parsed JSON, or the text
 *
 * Every call answers whatever the app answered (no throw on 4xx/5xx), so a
 * test asserts the status itself. The session is minted through the test
 * API's `POST _test/session` (support/auth.js), which also returns the
 * session's CSRF token.
 */
const {request, devices} = require('@playwright/test');
const apiTraffic = require('./api-traffic.js');

class ApiClient {
    /**
     * @param {{baseURL: string, contextPath: string, username: string|null}} options
     */
    static async create({baseURL, contextPath, username}) {
        const http = await request.newContext({
            baseURL,
            userAgent: devices['Desktop Chrome'].userAgent,
        });
        let csrfToken = null;
        if (username) {
            const session = await http.post('/index.php/index/api/v1/_test/session', {
                data: {username},
                headers: {'X-Test-Key': process.env.TEST_API_KEY || ''},
                failOnStatusCode: false,
            });
            if (!session.ok()) {
                await http.dispose();
                throw new Error(`apiAs(${username}): no session (${session.status()} ${await session.text()})`);
            }
            csrfToken = (await session.json()).csrfToken;
        }
        return new ApiClient(http, contextPath, csrfToken, username);
    }

    constructor(http, contextPath, csrfToken, username = null) {
        this.http = http;
        this.username = username;
        this.contextPath = contextPath;
        this.csrfToken = csrfToken;
    }

    /** The full path of an API route, e.g. `announcements/12`. */
    url(path) {
        return `/index.php/${this.contextPath}/api/v1/${path.replace(/^\//, '')}`;
    }

    get(path, params) {
        return this.call('GET', path, {params});
    }

    post(path, data) {
        return this.call('POST', path, {data});
    }

    put(path, data) {
        return this.call('PUT', path, {data});
    }

    delete(path, data) {
        return this.call('DELETE', path, {data});
    }

    /**
     * @returns {Promise<{status: number, body: any, response: import('@playwright/test').APIResponse}>}
     */
    async call(method, path, {params, data} = {}) {
        const headers = {Accept: 'application/json'};
        if (method !== 'GET' && this.csrfToken) {
            headers['X-Csrf-Token'] = this.csrfToken;
        }
        const response = await this.http.fetch(this.url(path), {
            method,
            params,
            data,
            headers,
            failOnStatusCode: false,
            maxRedirects: 0,
        });
        apiTraffic.record({method, url: response.url(), status: response.status(), user: this.username, via: 'api'});
        const text = await response.text();
        let body = text;
        try {
            body = JSON.parse(text);
        } catch {
            // not JSON: keep the text (an HTML error page, an empty body)
        }
        return {status: response.status(), body, response};
    }

    async dispose() {
        await this.http.dispose();
    }
}

module.exports = {ApiClient};
