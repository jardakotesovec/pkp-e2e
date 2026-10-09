// Kept walk for the PR review of pkp/pkp-lib#13479 (issue pkp/pkp-lib#13477, "PID extraction drops or corrupts
// identifiers in references and data citations"): the four points of the issue's first comment, and what the
// change must leave alone. The arXiv version itself is arxiv-version.js beside this file (both modes), the
// issue report's own walk, run with this one.
// On PKP's default test dataset (a dataset fleet), as dbarnes, through the screens only:
//   Setup: Settings › Workflow › "Metadata": metadata lookup and data citations ("Ask the author…") on.
//   References (OJS 4, OMP 3, OPS 1): thirteen references added in one "Add", each with an identifier in its text
//   (a comma or a bracket after a DOI, a dx.doi.org address, a handle followed by a sentence, a URN followed by
//   a comma, an http address, a versioned arXiv ID, a DOI holding "doi", and since round 2 http:// forms of a
//   DOI and a handle, an address ending in "/" and one ending a sentence); once the lookup's first job has
//   run, each row's "Edit citation" boxes are read.
//   "Edit citation" typed by hand, on one more reference: "DOI" and "Handle" typed in four forms, saved, reread.
//   Data: eleven data citations added, the type and identifier of each in CASES below; each row read.
// Reads as the PR intends when every case is "fixed" or "unchanged" (REFS' and TYPED's last column, CASES'
// "should"). Round 1 (head 09f4461da9) read "other" for "uri http" and "purl http", saved with https://; round 2
// (50fb7ad3b2) keeps an address as written, in a data citation and in a reference's "URL"; round 3 (f8c4d3176e)
// reads every case "fixed" or "unchanged".
// Run (reset the fleet first: npm run fleet-prep -- --feature <feature> --dataset <n> --reset):
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13479/walk.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, note, serverLog, idle} = require('../../../probe');
const K = require('../../issues/arxiv-id-loses-version/lib.js');

const SUBMISSION = {ojs: 4, omp: 3, ops: 1};
const BOXES = ['DOI', 'URL', 'URN', 'Arxiv', 'Handle'];

// [row text, the box the issue is about, its value before the change, its value as the PR intends,
//  other boxes' values at the PR head (recorded as alsoOk)]
const REFS = [
    ['Alpha A. Comma after. doi:10.1234/alpha, 2020', 'DOI', '10.1234/alpha,', '10.1234/alpha'],
    ['Bravo B. In brackets (doi:10.1234/bravo).', 'DOI', '10.1234/bravo)', '10.1234/bravo'],
    ['Charlie C. Old resolver. https://dx.doi.org/10.1234/charlie', 'DOI', '', '10.1234/charlie', {URL: ''}],
    ['Delta D. Handle then date. hdl:10419/12345. Accessed 2020-01-01.', 'Handle', '10419/12345. Accessed 2020-01-01', '10419/12345'],
    ['Echo E. Thesis. urn:nbn:de:101:1-2019072802401757702913, 2019.', 'URN', 'urn:nbn:de:101:1-2019072802401757702913,', 'urn:nbn:de:101:1-2019072802401757702913'],
    ['Foxtrot F. Plain address. http://example.org/data', 'URL', 'https://example.org/data', 'http://example.org/data'],
    ['Golf G. Versioned. arXiv:2101.12345v2 [cs.CL].', 'Arxiv', '2101.12345', '2101.12345v2'],
    ['Hotel H. Prefix inside. doi:10.1000/jdoi.2020.5', 'DOI', '10.1000/j.2020.5', '10.1000/jdoi.2020.5'],
    ['Juliet J. Old scheme. http://doi.org/10.1234/juliet', 'DOI', '10.1234/juliet', '10.1234/juliet', {URL: ''}],
    ['Kilo K. Old handle. http://hdl.handle.net/10419/777', 'Handle', '10419/777', '10419/777', {URL: ''}],
    ['Lima L. Slash kept. https://example.org/set/', 'URL', 'https://example.org/set', 'https://example.org/set/'],
    ['Mike M. Full stop. See http://example.org/report.', 'URL', 'https://example.org/report', 'http://example.org/report'],
    // capitals in the scheme: read as "other" at 50fb7ad3b2 (no URL at all; Url's pattern was case-sensitive and
    // the lookup no longer rewrites the text), "fixed" since f8c4d3176e (round 3, the pattern's i flag)
    ['Oscar O. Capitals. HTTP://example.org/caps', 'URL', 'https://example.org/caps', 'HTTP://example.org/caps'],
];
const HAND = 'India I. Typed by hand, 2019.';
// [box, typed, stored before the change, stored as the issue intends]
const TYPED = [
    ['DOI', 'https://dx.doi.org/10.1234/india', null, '10.1234/india'],
    ['DOI', 'doi:10.1000/jdoi.2020.5', '10.1000/j.2020.5', '10.1000/jdoi.2020.5'],
    ['Handle', 'hdl:10419/hdlfoo', '10419/foo', '10419/hdlfoo'],
    ['Handle', 'handle:20.1000/abc def', '20.1000/abc def', '20.1000/abc'],
];
// [title, identifier type, identifier typed, saved before the change (null: refused), saved as it should be]
const CASES = [
    ['pr13479 doi inside', 'DOI', '10.1000/jdoi.2020.5', '10.1000/j.2020.5', '10.1000/jdoi.2020.5'],
    ['pr13479 handle inside', 'Handle', '10419/hdlfoo', '10419/foo', '10419/hdlfoo'],
    ['pr13479 doi http', 'DOI', 'http://doi.org/10.1234/efgh', null, '10.1234/efgh'],
    ['pr13479 ark http', 'ARK', 'http://n2t.net/ark:/12345/abc123', null, 'ark:/12345/abc123'],
    ['pr13479 doi control', 'DOI', 'https://doi.org/10.1234/abcd', '10.1234/abcd', '10.1234/abcd'],
    ['pr13479 uri secure', 'URI', 'https://example.org/data2', 'https://example.org/data2', 'https://example.org/data2'],
    ['pr13479 uri http', 'URI', 'http://example.org/data', 'http://example.org/data', 'http://example.org/data'],
    ['pr13479 purl http', 'PURL', 'http://purl.org/dc/terms/title', 'http://purl.org/dc/terms/title', 'http://purl.org/dc/terms/title'],
    // cut at the space: ruled intended by the PR's author (2026-10-09); typed bare it is kept whole
    ['pr13479 handle space', 'Handle', 'handle:20.1000/abc def', '20.1000/abc def', '20.1000/abc'],
    ['pr13479 purl slash', 'PURL', 'http://purl.org/dc/elements/1.1/', 'http://purl.org/dc/elements/1.1', 'http://purl.org/dc/elements/1.1/'],
    ['pr13479 uri stop', 'URI', 'https://example.org/data3.', 'https://example.org/data3', 'https://example.org/data3'],
];

async function readBoxes(page) {
    const out = {};
    for (const label of BOXES) out[label] = await K.editField(page, label).inputValue().catch(() => undefined);
    return out;
}

/** "Save" on "Edit citation", keeping the identifiers of the answer. */
async function saveEdit(page) {
    const p = K.editPanel(page);
    const resp = page.waitForResponse((r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
    await p.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    const closed = await p.waitFor({state: 'detached', timeout: 10_000}).then(() => true).catch(() => false);
    await idle(page);
    const out = {status: r ? r.status() : null, closed};
    if (!closed) out.errors = (await p.locator('.pkpFieldError').allInnerTexts().catch(() => [])).map((x) => K.flat(x));
    return out;
}

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', submission: SUBMISSION[app.name]};
    const log = serverLog(app);
    const from = log.mark();
    const {page} = await launch(app);
    let n = 0;
    const snap = async (name) => {
        const id = `pr13479-${String(++n).padStart(2, '0')}-${name}`;
        record(id, await screen(page).catch((e) => ({url: page.url(), error: K.flat(e.message)})));
        await shot(page, id).catch(() => {});
    };
    const step = async (key, fn) => {
        try { facts[key] = await fn(); } catch (e) {
            facts[key] = {threw: K.flat(e.message, 400)};
            note(`pkp-lib#13479 walk (${app.name}): step ${key} threw: ${K.flat(e.message, 200)}`);
            await snap(`${key}-threw`).catch(() => {});
            await K.closeEditCitation(page).catch(() => {});
        }
        console.log(`[pr13479 ${app.name}] ${key}`, JSON.stringify(facts[key]).slice(0, 3000));
        return facts[key];
    };
    const save = () => record('pr13479-facts', facts);
    const openRefs = async () => { await K.gotoWorkflow(page, app, SUBMISSION[app.name]); return K.openEntry(page, 'References'); };

    await signIn(page, 'dbarnes');
    await step('settings', async () => K.enableLookupAndDataCitations(page, app));

    // References: identifiers picked out of the text by the lookup's first job.
    await step('references', async () => ({heading: await openRefs()}));
    await step('add', async () => K.addReference(page, [...REFS.map((r) => r[0]), HAND].join('\n')));
    // Every page load runs waiting jobs (job_runner = On); a few loads let the first job of each reference run.
    for (let i = 0; i < 6; i++) { await K.sleep(1500); await openRefs(); }
    await snap('references-added');
    await step('rows', async () => {
        const out = [];
        for (const [text, box, before, fixed, also] of REFS) {
            const rowText = text.slice(0, 22);
            const row = {text, box, before, fixed};
            try {
                await K.openEditCitation(page, rowText);
                row.boxes = await readBoxes(page);
                row.read = row.boxes[box];
                row.is = row.read === fixed ? (fixed === before ? 'unchanged' : 'fixed') : row.read === before ? 'as before' : 'other';
                if (also) row.alsoOk = Object.entries(also).every(([k, v]) => row.boxes[k] === v);
                await K.closeEditCitation(page);
            } catch (e) {
                row.threw = K.flat(e.message, 200);
                await K.closeEditCitation(page).catch(() => {});
            }
            out.push(row);
        }
        return out;
    });
    await snap('references-read');
    save();

    // "Edit citation" typed by hand.
    await step('typed', async () => {
        const out = [];
        const rowText = HAND.slice(0, 22);
        for (const [box, typed, before, fixed] of TYPED) {
            const row = {box, typed, before, fixed};
            await K.openEditCitation(page, rowText);
            await K.editField(page, box).fill(typed);
            row.saved = await saveEdit(page);
            if (!row.saved.closed) {
                await K.closeEditCitation(page);
                row.read = null;
            } else {
                await K.openEditCitation(page, rowText);
                row.read = await K.editField(page, box).inputValue();
                await K.closeEditCitation(page);
            }
            row.is = row.read === fixed ? (fixed === before ? 'unchanged' : 'fixed') : row.read === before ? 'as before' : 'other';
            out.push(row);
        }
        return out;
    });
    await snap('typed-read');
    save();

    // Data citations.
    await step('data', async () => {
        await K.gotoWorkflow(page, app, SUBMISSION[app.name]);
        const heading = await K.openEntry(page, 'Data');
        await page.locator('table[aria-label="Data Citations"]:visible').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
        return {heading};
    });
    await step('dataCitations', async () => {
        const out = [];
        for (const [title, identifierType, identifier, before, should] of CASES) {
            const {panel, saved} = await K.addDataCitation(page, {title, identifierType, identifier, relationship: K.SUPPORTING});
            const row = {title, type: identifierType, typed: identifier, before, should, saved};
            if (!saved.closed) { await snap(`dc-refused-${title.replace(/\W+/g, '-')}`); await K.closeDataCitation(page, panel); }
            row.row = ((await K.dcRows(page)) || []).find((r) => r.includes(title)) || null;
            row.read = saved.closed && saved.response ? saved.response.identifier : null;
            row.is = row.read === should ? (should === before ? 'unchanged' : 'fixed') : row.read === before ? 'as before' : 'other';
            out.push(row);
        }
        return out;
    });
    await snap('data-citations');
    facts.serverLog = log.since(from);
    save();
    await signOut(page).catch(() => {});
});
