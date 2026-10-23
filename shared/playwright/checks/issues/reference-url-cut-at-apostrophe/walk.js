// Issue report docs/issues/U42-A29-reference-url-cut-at-apostrophe.md (U42 A29, the "References"
// page): the web address picked out of a reference, and a data citation's "URI", end at an
// apostrophe or an opening bracket in the address. Takes the report's Steps on PKP's default test
// dataset, as dbarnes:
//   Settings › Workflow › "Metadata": "Enable references structuring and metadata lookup" and
//     "Enable data citation metadata" ("Ask the author…"), "Save".
//   References: OJS 5, OMP 4, OPS 1 › "References": two lines, "Add"; each row's web address link
//     once the lookup has picked it out, and its "Edit citation" "URL" box, then "Close".
//   Data citations: the same submission › "Data" › "Add Data Citation" of type "URI"; the row read.
// MODE=neighbour (run alone, fix in and out): addresses whose result must not change with the fix
// (a sentence's full stop, an address in brackets, in single and in double quotation marks, followed
// by "!", in Markdown "**", and a plain data citation "URI").
// MODE=wayround (fix out, and in): the reference's whole address typed into "URL" and saved, then
// read again; and a data citation of type "PURL" with an apostrophe.
// On 3.5 the "References" page is one box with no rows and there is no "Data" page: the walk records it.
// Reset the dataset fleet first; the walk changes the dataset.
// Run: [MODE=neighbour] PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/reference-url-cut-at-apostrophe/walk.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, serverLog} = require('../../../probe');
const K = require('./lib');

const MODE = process.env.MODE || 'walk';
const SUBMISSION = {ojs: 5, omp: 4, ops: 1};
const CASES = MODE === 'neighbour'
    ? [
        ['Oscar', 'Oscar, D. (2024). Sentence hkq23c. See https://example.org/oscar-page.', 'https://example.org/oscar-page'],
        ['Papa', 'Papa, E. (2024). Bracketed hkq23c (https://example.org/papa-page).', 'https://example.org/papa-page'],
        ['Quebec', "Quebec, F. (2024). Single quotes hkq23c 'https://example.org/quebec-page'.", 'https://example.org/quebec-page'],
        ['Romeo', 'Romeo, G. (2024). Quoted hkq23c "https://example.org/romeo-page"', 'https://example.org/romeo-page'],
        ['Tango', 'Tango, H. (2024). Exclaimed hkq23c, see https://example.org/tango-page!', 'https://example.org/tango-page'],
        ['Uniform', 'Uniform, I. (2024). Emphasis hkq23c **https://example.org/uniform-page**', 'https://example.org/uniform-page'],
    ]
    : MODE === 'wayround'
    ? [
        ['Kilo', "Kilo, A. (2024). Kilo's field notes hkq23c. https://example.org/kilo's-page", "https://example.org/kilo's-page"],
    ]
    : [
        ['Kilo', "Kilo, A. (2024). Kilo's field notes hkq23c. https://example.org/kilo's-page", "https://example.org/kilo's-page"],
        ['Estuary', 'Estuary, B. (2024). Estuaries hkq23c. https://en.wikipedia.org/wiki/Estuary_(landform)', 'https://en.wikipedia.org/wiki/Estuary_(landform)'],
    ];
const DATA = MODE === 'neighbour'
    ? {title: 'Sierra survey hkq23c', identifierType: 'URI', identifier: 'https://example.org/sierra-data', relationship: K.SUPPORTING}
    : MODE === 'wayround'
    ? {title: 'Kilo ontology hkq23c', identifierType: 'PURL', identifier: "https://purl.org/hkq23c/kilo's-term", relationship: K.SUPPORTING}
    : {title: 'Kilo survey hkq23c', identifierType: 'URI', identifier: "https://example.org/kilo's-data", relationship: K.SUPPORTING};

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const main = app.line !== 'stable-3_5_0';
    const sid = SUBMISSION[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: sid};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        // Step 1: the settings (main only; 3.5 has neither box).
        if (main) facts.settings = await K.enableLookupAndDataCitations(page, app);
        // References: steps 2-4.
        await K.gotoWorkflow(page, app, sid);
        facts.referencesHeading = await K.openEntry(page, 'References');
        if (!main) {
            record('step2-references-35', await screen(page));
            facts.rows = await K.refsTable(page).count();
            facts.dataEntry = await K.wf(page).getByRole('link', {name: 'Data', exact: true}).count();
            console.log(`[fact] ${app.name} 3.5: ${JSON.stringify(facts)}`);
        } else {
            facts.add = await K.addReference(page, CASES.map((c) => c[1]).join('\n'));
            facts.references = [];
            for (const [name, line, expected] of CASES) {
                const link = await K.waitRowLink(page, app, sid, `${name},`);
                facts.references.push({name, typed: line, expected, link});
            }
            record('step3-references-rows', await screen(page));
            await shot(page, 'step3-references');
            for (const ref of facts.references) {
                const read = await K.readUrlBox(page, `${ref.name},`);
                Object.assign(ref, {url: read.url, asExpected: read.url === ref.expected && ref.link.href === ref.expected, boxes: read.boxes});
                console.log(`[fact] ${app.name} ${ref.name}: ${JSON.stringify(ref)}`);
            }
            if (MODE === 'wayround') {
                // The way round: type the whole address into "URL", "Save", reopen.
                const ref = facts.references[0];
                await K.openEditCitation(page, `${ref.name},`);
                await K.editField(page, 'URL').fill(ref.expected);
                const saved = page.waitForResponse((r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
                await K.editPanel(page).getByRole('button', {name: 'Save', exact: true}).click();
                const r = await saved;
                const closed = await K.editPanel(page).waitFor({state: 'detached', timeout: 10_000}).then(() => true).catch(() => false);
                if (!closed) {
                    ref.wayroundErrors = (await K.editPanel(page).locator('.pkpFieldError').allInnerTexts().catch(() => [])).map((x) => K.flat(x));
                    await K.closeEditCitation(page);
                }
                await idle(page);
                const reread = await K.readUrlBox(page, `${ref.name},`);
                const link = await K.refRow(page, `${ref.name},`).getByRole('link').filter({hasText: /^https?:/}).first();
                ref.wayround = {status: r ? r.status() : null, closed, url: reread.url, href: await link.getAttribute('href').catch(() => null)};
                record('step4-wayround', await screen(page));
                console.log(`[fact] ${app.name} wayround: ${JSON.stringify(ref.wayround)}`);
            }
            // Data citations: steps 5-6.
            await K.gotoWorkflow(page, app, sid);
            facts.dataHeading = await K.openEntry(page, 'Data');
            await page.locator('table[aria-label="Data Citations"]:visible').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
            const {panel, saved} = await K.addDataCitation(page, DATA);
            if (!saved.closed) await K.closeDataCitation(page, panel);
            record('step6-data-citations', await screen(page));
            await shot(page, 'step6-data-citations');
            facts.dataCitation = {
                typed: DATA.identifier, status: saved.status, errors: saved.errors,
                saved: saved.response ? saved.response.identifier : null,
                row: ((await K.dcRows(page)) || []).find((r) => r.includes(DATA.title)) || null,
            };
            facts.dataCitation.asTyped = facts.dataCitation.saved === DATA.identifier;
            console.log(`[fact] ${app.name} data citation: ${JSON.stringify(facts.dataCitation)}`);
        }
        await signOut(page).catch(() => {});
    } finally {
        await close();
    }
    facts.serverLog = log.since(from);
    record('facts-url', facts);
    console.log(`[fact] ${app.name} done`);
});
