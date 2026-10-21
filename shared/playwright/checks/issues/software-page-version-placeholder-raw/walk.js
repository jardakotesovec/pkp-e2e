// Issue report docs/issues/U07-A14-software-page-version-placeholder-raw.md (U07 A14): in a few
// languages the page about the software ("About Open Journal Systems" and its press and server
// twins) prints a misspelt version placeholder instead of the version, and in two the site's page
// links its last sentence to "{$contactUrl}". Takes the report's Steps on PKP's default test
// dataset (a dataset fleet, harness.md "Dataset fleets"), on the app given:
//
//   precondition: admin installs the languages (Administration › Site Settings › Site Setup ›
//     Languages › "Install Locale") and ticks "UI" for each on publicknowledge's Settings ›
//     Website › Setup › Languages
//     OJS: hi, uz_Latn, kk   OMP: ru   OPS: cs, tr
//   signed out, per language: the context's home › the footer's PKP logo › the paragraph; the
//   site's page by its address; where the site's paragraph has a link to "{$contactUrl}", it is
//   pressed. English is the control.
//
// Neighbour mode (`neighbour` as the script's argument, run alone, fix in and out, no install):
// the English and French (Canada) pages of the site and of publicknowledge keep their text and
// the version.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21m --dataset 8 --reset
// Run (main):   PROBE_FEATURE=issues-h21m PROBE_AGENT=h21m bin/app-lock.sh shared <app> -- node bin/probe.js <app> shared/playwright/checks/issues/software-page-version-placeholder-raw/walk.js [neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21m-3_5 --dataset 8 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21m-3_5 PROBE_AGENT=h21m node bin/probe.js <app> shared/playwright/checks/issues/software-page-version-placeholder-raw/walk.js
// Facts: .reports/<feature>/h21m/facts[-neighbour][-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog, rawKeys} = require('../../../probe');

const neighbour = process.argv.includes('neighbour');
const LANGS = {ojs: ['hi', 'uz_Latn', 'kk'], omp: ['ru'], ops: ['cs', 'tr']};
const PAGE = '/about/aboutThisPublishingSystem';
const flat = (s, n = 3000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js changes the site languages: run it on a dataset fleet');
    const {SiteLanguagesList, JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');
    const log = serverLog(app);
    const facts = {app: app.name, line: app.line || 'main', mode: neighbour ? 'neighbour' : 'steps'};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const step = async (key, fn) => {
        try {
            fact(key, await fn());
        } catch (e) {
            fact(`${key} error`, String(e && e.stack ? e.stack : e).slice(0, 800));
        }
    };

    // The page about the software as a visitor reads it: heading, paragraph, its links, the
    // placeholder left in it and the version printed.
    const readAbout = async (page, name) => {
        const s = await screen(page);
        record(name, s);
        await shot(page, name).catch(() => {});
        const r = await page.evaluate(() => {
            const box = document.querySelector('.page_about_publishing_system');
            const p = box && box.querySelector('p');
            return {
                lang: document.documentElement.lang,
                title: document.title,
                heading: box && box.querySelector('h1') ? box.querySelector('h1').innerText.trim() : null,
                paragraph: p ? p.innerText.replace(/\s+/g, ' ').trim() : null,
                links: p ? [...p.querySelectorAll('a')].map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})) : [],
            };
        });
        return {
            url: rel(page.url()),
            ...r,
            placeholder: (r.paragraph || '').match(/\{\s*\$[^}]{0,40}\}?/g) || [],
            version: ((r.paragraph || '').match(/\d+\.\d+\.\d+\.\d+/) || [null])[0],
            rawKeys: await rawKeys(page).catch((e) => String(e.message)),
        };
    };
    // The context's home in a language, then the footer's PKP logo, pressed.
    const contextPage = async (page, locale, name) => {
        const from = log.mark();
        const home = await page.goto(app.url(`/index.php/${app.contextPath}/${locale}`));
        await idle(page);
        const logo = page.locator('.pkp_brand_footer a').first();
        const alt = await logo.locator('img').getAttribute('alt').catch(() => null);
        await Promise.all([page.waitForLoadState('load'), logo.click()]);
        await idle(page);
        return {homeStatus: home && home.status(), logoAlt: alt, ...(await readAbout(page, name)), log: log.since(from)};
    };
    // The site's page by its address.
    const sitePage = async (page, locale, name) => {
        const from = log.mark();
        const r = await page.goto(app.url(`/index.php/index/${locale}${PAGE}`));
        await idle(page);
        return {status: r && r.status(), ...(await readAbout(page, name)), log: log.since(from)};
    };
    // A paragraph link to the unfilled contact placeholder, pressed.
    const pressContactLink = async (page, name) => {
        const link = page.locator('.page_about_publishing_system p a[href*="contactUrl"]').first();
        if (!(await link.count())) return {link: 'none'};
        const href = await link.getAttribute('href');
        const [resp] = await Promise.all([page.waitForNavigation({waitUntil: 'load'}).catch(() => null), link.click()]);
        await idle(page);
        const s = await screen(page);
        record(name, s);
        await shot(page, name).catch(() => {});
        return {href, status: resp && resp.status(), url: rel(page.url()), title: await page.title(), heading: flat(await page.locator('h1').first().innerText().catch(() => null), 200)};
    };

    const {page, close} = await launch(app);
    try {
        if (!neighbour) {
            const langs = LANGS[app.name];
            fact('0 site languages before', sql(app, 'select installed_locales, supported_locales from site'));
            // Precondition 1: admin installs the languages.
            await signIn(page, 'admin');
            const list = new SiteLanguagesList(page);
            await step('0 install', async () => {
                await list.goto();
                const win = await list.openInstall();
                const labels = {};
                for (const c of langs) {
                    labels[c] = flat(await win.box(c).evaluate((b) => (b.closest('label') || b.parentElement).innerText));
                    await win.box(c).check();
                }
                record('0-install-window', await screen(page));
                const answer = await win.save();
                await list.reload();
                const rows = {};
                for (const c of langs) rows[c] = await list.cellTexts(c).catch((e) => String(e.message));
                record('0-site-languages', await screen(page));
                return {labels, status: answer.status(), rows};
            });
            // Precondition 2: "UI" ticked for each on the context's Website Languages.
            await step('0 context UI', async () => {
                const tab = new JournalLanguagesTab(page, app.contextPath, {locale: 'en'});
                await tab.goto();
                const out = {};
                for (const c of langs) {
                    const r = await tab.pressWebsite(c, 'uiLocale');
                    out[c] = {status: r.response && r.response.status(), alerts: r.alerts};
                }
                await page.reload();
                await tab.openTab();
                for (const c of langs) out[c].ui = await tab.website.cell(c, 'uiLocale').isChecked();
                record('0-website-languages', await screen(page));
                return out;
            });
            fact('0 site languages after', sql(app, 'select installed_locales, supported_locales from site'));
            await signOut(page);
            // The steps, signed out.
            for (const c of langs) {
                await step(`${c} context page`, () => contextPage(page, c, `${c}-context`));
                await step(`${c} site page`, () => sitePage(page, c, `${c}-site`));
                await step(`${c} site contact link`, () => pressContactLink(page, `${c}-site-contact`));
            }
            // Control: English.
            await step('en context page', () => contextPage(page, 'en', 'en-context'));
            await step('en site page', () => sitePage(page, 'en', 'en-site'));
        } else {
            for (const c of ['en', 'fr_CA']) {
                await step(`nb ${c} context page`, () => contextPage(page, c, `nb-${c}-context`));
                await step(`nb ${c} site page`, () => sitePage(page, c, `nb-${c}-site`));
            }
        }
    } finally {
        record(neighbour ? 'facts-neighbour' : 'facts', facts);
        await close();
    }
});
