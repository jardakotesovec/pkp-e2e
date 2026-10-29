#!/usr/bin/env node
// api-call.mjs — one REST API call as a user, for probing while writing a
// grid or an API check (docs/process/api.md). It goes to the app's probe
// server (base port + 50; `npm run probe-servers -- --start`), signs in
// the way the `apiAs` fixture does, and prints the status and the body.
//
// run: npm run api-call -- <app> <username|-> <METHOD> <path> [json] [--context <path>]
//      npm run api-call -- ojs manager.maya GET announcements
//      npm run api-call -- ojs - GET submissions/12           (nobody signed in)
//      npm run api-call -- omp admin POST announcements '{"title":{"en":"Hi"}}' --context index
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveApp } = require('./apps.js');
const { loadEnv } = require('../shared/playwright/support/env.js');
const { PROBE_PORT_OFFSET } = require('../shared/playwright/probe/index.js');

const args = process.argv.slice(2);
const contextAt = args.indexOf('--context');
const context = contextAt >= 0 ? args.splice(contextAt, 2)[1] : null;
const [appName, user, method, apiPath, json] = args;
if (!apiPath) {
    console.error('usage: npm run api-call -- <app> <username|-> <METHOD> <path> [json] [--context <path>]');
    process.exit(2);
}
const app = resolveApp(appName);
loadEnv(app.root); // TEST_API_KEY, which the sign-in needs
process.env.PKP_APP_NAME = app.name;
const { ApiClient } = require('../shared/playwright/support/api-client.js');
const appContext = require(`${app.suiteDir}/support/app.context.js`);

const client = await ApiClient.create({
    baseURL: `http://127.0.0.1:${app.basePort + PROBE_PORT_OFFSET}`,
    contextPath: context || appContext.contextPath,
    username: user === '-' ? null : user,
});
const res = await client.call(method.toUpperCase(), apiPath, { data: json ? JSON.parse(json) : undefined });
console.log(res.status);
console.log(typeof res.body === 'string' ? res.body.slice(0, 4000) : JSON.stringify(res.body, null, 2).slice(0, 4000));
await client.dispose();
