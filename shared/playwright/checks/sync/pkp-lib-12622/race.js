// Upstream-sync lead, 2026-10-09 (dismissed; docs/tracking/upstream-sync.md of that day): does a press's publication format "Edit" window and its file's
// "Edit a file" window ask "The data on this form has changed…" at the header "Close" after a URN
// suffix typed on "Identifiers"? The kept check (shared/playwright/checks/U44/I09/i09.js, p00)
// presses "Identifiers" as soon as the tab strip is there, without waiting for the first tab. This
// script drives each window three ways on one scratch press, the same on either line:
//   natural  as i09.js does (no wait before "Identifiers")
//   settled  the first tab's form is on screen before "Identifiers" is pressed (what a person does)
//   held     the first tab's request is held 4 s by the browser, "Identifiers" pressed meanwhile
//   meta     (MODES=meta only) the control: the first tab's first text box changed, then "Close"
// Each read records: whether the first tab's request ended or was aborted, the forms of the window
// in page order when "Close" is pressed, every browser dialog, the dialog of the reload after, and
// the suffix box of the reopened window. No assertions.
//
//   PROBE_FEATURE=sync PROBE_AGENT=rrlead PROBE_RUN=a1 node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-12622/race.js
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=sync-3_5 PROBE_AGENT=rrlead PROBE_RUN=b1 node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-12622/race.js
const {expect} = require('@playwright/test');
const KIT = '../../..';
const {forEachApp, launch, signIn, screen, record, idle, tag, sql} = require(`${KIT}/probe`);

const T = 30_000;
const HOLD = 4000;
const PREFIX = 'urn:nbn:de:0000-';
const FILE = 'article.pdf';
const MANAGER = 'manager.maya';
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['natural', 'settled', 'held'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const FIRST_TAB = {format: /edit-format-tab|editFormatTab/, file: /edit-metadata-tab|editMetadataTab/};

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const stable35 = app.line === 'stable-3_5_0';
    const facts = {app: app.name, line: app.line || 'main', reads: []};
    const {page, close} = await launch(app);
    const asked = [];
    page.on('dialog', (d) => {
        asked.push({type: d.type(), message: flat(d.message(), 200)});
        d.accept().catch(() => {});
    });
    /** The first tab's requests of the window being driven: how each ended. */
    let firstTab = [];
    const watch = (kind) => {
        firstTab = [];
        const re = FIRST_TAB[kind];
        const fin = (r) => re.test(r.url()) && firstTab.push({ended: 'finished'});
        const fail = (r) => re.test(r.url()) && firstTab.push({ended: 'failed', error: r.failure() && r.failure().errorText});
        page.on('requestfinished', fin);
        page.on('requestfailed', fail);
        return () => {
            page.off('requestfinished', fin);
            page.off('requestfailed', fail);
        };
    };

    try {
        const {WorkflowPage} = require(`${KIT}/pages/WorkflowPage.js`);
        const {LegacyIdentifiersWindow, UrnPluginSettings, pastCloseWindow} = require(`${KIT}/pages/IdentifiersPages.js`);
        const {PublicationFormatsPage} = require('../../../../../apps/omp/playwright/pages/PublicationFormatPages.js');
        const t = tag('rrlead');
        const author = `${t}au`;
        const frame = new WorkflowPage(page, t, {labels: {publicationGroup: 'Publication'}});
        await app.api.createContext({
            tag: t,
            context: {acronym: 'PKP'},
            users: [
                {username: MANAGER, roles: ['manager']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const S = {};
        for (const n of ['A', 'B']) {
            const r = await app.api.createSubmission({
                tag: `${t}${n.toLowerCase()}`,
                context: t,
                submitter: author,
                title: `Lead ${n} ${t}`,
                publicationFormats: [{name: 'PDF', file: FILE, approved: false, available: false}],
            });
            S[n] = {id: r.submissionId, pub: r.publicationId};
        }
        facts.seed = {context: t, S};
        console.log(`[fact] seed ${JSON.stringify(facts.seed)}`);

        await signIn(page, MANAGER);
        const settings = new UrnPluginSettings(page, t);
        await settings.openPlugins();
        if (!(await settings.enabledBox().isChecked())) await settings.setEnabled(true);
        await settings.openSettings();
        for (const k of ['Monographs', 'Chapters', 'Publication Formats', 'Files']) await settings.setKind(k, true);
        await settings.prefixBox().fill(PREFIX);
        await settings.suffixRadio('customId').check();
        await settings.checkNumberBox().uncheck();
        await settings.namespaceSelect().selectOption('urn:nbn:de');
        await settings.resolverBox().fill('https://nbn-resolving.de/');
        await settings.saveAccepted();

        const formats = new PublicationFormatsPage(page, t);
        const openList = async (sub) => {
            if (stable35) {
                await frame.gotoEditorial(sub.id);
                await frame.expectVersionLoaded().catch(() => {});
                await frame.menuLink('Publication Formats').first().click();
            } else {
                await frame.gotoEditorial(sub.id, {menuKey: `publication_${sub.pub}_publicationFormats`});
            }
            await frame.expectPageHeading('Publication Formats');
            await formats.expectLoaded();
            await idle(page);
        };
        /** The row's "Edit" pressed; the window on its "Identifiers" tab, reached the way `mode` says. */
        const openWindow = async (kind, sub, mode) => {
            await openList(sub);
            const row = kind === 'format' ? formats.formatRow('PDF') : formats.fileRow('PDF', FILE);
            await expect(row).toHaveCount(1, {timeout: T});
            const controls = row.locator('xpath=following-sibling::tr[1]');
            if (!(await controls.isVisible())) await row.locator('a.show_extras').first().click();
            await expect(controls).toBeVisible({timeout: T});
            const re = FIRST_TAB[kind];
            let held = false;
            if (mode === 'held') {
                await page.route(re, async (route) => {
                    held = true;
                    await sleep(HOLD);
                    await route.continue().catch(() => {});
                });
            }
            const answered = mode === 'settled' || mode === 'meta' ? page.waitForResponse((r) => re.test(r.url()), {timeout: T}) : null;
            await controls.getByRole('link', {name: 'Edit', exact: true}).first().click();
            const dialog = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: 'Identifiers', exact: true})}).last();
            const win = new LegacyIdentifiersWindow(page, dialog);
            await win.tab('Identifiers').waitFor({timeout: T});
            if (mode === 'settled' || mode === 'meta') {
                await answered;
                await expect(dialog.locator('form').first()).toBeVisible({timeout: T});
                await idle(page);
                await sleep(500);
            }
            const firstFormBeforeTab = await dialog.locator('form').count();
            // meta: the first tab stays; its first text box is what gets changed
            if (mode === 'meta') return {win, dialog, held, firstFormBeforeTab};
            await win.openIdentifiersTab();
            await idle(page);
            if (mode === 'held') {
                await sleep(HOLD + 1000);
                await page.unroute(re);
                await idle(page);
            }
            return {win, dialog, held, firstFormBeforeTab};
        };
        const dom = (dialog) =>
            dialog.evaluate((el) => ({
                tabs: [...el.querySelectorAll('[role="tab"]')].map((x) => x.innerText.trim()),
                formsInPageOrder: [...el.querySelectorAll('form')].map((f) => f.id || '(no id)'),
                panels: [...el.querySelectorAll('[role="tabpanel"]')].map((p) => ({
                    hidden: p.getAttribute('aria-hidden'),
                    forms: [...p.querySelectorAll('form')].map((f) => f.id || '(no id)'),
                    htmlLength: p.innerHTML.trim().length,
                })),
            }));

        const drive = async (kind, sub, mode, suffix) => {
            const out = {kind, mode, submission: sub.id, typed: suffix};
            const unwatch = watch(kind);
            try {
                const {win, dialog, held, firstFormBeforeTab} = await openWindow(kind, sub, mode);
                out.title = flat(await dialog.getByRole('heading', {level: 1}).first().innerText().catch(() => ''), 80);
                out.requestHeld = held;
                out.formsWhenIdentifiersPressed = firstFormBeforeTab;
                const firstBox = () => dialog.locator('[role="tabpanel"]').first().locator('input[type="text"]:visible, input:not([type]):visible').first();
                const box = mode === 'meta' ? firstBox() : win.urnSuffixBox();
                await box.click();
                if (mode === 'meta') {
                    out.box = {name: await box.getAttribute('name'), id: await box.getAttribute('id'), before: await box.inputValue()};
                    await box.press('End');
                } else {
                    await box.fill('');
                }
                await box.pressSequentially(mode === 'meta' ? ' changed' : suffix, {delay: 15});
                await box.blur().catch(() => {});
                await sleep(300);
                out.firstTabRequests = firstTab.slice();
                out.window = await dom(dialog);
                const before = asked.length;
                await dialog.getByRole('button', {name: 'Close', exact: true}).first().click();
                await sleep(2000);
                await idle(page);
                out.askedAtClose = asked.slice(before);
                out.windowOpenAfter = (await dialog.count()) > 0;
                const s = await screen(page);
                record(`${kind}-${mode}`, s);
                out.notices = s.notices;
                if (out.windowOpenAfter) await win.close();
                else await pastCloseWindow(page);
                // the page left by a reload: the browser's own box, if any
                const b2 = asked.length;
                await page.reload();
                await sleep(1500);
                out.askedAtReload = asked.slice(b2);
                // reopened, settled: is anything kept?
                const again = await openWindow(kind, sub, mode === 'meta' ? 'meta' : 'settled');
                if (mode === 'meta') out.boxReopened = await again.dialog.locator('[role="tabpanel"]').first().locator('input[type="text"]:visible, input:not([type]):visible').first().inputValue();
                else out.suffixBoxReopened = await again.win.urnSuffixBox().inputValue();
                await again.win.close();
                await pastCloseWindow(page);
            } catch (e) {
                out.threw = flat(e.message, 600);
                await page.unroute(FIRST_TAB[kind]).catch(() => {});
                await page.keyboard.press('Escape').catch(() => {});
            } finally {
                unwatch();
            }
            facts.reads.push(out);
            console.log(`[fact] ${kind} ${mode}: ${JSON.stringify(out)}`);
            return out;
        };

        let n = 0;
        for (const kind of ['format', 'file']) {
            for (const mode of MODES) {
                n += 1;
                await drive(kind, kind === 'format' ? S.A : S.B, mode, `e2e-lead${n}`);
            }
        }
        const ids = Object.values(S).map((s) => s.id).join(',');
        const pubs = Object.values(S).map((s) => s.pub).join(',');
        facts.stored = [
            ...sql(app, `select 'format', s.publication_format_id, s.setting_name, s.setting_value from publication_format_settings s join publication_formats f on f.publication_format_id = s.publication_format_id where s.setting_name in ('pub-id::other::urn', 'urnSuffix') and f.publication_id in (${pubs})`).split('\n').filter(Boolean),
            ...sql(app, `select 'file', s.submission_file_id, s.setting_name, s.setting_value from submission_file_settings s join submission_files f on f.submission_file_id = s.submission_file_id where s.setting_name in ('pub-id::other::urn', 'urnSuffix') and f.submission_id in (${ids})`).split('\n').filter(Boolean),
        ];
        console.log(`[fact] stored ${JSON.stringify(facts.stored)}`);
    } finally {
        record('facts', facts);
        await close();
    }
});
