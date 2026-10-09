// PR review of pkp/pkp-lib#13475 (issue pkp/pkp-lib#13455, with the pointer bumps pkp/ojs#5912,
// pkp/omp#2497, pkp/ops#1437): the five small fixes in the citation API, map and lookups, walked the
// same way before (the PR's base) and after (its head). As `dbarnes` on PKP's default dataset for
// `main`, on the submission of ../../issues/citation-author-row-kept-after-close/lib.js SUBMISSION.
//   1. `_href`: what the citations API hands out for a reference, and what its address answers.
//   2. "Edit citation" with lookup off (the one box "Edit Raw Citation"), "Save": the request, the
//      answer and the "Undefined array key" lines the server log gains.
//   2b. The same panel with lookup on: DOI, Handle and Arxiv typed as addresses are stored bare, a
//      cleared DOI is stored empty (the block the PR rewrote).
//   3, 4. lookups.php (the two services' answers through the app's own classes, a local stand-in for
//      the services): a one-word author name, and answers with no authors. Its "names" answer is
//      stored on a reference, and the row and the panel's "Author Information" are read.
//   5. A client sends `processingStatus` and `isStructured` with an edit: the answer and what the
//      reference then carries.
// Every database call is a read. Names tagged pr13475.
//
// Reset first:  npm run fleet-prep -- --feature sync --dataset 7 --reset
// Run:          PROBE_FEATURE=sync PROBE_AGENT=pr13475 PROBE_RUN=<base|head> node bin/probe.js <app|all> shared/playwright/checks/sync/pkp-lib-13475/walk.js
// Facts: .reports/sync/pr13475/walk-facts-<run>-<app>.json
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, shot, idle, sql, serverLog} = require('../../../probe');
const L = require('../../issues/citation-author-row-kept-after-close/lib');

const PLAIN = 'pr13475 Plain reference. Test Press; 2020.';
const PLAIN_EDITED = 'pr13475 Plain reference, edited. Test Press; 2020.';
const NAMES = 'pr13475 Alpha study of things. Journal of Things; 2020.';
const NAMES_TITLE = 'Alpha study of things';
const STATE = 'pr13475 Internal state reference. Test Press; 2022.';
const UNDEFINED_KEY = /Undefined array key/;

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const facts = {app: app.name, run: process.env.PROBE_RUN || null};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${L.flat(JSON.stringify(v), 900)}`);
    };
    const log = serverLog(app, {match: /Undefined array key|foreach\(\) argument|PHP (Warning|Fatal|Deprecated)|\[5\d\d\]/});
    const {page, close} = await launch(app);
    const writes = L.watchWrites(page);
    const sub = L.SUBMISSION[app.name].id;
    const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`));
    const api = app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/citations`);
    const idOf = (raw) => Number(sql(app, `select citation_id from citations where publication_id = ${publicationId} and raw_citation = '${raw.replace(/'/g, "''")}' order by citation_id desc limit 1`));
    const read = async (id) => {
        const r = await page.request.get(`${api}/${id}`);
        return {status: r.status(), body: await r.json().catch(() => null)};
    };
    const pick = (o, keys) => (o ? Object.fromEntries(keys.map((k) => [k, o[k] === undefined ? '(absent)' : o[k]])) : null);
    const put = async (id, data) => {
        const csrfToken = await page.evaluate(() => window.pkp.currentUser.csrfToken);
        const r = await page.request.put(`${api}/${id}`, {headers: {'X-Csrf-Token': csrfToken}, data, failOnStatusCode: false});
        return {status: r.status(), body: await r.json().catch(() => null)};
    };
    const reopen = async () => {
        const {pg} = await L.openPublicationPage(page, app, 'References');
        await L.sleep(1500);
        return pg;
    };
    /** Press "Save" on the open panel; the write's answer, whatever its status. */
    const save = async (panel) => {
        const answered = page.waitForResponse((r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() === 'POST', {timeout: L.T});
        await panel.saveButton().click();
        const r = await answered;
        const posted = r.request().postData() || '';
        let sent;
        try {
            sent = Object.keys(JSON.parse(posted));
        } catch (e) {
            // a form-encoded body: its field names, an author table's rows as one
            sent = [...new Set([...new URLSearchParams(posted).keys()].map((k) => k.replace(/\[.*$/, '')))];
        }
        const out = {status: r.status(), sent, answerHasHref: Object.prototype.hasOwnProperty.call((await r.json().catch(() => ({}))) || {}, '_href')};
        await panel.dialog().waitFor({state: 'detached', timeout: 10_000}).catch(() => {});
        await L.afterClose(page);
        return out;
    };
    const step = async (key, fn) => {
        try {
            await fn();
        } catch (e) {
            fact(`${key} error`, L.flat(e.message, 400));
            await shot(page, `pr13475-${key}-error${run}`).catch(() => {});
        }
    };

    try {
        await signIn(page, 'dbarnes');
        let refs;

        // 1 and 2: lookup off, as the dataset arrives.
        await step('s1', async () => {
            fact('s1 lookup setting as found', sql(app, `select setting_value from ${app.contextTables.settings} where setting_name = 'citationsMetadataLookup'`) || '(not set)');
            refs = await reopen();
            await refs.add([PLAIN, STATE]);
            await idle(page);
        });
        await step('s2', async () => {
            const list = await page.request.get(api);
            const items = (await list.json()).items;
            const item = items.find((i) => i.id === idOf(PLAIN));
            fact('s2 list: keys of a reference', Object.keys(item).sort());
            fact('s2 list: _href', item._href === undefined ? '(absent)' : item._href);
            if (item._href) {
                const r = await page.request.get(item._href, {failOnStatusCode: false});
                fact('s2 the _href address answers', {status: r.status(), body: L.flat(await r.text(), 200)});
            }
            const one = await read(item.id);
            fact('s2 one reference: _href', one.body && one.body._href === undefined ? '(absent)' : one.body && one.body._href);
            fact('s2 the nested address answers', one.status);
        });
        await step('s3', async () => {
            const from = log.mark();
            const panel = await refs.edit(PLAIN);
            fact('s3 boxes of the panel (lookup off)', await panel.textboxes().count());
            await panel.rawBox().fill(PLAIN_EDITED);
            fact('s3 raw edit "Save"', await save(panel));
            fact('s3 row after the save', L.flat(await refs.row(PLAIN_EDITED).first().innerText().catch(() => null), 200));
            fact('s3 server log lines', log.since(from).map((l) => L.flat(l.replace(/^\[[^\]]*\]\s*/, ''), 200)));
            await shot(page, `pr13475-s3${run}`);
        });

        // 2b: lookup on, the structured panel.
        await step('s4', async () => fact('s4 lookup on', await L.tickMetadata(page, app, ['lookup'])));
        await step('s5', async () => {
            refs = await reopen();
            const from = log.mark();
            const panel = await refs.edit(PLAIN_EDITED);
            await panel.field('DOI').fill('https://doi.org/10.1234/pr13475');
            await panel.field('Handle').fill('https://hdl.handle.net/20.1000/100');
            await panel.field('Arxiv').fill('arxiv:2101.12345');
            await panel.field('Title').fill('Plain study');
            fact('s5 structured edit "Save"', await save(panel));
            const one = await read(idOf(PLAIN_EDITED));
            fact('s5 stored', pick(one.body, ['doi', 'handle', 'arxiv', 'title', 'isStructured', 'processingStatus']));
            fact('s5 server log lines', log.since(from).filter((l) => UNDEFINED_KEY.test(l)).map((l) => L.flat(l, 200)));
        });
        await step('s6', async () => {
            const panel = await refs.edit(PLAIN_EDITED);
            await panel.field('DOI').fill('');
            fact('s6 DOI cleared "Save"', await save(panel));
            const one = await read(idOf(PLAIN_EDITED));
            fact('s6 stored', pick(one.body, ['doi', 'handle', 'arxiv', 'title', 'isStructured']));
        });

        // 3 and 4: the lookups' answers, then the one-word names on the screen.
        await step('s7', async () => {
            refs = await reopen();
            await refs.add([NAMES]);
            await idle(page);
            const id = idOf(NAMES);
            const out = execFileSync('php', [path.join(__dirname, 'lookups.php'), String(id)], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 120_000});
            const driver = JSON.parse(out.slice(out.indexOf('{')));
            fact('s7 OpenAlex names: authors', driver.names.authors.map((a) => `${a.givenName === undefined ? '(none)' : a.givenName} | ${a.familyName === undefined ? '(none)' : a.familyName}`));
            fact('s7 OpenAlex names: warnings', driver.names.warnings);
            fact('s7 OpenAlex no authorships', driver.noauthors);
            fact('s7 Crossref no author', driver.crossref);
            fact('s7 stored on the reference', driver.stored);
        });
        await step('s8', async () => {
            refs = await reopen();
            // the row now shows the looked-up title in place of the text typed
            const expander = refs.rowExpander(NAMES_TITLE).first();
            if (await expander.isVisible().catch(() => false)) await expander.click().catch(() => {});
            await L.sleep(500);
            fact('s8 the row', L.flat(await refs.row(NAMES_TITLE).first().innerText().catch(() => null), 500));
            await shot(page, `pr13475-s8-row${run}`);
            const panel = await refs.edit(NAMES_TITLE);
            fact('s8 "Author Information" rows', await L.authorRows(panel.authorsField()));
            await shot(page, `pr13475-s8-panel${run}`);
            fact('s8 "Save" on the panel as it arrived', await save(panel));
            const one = await read(idOf(NAMES));
            fact('s8 authors after that save', (one.body.authors || []).map((a) => `${a.givenName || '(none)'} | ${a.familyName || '(none)'}`));
        });

        // 5: the two internal values sent by a client.
        await step('s9', async () => {
            const id = idOf(STATE);
            const before = await read(id);
            fact('s9 before', pick(before.body, ['processingStatus', 'isStructured']));
            for (const [name, data] of [
                ['processingStatus 5', {rawCitation: STATE, processingStatus: 5}],
                ['isStructured true', {rawCitation: STATE, isStructured: true}],
                ['rawCitation alone', {rawCitation: STATE}],
            ]) {
                const r = await put(id, data);
                const after = await read(id);
                fact(`s9 PUT ${name}`, {status: r.status, answer: r.status === 200 ? pick(r.body, ['processingStatus', 'isStructured']) : r.body, stored: pick(after.body, ['processingStatus', 'isStructured'])});
            }
            refs = await reopen();
            fact('s9 the row', L.flat(await refs.row(STATE).first().innerText().catch(() => null), 300));
            fact('s9 progress box', await refs.progressTitle().first().innerText({timeout: 1500}).catch(() => null));
            await shot(page, `pr13475-s9${run}`);
        });
        fact('writes the page sent', writes.map((w) => `${w.override || 'POST'} ${w.url.replace(/^.*\/publications\/\d+\//, '')}`));
    } finally {
        record(`walk-facts${run}`, facts);
        await close();
    }
});
