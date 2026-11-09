// Issue report walk: spec U11 register A10, with U12 A19 and U66 A12 (through the programming
// interface, a journal's highlight, announcement and institution each come with an address
// (`_href`) at the site instead of the journal, and the site's address fails on the server for any
// highlight read on its own). No screen reads one item on its own, so after the items are added
// through the journal's own screens the Steps type the interface's addresses into the same
// browser. Runs on a dataset fleet (PKP's default test dataset, harness.md "Dataset fleets"); the
// kit builds nothing: the second journal the site's Highlights tab needs is made on screen. Fact
// labels carry the Steps' numbers; every step records what it finds and never throws. Reset the
// fleet before each walk: the walk adds a journal, highlights, an announcement and an institution.
//
// Modes (first argument):
//   (none)      the Steps 1-11: `rvaca` adds "u11r2 Call for papers", "u11r2 Announcement" and
//               "u11r2 Institution" on the journal's screens, reads the three lists, opens each
//               `_href` and the journal's address for each; `admin` does the same reads; then
//               `admin` creates "u11r2 Second Journal", adds "u11r2 Site highlight" on the Site
//               Settings, reads the site's list and opens its `_href`.
//   neighbour   what a fix must leave alone (runs alone, on a fresh dataset): `rvaca` adds and
//               edits a highlight on the panel, and opens the site's address for it (refused);
//               an unknown id at the journal's address; submission 1's publications' `_href`;
//               `dbuskins` (section editor) and a signed-out browser at the journal's address;
//               `admin` at the site's address for the journal's highlight and for an unknown id,
//               and the site's highlights list.
//
// Reset:  npm run fleet-prep -- --feature issues-u11r2 --dataset 2 --reset
// Run:    PROBE_FEATURE=issues-u11r2 PROBE_AGENT=u11r2 node bin/probe.js all shared/playwright/checks/issues/highlight-read-on-its-own-fails/walk.js [neighbour]
// 3.5:    PKP_E2E_LINE=stable-3_5_0 (reset with --feature issues-u11r2-3_5) and PROBE_RUN=r35 PROBE_FEATURE=issues-u11r2-3_5 in front.
// Fix:    node bin/try-fix.js apply shared/playwright/checks/issues/highlight-read-on-its-own-fails/fix.diff ojs omp ops
// Facts:  .reports/<feature>/u11r2/a10-facts-<mode>-<app>.json (PROBE_RUN adds its tag)
const {forEachApp, launch, signIn, signOut, screen, shot, record, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv.slice(2).includes('neighbour') ? 'neighbour' : 'steps';
const TAG = 'u11r2';
const STEP_H = {title: `${TAG} Call for papers`, url: `https://example.org/${TAG}`, label: 'Read more'};
const SITE_H = {title: `${TAG} Site highlight`, url: `https://example.org/${TAG}-site`, label: 'Read more'};
const NB_H = {title: `${TAG} Neighbour highlight`, url: `https://example.org/${TAG}-nb`, label: 'Read more'};
const SECOND = {initials: 'U11R2', path: `${TAG}second`, email: `${TAG}second@mailinator.com`};
const SECOND_NAME = {ojs: `${TAG} Second Journal`, omp: `${TAG} Second Press`, ops: `${TAG} Second Server`};
const KINDS = ['highlights', 'announcements', 'institutions'];

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js drives a dataset fleet only (fleet-prep --dataset)');
    const ctx = app.contextPath;
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[a10] ${app.name} ${k}: ${L.flat(JSON.stringify(v), 900)}`);
    };
    let n = 0;
    const snap = async (page, name) => {
        record(`a10-${MODE}-${String(++n).padStart(2, '0')}-${name}`, await screen(page).catch((e) => ({error: e.message})));
        await shot(page, `a10-${MODE}-${name}`).catch(() => {});
    };
    const log = serverLog(app);
    // Open an address and add the server log lines it wrote (errors, exceptions, 5xx).
    const open = async (page, address) => {
        const from = log.mark();
        const a = await L.openApi(page, app, address);
        await L.pause(300);
        const lines = log.since(from);
        if (lines && lines.length) a.log = lines.map((x) => L.flat(x, 500));
        if (a.json && !Array.isArray(a.json) && !a.json.items) {
            const j = a.json;
            a.summary = j.error ? {error: j.error, errorMessage: j.errorMessage} : {id: j.id, contextId: j.contextId, _href: L.rel(j._href), keys: Object.keys(j).length};
            delete a.json;
        }
        return a;
    };
    const list = async (page, base, kind) => {
        const a = await open(page, `/index.php/${base}/api/v1/${kind}`);
        return {status: a.status, items: L.hrefs(a), error: a.json ? undefined : (a.body || a.error), log: a.log};
    };
    // Steps 5-7 (and 8): the three lists, each tagged item's `_href`, and the journal's address for it.
    const readAll = async (page, label, stepList, stepHref, stepOwn) => {
        for (const kind of KINDS) {
            const l = await list(page, ctx, kind);
            fact(`${stepList} ${label} ${kind} list`, l);
            const item = (l.items || []).find((i) => new RegExp(TAG).test(i.title)) || {};
            fact(`${stepHref} ${label} ${kind} _href`, await open(page, item._href || '/missing-href'));
            fact(`${stepOwn} ${label} ${kind} journal address`, await open(page, `/index.php/${ctx}/api/v1/${kind}/${item.id}`));
        }
    };
    const {page, close} = await launch(app);

    try {
        if (MODE === 'steps') {
            // 1
            await signIn(page, 'rvaca');
            // 2
            fact('2 journal highlights tab', await L.openContextHighlights(page, app));
            fact('2 add highlight', await L.addHighlight(page, STEP_H));
            await snap(page, 'step2-highlight-added');
            // 3
            fact('3 enable announcements', await L.enableAnnouncements(page, app));
            fact('3 announcements page', await L.openAnnouncements(page, app));
            fact('3 add announcement', await L.addAnnouncement(page, `${TAG} Announcement`));
            await snap(page, 'step3-announcement-added');
            // 4
            fact('4 institutions page', await L.openInstitutions(page, app));
            fact('4 add institution', await L.addInstitution(page, `${TAG} Institution`));
            await snap(page, 'step4-institution-added');
            // 5, 6, 7
            await readAll(page, 'rvaca', '5', '6', '7');
            // 8
            await signOut(page);
            await signIn(page, 'admin');
            await readAll(page, 'admin', '8', '8', '8');
            // 9
            fact('9 create second context', await L.createContext(page, app, {...SECOND, name: SECOND_NAME[app.name]}));
            // 10
            fact('10 site highlights tab', await L.openSiteHighlights(page));
            fact('10 add site highlight', await L.addHighlight(page, SITE_H));
            await snap(page, 'step10-site-highlight');
            // 11
            const sl = await list(page, 'index', 'highlights');
            fact('11 site highlights list', sl);
            const si = (sl.items || []).find((i) => new RegExp(TAG).test(i.title)) || {};
            fact('11 admin site highlight _href', await open(page, si._href || '/missing-href'));
        } else {
            await signIn(page, 'rvaca');
            fact('n journal highlights tab', await L.openContextHighlights(page, app));
            fact('n add highlight', await L.addHighlight(page, NB_H));
            fact('n edit on panel', await L.editHighlightUrl(page, NB_H.title, `https://example.org/${TAG}-nb-edited`));
            fact('n panel after reload', await L.openContextHighlights(page, app));
            await snap(page, 'neighbour-panel');
            const l = await list(page, ctx, 'highlights');
            fact('n journal list', l);
            const item = (l.items || []).find((i) => new RegExp(TAG).test(i.title)) || {};
            const own = `/index.php/${ctx}/api/v1/highlights/${item.id}`;
            const site = `/index.php/index/api/v1/highlights/${item.id}`;
            fact('n rvaca journal address', await open(page, own));
            fact('n rvaca site address', await open(page, site));
            fact('n rvaca unknown id', await open(page, `/index.php/${ctx}/api/v1/highlights/999999`));
            const pubs = await open(page, `/index.php/${ctx}/api/v1/submissions/1/publications`);
            fact('n publications of submission 1 _href', {status: pubs.status, items: L.hrefs(pubs), log: pubs.log});
            await signOut(page);
            await signIn(page, 'dbuskins');
            fact('n dbuskins journal address', await open(page, own));
            await signOut(page);
            fact('n signed out journal address', await open(page, own));
            await signIn(page, 'admin');
            fact('n admin site address of the journal highlight', await open(page, site));
            fact('n admin site unknown id', await open(page, '/index.php/index/api/v1/highlights/999999'));
            fact('n admin site list', await list(page, 'index', 'highlights'));
            await snap(page, 'neighbour-end');
        }
    } catch (e) {
        fact('error', L.flat(e.stack || e.message, 900));
        await snap(page, 'ERROR').catch(() => {});
    } finally {
        record(`a10-facts-${MODE}`, facts);
        await close();
    }
});
