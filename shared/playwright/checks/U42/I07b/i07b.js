// U42 claim check, housekeeping chunk I07b (2026-10-07): two rows of docs/tracking/incidentals.md.
//
//   l11   Rules 11, 14, 15, note j: a reference an editor fills in by hand ("Edit citation") while its lookup still
//         waits. As the scratch context's manager, with "References Metadata Lookup" on:
//           a   six references added in one "Add" (three with a DOI in their text, three without); the list, the
//               progress box and the row menus; then "Edit" › "Save" on three of them while nothing has run:
//                 one   DOI in the text; Title, an author, Publication Date and Volume typed (the row's own drive)
//                 two   no DOI in the text; DOI, Title and an author typed
//                 three DOI in the text; another DOI, Title and an author typed
//               each read on the same page after the save and again after a reload, beside the stored processing
//               status and the queued lookup steps of the reference (database reads, never steps); one panel is
//               left by "Close" with a change typed
//           b   the install's own job runner run once (the kit's drainJobs: no service answers on a test install, so
//               only the step that reads the text can finish); the list again; then "Edit" › "Save" on "four" (DOI in
//               the text, untouched until now): the other end, a hand edit made after the lookup's first step ran;
//               another DOI typed on "six" after that step, and the runner again once the put-back steps are due;
//               "Reprocess all references" › "OK" and the runner a third time (Rule 15 as far as a test install
//               runs it); at the end "Delete all references", so the steps still queued find nothing later
//         What stays unreachable: a service's answer (no outbound connections), so nothing here shows OpenAlex or
//         Crossref writing over a typed title, author or date.
//   l13   Fields "Creators", A14: an invalid ORCID iD in a creator row of "Add Data Citation" and "Edit Data
//         Citation". Each box as the browser builds it (id, aria-describedby and what it points at, aria-invalid)
//         and as Chromium's accessibility tree gives it (name, description), beside the same read of the panel's
//         ordinary boxes when they are refused (Title, Year, URL): the controls that say whether the row's fact is
//         the Creators table's or every field's.
//   forms the same read on one settings form (Settings › Journal/Press/Server › Contact, a refused "Save"), for
//         the spec that owns forms.
//
//   .reports/hk07b/applock.sh shared ojs,omp,ops -- env PROBE_FEATURE=U42 PROBE_AGENT=ccI07b PROBE_RUN=r1 \
//       node bin/probe.js all shared/playwright/checks/U42/I07b/i07b.js
//   PHASES narrows (l11,l13,forms). DRAIN=0 skips l11's part b (the runner pass runs every queued job of the
//   fleet, other agents' included). Each run seeds a scratch context of its own (tag prefix u42i07b);
//   publicknowledge is never touched. Facts: .reports/U42/<agent>/facts-<run>-<app>.json.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag, sql, drainJobs} = require('../../../probe');

const PHASES = (process.env.PHASES || 'l11,l13,forms').split(',');
const DRAIN = process.env.DRAIN !== '0';
const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const ORCID_INVALID =
    'The ORCID iD you specified is invalid. Please include the full URI (e.g. "https://orcid.org/0000-0002-1825-0097").';
const STATUS = {'-2': 'QUEUED', '-1': 'FAILED', 0: 'NOT_PROCESSED', 1: 'PID_EXTRACTED', 2: 'CROSSREF', 3: 'OPEN_ALEX', 4: 'ORCID', 5: 'PROCESSED'};
const CONTEXT_SETTINGS = {ojs: 'Journal', omp: 'Press', ops: 'Server'};

forEachApp(async (app) => {
    const log = (...a) => console.log(`[i07b ${RUN} ${app.name}]`, ...a);
    const facts = {app: app.name, run: RUN, startedAt: new Date().toISOString()};
    const fact = (k, v) => {
        facts[k] = v;
        log(`fact ${k}: ${flat(JSON.stringify(v), 900)}`);
        record('facts', facts);
    };

    // ------------------------------------------------------------------ seed
    const t = tag('u42i07b');
    const users = [
        {username: `${t}mg`, roles: ['manager']},
        {username: `${t}au`, roles: ['author']},
    ];
    const ctx = await app.api.createContext({tag: t, users, citationsMetadataLookup: true, metadata: {dataCitations: 'enable'}});
    const path = ctx.path || t;
    const subRefs = await app.api.createSubmission({tag: `${t}r`, context: path, submitter: `${t}au`});
    const subData = await app.api.createSubmission({tag: `${t}d`, context: path, submitter: `${t}au`});
    fact('seed', {context: path, manager: `${t}mg`, references: subRefs.submissionId, data: subData.submissionId});

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        await (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
    });
    /** The page's own citation and data citation writes, with what the server answered. */
    const writes = [];
    page.on('response', async (r) => {
        const u = r.url().split('?')[0];
        const m = r.request().method();
        if (m === 'GET' || !/\/api\/v1\//.test(u) || /_test\//.test(u)) return;
        const e = {at: Date.now(), op: r.request().headers()['x-http-method-override'] || m, url: u.replace(/^.*\/api\/v1\//, ''), status: r.status()};
        const body = await r.text().catch(() => '');
        try {
            const j = JSON.parse(body);
            if (r.status() >= 400) e.answer = j;
            else if (j && typeof j === 'object' && 'processingStatus' in j) e.answer = {processingStatus: j.processingStatus, isStructured: j.isStructured, doi: j.doi, title: j.title};
        } catch (err) {
            e.answer = flat(body, 200);
        }
        writes.push(e);
    });
    const writesSince = (t0) => writes.filter((w) => w.at >= t0).map(({at, ...w}) => w);
    const dialogsSince = (t0) => dialogs.filter((d) => d.at >= t0).map(({at, ...d}) => d);

    const snap = async (name) => {
        let s;
        try {
            s = await screen(page);
        } catch (e) {
            s = {url: page.url(), error: flat(e.message, 300)};
        }
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    };
    const part = async (key, fn) => {
        try {
            await fn();
        } catch (e) {
            fact(`${key} ERROR`, flat(e.stack || e.message, 900));
            await snap(`${key}-error`);
        }
    };
    /** Wait out a closed side panel (the modal store keeps its slot 450 ms; patterns.md pitfall 4). */
    const afterClose = async () => {
        await sleep(900);
        await idle(page);
    };

    // ------------------------------------------------------------------ screens
    const C = require('../../../pages/CitationsPages.js');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const wf = new WorkflowPage(page, path, {labels: {publicationGroup: app.name === 'ops' ? 'Preprint' : 'Publication'}});
    const openPublicationPage = async (submissionId, entry) => {
        await page.goto(app.url(`/index.php/${path}/dashboard`));
        await idle(page);
        await wf.gotoEditorial(submissionId);
        await idle(page);
        const pg = entry === 'Data' ? new C.DataCitationsTable(page, {frame: wf}) : new C.ReferencesPage(page, wf);
        await pg.open();
        await idle(page);
        return pg;
    };

    /** Role, name and description of a locator's first element as Chromium's accessibility tree computes them. */
    const axOf = async (locator) => {
        const cdp = await page.context().newCDPSession(page);
        try {
            const handle = await locator.first().elementHandle();
            await handle.evaluate((el) => {
                window.__axProbe = el;
            });
            const {result} = await cdp.send('Runtime.evaluate', {expression: 'window.__axProbe'});
            const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {objectId: result.objectId, fetchRelatives: false});
            const node = nodes[0] || {};
            const prop = (name) => ((node.properties || []).find((p) => p.name === name) || {value: {}}).value.value ?? null;
            return {
                role: node.role ? node.role.value : null,
                name: node.name ? node.name.value : null,
                description: node.description ? node.description.value : null,
                invalid: prop('invalid'),
            };
        } finally {
            await cdp.detach().catch(() => {});
        }
    };
    /**
     * A form control as the browser builds it: its id and how many elements carry that id, aria-describedby and
     * what each id in it points at, aria-invalid, the messages drawn in its own field (each with its id and how
     * many elements carry that id), and its accessibility node.
     */
    const boxFacts = async (locator) => {
        const n = await locator.count();
        const out = [];
        for (let i = 0; i < n; i++) {
            const box = locator.nth(i);
            const dom = await box.evaluate((el) => {
                const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
                const count = (id) => (id ? document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length : 0);
                const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
                const field = el.closest('.pkpFormField');
                return {
                    name: el.getAttribute('name'),
                    id: el.id,
                    elementsWithId: count(el.id),
                    value: el.value,
                    ariaDescribedby: el.getAttribute('aria-describedby'),
                    describedByPointsAt: ids.map((id) => ({id, elementsWithId: count(id), text: f(document.getElementById(id)?.innerText).slice(0, 160)})),
                    ariaInvalid: el.getAttribute('aria-invalid'),
                    messagesInItsField: field
                        ? [...field.querySelectorAll('.pkpFieldError')].map((e) => ({id: e.id, elementsWithId: count(e.id), ariaLive: e.getAttribute('aria-live'), text: f(e.innerText)}))
                        : null,
                };
            });
            out.push({...dom, ax: await axOf(box)});
        }
        return out;
    };

    try {
        await signIn(page, `${t}mg`, {contextPath: path});
        await idle(page).catch(() => {});

        // ============================================================== l11
        if (PHASES.includes('l11')) {
            const REF = {
                one: `Lovelace A. ${t}one Notes on the analytical engine. 1843. https://doi.org/10.1234/${t}.one`,
                two: `Babbage C. ${t}two On the economy of machinery. 1832.`,
                three: `Turing A. ${t}three On computable numbers. 1936. https://doi.org/10.1234/${t}.three`,
                four: `Hopper G. ${t}four The education of a computer. 1952. https://doi.org/10.1234/${t}.four`,
                five: `Shannon C. ${t}five A mathematical theory of communication. 1948.`,
                six: `Boole G. ${t}six An investigation of the laws of thought. 1854. https://doi.org/10.1234/${t}.six`,
            };
            const KEYS = Object.keys(REF);
            /** Read: every reference of the submission as stored (processing status, identifiers, details). */
            const stored = () => {
                const rows = JSON.parse(
                    sql(
                        app,
                        `select coalesce(json_agg(json_build_object('id', c.citation_id, 'raw', c.raw_citation, 'settings', (select json_object_agg(setting_name, setting_value) from citation_settings cs where cs.citation_id = c.citation_id)) order by c.seq), '[]') from citations c join submissions s on s.current_publication_id = c.publication_id where s.submission_id = ${subRefs.submissionId}`
                    ) || '[]'
                );
                const out = {};
                for (const r of rows) {
                    const key = KEYS.find((k) => r.raw.includes(`${t}${k} `));
                    const s = r.settings || {};
                    out[key || r.id] = {
                        id: r.id,
                        processingStatus: s.processingStatus ?? null,
                        statusName: STATUS[s.processingStatus] ?? null,
                        isStructured: s.isStructured ?? null,
                        doi: s.doi ?? null,
                        url: s.url ?? null,
                        title: s.title ?? null,
                        date: s.date ?? null,
                        volume: s.volume ?? null,
                        authors: s.authors ?? null,
                    };
                }
                return out;
            };
            /** Read: the queued lookup steps per reference (the job at the head of each chain, and the steps chained behind it). */
            const queued = (ids) => {
                const rows = JSON.parse(sql(app, `select coalesce(json_agg(json_build_object('id', id, 'attempts', attempts, 'available_at', available_at, 'payload', payload) order by id), '[]') from jobs where payload like '%citation%'`) || '[]');
                const now = Math.floor(Date.now() / 1000);
                const short = (cls) => String(cls).split('\\').pop();
                const out = {};
                for (const row of rows) {
                    let p;
                    try {
                        p = JSON.parse(row.payload);
                    } catch (e) {
                        continue;
                    }
                    const command = (p.data && p.data.command) || '';
                    const m = command.match(/citationId";i:(\d+);/);
                    if (!m) continue;
                    const key = Object.keys(ids).find((k) => ids[k].id === Number(m[1]));
                    if (!key) continue;
                    const chained = [...command.matchAll(/O:\d+:\\?"PKP\\+jobs\\+citation\\+(\w+)\\?"/g)].map((x) => x[1]);
                    const retries = (command.match(/serviceRetries";i:(\d+);/) || [])[1];
                    (out[key] = out[key] || []).push({
                        job: short(p.displayName),
                        serviceRetries: retries === undefined ? null : Number(retries),
                        attempts: row.attempts,
                        dueInSeconds: row.available_at - now,
                        chainedBehind: chained.slice(1),
                    });
                }
                return out;
            };
            const otherJobs = () => Number(sql(app, `select count(*) from jobs where payload not like '%citation%'`) || 0);
            /** The row of a reference as shown: its text, links, whether it has an expander, its menu. */
            const rowRead = async (refs, key) => {
                const needle = `${t}${key}`;
                const row = refs.row(needle).first();
                const out = {shown: flat(await row.innerText({timeout: 5000}).catch(() => null), 400)};
                out.links = await row.locator('a').evaluateAll((as) => as.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []);
                out.expander = await refs
                    .rowExpander(needle)
                    .first()
                    .boundingBox()
                    .then((b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : null))
                    .catch(() => null);
                try {
                    const items = await refs.openRowMenu(needle);
                    out.menu = (await items.allInnerTexts()).map((s) => flat(s, 60));
                    await refs.closeRowMenu(needle);
                } catch (e) {
                    out.menuError = flat(e.message, 200);
                }
                return out;
            };
            const listRead = async (refs, keys = KEYS) => {
                const out = {progress: flat(await refs.progressTitle().first().innerText({timeout: 3000}).catch(() => null)), rows: {}};
                for (const k of keys) out.rows[k] = await rowRead(refs, k);
                return out;
            };
            /** The page's own refresh: publication fetches seen in `ms` with nothing pressed. */
            const refreshWatch = async (ms = 16_000) => {
                let n = 0;
                const on = (r) => {
                    if (r.method() === 'GET' && /\/submissions\/\d+\/publications\/\d+(\?|$)/.test(r.url())) n++;
                };
                page.on('request', on);
                await sleep(ms);
                page.off('request', on);
                return {seconds: ms / 1000, publicationFetches: n};
            };
            const panelValues = async (panel) =>
                panel.dialog().locator('.pkp-modal-scroll-container').locator('input, select, textarea').evaluateAll((els) =>
                    Object.fromEntries(els.filter((el) => el.value !== '').map((el, i) => [`${el.getAttribute('name') || el.id || i}${el.closest('tbody') ? `[row ${[...el.closest('tbody').children].indexOf(el.closest('tr'))}]` : ''}`, el.value]))
                );
            /** "Edit" on a reference, type into the named boxes, "Save"; the reads before, on the same page after, and after a reload. */
            const handEdit = async (refs, key, {doi, title, author, date, volume}, label) => {
                const out = {typed: {doi, title, author, date, volume}};
                out.before = {stored: stored()[key], queued: queued(stored())[key] || []};
                const panel = await refs.edit(`${t}${key}`);
                await idle(page);
                await sleep(500);
                out.panelOnOpen = await panelValues(panel);
                await snap(`${label}-edit-open`);
                if (key === 'one') {
                    await loc(page, '"Edit citation": the DOI box', panel.field('DOI'));
                    await loc(page, '"Edit citation": the Publication Date box', panel.dialog().locator('input[type="date"]'));
                }
                if (doi !== undefined) await panel.field('DOI').fill(doi);
                if (title !== undefined) await panel.field('Title').fill(title);
                if (author) await panel.addAuthor(author);
                if (date !== undefined) await panel.dialog().locator('input[type="date"]').fill(date);
                if (volume !== undefined) await panel.field('Volume').fill(volume);
                await snap(`${label}-edit-typed`);
                const t0 = Date.now();
                await panel.save();
                await afterClose();
                out.saveSent = writesSince(t0);
                const s1 = await snap(`${label}-after-save`);
                out.noticesAfterSave = s1.notices;
                out.samePage = {row: await rowRead(refs, key), progress: flat(await refs.progressTitle().first().innerText({timeout: 3000}).catch(() => null))};
                out.afterSave = {stored: stored()[key], queued: queued(stored())[key] || []};
                const refs2 = await openPublicationPage(subRefs.submissionId, 'References');
                await snap(`${label}-after-reload`);
                out.afterReload = {row: await rowRead(refs2, key), progress: flat(await refs2.progressTitle().first().innerText({timeout: 3000}).catch(() => null))};
                out.dialogs = dialogsSince(t0);
                return {out, refs: refs2};
            };

            let refs;
            await part('l11-a', async () => {
                refs = await openPublicationPage(subRefs.submissionId, 'References');
                await snap('l11-a0-page-empty');
                await loc(page, 'References page: the "Add" box', refs.addBox());
                await loc(page, 'References page: the progress box title', refs.progressTitle());
                const t0 = Date.now();
                await refs.add(KEYS.map((k) => REF[k]));
                await idle(page);
                await sleep(1500);
                await snap('l11-a1-six-added');
                fact('l11 a1 add sent', writesSince(t0));
                fact('l11 a1 stored after Add', stored());
                fact('l11 a1 queued after Add', queued(stored()));
                fact('l11 a1 list after Add', await listRead(refs));
                fact('l11 a1 page refresh while waiting', await refreshWatch());

                let r = await handEdit(refs, 'one', {title: `Hand title ${t}one`, author: {givenName: 'Ada', familyName: 'Lovelace'}, date: '1843-01-01', volume: '3'}, 'l11-a2-one');
                fact('l11 a2 one: title, author, date, volume typed (DOI in the text)', r.out);
                r = await handEdit(r.refs, 'two', {doi: `10.5678/${t}.hand2`, title: `Hand title ${t}two`, author: {givenName: 'Charles', familyName: 'Babbage'}}, 'l11-a3-two');
                fact('l11 a3 two: DOI, title, author typed (no DOI in the text)', r.out);
                r = await handEdit(r.refs, 'three', {doi: `10.5678/${t}.hand3`, title: `Hand title ${t}three`, author: {givenName: 'Alan', familyName: 'Turing'}}, 'l11-a4-three');
                fact('l11 a4 three: another DOI, title, author typed (DOI in the text)', r.out);
                refs = r.refs;

                // Expanded details of the structured rows, as the page shows them.
                if (await refs.expandAllButton().count()) {
                    await refs.expandAllButton().click();
                    await sleep(400);
                    await snap('l11-a5-expanded');
                    fact('l11 a5 rows expanded', Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, flat(await refs.row(`${t}${k}`).first().innerText().catch(() => null), 500)]))));
                    await refs.expandAllButton().click();
                }
                fact('l11 a5 list before the runner', await listRead(refs));
                fact('l11 a5 page refresh before the runner', await refreshWatch());

                // Sweep: the panel left by "Close" with a change typed.
                const t1 = Date.now();
                const panel = await refs.edit(`${t}one`);
                await idle(page);
                await panel.field('Title').fill(`Unsaved ${t}one`);
                await panel.field('Title').blur();
                await panel.close();
                await sleep(2000);
                const s = await snap('l11-a6-closed-with-change');
                fact('l11 a6 closed with a change typed', {dialogs: dialogsSince(t1), notices: s.notices, sent: writesSince(t1), stored: stored().one.title, row: (await rowRead(refs, 'one')).shown});
            });

            if (DRAIN) {
                await part('l11-b', async () => {
                    const before = {stored: stored(), queued: queued(stored()), otherQueuedJobsOfTheFleet: otherJobs()};
                    fact('l11 b0 before the runner', before);
                    const run = await drainJobs(app, {passes: 2});
                    fact('l11 b0 runner', {passes: run.passes, counts: run.counts, output: flat(run.output.replace(/\s+/g, ' '), 1500)});
                    fact('l11 b1 stored after the runner', stored());
                    fact('l11 b1 queued after the runner', queued(stored()));
                    refs = await openPublicationPage(subRefs.submissionId, 'References');
                    await snap('l11-b1-after-runner');
                    fact('l11 b1 list after the runner', await listRead(refs));
                    if (await refs.expandAllButton().count()) {
                        await refs.expandAllButton().click();
                        await sleep(400);
                        await snap('l11-b1-after-runner-expanded');
                        fact('l11 b1 rows expanded after the runner', Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, flat(await refs.row(`${t}${k}`).first().innerText().catch(() => null), 500)]))));
                        await refs.expandAllButton().click();
                    }
                    for (const k of ['one', 'three']) {
                        const panel = await refs.edit(`${t}${k}`);
                        await idle(page);
                        await sleep(500);
                        fact(`l11 b2 ${k}: "Edit citation" after the runner`, await panelValues(panel));
                        await snap(`l11-b2-${k}-edit-after-runner`);
                        await panel.close();
                        await afterClose();
                    }
                    const r = await handEdit(refs, 'four', {title: `Hand title ${t}four`, author: {givenName: 'Grace', familyName: 'Hopper'}, date: '1952-01-01', volume: '7'}, 'l11-b3-four');
                    fact('l11 b3 four: title, author, date, volume typed after the runner ran', r.out);
                    fact('l11 b3 page refresh after it', await refreshWatch());

                    // The other end of "three": a DOI typed after the step that reads the text has run, then the
                    // runner again once the steps it put back are due.
                    const r6 = await handEdit(r.refs, 'six', {doi: `10.5678/${t}.hand6`}, 'l11-b4-six');
                    fact('l11 b4 six: another DOI typed after the runner ran (DOI in the text)', r6.out);
                    refs = r6.refs;
                    const dueIn = () => Math.max(0, ...Object.values(queued(stored())).flat().filter((j) => j.job === 'CrossrefJob').map((j) => j.dueInSeconds));
                    const waitFrom = Date.now();
                    while (dueIn() > 0 && Date.now() - waitFrom < 180_000) await sleep(5000);
                    await sleep(2000);
                    const run2 = await drainJobs(app, {passes: 1});
                    fact('l11 b5 runner, second pass', {waitedSeconds: Math.round((Date.now() - waitFrom) / 1000), counts: run2.counts, output: flat(run2.output.replace(/\s+/g, ' '), 900)});
                    fact('l11 b5 stored after the second pass', stored());
                    fact('l11 b5 queued after the second pass', queued(stored()));
                    refs = await openPublicationPage(subRefs.submissionId, 'References');
                    await snap('l11-b5-after-second-pass');
                    fact('l11 b5 list after the second pass', await listRead(refs));

                    // Rule 15 with what a test install can run: "Reprocess all references", then the runner.
                    const t2 = Date.now();
                    await loc(page, 'References page: "Reprocess all references"', refs.reprocessAllButton());
                    await refs.reprocessAllButton().click();
                    const ask = page.getByRole('dialog').filter({hasText: 'This will reprocess all references currently listed.'});
                    await ask.waitFor({timeout: T});
                    await snap('l11-b6-reprocess-all-asked');
                    await refs.confirmOk(ask, /reprocessCitationsByPublicationId$/);
                    await idle(page);
                    await sleep(1500);
                    const s6 = await snap('l11-b6-reprocess-all-ok');
                    fact('l11 b6 "Reprocess all references" › "OK"', {sent: writesSince(t2), notices: s6.notices, dialogs: dialogsSince(t2), stored: stored(), list: await listRead(refs)});
                    const run3 = await drainJobs(app, {passes: 1});
                    fact('l11 b7 runner after "Reprocess all references"', {counts: run3.counts, output: flat(run3.output.replace(/\s+/g, ' '), 600)});
                    fact('l11 b7 stored after it', stored());
                    refs = await openPublicationPage(subRefs.submissionId, 'References');
                    await snap('l11-b7-after-reprocess-and-runner');
                    fact('l11 b7 list after it', await listRead(refs));
                    fact('l11 b7 queued at the end', queued(stored()));
                });
                // Leave no lookup behind for the fleet: with the references deleted, the steps still queued find
                // nothing and end on any later runner pass.
                await part('l11-end', async () => {
                    const t3 = Date.now();
                    await refs.deleteAllButton().click();
                    const ask = refs.deleteAllDialog();
                    await ask.waitFor({timeout: T});
                    await refs.confirmOk(ask, /deleteCitationsByPublicationId$/);
                    await idle(page);
                    await sleep(1000);
                    fact('l11 end "Delete all references" › "OK"', {sent: writesSince(t3), rows: (await refs.rowCells().allInnerTexts()).map((x) => flat(x, 120)), stored: stored()});
                });
            }
        }

        // ============================================================== l13
        if (PHASES.includes('l13')) {
            const DATASET = `Dataset ${t}`;
            const boxesOf = (field) => field.locator('tbody input.pkpFormField--text__input');
            const perRow = (field) =>
                field.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('.pkpFieldError')].map((e) => e.innerText.replace(/\s+/g, ' ').trim())));
            const panelRead = async (panel) => ({
                messagesPerCreatorRow: await perRow(panel.creatorsField()),
                creatorBoxes: await boxFacts(boxesOf(panel.creatorsField())),
                title: await boxFacts(panel.titleBox()),
                relationship: await boxFacts(panel.relationshipSelect()),
                year: await boxFacts(panel.yearBox()),
                url: await boxFacts(panel.urlBox()),
                foot: flat(await panel.dialog().locator('.pkpFormPage__footer, .pkpForm__footer, [class*="footer"]').last().innerText().catch(() => null), 300),
            });
            let data;
            await part('l13-add', async () => {
                data = await openPublicationPage(subData.submissionId, 'Data');
                await snap('l13-d0-data-page');
                await loc(page, 'Data page: "Add Data Citation"', data.addButton());
                const panel = await data.openAdd();
                await idle(page);
                await snap('l13-d1-add-open');
                await loc(page, '"Add Data Citation": the Creators field', panel.creatorsField());

                // Control 1: an ordinary box refused in the browser (Title and Relationship type empty).
                let t0 = Date.now();
                await panel.saveButton().click();
                await panel.dialog().locator('.pkpFieldError').first().waitFor({timeout: T});
                await snap('l13-d2-empty-refused');
                fact('l13 d2 "Save" with nothing filled', {sent: writesSince(t0), ...(await panelRead(panel))});

                // The row's state: a bare ORCID iD in the second creator row; Year and URL refused in the same save (controls).
                await panel.fill({title: DATASET, relationshipType: 'supporting', year: '20a4', url: 'example'});
                await panel.addCreator({givenName: 'Ada', familyName: 'Lovelace'});
                await panel.addCreator({givenName: 'Charles', familyName: 'Babbage', orcid: '0000-0002-1825-0097'});
                await loc(page, '"Add Data Citation": the creator rows\' boxes', boxesOf(panel.creatorsField()));
                t0 = Date.now();
                await panel.saveButton().click();
                await panel.dialog().getByText(ORCID_INVALID).first().waitFor({timeout: T});
                await idle(page);
                const s3 = await snap('l13-d3-orcid-refused');
                fact('l13 d3 a bare ORCID iD in the second row, Year "20a4", URL "example"', {sent: writesSince(t0), notices: s3.notices, ...(await panelRead(panel))});
                // The same boxes with the cursor in the refused box (what a screen reader is given on focus).
                const orcid2 = boxesOf(panel.creatorsField()).nth(5);
                await orcid2.focus();
                fact('l13 d3 the refused ORCID box with the cursor in it', {
                    focused: await orcid2.evaluate((el) => document.activeElement === el),
                    box: (await boxFacts(orcid2))[0],
                    yearBoxFocusedForComparison: await (async () => {
                        await panel.yearBox().focus();
                        return (await boxFacts(panel.yearBox()))[0];
                    })(),
                });

                // Sweep: the foot's links to the refused boxes (visually hidden, reached from the keyboard).
                const active = () =>
                    page.evaluate(() => {
                        const el = document.activeElement;
                        const authors = document.querySelector('[role="dialog"] .pkpFormField--authors');
                        const r = authors ? authors.getBoundingClientRect() : null;
                        return {
                            cursorIn: el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 70)}"` : null,
                            creatorsTableInView: r ? r.top >= 0 && r.top < window.innerHeight : null,
                        };
                    });
                const goTo = {};
                for (const label of ['Go to Creators', 'Go to Year', 'Jump to next error']) {
                    const button = panel.dialog().getByRole('button', {name: new RegExp(`^${label}`)}).first();
                    await loc(page, `"Add Data Citation" refused: the foot's "${label}…" button`, button);
                    await panel.titleBox().focus();
                    await button.focus();
                    await page.keyboard.press('Enter');
                    await sleep(600);
                    goTo[label] = await active();
                }
                fact('l13 d3 the foot\'s links pressed from the keyboard', goTo);

                // The other end: both rows refused at once. A change in any creator box clears the whole table's
                // messages, and "Save" stays grayed out while another refused box (Year, URL) is unchanged.
                await boxesOf(panel.creatorsField()).nth(2).fill('123');
                await sleep(300);
                fact('l13 d4a after typing in the first row only', {saveEnabled: await panel.saveButton().isEnabled(), messagesPerCreatorRow: await perRow(panel.creatorsField()), secondRowOrcidBox: (await boxFacts(boxesOf(panel.creatorsField()).nth(5)))[0]});
                await panel.fill({year: '2024', url: 'https://example.org/dataset'});
                await sleep(300);
                const enabled = await panel.saveButton().isEnabled();
                t0 = Date.now();
                if (enabled) {
                    await panel.saveButton().click();
                    await panel.dialog().getByText(ORCID_INVALID).first().waitFor({timeout: T}).catch(() => {});
                    await idle(page);
                }
                const s4 = await snap('l13-d4-both-rows-refused');
                fact('l13 d4 an invalid ORCID iD in both rows', {saveEnabledAfterTheChanges: enabled, sent: writesSince(t0), notices: s4.notices, ...(await panelRead(panel))});

                // Corrected: saved.
                await boxesOf(panel.creatorsField()).nth(2).fill('');
                await boxesOf(panel.creatorsField()).nth(5).fill('https://orcid.org/0000-0002-1825-0097');
                t0 = Date.now();
                await panel.save();
                await afterClose();
                const s5 = await snap('l13-d5-saved');
                fact('l13 d5 corrected and saved', {sent: writesSince(t0), notices: s5.notices, rows: (await data.rowCells().allInnerTexts()).map((x) => flat(x, 200))});
            });
            await part('l13-edit', async () => {
                data = await openPublicationPage(subData.submissionId, 'Data');
                const panel = await data.edit(DATASET);
                await idle(page);
                await sleep(500);
                await snap('l13-e1-edit-open');
                fact('l13 e1 "Edit Data Citation" on open', await panelRead(panel));
                await boxesOf(panel.creatorsField()).nth(5).fill('not-an-orcid');
                let t0 = Date.now();
                await panel.saveButton().click();
                await panel.dialog().getByText(ORCID_INVALID).first().waitFor({timeout: T});
                await idle(page);
                const s2 = await snap('l13-e2-edit-refused');
                fact('l13 e2 "Edit Data Citation": "not-an-orcid" in the second row', {sent: writesSince(t0), notices: s2.notices, ...(await panelRead(panel))});
                // Left by "Close" with the change typed and refused.
                t0 = Date.now();
                await panel.close();
                await sleep(2000);
                const s3 = await snap('l13-e3-closed-with-change');
                fact('l13 e3 closed with the refused change', {dialogs: dialogsSince(t0), notices: s3.notices, sent: writesSince(t0)});
                data = await openPublicationPage(subData.submissionId, 'Data');
                const again = await data.edit(DATASET);
                await idle(page);
                await sleep(500);
                fact('l13 e4 after a reload, "Edit Data Citation" creator boxes', (await boxFacts(boxesOf(again.creatorsField()))).map((b) => `${b.name}=${b.value}`));
                await snap('l13-e4-edit-after-reload');
                await again.close();
                await afterClose();
            });
        }

        // ============================================================== forms
        if (PHASES.includes('forms')) {
            await part('forms', async () => {
                await page.goto(app.url(`/index.php/${path}/management/settings/context`));
                await idle(page);
                await page.locator('#contact-button').first().click();
                const form = page.locator('[id="contact"] form').first();
                await form.waitFor({state: 'visible', timeout: T});
                await idle(page);
                await snap('forms-f0-contact');
                const email = form.locator('input[name="contactEmail"]');
                await loc(page, `Settings › ${CONTEXT_SETTINGS[app.name]} › Contact: the principal contact's Email box`, email);
                fact('forms f0 the Email box before', (await boxFacts(email))[0]);
                await email.fill('notanemail');
                const t0 = Date.now();
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await form.locator('.pkpFieldError').first().waitFor({timeout: T});
                await idle(page);
                const s = await snap('forms-f1-contact-refused');
                const flagged = form.locator('[aria-invalid="true"]');
                await flagged.first().focus().catch(() => {});
                fact('forms f1 "Save" refused', {sent: writesSince(t0), notices: s.notices, flaggedBoxes: await boxFacts(flagged), emailBox: (await boxFacts(email))[0]});
            });
        }

        await signOut(page).catch(() => {});
    } finally {
        fact('dialogs of the run', dialogs.map(({at, ...d}) => d));
        fact('endedAt', new Date().toISOString());
        await close();
    }
});
