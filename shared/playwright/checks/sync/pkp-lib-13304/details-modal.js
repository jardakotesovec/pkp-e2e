// Kept verification probe for pkp/pkp-lib#13304 (fix #13309, lib/pkp 40df36903d: the publication API map answers
// `supportingAgencies: []` to a reviewer whose assignment anonymizes authors; ui-library #983 db5b2813: the reviewer's
// "View All Submission Details" window adds a "Supporting Agencies" field when the list is non-empty). Run:
//   PROBE_FEATURE=sync PROBE_AGENT=s14-13304 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13304/details-modal.js
// One OJS process on a scratch journal (manager, author, two external reviewers; one submission in external review
// with both reviewers on round 1, the journal's default double-anonymous method):
//   seed      the journal and the submission                                                   (seed)
//   m1        manager: PUT contexts/{id} agencies=enable, then the Metadata screen              (m1-*)
//   m2        manager: the second reviewer's row › Edit › Review Type "Open" › OK               (m2-*)
//   m3        manager: PUT publications/{pid} supportingAgencies, then GET it back              (m3-*)
//   r1        anonymous-assignment reviewer: wizard step 1 › "View All Submission Details"      (r1-*)
//   r2        open-assignment reviewer: the same                                                (r2-*)
// No assertions: the session judges. Expected: r1 no "Supporting Agencies" row, no "Authors", API `supportingAgencies: []`;
// r2 a "Supporting Agencies" row with the term, "Authors" named, the API body carrying the term.
const {forEachApp, launch, signIn, screen, shot, record, note, idle, tag} =
    require('../../../probe');
const log = (...a) => console.log(...a);

const AGENCY = 'Agency Alpha 13304';

async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

// A same-origin API call from the signed-in browser session (cookies + the page's CSRF token).
async function sessionApi(page, method, path, data) {
    return page.evaluate(async ({method, path, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(path, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data),
            credentials: 'same-origin',
        });
        let body = null;
        const text = await res.text();
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 500); }
        return {status: res.status, body, hadToken: !!token};
    }, {method, path, data});
}

// The workflow modal (a reka-ui dialog with the stage navigation) and a panel row by the table's accessible name.
const wfDialog = (page) => page.getByRole('dialog').filter({has: page.getByRole('navigation')}).first();
const panelRow = (page, title, text) => page.locator('div')
    .filter({has: page.getByRole('table', {name: title, exact: true})}).last()
    .getByRole('row').filter({hasText: text});

// The details window's rows: each field's heading/label text in order, and the whole innerText.
async function readDetailsDialog(page) {
    return page.evaluate(() => {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.offsetParent !== null || d.getClientRects().length);
        const dlg = dialogs[dialogs.length - 1];
        if (!dlg) return null;
        const pick = (sel) => [...dlg.querySelectorAll(sel)].map((e) => e.innerText.trim()).filter(Boolean);
        return {
            title: (dlg.querySelector('h1, h2, [class*="modal__title"], [class*="Modal__title"], [class*="title"]') || {}).innerText?.trim() || null,
            // The window is a display-only PkpForm with field-heading-element="h2" (ReviewerSubmissionDetailsModal.vue).
            fieldHeadings: pick('h2'),
            rows: [...dlg.querySelectorAll('h2')].map((h) => ({label: h.innerText.trim(), tag: h.tagName, cls: h.className.slice(0, 120), value: (h.parentElement?.innerText || '').replace(h.innerText, '').trim().slice(0, 200)})),
            labels: pick('label, legend, dt'),
            hasSupportingAgencies: /Supporting Agencies/.test(dlg.innerText),
            hasAuthors: /\bAuthors\b/.test(dlg.innerText),
            hasAgencyTerm: dlg.innerText.includes('Agency Alpha 13304'),
            innerText: dlg.innerText,
        };
    });
}

async function reviewerLeg(page, app, T, username, sid, key) {
    await signIn(page, username, {contextPath: T});
    await page.goto(app.url(`/index.php/${T}/reviewer/submission/${sid}`));
    await idle(page);
    await page.getByRole('heading', {name: /^Review: /, level: 1}).waitFor({state: 'visible', timeout: 30_000});
    const step1 = await page.locator('#reviewStep1Form').innerText().catch(() => null);
    const reviewType = step1 ? (step1.match(/Review Type\s*\n?\s*([^\n]+)/) || [])[1] || null : null;
    record(`${key}-wizard-step1`, {url: page.url(), reviewType, step1});
    await shot(page, `${key}-wizard-step1`).catch(() => {});
    log(key, username, 'Review Type:', reviewType);

    // The window fetches the publication; capture that response's body.
    const pubResponse = page.waitForResponse((r) => /\/api\/v1\/submissions\/\d+\/publications\/\d+(\?.*)?$/.test(r.url()) && r.request().method() === 'GET', {timeout: 30_000});
    const link = page.getByRole('link', {name: 'View All Submission Details'});
    await link.first().waitFor({state: 'visible', timeout: 30_000});
    await link.first().click();
    let apiBody = null, apiMeta = null;
    try {
        const resp = await pubResponse;
        apiMeta = {url: resp.url(), status: resp.status()};
        apiBody = await resp.json();
    } catch (e) {
        apiMeta = {error: String(e.message).slice(0, 200)};
    }
    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({state: 'visible', timeout: 30_000}).catch(() => {});
    await page.waitForFunction(() => {
        const ds = document.querySelectorAll('[role="dialog"]');
        const last = ds[ds.length - 1];
        return !!last && last.innerText.length > 120;
    }, undefined, {timeout: 30_000}).catch(() => {});
    await idle(page);
    const details = await readDetailsDialog(page);
    record(`${key}-details-window`, details);
    record(`${key}-details-api`, {
        meta: apiMeta,
        supportingAgencies: apiBody?.supportingAgencies ?? null,
        authorsString: apiBody?.authorsString ?? null,
        authors: apiBody?.authors ?? null,
        keywords: apiBody?.keywords ?? null,
        fundingStatement: apiBody?.fundingStatement ?? null,
        dataAvailability: apiBody?.dataAvailability ?? null,
        keys: apiBody ? Object.keys(apiBody) : null,
        body: apiBody,
    });
    await snap(page, `${key}-details-window-screen`);
    log(key, 'window headings', JSON.stringify(details?.fieldHeadings), '| Supporting Agencies:', details?.hasSupportingAgencies, '| Authors:', details?.hasAuthors, '| term:', details?.hasAgencyTerm);
    log(key, 'api supportingAgencies', JSON.stringify(apiBody?.supportingAgencies), '| authorsString', JSON.stringify(apiBody?.authorsString));
    const close = dialog.getByRole('button', {name: 'Close', exact: true});
    if (await close.count()) { await close.first().click().catch(() => {}); await idle(page); }
    return {reviewType, details, api: apiBody?.supportingAgencies ?? null};
}

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('s14sa');
    const mgr = `${T}mgr`, au = `${T}aut`, rev1 = `${T}rva`, rev2 = `${T}rvo`;
    const ctx = await app.api.createContext({tag: T, users: [
        {username: mgr, roles: ['manager'], givenName: 'Meg', familyName: 'Agencyside'},
        {username: au, roles: ['author'], givenName: 'Au', familyName: 'Thorside'},
        {username: rev1, roles: ['externalReviewer'], givenName: 'Ann', familyName: 'Anonside'},
        {username: rev2, roles: ['externalReviewer'], givenName: 'Ola', familyName: 'Openside'},
    ]});
    const sub = await app.api.createSubmission({
        tag: T, context: T, submitter: au, title: `Agencies ${T}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: rev1}, {username: rev2}]}],
    });
    record('seed', {ctx, sub, users: {mgr, au, rev1, rev2}});
    const sid = sub.submissionId;
    const ctxId = ctx.id ?? ctx.contextId ?? ctx.context?.id ?? null;
    log('seeded', T, 'context', ctxId, 'submission', sid);

    const {page, close} = await launch(app);
    try {
        await signIn(page, mgr, {contextPath: T});
        await idle(page);

        // ---------- m1: Supporting Agencies enabled on the journal (PUT contexts/{id} from the manager's session) ----------
        const base = `/index.php/${T}/api/v1`;
        const ctxGet0 = await sessionApi(page, 'GET', `${base}/contexts/${ctxId}`);
        const put = await sessionApi(page, 'PUT', `${base}/contexts/${ctxId}`, {agencies: 'enable'});
        const ctxGet1 = await sessionApi(page, 'GET', `${base}/contexts/${ctxId}`);
        record('m1-context-agencies', {
            how: 'PUT api/v1/contexts/{id} {agencies: "enable"} from the manager browser session with X-Csrf-Token',
            before: {status: ctxGet0.status, agencies: ctxGet0.body?.agencies ?? null},
            put: {status: put.status, hadToken: put.hadToken, agencies: put.body?.agencies ?? null, error: put.status >= 400 ? put.body : undefined},
            after: {status: ctxGet1.status, agencies: ctxGet1.body?.agencies ?? null},
        });
        log('m1 agencies before', JSON.stringify(ctxGet0.body?.agencies), 'put', put.status, 'after', JSON.stringify(ctxGet1.body?.agencies));
        // The Metadata screen as the manager sees it after the change (Settings › Workflow › Submission › Metadata).
        await page.goto(app.url(`/index.php/${T}/management/settings/workflow`));
        await idle(page);
        const metaTab = page.getByRole('tab', {name: 'Metadata', exact: true});
        if (await metaTab.count()) { await metaTab.first().click().catch(() => {}); await idle(page); }
        const agencyBoxes = await page.evaluate(() => [...document.querySelectorAll('input[type=checkbox], input[type=radio]')]
            .filter((i) => /agenc/i.test(i.name || '') || /agenc/i.test((i.closest('label') || i.parentElement)?.innerText || ''))
            .map((i) => ({name: i.name, value: i.value, type: i.type, checked: i.checked, label: (i.closest('label') || i.parentElement)?.innerText.trim().slice(0, 100)})));
        record('m1-metadata-screen-boxes', agencyBoxes);
        await snap(page, 'm1-metadata-screen');

        // ---------- m2: the second reviewer's assignment set to "Open" (row › Edit › Review Type) ----------
        await page.goto(app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        await wfDialog(page).waitFor({state: 'visible', timeout: 30_000});
        await page.getByRole('heading', {name: /^Workflow:/}).waitFor({state: 'visible', timeout: 30_000});
        const rowsBefore = await page.evaluate(() => [...document.querySelectorAll('table')].map((t) => ({name: t.getAttribute('aria-labelledby') ? (document.getElementById(t.getAttribute('aria-labelledby')) || {}).innerText : t.getAttribute('aria-label'), rows: [...t.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))})));
        record('m2-reviewer-rows-before', rowsBefore);
        const row = panelRow(page, 'Reviewers', 'Openside');
        await row.first().waitFor({state: 'visible', timeout: 30_000});
        await row.first().getByRole('button', {name: 'More Actions'}).click();
        const menu = page.getByRole('menu');
        await menu.getByRole('menuitem').first().waitFor({state: 'visible', timeout: 30_000});
        record('m2-row-menu', await menu.getByRole('menuitem').evaluateAll((es) => es.map((e) => e.innerText.trim())));
        await menu.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const editModal = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
        await editModal.locator('input[name="isReviewPubliclyVisible"]').waitFor({state: 'visible', timeout: 30_000});
        const radios = await editModal.locator('input[name="reviewMethod"]').evaluateAll((is) => is.map((i) => ({value: i.value, checked: i.checked, label: (document.querySelector(`label[for="${i.id}"]`) || i.closest('label') || i.parentElement)?.innerText.trim().slice(0, 80)})));
        record('m2-edit-review-methods-before', radios);
        log('m2 review methods', JSON.stringify(radios));
        await snap(page, 'm2-edit-review-before');
        await editModal.locator('input[name="reviewMethod"][value="3"]').check();
        await editModal.getByRole('button', {name: 'OK', exact: true}).click();
        await editModal.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30_000});
        await idle(page);
        // Reopen to confirm the stored method, then cancel.
        await row.first().getByRole('button', {name: 'More Actions'}).click();
        await menu.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        await editModal.locator('input[name="isReviewPubliclyVisible"]').waitFor({state: 'visible', timeout: 30_000});
        const radiosAfter = await editModal.locator('input[name="reviewMethod"]').evaluateAll((is) => is.map((i) => ({value: i.value, checked: i.checked})));
        record('m2-edit-review-methods-after', radiosAfter);
        log('m2 review methods after', JSON.stringify(radiosAfter));
        const cancel = editModal.locator('a:visible, button:visible').filter({hasText: /^Cancel$/}).first();
        if (await cancel.count()) { await cancel.click().catch(() => {}); await idle(page); }
        const rowsAfter = await page.evaluate(() => [...document.querySelectorAll('table')].map((t) => ({name: t.getAttribute('aria-labelledby') ? (document.getElementById(t.getAttribute('aria-labelledby')) || {}).innerText : t.getAttribute('aria-label'), rows: [...t.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))})));
        record('m2-reviewer-rows-after', rowsAfter);
        await snap(page, 'm2-reviewers-panel');

        // ---------- m3: the supporting agency on the publication (PUT publications/{pid}), read back ----------
        const subGet = await sessionApi(page, 'GET', `${base}/submissions/${sid}`);
        const pid = subGet.body?.currentPublicationId ?? null;
        const pubBefore = await sessionApi(page, 'GET', `${base}/submissions/${sid}/publications/${pid}`);
        let pubPut = await sessionApi(page, 'PUT', `${base}/submissions/${sid}/publications/${pid}`, {supportingAgencies: {en: [{name: AGENCY}]}});
        let shape = 'objects {name}';
        if (pubPut.status >= 400) {
            pubPut = await sessionApi(page, 'PUT', `${base}/submissions/${sid}/publications/${pid}`, {supportingAgencies: {en: [AGENCY]}});
            shape = 'plain strings (the object shape was refused)';
        }
        const pubAfter = await sessionApi(page, 'GET', `${base}/submissions/${sid}/publications/${pid}`);
        record('m3-publication-agencies', {
            how: `PUT api/v1/submissions/{id}/publications/{pid} {supportingAgencies: {en: [...]}} from the manager browser session; item shape sent: ${shape}`,
            pid,
            before: {status: pubBefore.status, supportingAgencies: pubBefore.body?.supportingAgencies ?? null},
            put: {status: pubPut.status, supportingAgencies: pubPut.body?.supportingAgencies ?? null, error: pubPut.status >= 400 ? pubPut.body : undefined},
            after: {status: pubAfter.status, supportingAgencies: pubAfter.body?.supportingAgencies ?? null, authorsString: pubAfter.body?.authorsString ?? null},
        });
        log('m3 pid', pid, 'put', pubPut.status, 'after', JSON.stringify(pubAfter.body?.supportingAgencies));
        // Control: the manager's own view of the term on Publication › Metadata (best effort: the group nests under
        // a version node, as the 13109 probe's openTitleAbstract found; never blocks the reviewer legs).
        try {
            await page.goto(app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`));
            await idle(page);
            await wfDialog(page).waitFor({state: 'visible', timeout: 30_000});
            const nav = wfDialog(page).getByRole('navigation');
            const metaLink = nav.getByRole('link', {name: 'Metadata', exact: true});
            if (!(await metaLink.first().isVisible().catch(() => false))) {
                const pubLink = nav.getByRole('link', {name: 'Publication', exact: true});
                if (await pubLink.count()) { await pubLink.first().click(); await idle(page); }
            }
            if (!(await metaLink.first().isVisible().catch(() => false))) {
                const nodes = nav.getByRole('link', {name: /^(Unassigned version|Version of Record|Author Original)\b/});
                if (await nodes.count()) { await nodes.last().click(); await idle(page); }
            }
            record('m3-workflow-nav-links', await nav.getByRole('link').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim().slice(0, 60), visible: a.offsetParent !== null}))));
            await metaLink.first().waitFor({state: 'visible', timeout: 15_000});
            await metaLink.first().click();
            await idle(page);
            await page.waitForFunction((term) => document.body.innerText.includes(term), AGENCY, {timeout: 20_000}).catch(() => {});
            await snap(page, 'm3-publication-metadata-screen');
            record('m3-publication-metadata-has-term', {shown: (await wfDialog(page).innerText().catch(() => '')).includes(AGENCY)});
        } catch (e) {
            record('m3-publication-metadata-has-term', {shown: null, error: String(e.message).slice(0, 300)});
            await snap(page, 'm3-workflow-nav');
        }

        // ---------- r1 / r2: the two reviewers ----------
        const r1 = await reviewerLeg(page, app, T, rev1, sid, 'r1-anonymous');
        const r2 = await reviewerLeg(page, app, T, rev2, sid, 'r2-open');
        record('summary', {
            journal: T, submissionId: sid, publicationId: pid, agency: AGENCY,
            r1: {user: rev1, reviewType: r1.reviewType, rows: r1.details?.fieldHeadings, supportingAgenciesShown: r1.details?.hasSupportingAgencies, authorsShown: r1.details?.hasAuthors, apiSupportingAgencies: r1.api},
            r2: {user: rev2, reviewType: r2.reviewType, rows: r2.details?.fieldHeadings, supportingAgenciesShown: r2.details?.hasSupportingAgencies, authorsShown: r2.details?.hasAuthors, apiSupportingAgencies: r2.api},
        });
    } finally {
        await close();
    }
});
