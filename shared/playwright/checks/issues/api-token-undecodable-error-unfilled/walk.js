// Issue report docs/issues/U03-A27-api-token-undecodable-error-unfilled.md (U03 A27): a REST API request
// whose token is not in the form of an API key is refused with "The apiToken could not be decoded because
// of the following error: {$error}", the "{$error}" left unfilled where the reason should be.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`:
//   steps (default)
//     S0    `[security] api_key_secret` set in the fleet's config (the dataset leaves it empty; a team
//           install sets it in config.inc.php). Put back to "" at the end.
//     S1-S3 screens: sign in, Profile › "API Key", "Create API Key" (a key left from an earlier run is
//           deleted first); the key read from the box.
//     S4    the key as a bearer token (control, 200).
//     S5-S8 `Bearer abc`; the key's first two parts; the middle part replaced by base64url("{not json");
//           `?apiToken=abc`.
//     C     the key with its signature's first character changed (the other refusal's wording).
//   neighbour (runs alone; what a fix must leave alone): no token 401, the key 200, the changed signature
//           400 "The API token could not be validated. …", "Delete" (OK), the deleted key 401.
// The requests are the curl of the Steps, sent without a cookie; the kit builds nothing.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=<id> bin/app-lock.sh shared <app> -- \
//                 node bin/probe.js <app|all> shared/playwright/checks/issues/api-token-undecodable-error-unfilled/walk.js [steps|neighbour]
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (neighbour), with fix.diff applied or not.
const {forEachApp, launch, signIn, signOut, record} = require('../../../probe');
const L = require('./lib.js');

const mode = process.argv[2] || 'steps';
const SECRET = 'h21l-api-key-secret-for-testing';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const out = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode, run: process.env.PROBE_RUN || null, at: new Date().toISOString()};
    const F = (k, v) => {
        out[k] = v;
        record(`a27-${mode}${run}`, out);
        console.log('[fact]', app.name, k, L.flat(JSON.stringify(v === undefined ? null : v), 900));
    };
    F('S0 secret', L.setSecret(app, SECRET));
    await L.sleep(3000);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        const p = await L.openProfile(page, app.contextPath, 'apiKey');
        let st = await L.apiKeyState(p);
        F('S2 API Key tab', {state: st, snap: await L.snap(page, `a27-${mode}-open${run}`)});
        if (st.buttons && st.buttons.includes('Delete')) {
            await p.deleteApiKey({confirm: true});
            F('S2 leftover key deleted', await L.apiKeyState(p));
        }
        if (mode === 'neighbour') F('N1 no token', await L.rest(app, null));
        await p.createApiKey();
        st = await L.apiKeyState(p);
        F('S3 created', {state: {...st, value: st.value ? `${st.value.slice(0, 20)}… (${st.length} chars, ${st.value.split('.').length} parts)` : null}, snap: await L.snap(page, `a27-${mode}-created${run}`)});
        const k = st.value;
        if (!k) throw new Error('no key in the box after "Create API Key"');
        const [h, pl, s] = k.split('.');
        const tampered = `${h}.${pl}.${s[0] === 'A' ? 'B' : 'A'}${s.slice(1)}`;
        if (mode === 'neighbour') {
            F('N2 valid key', await L.rest(app, k));
            F('N3 changed signature', await L.rest(app, tampered));
            await p.deleteApiKey({confirm: true});
            F('N4 deleted', {state: await L.apiKeyState(p), snap: await L.snap(page, `a27-${mode}-deleted${run}`)});
            F('N5 deleted key', await L.rest(app, k));
        } else {
            F('S4 valid key', await L.rest(app, k));
            F('S5 Bearer abc', await L.rest(app, 'abc'));
            F('S6 first two parts', await L.rest(app, `${h}.${pl}`));
            F('S7 middle part {not json', await L.rest(app, `${h}.${L.b64url('{not json')}.${s}`));
            F('S8 ?apiToken=abc', await L.rest(app, 'abc', {how: 'param'}));
            F('C changed signature', await L.rest(app, tampered));
        }
        await signOut(page).catch(() => {});
    } catch (e) {
        F('error', L.flat(e.stack || e.message, 1200));
        throw e;
    } finally {
        await close();
        F('secret restored', L.setSecret(app, ''));
    }
});
