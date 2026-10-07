// Issue report docs/issues/U13-A15-japanese-versions-entries-raw-key.md (U13 A15):
// in a language whose translation has no text for the "Versions" entry (Japanese holds
// it empty, Spanish (Mexico) lacks it), every entry of the list reads
// "##submission.versionIdentity##" instead of the version's date and name.
//
// Steps, on PKP's default test dataset:
//   [3.5 only: the list shows from two published versions on, so dbarnes first publishes a
//    second version of the journal's article 1 and of the press's book 5]
//   1-3  admin: Administration > Site Settings > Site Setup > Languages, "Install Locale",
//        Japanese and Spanish (Mexico), "Save"
//   4-5  admin: Settings > Website > Setup > Languages, "UI" on both rows of "Website Languages"
//   6    sign out
//   7-9  the item's page in Japanese and in Spanish (Mexico): the "Versions" list, and a
//        preprint's line above the title; then English and French (Canada), the control
//
// WALK=neighbour (the fix trial's neighbour check, run with the fix in and out): Polish, whose
// translation holds a pattern of its own, added the same way; the item's page in Polish and English.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/japanese-versions-entries-raw-key/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature>-3_5 PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/japanese-versions-entries-raw-key/walk.js
// Facts: .reports/<feature>/<id>/facts[-neighbour][-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, screen, record, idle, rawKeys} = require('../../../probe');

const MODE = process.env.WALK || 'walk';
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => u.replace(/^https?:\/\/[^/]+/, '');
const ITEM = {
    ojs: {id: 1, address: 'article/view/1', publish: 'Publish'},
    ops: {id: 3, address: 'preprint/view/3'},
    omp: {id: 5, address: 'catalog/book/5', publish: 'Publish', newVersion: true},
};
const ADD = MODE === 'neighbour' ? ['pl'] : ['ja', 'es_MX'];
const READ = MODE === 'neighbour' ? ['pl', 'en'] : ['ja', 'es_MX', 'en', 'fr_CA'];

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const {JournalLanguagesTab, SiteLanguagesList} = require('../../../pages/LanguagesPages.js');
    const item = ITEM[app.name];
    const v35 = (app.line || 'main') === 'stable-3_5_0';
    const fact = (k, v) => {
        record(MODE === 'walk' ? 'facts' : `facts-${MODE}`, {[k]: v}, {merge: true});
        console.log(`[${app.name}] ${k}: ${flat(JSON.stringify(v), 1400)}`);
    };
    const step = async (k, fn) => {
        try {
            const v = await fn();
            fact(k, v);
            return v;
        } catch (e) {
            fact(k, {threw: flat(String(e), 600)});
            return null;
        }
    };
    const {page} = await launch(app);
    fact('line', {app: app.name, line: app.line || 'main', mode: MODE});

    // [3.5] A second published version, so the item's page shows the list at all.
    if (v35 && MODE === 'walk' && item.publish) {
        const V = require('../new-version-galley-publisher-id-refused/lib');
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        if (item.newVersion) await step('0-new-version', () => V.newVersion(page, app, item.id));
        await step('0-publish', () => V.publishNewest(page, app, item.id, item.publish));
        await signOut(page);
    }

    // Steps 1-3: the site's languages
    await signIn(page, 'admin');
    const site = new SiteLanguagesList(page);
    await step('3-install', async () => {
        await site.goto();
        const before = await site.codes();
        const win = await site.openInstall();
        const labels = {};
        for (const code of ADD) {
            labels[code] = flat(await win.box(code).evaluate((el) => (el.closest('label') || el.parentElement).innerText));
            await win.box(code).check();
        }
        const answer = await win.save();
        return {before, labels, status: answer.status(), after: await site.codes()};
    });
    record(`${MODE}-3-site-languages`, await screen(page));

    // Steps 4-5: the journal's interface languages
    const tab = new JournalLanguagesTab(page, app.contextPath, {locale: 'en'});
    await step('5-ui', async () => {
        await tab.goto();
        const out = {columns: await tab.website.columns(), rows: {}};
        for (const code of ADD) {
            const box = tab.website.cell(code, 'uiLocale');
            const row = {cells: await tab.website.cellTexts(code), tickedBefore: await box.isChecked()};
            if (!row.tickedBefore) {
                const pressed = await tab.pressWebsite(code, 'uiLocale');
                row.status = pressed.response && pressed.response.status();
                row.alerts = pressed.alerts;
            }
            row.tickedAfter = await tab.website.cell(code, 'uiLocale').isChecked();
            out.rows[code] = row;
        }
        return out;
    });
    record(`${MODE}-5-website-languages`, await screen(page));

    // Step 6
    await signOut(page);

    // Steps 7-9: the item's page in each language
    for (const lang of READ) {
        await step(`read-${lang}`, async () => {
            const response = await page.goto(app.url(`/index.php/${app.contextPath}/${lang}/${item.address}`));
            await idle(page);
            record(`${MODE}-read-${lang}`, await screen(page));
            const versions = page.locator('.versions').last();
            const shown = (await versions.count()) > 0;
            const line = page.locator('.preprint_version');
            const keys = ((await rawKeys(page)) || []).map((k) => String(k.key || k).replace(/ @ .*$/, ''));
            return {
                url: rel(page.url()),
                status: response && response.status(),
                htmlLang: await page.getAttribute('html', 'lang'),
                title: flat(await page.title()),
                versionsHeading: shown ? flat(await versions.locator('.label').first().innerText()) : null,
                versions: shown ? (await versions.locator('li').allInnerTexts()).map((t) => flat(t)) : null,
                versionLinks: shown ? await versions.locator('li a').evaluateAll((as) => as.map((a) => a.getAttribute('href').replace(/^https?:\/\/[^/]+/, ''))) : null,
                labelLine: (await line.count())
                    ? flat((await page.locator('.preprint_label, .preprint_label + .separator, .preprint_version').allInnerTexts()).join(' '))
                    : null,
                rawKeys: [...new Set(keys)].sort(),
            };
        });
    }
    await idle(page);
});
