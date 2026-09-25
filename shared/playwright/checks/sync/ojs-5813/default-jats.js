// Kept verification probe for pkp/ojs#5813 (jatsTemplate c1c0e5379f..1065bb02ae: the abstract-to-JATS conversion
// moved from xsl/htmlAbstractToJats.xsl into JatsHelper::htmlToJatsContent(), <history>, NISO ALI licence elements,
// the data availability <sec> in <back>). Run:
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ojs-5813/default-jats.js
// Inputs: abstracts.json beside this script (rebuilt 2026-09-24 from the report's wording; the VM's scratch copy is
// gone): `rich` an ordinary rich abstract (bold, italic, sup, sub, &, a link, lists, <br>), `literal` the unbalanced
// control (only "<i>"), `literal2` the finding (tag names as text with matching close tags), `plain` a bare
// abstract, `das` the data availability statement. Outputs: .reports/<PROBE_FEATURE>/<PROBE_AGENT>/, with the
// records; the finding holds while after-literal2.xml's <abstract> splits into several <p> with <italic>.
// One process on OJS, on a scratch journal (manager, author; dataAvailability and citations at "request"; the
// OAI JATS format plugin on; CC BY 4.0 licence set through PUT contexts/{id}):
//   seed     six submissions: rich (published), literal, literal2, plain, das (no references), dasrefs (references)
//   s1       manager: workflow › Publication › JATS XML of "rich", the tab's text and the download            (s1-*)
//   api      GET submissions/{id}/publications/{pid}/jats for every submission → after-<key>.xml             (api-*)
//   s5       OAI ListMetadataFormats, ListIdentifiers, GetRecord and ListRecords (jats) → oai-*.xml          (oai-*)
//   pub      the public JATS download after PUT jats/visibility on "rich" → public-rich.xml                  (public-*)
// On PKP_E2E_LINE=stable-3_5_0 "rich" stays unpublished (the line refuses the `published` seed key): s1, pub and
// the OAI records then read nothing, the API reads stand. No assertions: the session judges (a JATS 1.2 DTD check over after-*.xml is not kept with the script).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, outDir} = require('../../../probe');

const log = (...a) => console.log('[5813]', ...a);
const INPUTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'abstracts.json'), 'utf8'));
const save = (name, text) => { fs.writeFileSync(path.join(outDir(), name), text); log('wrote', name, text.length, 'bytes'); };

async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

/** A browser-session API call: the documented client path, with the signed-in user's CSRF token. */
async function sessionApi(page, method, url, data) {
    return page.evaluate(async ({method, url, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data),
            credentials: 'same-origin',
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 800); }
        return {status: res.status, body};
    }, {method, url, data});
}

forEachApp(async (app) => {
    const scratch = tag('rr14a');
    const mgr = `${scratch}mgr`;
    const au = `${scratch}au`;
    const ctx = await app.api.createContext({
        tag: scratch,
        context: {path: scratch, name: `Scratch ${scratch}`},
        users: [{username: mgr, roles: ['manager']}, {username: au, roles: ['author']}],
        metadata: {dataAvailability: 'request', citations: 'request'},
        plugins: {oaimetadataformatplugin_jats: {enabled: true}},
    });
    record('seed-context', ctx);
    log('context', JSON.stringify(ctx).slice(0, 300));
    const api = (p) => app.url(`/index.php/${scratch}/api/v1/${p}`);
    const subs = {};

    const {page, close} = await launch(app);
    try {
        await signIn(page, mgr, {contextPath: scratch});
        await page.goto(app.url(`/index.php/${scratch}/dashboard/editorial`));
        await idle(page);

        // Journal settings a real journal has, set BEFORE any submission exists so a publish copies the
        // licence onto the publication: an ISSN (journal-meta needs issn+ to be DTD-valid at all), open
        // access publishing mode (ali:free_to_read), and a CC BY 4.0 licence (Settings › Distribution ›
        // License writes licenseUrl on the context).
        const ctxId = ctx.contextId ?? ctx.id;
        const settings = await sessionApi(page, 'PUT', api(`contexts/${ctxId}`), {
            onlineIssn: '2049-3630', publishingMode: 0, licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
        });
        record('put-context-settings', {status: settings.status, onlineIssn: settings.body?.onlineIssn, publishingMode: settings.body?.publishingMode, licenseUrl: settings.body?.licenseUrl, error: settings.status >= 400 ? settings.body : undefined});
        log('context settings PUT', settings.status, settings.status >= 400 ? JSON.stringify(settings.body).slice(0, 300) : `issn=${settings.body?.onlineIssn} mode=${settings.body?.publishingMode} licence=${settings.body?.licenseUrl}`);

        for (const [key, abstract] of Object.entries(INPUTS)) {
            if (key === 'das') continue;
            subs[key] = await app.api.createSubmission({
                tag: `${scratch}${key}`, context: scratch, submitter: au,
                title: `rr14 ${key} abstract`, abstract, submitted: true, published: key === 'rich' && !process.env.PKP_E2E_LINE, // 3.5 refuses the `published` seed key
            });
        }
        subs.dasrefs = await app.api.createSubmission({
            tag: `${scratch}dasrefs`, context: scratch, submitter: au,
            title: 'rr14 das with references', abstract: INPUTS.plain, submitted: true,
        });
        subs.das = await app.api.createSubmission({
            tag: `${scratch}das`, context: scratch, submitter: au,
            title: 'rr14 das without references', abstract: INPUTS.plain, submitted: true,
        });
        record('seed-submissions', subs);
        log('submissions', Object.entries(subs).map(([k, s]) => `${k}=${s.submissionId}/${s.publicationId}`).join(' '));

        // Data availability statement and references through the publication API (S4)
        for (const key of ['das', 'dasrefs']) {
            const s = subs[key];
            const data = {dataAvailability: {en: INPUTS.das}};
            if (key === 'dasrefs') data.citationsRaw = 'Doe, J. (2020). A first reference. Journal of Tests, 1(1), 1-2.\nRoe, R. (2021). A second reference & more. https://example.org/ref?x=1&y=2';
            const r = await sessionApi(page, 'PUT', api(`submissions/${s.submissionId}/publications/${s.publicationId}`), data);
            record(`put-${key}`, {status: r.status, body: r.body});
            log('PUT', key, r.status, r.status >= 400 ? JSON.stringify(r.body).slice(0, 300) : 'ok');
        }

        // S1: the JATS XML tab of the rich submission
        const rich = subs.rich;
        await page.goto(app.url(`/index.php/${scratch}/dashboard/editorial?workflowSubmissionId=${rich.submissionId}`));
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').first();
        const jatsLink = dlg.getByRole('link', {name: /^JATS XML$/}).or(dlg.getByText('JATS XML', {exact: true})).first();
        try {
            await jatsLink.click({timeout: 15000});
            await idle(page);
            await page.waitForTimeout(1500);
        } catch (e) {
            log('JATS XML entry not clicked:', e.message.slice(0, 120));
        }
        const s1 = await snap(page, 's1-jats-tab', {submissionId: rich.submissionId});
        log('tab dialog text head:', (s1.text?.dialog || '').slice(0, 300).replace(/\n/g, ' | '));
        try {
            const [download] = await Promise.all([
                page.waitForEvent('download', {timeout: 15000}),
                dlg.getByRole('button', {name: /download/i}).or(dlg.getByRole('link', {name: /download/i})).first().click({timeout: 5000}),
            ]);
            const p = path.join(outDir(), 's1-download-rich.xml');
            await download.saveAs(p);
            log('downloaded', download.suggestedFilename(), fs.statSync(p).size, 'bytes');
        } catch (e) {
            log('download not taken:', e.message.slice(0, 160));
        }

        // API GET for every submission
        for (const [key, s] of Object.entries(subs)) {
            const r = await sessionApi(page, 'GET', api(`submissions/${s.submissionId}/publications/${s.publicationId}/jats`));
            record(`api-${key}`, {status: r.status, keys: r.body && typeof r.body === 'object' ? Object.keys(r.body) : null, isDefault: r.body?.isDefaultContent});
            if (r.status === 200 && r.body?.jatsContent) save(`after-${key}.xml`, r.body.jatsContent);
            else log('GET jats', key, r.status, JSON.stringify(r.body).slice(0, 300));
        }

        // Public download (S5 companion): visibility on, then unauthenticated GET
        const vis = await sessionApi(page, 'PUT', api(`submissions/${rich.submissionId}/publications/${rich.publicationId}/jats/visibility`), {jatsPublicVisibility: true});
        record('put-visibility', vis);
        log('visibility PUT', vis.status);
        const pub = await fetch(api(`submissions/${rich.submissionId}/publications/${rich.publicationId}/jats/download`));
        const pubText = await pub.text();
        log('public download', pub.status, pub.headers.get('content-type'), pubText.length);
        if (pub.status === 200) save('public-rich.xml', pubText);
        else record('public-download', {status: pub.status, body: pubText.slice(0, 500)});

        // S6: the seeded journal's licence element, read-only (a GET on the first published seeded submission)
        await signIn(page, 'manager.maya', {contextPath: app.contextPath});
        await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial`));
        await idle(page);
        const pkApi = (p) => app.url(`/index.php/${app.contextPath}/api/v1/${p}`);
        const list = await sessionApi(page, 'GET', pkApi('submissions?status=3&count=1'));
        const first = list.body?.items?.[0];
        record('pk-list', {status: list.status, first: first ? {id: first.id, publicationId: first.currentPublicationId} : null});
        if (first) {
            const r = await sessionApi(page, 'GET', pkApi(`submissions/${first.id}/publications/${first.currentPublicationId}/jats`));
            if (r.status === 200 && r.body?.jatsContent) save(`pk-${first.id}.xml`, r.body.jatsContent);
            else log('publicknowledge GET jats', r.status, JSON.stringify(r.body).slice(0, 300));
        }
    } finally {
        await close();
    }

    // S5: OAI
    const oai = async (q, name) => {
        const res = await fetch(app.url(`/index.php/${scratch}/oai?${q}`), {redirect: 'follow'});
        const text = await res.text();
        save(name, text);
        return text;
    };
    const formats = await oai('verb=ListMetadataFormats', 'oai-formats.xml');
    log('formats:', (formats.match(/<metadataPrefix>[^<]*/g) || []).join(' '));
    const ids = await oai('verb=ListIdentifiers&metadataPrefix=jats', 'oai-identifiers.xml');
    const idList = (ids.match(/<identifier>([^<]*)/g) || []).map((m) => m.replace('<identifier>', ''));
    log('identifiers:', idList.join(' '), (ids.match(/<error[^>]*>[^<]*/) || [''])[0]);
    if (idList.length) {
        const rec = await oai(`verb=GetRecord&metadataPrefix=jats&identifier=${encodeURIComponent(idList[0])}`, 'oai-getrecord.xml');
        log('GetRecord head:', rec.slice(0, 200).replace(/\n/g, ' '), (rec.match(/<error[^>]*>[^<]*/) || [''])[0]);
    }
    const list = await oai('verb=ListRecords&metadataPrefix=jats', 'oai-listrecords.xml');
    log('ListRecords records:', (list.match(/<record>/g) || []).length, (list.match(/<error[^>]*>[^<]*/) || [''])[0]);
    record('done', {scratch, subs: Object.fromEntries(Object.entries(subs).map(([k, s]) => [k, s.submissionId]))});
});
