// Issue report docs/issues/U51-A31-uzbek-subscription-texts-placeholders-raw.md (U51 A31): read in
// Uzbek (Latin), the month and week lists of "Delayed Open Access" and "Subscription Expiry
// Reminders", the fee on a locked galley link and a subscription's end date print "{$ x}",
// "({$ currency} {$ price})" and "Muddati: {$ date}". OJS only (subscriptions are a journal's),
// on PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"), journal
// `publicknowledge`. The kit builds nothing; every step is a screen. Helpers: ./lib.js.
//
//   P1 admin: "Install Locale": Uzbek (Latin)        P2 Website › Setup › Languages: "UI" on it
//   P3 rvaca: Settings › Distribution › "Payments": Enable, USD, Manual Fee Payment, "Save"
//   P4 "Access": the subscription mode, "Save"       P5 "Payment Types": "Purchase Article" 10
//   P6 "Subscription Types": "Online Year h21s", 10 USD, 12 months, individual
//   P7 "Individual Subscriptions": dsokoloff Active 2026-01-01..2026-12-31,
//      ccorino Active 2025-01-01..2025-12-31
//   P8 "Vol. 1 No. 2 (2014)" › "Access": "Subscription"   P9 "Sidebar": "Subscription Block"
//   1 rvaca: user menu › o‘zbek   2 "Access": "Delayed Open Access"   3 the fourth entry, "Save",
//     reload   4 "Payments" › "Subscription Policies": the four lists   5 the same in English
//   6 signed out, uz_Latn: the issue's and the article's "PDF" link
//   7 dsokoloff: "My Subscriptions" and the block   8 ccorino: the same   9 6-8 in English
//
// Others mode (`others` as the script's argument, run alone): P1-P2 with Arabic, Mongolian,
// Romanian and Aragonese instead of Uzbek (Latin), P3-P9, then steps 6-8 in each of the four.
//
// Neighbour mode (`neighbour` as the script's argument, run alone, fix in and out): P3-P9 without
// the Uzbek install, then the lists, the link, "My Subscriptions" and the block in English and
// French (Canada) (the dataset's two languages), which the fix must leave as they are.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21s --dataset 2 --reset
// Run (main):   PROBE_FEATURE=issues-h21s PROBE_AGENT=h21s bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/issues/uzbek-subscription-texts-placeholders-raw/walk.js [others|neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21s-3_5 --dataset 2 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21s-3_5 PROBE_AGENT=h21s node bin/probe.js ojs shared/playwright/checks/issues/uzbek-subscription-texts-placeholders-raw/walk.js
// Facts: .reports/<feature>/h21s/a31-facts[-neighbour|-others][-<run>]-ojs.json
const {forEachApp, launch, signIn, signOut, screen, record, sql, switchLanguage, serverLog} = require('../../../probe');
const L = require('./lib');

const neighbour = process.argv.includes('neighbour');
const others = process.argv.includes('others');
const UZ = 'uz_Latn';
const OTHERS = ['ar', 'mn', 'ro', 'an'];
const TYPE = 'Online Year h21s';
const ARTICLE = 'Signalling Theory Dividends';

forEachApp(async (app) => {
    if (app.name !== 'ojs') return console.log(`[walk] ${app.name}: no subscriptions; not walked`);
    if (!app.dataset) throw new Error('walk.js changes the dataset: run it on a dataset fleet');
    const log = serverLog(app);
    const from = log.mark();
    const facts = {app: app.name, line: app.line || 'main', run: process.env.PROBE_RUN || null, mode: neighbour ? 'neighbour' : others ? 'others' : 'steps'};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const step = async (k, fn) => {
        try {
            fact(k, await fn());
        } catch (e) {
            fact(k, {error: L.flat(e.stack || e.message, 700)});
        }
    };
    const uid = (u) => sql(app, `select user_id from users where username='${u}'`);
    const stored = (name) => sql(app, `select setting_value from journal_settings where setting_name='${name}'`) || '(none)';
    const reads = async (locale) => {
        // Back office, as rvaca, in `locale`: the "Access" list, the four reminder lists.
        await step(`${locale} access list`, async () => L.readSelect(await L.openAccessTab(page, app, locale)));
        record(`a31-access-${locale}`, await screen(page));
        await step(`${locale} policy lists`, () => L.readPolicyLists(page, app, locale));
        record(`a31-policies-${locale}`, await screen(page));
    };
    const readerSide = async (locale) => {
        await signOut(page);
        await step(`${locale} visitor links`, () => L.readIssueAndArticle(page, app, locale, ARTICLE, `a31-visitor-${locale}`));
        for (const u of ['dsokoloff', 'ccorino']) {
            await signIn(page, u, {contextPath: app.contextPath});
            await step(`${locale} ${u} my subscriptions`, () => L.readMySubscriptions(page, app, locale, `a31-mysubs-${u}-${locale}`));
            record(`a31-mysubs-${u}-${locale}`, await screen(page));
            await signOut(page);
        }
    };

    const {page, close} = await launch(app);
    try {
        if (!neighbour) {
            const langs = others ? OTHERS : [UZ];
            await signIn(page, 'admin');
            await step('P1 install locale', () => L.installLocale(page, langs));
            await step('P2 UI ticked', () => L.tickUi(page, app, langs));
        }
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        await step('P3 payments', () => L.setUpPayments(page, app));
        await step('P4 access', () => L.requireSubscriptions(page, app));
        await step('P5 payment types', () => L.setPaymentTypes(page, app, {'Purchase Article': 10}));
        await step('P6 type', () => L.createType(page, app, {name: TYPE, cost: 10}));
        await step('P7 dsokoloff', () => L.createSubscription(page, app, {username: 'dsokoloff', userId: uid('dsokoloff'), type: TYPE, start: '2026-01-01', end: '2026-12-31'}));
        await step('P7 ccorino', () => L.createSubscription(page, app, {username: 'ccorino', userId: uid('ccorino'), type: TYPE, start: '2025-01-01', end: '2025-12-31'}));
        await step('P8 issue access', () => L.restrictIssue(page, app));
        await step('P9 subscription block', () => L.placeSubscriptionBlock(page, app));
        fact('P stored', {
            publishingMode: stored('publishingMode'),
            purchaseArticleFee: stored('purchaseArticleFee'),
            subscriptions: sql(app, 'select user_id, status, date_start, date_end from subscriptions order by 1'),
            issue: sql(app, "select issue_id, access_status from issues where published=1"),
            supportedLocales: stored('supportedLocales'),
        });

        if (others) {
            for (const locale of OTHERS) await readerSide(locale);
        } else if (!neighbour) {
            // 1: the interface in Uzbek (Latin), from the user menu.
            await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard`));
            await step('1 switch language', async () => {
                await switchLanguage(page, UZ);
                return {url: L.rel(page.url()), lang: await page.evaluate(() => document.documentElement.lang)};
            });
            // 2-3: "Delayed Open Access", the fourth entry saved, read back after a reload.
            await step('2 access list', async () => L.readSelect(await L.openAccessTab(page, app, UZ)));
            record('a31-access-uz', await screen(page));
            await step('3 choose fourth and save', async () => {
                const select = await L.openAccessTab(page, app, UZ);
                await select.selectOption({index: 3});
                const chosen = await L.readSelect(select);
                const saved = await L.saveAccessTab(page);
                return {chosen: chosen.chosen, saved, stored: stored('delayedOpenAccessDuration')};
            });
            await step('3 after reload', async () => (await L.readSelect(await L.openAccessTab(page, app, UZ))).chosen);
            // 4: the reminder lists.
            await step('4 policy lists', () => L.readPolicyLists(page, app, UZ));
            record('a31-policies-uz', await screen(page));
            // 5: the control in English.
            await step('5 switch to English', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/${UZ}/dashboard`));
                await switchLanguage(page, 'en');
                return L.rel(page.url());
            });
            await reads('en');
            // 6-8: the reader side in Uzbek (Latin); 9: in English.
            await readerSide(UZ);
            await readerSide('en');
        } else {
            for (const locale of ['en', 'fr_CA']) await reads(locale);
            for (const locale of ['en', 'fr_CA']) await readerSide(locale);
        }
    } catch (e) {
        facts.error = L.flat(e.stack || e.message, 900);
        console.log(`[fact] FAILED: ${facts.error}`);
    } finally {
        facts.serverLog = log.since(from);
        record(neighbour ? 'a31-facts-neighbour' : others ? 'a31-facts-others' : 'a31-facts', facts);
        await close();
    }
});
