// U17 A12 issue walk (housekeeping 2026-11-03, reporter hk6): "Save" in a section's (series') "Edit" window after
// the same section was deleted from the table in another tab.
//
// Runs on a dataset fleet (PKP's default test dataset), as `rvaca` (Journal / Press / Preprint Server manager).
// MODE= picks what runs:
//   steps (default)  the report's Steps: create "u17hk6 Gone" on screen, "Edit" it in tab 1, delete it from the
//                    table in tab 2, change the title and "Save" in tab 1, then "Cancel" and reload.
//   nb               the neighbour check for the fix: "Edit" a dataset section ("Articles" / "Preprints") or series
//                    ("History"), "Save" with nothing changed; and a new section / series "u17hk6 New" saved.
// Every step records its outcome rather than throwing, so a trial run with the fix applied records what it brings.
//
// Reset first:  npm run fleet-prep -- --feature issues-hk6 --dataset 5 --reset
// Run:          PROBE_FEATURE=issues-hk6 PROBE_AGENT=hk6 node bin/probe.js <ojs|omp|ops|all> \
//                   shared/playwright/checks/issues/section-window-save-after-delete-hangs/walk.js
// Facts: .reports/<PROBE_FEATURE>/hk6/facts-<mode>-<app>.json, screens beside them (s-<mode>-…).
const {forEachApp, launch, signIn, screen, record, idle, sql, serverLog} = require('../../../probe');
const {SectionsTab} = require('../../../pages/SectionsPages.js');

const T = 30_000;
const MODE = process.env.MODE || 'steps';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const isOMP = app.name === 'omp';
    const formId = isOMP ? 'seriesForm' : 'sectionForm';
    const titleBox = 'title[en]';
    const tabOf = (p) =>
        isOMP
            ? new SectionsTab(p, app.contextPath, {tab: 'Series', addLabel: 'Add Series', formId})
            : new SectionsTab(p, app.contextPath);
    const facts = {app: app.name, mode: MODE, line: app.line || 'main', steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1200)}`);
    };
    const step = async (label, action) => {
        try {
            const out = await action();
            fact(label, out === undefined ? 'done' : out);
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        }
    };
    const snap = async (p, n) => {
        const s = await screen(p);
        record(`s-${MODE}-${n}`, s);
        return s;
    };
    // What is stored under a title (OMP keeps its series in `series`).
    const [tbl, settings, idCol] = isOMP ? ['series', 'series_settings', 'series_id'] : ['sections', 'section_settings', 'section_id'];
    const storedByTitle = (title) =>
        sql(app, `select s.${idCol} from ${tbl} s join ${settings} ss on ss.${idCol} = s.${idCol} where ss.setting_name = 'title' and ss.setting_value = '${title}'`) || '(none)';
    const windowState = (p) =>
        p.evaluate((fid) => {
            const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
            const form = document.querySelector(`form#${fid}`);
            if (!form || !visible(form)) return {windowOpen: false};
            const save = form.querySelector('button.submitFormButton');
            return {
                windowOpen: true,
                saveDisabled: save ? save.disabled : null,
                spinner: !!form.querySelector('.pkp_spinner.is_visible'),
                errors: [...form.querySelectorAll('label.error, #formErrors li, .pkp_form_error')].filter(visible).map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
            };
        }, formId);
    const log = serverLog(app);
    const dialogs = [];
    const onDialog = (who) => (d) => {
        dialogs.push({tab: who, type: d.type(), message: d.message()});
        d.accept().catch(() => null);
    };

    // "Save" in an open window: the save's answer, the window afterwards, the notices, the server log since.
    const saveAndRead = async (p, win) => {
        const before = dialogs.length;
        const from = log.mark();
        const answered = p
            .waitForResponse((r) => r.request().method() === 'POST' && /update-(section|series)/.test(r.url()), {timeout: T})
            .catch((e) => e);
        await win.saveButton().click();
        const r = await answered;
        const reply = r instanceof Error ? {error: String(r.message).split('\n')[0]} : {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), body: (await r.text().catch(() => '')).slice(0, 400)};
        await win.form().waitFor({state: 'hidden', timeout: 8_000}).catch(() => null);
        await idle(p).catch(() => null);
        await sleep(1500);
        const s = await screen(p);
        return {reply, window: await windowState(p), notices: s.notices, browserDialogs: dialogs.slice(before), serverLog: log.since(from).map((l) => l.slice(0, 400)), screen: s};
    };
    const closeWindow = async (p, win) => {
        if (await win.form().isVisible().catch(() => false)) {
            await win.cancelLink().click().catch(() => null);
            await win.form().waitFor({state: 'hidden', timeout: 10_000}).catch(() => null);
            await sleep(600);
        }
        return {windowOpen: await win.form().isVisible().catch(() => false)};
    };
    const fill = async (win, title, abbrev, urlPath) => {
        await win.type(titleBox, title);
        if (!isOMP) await win.type('abbrev[en]', abbrev);
        if (urlPath) await win.box('path').fill(urlPath);
    };

    const {page, close} = await launch(app);
    page.on('dialog', onDialog('1'));
    try {
        await step('1 sign in as rvaca', () => signIn(page, 'rvaca').then(() => 'signed in'));

        if (MODE === 'steps') {
            const title = 'u17hk6 Gone';
            const edited = 'u17hk6 Gone edited';
            const urlPath = isOMP ? 'u17hk6gone' : app.name === 'ops' ? 'u17hk6-gone' : null;

            await step('2-3 create the section / series, Save', async () => {
                const tab = tabOf(page);
                await tab.goto();
                const win = await tab.openAdd();
                await fill(win, title, 'U17HK6', urlPath);
                const out = await saveAndRead(page, win);
                return {reply: out.reply, window: out.window, notices: out.notices, rowShown: await tab.row(title).count()};
            });
            fact('3 stored', storedByTitle(title));

            let win1 = null;
            await step('4 tab 1: the row › Edit', async () => {
                const tab = tabOf(page);
                await tab.goto();
                win1 = await tab.openEdit(title);
                await idle(page);
                return {heading: (await win1.heading().innerText().catch(() => '')).trim(), title: await win1.box(titleBox).inputValue()};
            });
            await snap(page, 'tab1-edit-open');

            await step('5 tab 2: the same page, the row › Delete › OK', async () => {
                const page2 = await page.context().newPage();
                page2.on('dialog', onDialog('2'));
                const tab = tabOf(page2);
                await tab.goto();
                const del = await tab.openDelete(title);
                const asked = (await del.root().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
                const r = await tab.confirm(del);
                const out = {asked, status: r.status(), body: (await r.text().catch(() => '')).slice(0, 200), rowLeft: await tab.row(title).count()};
                await page2.close().catch(() => null);
                return out;
            });
            fact('5 stored', storedByTitle(title));
            await page.bringToFront();

            await step('6 tab 1: title changed, Save', async () => {
                if (!win1) return 'no window';
                await win1.type(titleBox, edited);
                const out = await saveAndRead(page, win1);
                record(`s-${MODE}-tab1-saved`, out.screen);
                delete out.screen;
                return out;
            });
            fact('6 stored', {[title]: storedByTitle(title), [edited]: storedByTitle(edited)});

            await step('7 Cancel, reload: the table', async () => {
                const closed = win1 ? await closeWindow(page, win1) : 'no window';
                const tab = tabOf(page);
                await tab.reload();
                const rows = (await tab.rows().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
                return {afterCancel: closed, rowGone: await tab.row(title).count(), rowEdited: await tab.row(edited).count(), rows};
            });
            await snap(page, 'reloaded');
            fact('7 stored', {[title]: storedByTitle(title), [edited]: storedByTitle(edited)});
        }

        if (MODE === 'nb') {
            const existing = isOMP ? 'History' : app.name === 'ops' ? 'Preprints' : 'Articles';
            await step(`nb 1 Edit "${existing}", Save with nothing changed`, async () => {
                const tab = tabOf(page);
                await tab.goto();
                const win = await tab.openEdit(existing);
                const out = await saveAndRead(page, win);
                delete out.screen;
                if (out.window.windowOpen) await closeWindow(page, win);
                return {...out, rowShown: await tab.row(existing).count()};
            });
            const fresh = 'u17hk6 New';
            await step('nb 2 a new section / series, Save', async () => {
                const tab = tabOf(page);
                await tab.goto();
                const win = await tab.openAdd();
                await fill(win, fresh, 'U17HK6N', isOMP ? 'u17hk6new' : app.name === 'ops' ? 'u17hk6-new' : null);
                const out = await saveAndRead(page, win);
                delete out.screen;
                if (out.window.windowOpen) await closeWindow(page, win);
                await tab.reload();
                return {...out, rowShown: await tab.row(fresh).count()};
            });
            fact('nb 2 stored', storedByTitle(fresh));
        }
    } finally {
        record(`facts-${MODE}`, facts);
        await close();
    }
});
