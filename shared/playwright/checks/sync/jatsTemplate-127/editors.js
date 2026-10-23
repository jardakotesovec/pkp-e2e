// PR review check — pkp/pkp-lib#13607, pkp/jatsTemplate#127 (`main`, with the pointer bumps pkp/ojs#5981 and,
// for `ore`, #5982) and pkp/oaiJats#89 (stable-3_5_0, with the pointer bump pkp/ojs#5983): the JATS that OJS writes
// no longer lists the journal's managers, editors and section editors as a `contrib-group` in `journal-meta`; the
// article's own `contrib-group` (its contributors) stays. One journal, PKP's default test dataset. It changes the
// data (submission 17's JATS made public, the "JATS Metadata Format" plugin ticked): reset the fleet first, for
// each side.
//
//   npm run fleet-prep -- --feature sync-13607 --dataset 1 --reset --apps ojs
//   PROBE_FEATURE=sync-13607 PROBE_AGENT=<base|head> node bin/probe.js ojs shared/playwright/checks/sync/jatsTemplate-127/editors.js
//   php shared/playwright/checks/sync/jatsTemplate-123/validate-dtd.php checkouts/ojs .reports/sync-13607/<id>/*.xml
//   node shared/playwright/checks/sync/jatsTemplate-127/compare.js .reports/sync-13607/base .reports/sync-13607/head
// and on the line with PKP_E2E_LINE=stable-3_5_0 in front and --feature sync-13607-3_5 (3.5's generated JATS
// never had the editors; its OAI-PMH `jats` record added them), on `ore` from the slot's ore worktree.
//
//   0 (as dbarnes) the generated JATS of every version of every submission, as loaded        → asloaded-<s>-<p>.xml
//   1 the journal's users in the Journal manager, Journal editor and Section editor groups (the API)
//   2 submission 17, published: "Production" › "JATS XML", the page                           → shot 2-jats-page
//   3 its JATS made public ("Make available with publication"): the signed-out download        → public-17.xml
//   4 "JATS Metadata Format" ticked: the OAI-PMH `jats` record of submission 17                → oai-17.xml
//
// Facts go to facts-editors-ojs.json; no assertions. At jatsTemplate's base 8a08fa7 (`main`) journal-meta holds
// one `contrib` per user in the three groups; at the PR head 2e50ada none (2026-10-23).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, record, shot, outDir} = require('../../../probe');
const {enablePlugin} = require('../../issues/oai-jats-list-refused-for-one-subscription-article/lib');

const CTX = 'publicknowledge';
const T = 30_000;

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

const one = (xml, tagName) => (xml.match(new RegExp(`<${tagName}[\\s>][\\s\\S]*?</${tagName}>`)) || [''])[0];
const names = (xml) => [...xml.matchAll(/<contrib(\s[^>]*)?>[\s\S]*?<\/contrib>/g)].map(([c, attrs]) => {
    const type = ((attrs || '').match(/contrib-type="([^"]*)"/) || [, ''])[1];
    const s = (c.match(/<surname>([^<]*)/) || [, ''])[1];
    const g = (c.match(/<given-names>([^<]*)/) || [, ''])[1];
    return `${type}:${g} ${s}`.trim();
});
/** What a JATS document says about people: journal-meta's contrib-group and article-meta's. */
const people = (xml) => {
    const jm = one(xml, 'journal-meta');
    const am = one(xml, 'article-meta');
    return {
        journalMetaContribGroup: /<contrib-group[\s>]/.test(jm),
        journalMeta: names(one(jm, 'contrib-group')),
        articleMeta: names(one(am, 'contrib-group')),
    };
};

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the plugins ship in OJS alone
    if (!app.dataset) throw new Error('editors.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 2500)}`);
    };
    const api = (p) => app.url(`/index.php/${CTX}/api/v1/${p}`);
    const save = (name, text) => fs.writeFileSync(path.join(outDir(), name), text);

    const {page, close} = await launch(app);
    let p17 = null;
    try {
        await signIn(page, 'dbarnes', {contextPath: CTX});
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial`));
        await idle(page);

        const sub = async (sid) => (await sessionApi(page, 'GET', api(`submissions/${sid}`))).body;
        const pubUrl = (sid, pid) => api(`submissions/${sid}/publications/${pid}`);

        // 0: everything as loaded
        const list = await sessionApi(page, 'GET', api('submissions?count=100'));
        const asLoaded = {};
        for (const item of list.body?.items ?? []) {
            for (const p of (await sub(item.id)).publications ?? []) {
                const r = await sessionApi(page, 'GET', `${pubUrl(item.id, p.id)}/jats`);
                if (r.status === 200 && typeof r.body?.jatsContent === 'string') {
                    save(`asloaded-${item.id}-${p.id}.xml`, r.body.jatsContent);
                    const who = people(r.body.jatsContent);
                    asLoaded[`${item.id}/${p.id}`] = {generated: r.body.isDefaultContent, journalMetaContribGroup: who.journalMetaContribGroup,
                        journalMeta: who.journalMeta.length, articleMeta: who.articleMeta.length};
                } else asLoaded[`${item.id}/${p.id}`] = {status: r.status};
            }
        }
        fact('0 as loaded (submission/version)', asLoaded);
        const first = Object.keys(asLoaded).find((k) => asLoaded[k].journalMeta);
        if (first) {
            const [s, p] = first.split('/');
            fact('0 journal-meta contrib of the first document holding one', {document: first,
                contribs: people(fs.readFileSync(path.join(outDir(), `asloaded-${s}-${p}.xml`), 'utf8')).journalMeta});
        }

        // 1: who is in the three groups
        const users = await sessionApi(page, 'GET', api('users?count=100&roleIds[]=16&roleIds[]=17'));
        fact('1 users with a manager or sub-editor role', {status: users.status, users: (users.body?.items ?? []).map((u) => `${u.userName}: ${u.fullName}`)});

        // 2: the "JATS XML" page of a published article
        const s17 = await sub(17);
        p17 = s17.publications.at(-1);
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial?workflowSubmissionId=17`));
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').first();
        const entry = dlg.getByRole('link', {name: 'JATS XML', exact: true}).first();
        if (!(await entry.isVisible().catch(() => false))) {
            await dlg.getByRole('link', {name: 'Production', exact: true}).first().click({timeout: T}).catch(() => {});
            await idle(page);
        }
        if (await entry.isVisible().catch(() => false)) {
            await entry.click({timeout: T});
            await idle(page);
            await page.waitForTimeout(1500);
            await shot(page, '2-jats-page').catch(() => {});
            const text = await dlg.innerText().catch(() => '');
            fact('2 "JATS XML" page', {editorsOnPage: /jmanager|secteditor/.test(text), length: text.length});
        } else fact('2 "JATS XML" page', {notDone: 'no "JATS XML" entry in the workflow'});

        // 3: made public, the signed-out download
        const vis = await sessionApi(page, 'PUT', `${pubUrl(17, p17.id)}/jats/visibility`, {jatsPublicVisibility: true});
        fact('3 "Make available with publication"', {status: vis.status, error: vis.status >= 400 ? vis.body : undefined});
        try {
            fact('4 "JATS Metadata Format" ticked', await enablePlugin(page, 'JATS Metadata Format'));
        } catch (e) {
            fact('4 "JATS Metadata Format" ticked', {notDone: e.message.slice(0, 200)});
        }
    } finally {
        await close();
    }

    if (p17) {
        const dl = await fetch(api(`submissions/17/publications/${p17.id}/jats/download`));
        const dlText = await dl.text();
        if (dl.status === 200) save('public-17.xml', dlText);
        fact('3 signed-out download', {status: dl.status, type: dl.headers.get('content-type'), people: dl.status === 200 ? people(dlText) : dlText.slice(0, 300)});
    }

    const oai = async (q) => (await fetch(app.url(`/index.php/${CTX}/oai?${q}`))).text();
    const formats = ((await oai('verb=ListMetadataFormats')).match(/<metadataPrefix>[^<]*/g) || []).map((m) => m.replace('<metadataPrefix>', ''));
    if (formats.includes('jats')) {
        const ids = ((await oai('verb=ListIdentifiers&metadataPrefix=jats')).match(/<identifier>([^<]*)/g) || []).map((m) => m.replace('<identifier>', ''));
        const id = ids.find((i) => /\/17$/.test(i)) || ids[0];
        const rec = id ? await oai(`verb=GetRecord&metadataPrefix=jats&identifier=${encodeURIComponent(id)}`) : '';
        if (rec) save('oai-17.xml', rec);
        fact('4 OAI jats record', {formats, identifier: id, records: ids.length, error: (rec.match(/<error[^>]*>[^<]*/) || [null])[0], people: people(rec)});
    } else fact('4 OAI jats record', {formats, note: 'the journal does not list the jats format'});

    record('facts-editors', facts);
    fs.writeFileSync(path.join(outDir(), `facts-editors-${app.name}.json`), JSON.stringify(facts, null, 2));
});
