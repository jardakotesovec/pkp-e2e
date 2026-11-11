// Issue report docs/issues/U48-A2-body-text-save-offered-then-refused.md (U48 A2): on a version's
// "Body Text" page an assigned Layout Editor whose "Permissions" box is unticked is offered the
// toolbar, an editable editor and "Save"; "Save" is refused, while "Export" turns the unsaved text
// into a galley. Takes the report's Steps on PKP's default test dataset (a dataset fleet), OJS only
// (the page is a journal's):
//   1-3  `gcox` (Layout Editor on submission 5, "Permissions" unticked in the dataset): open
//        submission 5, Publication › "Body Text"
//   4    what the page offers (toolbar, editor editable, "Save", sidebar sections, "Export")
//   5    click into the editor, type a line
//   6    "Export" › "Export to HTML"; the line under "Export", "Unsaved Changes"
//   7    "Save"; the "Error" window, "OK"; "Unsaved Changes"
//   8    reload, "Body Text" again; the editor's text
//   9    Publication › "Galleys"; the galley name "HTML" opened; the galley file's text
// WALK=neighbour runs alone (fix in and out): steps 1-9 as `dbuskins` (Section editor on submission
// 5, "Permissions" ticked in the dataset); the editor, "Save" and "Export" must stay offered, the
// save answer 200 and the text hold over the reload.
// WALK=saved runs alone (fix in): `dbarnes` types a line on submission 5's Body Text and saves it;
// then `gcox` takes steps 1-4, 6 and 9: the saved line shows read-only, "Export to HTML" is enabled
// and the "HTML" galley holds the saved line.
// A fix that hides "Save", locks the editor or disables an "Export" item is recorded, not thrown on.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --apps ojs --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/body-text-save-offered-then-refused/walk.js
// 3.5:          the same with PKP_E2E_LINE=stable-3_5_0 in front; the line has no "Body Text" page,
//               which step 3 records with the side menu.
const {forEachApp, launch, signIn, signOut, screen, record, idle} = require('../../../probe');
const {sleep, flat, errorWindow, pressAndAnswer, openPage} = require('./lib');

const MODE = process.env.WALK || 'walk';
const SID = 5;
const TYPED = 'Layout note u48ir1111.';
const SAVED = 'Saved by the editor u48ir1111.';
const isSave = (r) => /\/bodyText(\?|$)/.test(r.url()) && r.request().method() !== 'GET' && !!r.request().headers()['x-http-method-override'];
const isExport = (r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST' && !r.request().headers()['x-http-method-override'];

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const name = (s) => `u48ir1111-body-${MODE}-${s}${run}`;
    const who = MODE === 'neighbour' ? 'dbuskins' : 'gcox';
    const line = MODE === 'saved' ? SAVED : TYPED;
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, who};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };

    const {page, close} = await launch(app);
    const frame = new WorkflowPage(page, app.contextPath);
    const body = new BodyTextPage(page, frame);
    const exportButton = () => page.getByRole('button', {name: 'Export', exact: true});
    const exportStatus = () => page.locator('.body-text-export ~ p[role="status"]').first();
    const visible = async (l) => (await l.count()) > 0 && (await l.first().isVisible().catch(() => false));
    const openBody = async () => {
        await frame.gotoEditorial(SID);
        await idle(page).catch(() => {});
        const menu = flat(await frame.dialog().locator('nav').first().innerText().catch(() => null), 600);
        const fetched = body.loaded().catch(() => null);
        const r = await openPage(frame, 'Body Text');
        if (!r.reached) return {...r, menu};
        await fetched;
        await body.editor().waitFor({state: 'visible', timeout: 30_000}).catch(() => {});
        await idle(page).catch(() => {});
        await sleep(1500);
        return r;
    };
    const offers = async () => ({
        toolbar: await visible(body.toolbar()),
        editorEditable: (await body.editor().count()) ? await body.editor().getAttribute('contenteditable') : null,
        save: (await visible(body.saveButton())) ? flat(await body.saveButton().innerText()) : null,
        unsavedBadge: await visible(body.unsavedBadge()),
        sections: await body.root().locator('details[data-sidebar-section]').evaluateAll((ds) => ds.map((d) => d.dataset.sidebarSection)).catch(() => null),
        export: await visible(exportButton()),
        exportLine: (await visible(exportStatus())) ? flat(await exportStatus().innerText()) : null,
        editorText: (await body.editor().count()) ? await body.editorText() : null,
    });
    // 6: "Export" › "Export to HTML"; a disabled item is recorded and not pressed
    const exportStep = async () => {
        if (!(await visible(exportButton()))) {
            fact('6 Export not offered', true);
            return;
        }
        await exportButton().click();
        const item = page.getByRole('menuitem', {name: 'Export to HTML'});
        const offered = await item.waitFor({state: 'visible', timeout: 10_000}).then(() => true).catch(() => false);
        const disabled = offered && ((await item.getAttribute('aria-disabled')) === 'true' || (await item.getAttribute('data-disabled')) !== null);
        fact('6 "Export to HTML" offered', offered && {disabled});
        if (offered && !disabled) {
            const answer = await pressAndAnswer(page, isExport, () => item.click(), 60_000);
            fact('6 export answer', answer && {...answer, body: flat(answer.body, 200)});
            fact('6 error window', await errorWindow(page, 3_000));
            await sleep(800);
        } else if (offered) {
            record(name('06-export-menu'), await screen(page));
            await page.keyboard.press('Escape');
            await sleep(400);
        }
        fact('6 after export', await offers());
        record(name('06-after-export'), await screen(page));
    };
    // 9: Publication › "Galleys", the "HTML" galley the export made, its file's text
    const galleyStep = async () => {
        fact('9 Galleys reached', await openPage(frame, 'Galleys'));
        await idle(page).catch(() => {});
        await sleep(1000);
        const galleys = new GalleyManager(page, frame);
        fact('9 galley names', (await galleys.nameCells().allInnerTexts().catch(() => [])).map((t) => flat(t, 120)));
        record(name('09-galleys'), await screen(page));
        const link = galleys.nameCells().filter({hasText: 'Generated from text editor'}).getByRole('link', {name: 'HTML', exact: true}).first();
        if (!(await link.count())) {
            fact('9 no "HTML" galley from the text editor', true);
            return;
        }
        const href = await link.getAttribute('href');
        const popup = page.context().waitForEvent('page', {timeout: 15_000}).catch(() => null);
        await link.click();
        const p = await popup;
        let shown = null;
        if (p) {
            await p.waitForLoadState('domcontentloaded', {timeout: 15_000}).catch(() => {});
            shown = flat(await p.locator('body').innerText({timeout: 10_000}).catch(() => null), 300);
            await p.close().catch(() => {});
        }
        // the same address in the same session: the browser takes the file as a download
        const got = await page.context().request.get(href).catch(() => null);
        const text = got ? (await got.text()).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ') : null;
        fact('9 galley file', {href: flat(href, 200), shownInTab: shown, status: got && got.status(), text: flat(text, 300), holdsLine: text != null && text.includes(line)});
    };

    try {
        if (MODE === 'saved') {
            // before: the editor saves a line
            await signIn(page, 'dbarnes');
            fact('0 dbarnes Body Text', await openBody());
            await body.typeAtEnd(SAVED);
            const saved = await pressAndAnswer(page, isSave, () => body.saveButton().click());
            fact('0 dbarnes save', saved && saved.status);
            await sleep(1500);
            await signOut(page);
        }
        // 1-3
        await signIn(page, who);
        const reached = await openBody();
        fact('3 Body Text reached', reached);
        if (!reached.reached) {
            record(name('03-no-body-text'), await screen(page));
            return;
        }
        // 4
        fact('4 offers', await offers());
        record(name('04-page'), await screen(page));
        if (MODE === 'saved') {
            await exportStep();
            await galleyStep();
            await signOut(page);
            return;
        }
        // 5
        await body.typeAtEnd(TYPED).catch((e) => fact('5 typing failed', flat(String(e), 300)));
        await sleep(800);
        fact('5 after typing', await offers());
        // 6
        await exportStep();
        // 7
        if (await visible(body.saveButton())) {
            const answer = await pressAndAnswer(page, isSave, () => body.saveButton().click());
            fact('7 save answer', answer);
            fact('7 error window', await errorWindow(page));
            await sleep(1800);
            fact('7 after save', await offers());
            record(name('07-after-save'), await screen(page));
        } else {
            fact('7 Save not offered', true);
        }
        // 8
        await page.reload();
        await idle(page).catch(() => {});
        fact('8 Body Text reached again', await openBody());
        fact('8 after reload', await offers());
        record(name('08-after-reload'), await screen(page));
        // 9
        await galleyStep();
        await signOut(page);
    } finally {
        record(name('facts'), facts);
        await idle(page).catch(() => {});
        await close();
    }
});
