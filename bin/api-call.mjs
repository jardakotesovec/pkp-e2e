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
//      npm run api-call -- ojs --scratch                       a scratch context and its manager,
//                                                              to call as with --context
//      npm run api-call -- ojs --personas GET 'submissions/{submissionId}/publications/{publicationId}/funders'
//                     a fresh persona set (personas.js), the call as every persona in every state,
//                     printed as a grid-shaped table of statuses, then the set's users and ids
//      --full prints the whole body (cut at 4000 characters otherwise)
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveApp } = require('./apps.js');
const { loadEnv } = require('../shared/playwright/support/env.js');
const { PROBE_PORT_OFFSET } = require('../shared/playwright/probe/index.js');

const args = process.argv.slice(2);
const contextAt = args.indexOf('--context');
const context = contextAt >= 0 ? args.splice(contextAt, 2)[1] : null;
const fullAt = args.indexOf('--full');
const full = fullAt >= 0 && args.splice(fullAt, 1).length > 0;
const [appName, user, method, apiPath, json] = args;
if (user === '--scratch') {
    await scratch(appName);
    process.exit(0);
}
if (user === '--personas') {
    await personas(appName, method.toUpperCase(), apiPath, json);
    process.exit(0);
}
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
const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2);
console.log(full ? text : text.slice(0, 4000));
await client.dispose();

/** A scratch context with a manager, through the test API (scenarios.md). */
async function scratch(name) {
    const app = resolveApp(name);
    loadEnv(app.root);
    const { PkpApi } = require('../shared/playwright/support/api.js');
    const tag = `probe${Date.now().toString(36)}`;
    const pkpApi = await PkpApi.create({ baseURL: `http://127.0.0.1:${app.basePort + PROBE_PORT_OFFSET}` });
    await pkpApi.createContext({ tag, users: [{ username: `${tag}mgr`, roles: ['manager'] }] });
    await pkpApi.dispose();
    console.log(`context ${tag}, manager ${tag}mgr: npm run api-call -- ${name} ${tag}mgr GET <path> --context ${tag}`);
}

/**
 * The call as every persona of a fresh persona set, in every state: a path
 * naming `{submissionId}`/`{publicationId}` is called on each state's
 * submission, any other path once at the set's context. Prints status per
 * cell, the shape a grid states, before the grid is written.
 */
async function personas(name, verb, template, body) {
    const app = resolveApp(name);
    loadEnv(app.root);
    process.env.PKP_APP_NAME = app.name;
    const { PkpApi } = require('../shared/playwright/support/api.js');
    const { ApiClient } = require('../shared/playwright/support/api-client.js');
    const { seedPersonas, PERSONAS } = require('../shared/playwright/support/personas.js');
    const baseURL = `http://127.0.0.1:${app.basePort + PROBE_PORT_OFFSET}`;
    const pkpApi = await PkpApi.create({ baseURL });
    const set = await seedPersonas(pkpApi, { appName: app.name }, { tag: `pp${Date.now().toString(36)}` });
    const states = /\{(submissionId|publicationId)\}/.test(template) ? set.states : ['context', 'site'];
    const rows = [];
    for (const [label, username] of Object.entries(set.users).filter(([label]) => label in PERSONAS)) {
        const cells = [];
        for (const state of states) {
            const ids = ['context', 'site'].includes(state) ? {} : set.submission(state);
            const url = template.replace(/\{(\w+)\}/g, (m, key) => (key in ids ? ids[key] : m));
            const client = await ApiClient.create({ baseURL, contextPath: state === 'site' ? 'index' : set.context, username });
            const res = await client.call(verb, url, verb === 'GET' ? {} : { data: body ? JSON.parse(body) : {} });
            cells.push(String(res.status));
            await client.dispose();
        }
        rows.push(`| ${label} | ${cells.join(' | ')} |`);
    }
    console.log(`| Persona | ${states.join(' | ')} |\n|---|${states.map(() => '---').join('|')}|\n${rows.join('\n')}`);
    console.log(`\ncontext ${set.context} (id ${set.contextId}); ${states.filter((s) => s !== 'context').map((s) => `${s} ${JSON.stringify(set.submission(s))}`).join('; ')}`);
    console.log(Object.entries(set.users).map(([label, u]) => `${label}: ${u ?? '-'}`).join('\n'));
    await pkpApi.dispose();
}
