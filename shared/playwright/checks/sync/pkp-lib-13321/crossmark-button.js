// Kept verification probe for pkp/pkp-lib#13321 (the Crossmark button moves from ui-library to the Crossref plugin:
// pkp-lib 7ea748823e drops PkpCrossmarkButton from js/load_frontend.js, ui-library 16f3fdad deletes the component,
// crossref-ojs 843650012d renders `<crossref-crossmark-button>` from templates/crossmarkButton.blade and registers it
// through pkp.registry from public/build/crossref.js, loaded by setupCrossmarkButton on ArticleHandler::view). Run:
//   PROBE_FEATURE=sync PROBE_AGENT=rr7 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13321/crossmark-button.js
// One OJS process on a scratch journal (one manager; two published submissions, A gets a DOI, B never does):
//   seed      the journal and the two submissions                                                     (seed)
//   e1        manager: the Crossref generic plugin enabled through the settings plugin grid           (e1-*)
//   e2        manager: PUT contexts/{id} DOI settings, PUT contexts/{id}/registrationAgency crossmark=on (e2-*)
//   e3        manager: POST dois/submissions/assignDois {ids:[A]}, the publication's doiObject read back (e3-*)
//   p1        signed out: A's landing page, Crossmark on + DOI                                          (p1-*)   S1, S2
//   p2        signed out: B's landing page, Crossmark on, no DOI                                        (p2-*)   S3
//   v1        manager: POST …/version on A, then /version/{new}, /version/{first} and the plain page   (v1-*)   S5
//   p4        manager unticks Crossmark (PUT registrationAgency crossmark=false); signed out: A again   (p4-*)   S4
//   s6        manager: Settings › Distribution › DOIs › Registration, the Crossmark checkbox            (s6-*)   S6
// Each page read records: HTTP status, `section.crossmark` outerHTML, the `a[data-target="crossmark"] img[alt="Crossmark"]`
// count, unresolved `<crossref-crossmark-button>` count, the head DC.Identifier.DOI metas, the footer scripts in order with
// their response statuses (`scripts` is the DOM order, `scriptResponses` the network log), `typeof document.CROSSMARK`, the details column's section classes, and the console lines of the leg.
// No assertions: the session judges. Expected: p1 and v1 pages carry the section with the anchor and the Crossmark image, the
// meta with the DOI, crossref.js after build_frontend.js, and no "Failed to resolve component" warning; p2 and p4 carry none
// of the section, the meta or crossref.js; s6 shows one Crossmark checkbox.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} =
    require('../../../probe');
const log = (...a) => console.log(...a);

const DEPOSITOR = {depositorName: 'Rr7 Depositor', depositorEmail: 'rr7.depositor@mail.test'};
const AGENCY_BODY = (crossmark) => ({
    registrationAgency: 'crossrefplugin',
    automaticDoiDeposit: false,
    ...DEPOSITOR,
    testMode: true,
    updatePolicyDoi: '10.1234/policy',
    crossmark,
});

async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

// A same-origin API call from the signed-in browser session (cookies + the page's CSRF token). Only on a backend page:
// the frontend bundle carries no currentUser, so the token is read there as null.
async function sessionApi(page, method, path, data, {form = false} = {}) {
    return page.evaluate(async ({method, path, data, form}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const headers = form
            ? {'Content-Type': 'application/x-www-form-urlencoded'}
            : {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''};
        let body;
        if (data !== undefined) {
            body = form ? new URLSearchParams({...data, csrfToken: token || ''}).toString() : JSON.stringify(data);
        }
        const res = await fetch(path, {method, headers, body, credentials: 'same-origin'});
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = text.slice(0, 800); }
        return {status: res.status, body: parsed, hadToken: !!token};
    }, {method, path, data, form});
}

// Everything the article page shows about the button, read from the DOM after the Vue roots mounted.
async function readArticlePage(page, response) {
    await page.waitForFunction(() => !!document.querySelector('section.crossmark a[data-target="crossmark"]'), undefined, {timeout: 8_000}).catch(() => {});
    const dom = await page.evaluate(() => {
        const section = document.querySelector('section.crossmark');
        return {
            title: document.title,
            crossmarkSection: section ? section.outerHTML : null,
            crossmarkSectionHasVueMount: section ? !!section.__vue_app__ : null,
            anchorImgCount: document.querySelectorAll('a[data-target="crossmark"] img[alt="Crossmark"]').length,
            anchors: [...document.querySelectorAll('a[data-target="crossmark"]')].map((a) => a.outerHTML),
            unresolvedCustomElements: document.querySelectorAll('crossref-crossmark-button, pkp-crossmark-button').length,
            doiMetas: [...document.querySelectorAll('head meta[name="DC.Identifier.DOI"]')].map((m) => m.content),
            scripts: [...document.scripts].filter((s) => s.src).map((s) => s.src.replace(/\?v=.*$/, '')),
            crossmarkWidget: typeof document.CROSSMARK,
            detailSections: [...document.querySelectorAll('.entry_details .item, .entry_details section')].map((e) => e.className).filter(Boolean),
            detailsText: (document.querySelector('.entry_details') || {}).innerText?.slice(0, 1500) || null,
        };
    });
    return {url: page.url(), status: response ? response.status() : null, ...dom};
}

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('s15cm');
    const mgr = `${T}mgr`;
    const ctx = await app.api.createContext({tag: T, users: [
        {username: mgr, roles: ['manager'], givenName: 'Meg', familyName: 'Crossmarkside'},
    ]});
    const subA = await app.api.createSubmission({tag: T, context: T, submitter: mgr, title: `Crossmark with DOI ${T}`, submitted: true, published: true});
    const subB = await app.api.createSubmission({tag: `${T}b`, context: T, submitter: mgr, title: `Crossmark without DOI ${T}`, submitted: true, published: true});
    record('seed', {ctx, subA, subB, users: {mgr}});
    const ctxId = ctx.id ?? ctx.contextId ?? ctx.context?.id ?? null;
    const sidA = subA.submissionId, pidA = subA.publicationId, sidB = subB.submissionId;
    log('seeded', T, 'context', ctxId, 'A', sidA, '/', pidA, 'B', sidB);
    const base = `/index.php/${T}/api/v1`;
    const dashboard = app.url(`/index.php/${T}/dashboard/editorial`);
    const articleUrl = (sid, suffix = '') => app.url(`/index.php/${T}/article/view/${sid}${suffix}`);

    const {page, close} = await launch(app);
    // Per-leg console and script-response capture (the kit's run record keeps errors and warnings for the whole process).
    let consoleLines = [], scriptResponses = [];
    page.on('console', (m) => { if (consoleLines.length < 100) consoleLines.push({type: m.type(), text: m.text().slice(0, 300)}); });
    page.on('pageerror', (e) => consoleLines.push({type: 'pageerror', text: String(e.message).slice(0, 300)}));
    page.on('response', (r) => { if (/\.js(\?|$)/.test(r.url())) scriptResponses.push({url: r.url().replace(/\?v=.*$/, ''), status: r.status()}); });
    page.on('requestfailed', (r) => { if (/\.js(\?|$)|widget|crossmark-cdn/.test(r.url())) scriptResponses.push({url: r.url(), failed: r.failure()?.errorText}); });
    const startLeg = () => { consoleLines = []; scriptResponses = []; };
    const legExtras = () => ({console: consoleLines.slice(), scriptResponses: scriptResponses.slice()});

    async function pageLeg(key, url, expectNote) {
        startLeg();
        let response = null, read = null, error = null;
        try {
            response = await page.goto(url, {waitUntil: 'load', timeout: 60_000});
            await idle(page).catch(() => {});
            read = await readArticlePage(page, response);
        } catch (e) {
            error = String(e.message).slice(0, 300);
        }
        const out = {expect: expectNote, error, ...read, ...legExtras()};
        record(key, out);
        await shot(page, key).catch(() => {});
        log(key, 'status', out.status, '| section:', out.crossmarkSection ? 'present' : 'none', '| anchor+img:', out.anchorImgCount,
            '| unresolved:', out.unresolvedCustomElements, '| metas:', JSON.stringify(out.doiMetas),
            '| crossref.js:', JSON.stringify((out.scriptResponses || []).filter((s) => /crossref/.test(s.url))),
            '| widget:', out.crossmarkWidget, '| console:', out.console.length);
        return out;
    }

    try {
        await signIn(page, mgr, {contextPath: T});
        await page.goto(dashboard);
        await idle(page);

        // ---------- e1: the Crossref generic plugin enabled through the settings plugin grid ----------
        const enable = await sessionApi(page, 'POST',
            `/index.php/${T}/$$$call$$$/grid/settings/plugins/settings-plugin-grid/enable?plugin=crossrefplugin&category=generic`,
            {plugin: 'crossrefplugin', category: 'generic'}, {form: true});
        record('e1-plugin-enable', {how: 'POST $$$call$$$/grid/settings/plugins/settings-plugin-grid/enable plugin=crossrefplugin category=generic (csrfToken in the form body)', ...enable});
        log('e1 enable', enable.status, JSON.stringify(enable.body).slice(0, 200));

        // ---------- e2: DOIs on, Crossref as agency, Crossmark ticked ----------
        const doiPut = await sessionApi(page, 'PUT', `${base}/contexts/${ctxId}`,
            {enableDois: true, doiPrefix: '10.1234', enabledDoiTypes: ['publication'], doiCreationTime: 'copyEditCreationTime'});
        const agencyPut = await sessionApi(page, 'PUT', `${base}/contexts/${ctxId}/registrationAgency`, AGENCY_BODY(true));
        const ctxGet = await sessionApi(page, 'GET', `${base}/contexts/${ctxId}`);
        record('e2-doi-settings', {
            doiPut: {status: doiPut.status, error: doiPut.status >= 400 ? doiPut.body : undefined},
            agencyPut: {status: agencyPut.status, body: agencyPut.body},
            after: {status: ctxGet.status, enableDois: ctxGet.body?.enableDois, doiPrefix: ctxGet.body?.doiPrefix, enabledDoiTypes: ctxGet.body?.enabledDoiTypes, registrationAgency: ctxGet.body?.registrationAgency},
        });
        log('e2 doi', doiPut.status, 'agency', agencyPut.status, JSON.stringify(agencyPut.body).slice(0, 300), '| registrationAgency after:', ctxGet.body?.registrationAgency);

        // ---------- e3: A gets a DOI ----------
        const assign = await sessionApi(page, 'POST', `${base}/dois/submissions/assignDois`, {ids: [sidA]});
        const pubA = await sessionApi(page, 'GET', `${base}/submissions/${sidA}/publications/${pidA}`);
        const pubB = await sessionApi(page, 'GET', `${base}/submissions/${sidB}/publications/${subB.publicationId}`);
        record('e3-assign-doi', {
            assign: {status: assign.status, body: assign.body},
            pubA: {status: pubA.status, doiObject: pubA.body?.doiObject ?? null, doiId: pubA.body?.doiId ?? null, status_: pubA.body?.status, urlPublished: pubA.body?.urlPublished},
            pubB: {status: pubB.status, doiObject: pubB.body?.doiObject ?? null, doiId: pubB.body?.doiId ?? null, status_: pubB.body?.status},
        });
        const doiA = pubA.body?.doiObject?.doi ?? null;
        log('e3 assign', assign.status, '| A doi:', doiA, '| B doi:', pubB.body?.doiObject?.doi ?? null);

        // ---------- p1 / p2: the public pages ----------
        await signOut(page);
        const p1 = await pageLeg('p1-on-with-doi', articleUrl(sidA), `S1/S2: section.crossmark with a[data-target=crossmark] img[alt=Crossmark]; meta ${doiA}; crossref.js after build_frontend.js; no Vue warning`);
        await loc(page, 'the Crossmark button (article page, Crossmark on, DOI)', page.locator('section.crossmark a[data-target="crossmark"]'));
        await loc(page, 'the Crossmark image', page.locator('section.crossmark img[alt="Crossmark"]'));
        await pageLeg('p2-on-no-doi', articleUrl(sidB), 'S3: no section.crossmark, no DC.Identifier.DOI meta, no crossref.js, no console warning');

        // ---------- v1: a second version of A; the versioned pages as the manager ----------
        await signIn(page, mgr, {contextPath: T});
        await page.goto(dashboard);
        await idle(page);
        const version = await sessionApi(page, 'POST', `${base}/submissions/${sidA}/publications/${pidA}/version`);
        const pidA2 = version.body?.id ?? null;
        record('v1-version', {status: version.status, newPublicationId: pidA2, newDoiObject: version.body?.doiObject ?? null, newStatus: version.body?.status ?? null, error: version.status >= 400 ? version.body : undefined});
        log('v1 version', version.status, 'new pid', pidA2, 'doi', version.body?.doiObject?.doi ?? null);
        if (pidA2) {
            await pageLeg('v1-page-version-new', articleUrl(sidA, `/version/${pidA2}`), `S5: the new (unpublished, previewed) version: section + meta follow this version (doi ${version.body?.doiObject?.doi ?? 'none'})`);
        }
        await pageLeg('v1-page-version-first', articleUrl(sidA, `/version/${pidA}`), `S5: the first (current) version by its /version URL: section + meta ${doiA}`);
        await pageLeg('v1-page-plain', articleUrl(sidA), `S5 control: the plain page as the signed-in manager: section + meta ${doiA}`);

        // ---------- p4: Crossmark unticked ----------
        await page.goto(dashboard);
        await idle(page);
        const off = await sessionApi(page, 'PUT', `${base}/contexts/${ctxId}/registrationAgency`, AGENCY_BODY(false));
        record('p4-crossmark-off', {status: off.status, crossmark: off.body?.crossmark, error: off.status >= 400 ? off.body : undefined});
        log('p4 crossmark off', off.status, JSON.stringify(off.body?.crossmark));
        await signOut(page);
        await pageLeg('p4-off-with-doi', articleUrl(sidA), 'S4: no section.crossmark, no meta, no crossref.js; the other detail sections still there');

        // ---------- s6: the settings form ----------
        await signIn(page, mgr, {contextPath: T});
        await page.goto(dashboard);
        await idle(page);
        const on = await sessionApi(page, 'PUT', `${base}/contexts/${ctxId}/registrationAgency`, AGENCY_BODY(true));
        record('s6-crossmark-on-again', {status: on.status, crossmark: on.body?.crossmark});
        try {
            await page.goto(app.url(`/index.php/${T}/management/settings/distribution`));
            await idle(page);
            const doisTab = page.locator('#dois-button');
            if (await doisTab.count()) { await doisTab.first().click(); await idle(page); }
            const regTab = page.getByRole('tab', {name: 'Registration', exact: true});
            if (await regTab.count()) { await regTab.first().click(); await idle(page); }
            await page.locator('input[name="crossmark"]').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
            const boxes = await page.evaluate(() => ({
                crossmark: [...document.querySelectorAll('input[name="crossmark"]')].map((i) => ({type: i.type, checked: i.checked, visible: i.offsetParent !== null, label: (i.closest('label') || i.parentElement)?.innerText.trim().slice(0, 160)})),
                updatePolicy: [...document.querySelectorAll('input[name="updatePolicyDoi"]')].map((i) => ({value: i.value, visible: i.offsetParent !== null})),
                agencyRadios: [...document.querySelectorAll('input[name="registrationAgency"]')].map((i) => ({value: i.value, checked: i.checked})),
                tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => ({text: t.innerText.trim(), selected: t.getAttribute('aria-selected')})),
            }));
            record('s6-settings-form', boxes);
            await loc(page, 'the Crossmark checkbox (Distribution › DOIs › Registration)', page.locator('input[name="crossmark"]'));
            log('s6 crossmark boxes', JSON.stringify(boxes.crossmark), '| updatePolicy', JSON.stringify(boxes.updatePolicy));
        } catch (e) {
            record('s6-settings-form', {error: String(e.message).slice(0, 300)});
        }
        await snap(page, 's6-settings-screen');

        record('summary', {journal: T, contextId: ctxId, sidA, pidA, pidA2, sidB, doiA,
            p1: {status: p1.status, section: !!p1.crossmarkSection, anchorImg: p1.anchorImgCount, metas: p1.doiMetas, console: p1.console}});
    } finally {
        await close();
    }
});
