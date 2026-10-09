// PR review check — pkp/pkp-lib#13464, pkp/jatsTemplate#123 (ojs#5918 is the pointer bump): the generated JATS
// names a version's stage in the JAV vocabulary of NISO RP-8-2026 for "Author's Original", "Published
// Manuscript Under Review" and "Version of Record", and a CRediT role carries the English term and the degree's
// fixed word in its attributes. One journal, PKP's default test dataset. It changes the data: reset the fleet first.
//
//   npm run fleet-prep -- --feature sync-13464 --dataset 1 --reset --apps ojs
//   PROBE_FEATURE=sync-13464 PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/jatsTemplate-123/jats-versions.js
//   php shared/playwright/checks/sync/jatsTemplate-123/validate-dtd.php checkouts/ojs .reports/sync-13464/<id>/*.xml
//
//   1 (as dbarnes) submission 17, published: the generated JATS of its version                       → vor-17.xml
//   2 submission 1, published twice: the JATS of each version                                        → v<n>-1.xml
//   3 submission 5, in Production: the JATS as loaded, then with the version's stage changed to
//     "Author's Original", "Published Manuscript Under Review" and "Version of Record"
//     (PUT …/version, what "Review Publishing Details" sends)                              → {asloaded,ao,pmur,vor}-5.xml
//   4 submission 6, in Production: its first contributor given the CRediT roles "Conceptualization"
//     (degree "Lead"), "Data curation" (no degree) and "Software" (degree "Supporting")                → credit-en-6.xml
//   5 the same submission with its language changed to French (Canada)                                → credit-fr-6.xml
//   6 submission 17: "Make available with publication", then the signed-out download                  → public-17.xml
//   7 Settings › Website › "Plugins": "JATS Metadata Format" ticked; the OAI-PMH `jats` record of submission 17 → oai-17.xml
//
// Facts go to facts-jats-versions-ojs.json; no assertions. At the plugin's base c564b8f the version read
// `<article-version vocab="JAV" … article-version-type="VoR">1.0</article-version>`, with no vocabulary on a
// PMUR; at the PR head 0c1a212 it is an `<article-version-alternatives>` of three (2026-10-09).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, record, outDir} = require('../../../probe');
const {enablePlugin} = require('../../issues/oai-jats-list-refused-for-one-subscription-article/lib');

const CTX = 'publicknowledge';
const ROLE = (slug) => `https://credit.niso.org/contributor-roles/${slug}/`;

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

/** The lines of a JATS document that this change touches. */
const touched = (xml) => (xml.match(/<article-version[^>]*>(?:[^<]*<\/article-version>)?|<\/article-version-alternatives>|<role\b[^>]*>[^<]*<\/role>/g) || []);

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the plugin ships in OJS alone
    if (!app.dataset) throw new Error('jats-versions.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const api = (p) => app.url(`/index.php/${CTX}/api/v1/${p}`);
    const save = (name, text) => fs.writeFileSync(path.join(outDir(), name), text);

    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: CTX});
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial`));
        await idle(page);

        const jats = async (key, sid, pid, name) => {
            const r = await sessionApi(page, 'GET', api(`submissions/${sid}/publications/${pid}/jats`));
            if (r.status === 200 && typeof r.body?.jatsContent === 'string') {
                save(name, r.body.jatsContent);
                fact(key, {status: 200, generated: r.body.isDefaultContent, file: name, touched: touched(r.body.jatsContent)});
            } else fact(key, {status: r.status, body: r.body});
        };
        const sub = async (sid) => (await sessionApi(page, 'GET', api(`submissions/${sid}`))).body;
        const stageOf = (p) => `${p.versionStage ?? 'none'} ${p.versionMajor ?? '-'}.${p.versionMinor ?? '-'}`;

        // 1, 2: the published submissions as loaded
        const s17 = await sub(17);
        const p17 = s17.publications[s17.publications.length - 1];
        await jats(`1 submission 17 (${stageOf(p17)})`, 17, p17.id, 'vor-17.xml');
        const s1 = await sub(1);
        for (const [i, p] of s1.publications.entries()) await jats(`2 submission 1, version ${i + 1} (${stageOf(p)})`, 1, p.id, `v${i + 1}-1.xml`);

        // 3: one unpublished version through the three stages
        const s5 = await sub(5);
        const p5 = s5.publications[s5.publications.length - 1];
        await jats(`3 submission 5 as loaded (${stageOf(p5)})`, 5, p5.id, 'asloaded-5.xml');
        for (const stage of ['AO', 'PMUR', 'VoR']) {
            const r = await sessionApi(page, 'PUT', api(`submissions/5/publications/${p5.id}/version`), {versionStage: stage, versionIsMinor: false});
            const now = r.status === 200 ? stageOf((await sub(5)).publications.at(-1)) : JSON.stringify(r.body).slice(0, 300);
            await jats(`3 submission 5 set to ${stage} (PUT ${r.status}: ${now})`, 5, p5.id, `${stage.toLowerCase()}-5.xml`);
        }

        // 4: CRediT roles on the first contributor of submission 6
        const s6 = await sub(6);
        const p6 = s6.publications[s6.publications.length - 1];
        const list = await sessionApi(page, 'GET', api(`submissions/6/publications/${p6.id}/contributors`));
        const first = (list.body?.items ?? list.body)?.[0];
        const creditRoles = [
            {role: ROLE('conceptualization'), degree: 'LEAD'},
            {role: ROLE('data-curation'), degree: null}, // what the form sends for an empty "Degree"
            {role: ROLE('software'), degree: 'SUPPORTING'},
        ];
        const put = await sessionApi(page, 'PUT', api(`submissions/6/publications/${p6.id}/contributors/${first?.id}`), {...first, contributorRoles: (first?.contributorRoles ?? []).map((r) => r.id), creditRoles});
        fact('4 contributor save', {status: put.status, name: put.body?.fullName, creditRoles: put.body?.creditRoles, error: put.status >= 400 ? put.body : undefined});
        await jats('4 submission 6, CRediT roles, English', 6, p6.id, 'credit-en-6.xml');

        // 5: the same submission in French (Canada)
        const loc = await sessionApi(page, 'PUT', api(`submissions/6/publications/${p6.id}/changeLocale`), {locale: 'fr_CA'});
        fact('5 language change', {status: loc.status, locale: loc.body?.locale, error: loc.status >= 400 ? loc.body : undefined});
        await jats('5 submission 6, CRediT roles, French (Canada)', 6, p6.id, 'credit-fr-6.xml');

        // 6: the public download
        const vis = await sessionApi(page, 'PUT', api(`submissions/17/publications/${p17.id}/jats/visibility`), {jatsPublicVisibility: true});
        const pub = await fetch(api(`submissions/17/publications/${p17.id}/jats/download`));
        const pubText = await pub.text();
        if (pub.status === 200) save('public-17.xml', pubText);
        fact('7 "JATS Metadata Format" ticked', await enablePlugin(page, 'JATS Metadata Format'));
        fact('6 public download', {visibility: vis.status, status: pub.status, type: pub.headers.get('content-type'), touched: pub.status === 200 ? touched(pubText) : pubText.slice(0, 300)});
    } finally {
        await close();
    }

    // 7: OAI-PMH
    const oai = async (q) => (await fetch(app.url(`/index.php/${CTX}/oai?${q}`))).text();
    const formats = ((await oai('verb=ListMetadataFormats')).match(/<metadataPrefix>[^<]*/g) || []).map((m) => m.replace('<metadataPrefix>', ''));
    if (formats.includes('jats')) {
        const ids = ((await oai('verb=ListIdentifiers&metadataPrefix=jats')).match(/<identifier>([^<]*)/g) || []).map((m) => m.replace('<identifier>', ''));
        const id = ids.find((i) => /\/17$/.test(i)) || ids[0];
        const rec = id ? await oai(`verb=GetRecord&metadataPrefix=jats&identifier=${encodeURIComponent(id)}`) : '';
        if (rec) save('oai-17.xml', rec);
        fact('7 OAI jats record', {formats, identifier: id, error: (rec.match(/<error[^>]*>[^<]*/) || [null])[0], touched: touched(rec)});
    } else fact('7 OAI jats record', {formats, note: 'the journal does not list the jats format'});

    record('facts-jats-versions', facts);
    fs.writeFileSync(path.join(outDir(), `facts-jats-versions-${app.name}.json`), JSON.stringify(facts, null, 2));
});
