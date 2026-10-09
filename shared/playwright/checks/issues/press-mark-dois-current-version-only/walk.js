// Kept walk of the deleted issue report for U45 OMP4 (pkp-e2e#944; fixed by pkp/omp#2495 with pkp/pkp-lib#13460):
// with "DOI Versioning" "Yes", the "Mark DOIs …" actions on a press change only the
// current version's DOIs. Takes the report's Steps on PKP's default test dataset (a
// dataset fleet), as `dbarnes`, on OMP book 14; OJS article 17 and OPS preprint 2 take
// the same steps as the control (the work's own DOI only):
//   1. sign in as dbarnes
//   2. Settings › Distribution › "DOIs" › "Setup": prefix 10.1234, (press) "Chapters" and
//      "Publication Formats" ticked, "DOI Versioning" "Yes", "Save"
//   3. "DOIs": tick the work, "Bulk Actions" › "Assign DOIs", confirm
//   4. workflow: "Create New Version", "Major Revision", "Confirm" (2.0); "Publish" / "Post"
//   5. "DOIs": tick, "Mark DOIs Registered", confirm; expand the row, "View all"
//   6. workflow: "Create New Version", "Major Revision", "Confirm" (3.0); "Publish" / "Post"
//   7. "DOIs": tick, "Mark DOIs Unregistered", confirm; "View all"
//   8. tick, "Mark DOIs Registered", confirm; tick, "Mark DOIs Needs Sync", confirm; "View all"
// WALK=neighbour (OMP, a freshly loaded dataset, with the fix in and out) is a walk of its
// own under "DOI Versioning" "No": books 14 and 5 get DOIs, book 14 a version 2.0 that
// shares 1.0's DOI; the three actions on book 14 set the shared DOI (read on its row and,
// for both versions, in the dois table: the page offers no "View all" under "No") and
// leave book 5's alone, and "Mark DOIs Needs Sync" on book 5 ("Unregistered") is refused.
// On stable-3_5_0 a journal and a press have no "DOI Versioning": the script records the
// Setup form and stops. OPS 3.5 (control): "Create New Version" is the button on "Title &
// Abstract" answered "Yes", and the "View all" window shows no status, so the stored
// statuses are the read.
//
// Helpers: lib.js beside this file, ../minor-version-new-galley-dois/lib.js and
// ../major-version-earlier-doi-stays-registered/lib.js (the version and publish steps).
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/press-mark-dois-current-version-only/walk.js
// Neighbour:    WALK=neighbour PROBE_RUN=nb PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp <this file>
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<3.5 feature> PROBE_AGENT=<id> node bin/probe.js all <this file>
const {forEachApp, launch, signIn, screen, record, sql} = require('../../../probe');
const {APP, createVersion, publishLatest, readDoiRow, readVersionsWindow} = require('../minor-version-new-galley-dois/lib');
const {createVersion35, publish35} = require('../major-version-earlier-doi-stays-registered/lib');
const {storedVersionDois, windowLines, windowStatuses} = require('./lib');

const T = 30_000;
const MODE = process.env.WALK || 'walk';
const PREFIX = '10.1234';
const OTHER_BOOK = 5; // "Bomb Canada and Other Unkind Remarks in the American Media", published, one version

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (MODE === 'neighbour' && app.name !== 'omp') return;
    const stable35 = app.line === 'stable-3_5_0';
    const {expect} = require('@playwright/test');
    const {DoiSettings, DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const a = APP[app.name];
    const pre = MODE === 'neighbour' ? 'omp4-n' : 'omp4-';
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: a.sid};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 2500)}`);
    };

    const {page, close} = await launch(app);
    await recordNotices(page);
    const settings = new DoiSettings(page, app.contextPath);
    const dois = new DoisPage(page, app.contextPath);
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: a.group}});
    const takeNotices = () =>
        page.evaluate(() => {
            const w = /** @type {any} */ (window);
            const seen = [...(w.__doiNotices || [])];
            if (w.__doiNotices) w.__doiNotices.length = 0;
            return seen;
        });
    /** Tick, choose the action, confirm; the answer's status and the notice. Records a failure instead of throwing. */
    const mark = async (step, label, ids = [a.sid]) => {
        await dois.goto();
        try {
            const r = await dois.runBulk(label, ids);
            fact(`${step} ${label}`, {status: r.status(), notices: await takeNotices()});
        } catch (e) {
            fact(`${step} ${label}`, {failed: String(e).slice(0, 400)});
        }
    };
    /** Expand the work's row, read it and its "View all" window, and the stored statuses. */
    const readRow = async (step, sid = a.sid) => {
        await dois.goto();
        const row = await readDoiRow(page, dois, sid);
        const blocks = await readVersionsWindow(page, dois, sid);
        const stored = storedVersionDois(sql, app, sid);
        fact(`${step} row ${sid}`, row);
        fact(`${step} view all ${sid}`, windowLines(blocks));
        fact(`${step} stored ${sid}`, stored.map((v) => `${v.version}${v.published ? '' : ' (unpublished)'}: ${v.dois.map((d) => `${d.kind} ${d.doi} ${d.status}`).join('; ')}`));
        record(`${pre}${step}-dois-${sid}`, await screen(page));
        return {row, window: windowStatuses(blocks), stored: stored.map((v) => ({version: v.version, statuses: v.statuses}))};
    };
    const newVersion = async (step) => {
        await frame.gotoEditorial(a.sid);
        await frame.expectVersionLoaded().catch(() => {});
        fact(`${step} create`, stable35 ? await createVersion35(page, frame) : await createVersion(page, frame, 'Major Revision'));
        await frame.gotoEditorial(a.sid);
        await frame.expectVersionLoaded().catch(() => {});
        if (stable35) fact(`${step} publish`, await publish35(page, a.post));
        else {
            const ojsScreen = app.name === 'ojs' ? new (require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js').PublishScreen)(page, app.contextPath) : null;
            fact(`${step} publish`, await publishLatest(page, frame, a.post, ojsScreen));
        }
        record(`${pre}${step}-published`, await screen(page));
        fact(`${step} stored`, storedVersionDois(sql, app, a.sid).map((v) => `${v.version}: ${v.statuses.join('/') || 'no DOI'}`));
    };

    try {
        // 1
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});

        // 2
        await settings.goto('Setup');
        const versioning = settings.versioningRadio('Yes');
        const offered = await versioning.count();
        fact('2 versioning offered', offered);
        if (!offered) {
            fact('2 kinds', await settings.kinds());
            record(`${pre}2-setup-no-versioning`, await screen(page));
            fact('verdict', 'no "DOI Versioning" on the Setup form: the steps cannot be taken');
            return;
        }
        if ((await settings.prefixBox().inputValue()) !== PREFIX) await settings.prefixBox().fill(PREFIX);
        if (app.name === 'omp' && MODE !== 'neighbour') {
            await settings.kindBox('Chapters').check();
            await settings.kindBox('Publication Formats').check();
        }
        if (MODE !== 'neighbour') await versioning.check();
        const saved = await settings.pressSave(settings.setup);
        await expect(settings.savedStatus(settings.setup)).toBeVisible({timeout: T});
        fact('2 save', {status: saved.status(), kinds: await settings.kinds(), versioningYes: await versioning.isChecked()});
        record(`${pre}2-setup`, await screen(page));

        if (MODE === 'neighbour') {
            // "DOI Versioning" "No": the versions of book 14 share one DOI; book 5 is the bystander.
            await mark('n1', 'Assign DOIs', [a.sid, OTHER_BOOK]);
            await newVersion('n2');
            await mark('n3', 'Mark DOIs Registered');
            const n3 = {book: await readRow('n3'), other: await readRow('n3', OTHER_BOOK)};
            // Refused: book 5's DOI is "Unregistered".
            await dois.goto();
            try {
                await dois.tick([OTHER_BOOK]);
                const w = await dois.chooseBulkAction('Mark DOIs Needs Sync');
                const acted = page.waitForResponse((r) => /\/api\/v1\/dois\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
                await w.getByRole('button', {name: 'Mark DOIs Needs Sync', exact: true}).click();
                const r = await acted;
                await expect(dois.failedDialog()).toBeVisible({timeout: T});
                fact('n4 Mark DOIs Needs Sync on book 5', {status: r.status(), window: (await dois.failedDialog().innerText()).replace(/\s+/g, ' ').trim()});
                record(`${pre}n4-refused`, await screen(page));
                await dois.closeFailedDialog();
            } catch (e) {
                fact('n4 Mark DOIs Needs Sync on book 5', {failed: String(e).slice(0, 400)});
            }
            const n4 = {book: await readRow('n4'), other: await readRow('n4', OTHER_BOOK)};
            await mark('n5', 'Mark DOIs Needs Sync');
            const n5 = {book: await readRow('n5'), other: await readRow('n5', OTHER_BOOK)};
            await mark('n6', 'Mark DOIs Unregistered');
            const n6 = {book: await readRow('n6'), other: await readRow('n6', OTHER_BOOK)};
            const line = (x) => `book 14 ${x.book.stored.map((v) => `${v.version} ${v.statuses.join('/')}`).join(', ')} | book 5 ${x.other.stored.map((v) => `${v.version} ${v.statuses.join('/')}`).join(', ')}`;
            fact('neighbour verdict', {registered: line(n3), refused: line(n4), needsSync: line(n5), unregistered: line(n6)});
            return;
        }

        // 3
        await mark('3', 'Assign DOIs');
        // 4
        await newVersion('4');
        // 5
        await mark('5', 'Mark DOIs Registered');
        const s5 = await readRow('5');
        // 6
        await newVersion('6');
        // 7
        await mark('7', 'Mark DOIs Unregistered');
        const s7 = await readRow('7');
        // 8
        await mark('8a', 'Mark DOIs Registered');
        await mark('8b', 'Mark DOIs Needs Sync');
        const s8 = await readRow('8');

        const one = (s, want) => ({
            window: s.window.map((b) => `${b.heading}: ${b.badges.join('/')} (${b.rows} rows)`),
            stored: s.stored.map((v) => `${v.version}: ${v.statuses.join('/')}`),
            everyVersion: s.stored.every((v) => v.statuses.length === 1 && v.statuses[0] === want),
        });
        fact('verdict', {
            'step 5, every version "Registered"': one(s5, 'Registered'),
            'step 7, every version "Unregistered"': one(s7, 'Unregistered'),
            'step 8, every version "Needs Sync"': one(s8, 'Needs Sync'),
        });
    } finally {
        record(`${pre}facts`, facts);
        await close();
    }
});
