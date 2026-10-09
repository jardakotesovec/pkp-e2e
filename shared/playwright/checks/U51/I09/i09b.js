// U51 Subscriptions, claim check I09 (housekeeping 2026-10-09), second script: the same
// fault as i09.js reads in the manager's lists, on the reader's subscription screens {OJS}.
//
// locale/uz_Latn/locale.po writes three more placeholders of U51's screens with a space
// ("{$ date}", "{$ currency} {$ price}"): `user.subscriptions.expires` and `.expired` ("My
// Subscriptions" and the sidebar's "Subscription" block) and `reader.purchasePrice` (the fee
// beside a restricted galley link). Read here on screen, English beside Uzbek (Latin):
//   A  a scratch journal that requires subscriptions, payments set up with a "Purchase
//      Article" fee, one subscription type, a subscriber whose subscription runs and one
//      whose subscription has ended, one published article with a PDF (the _test API); its
//      manager ticks Uzbek (Latin) under "UI"
//   B  signed out: the article's page and the issue's page, English then Uzbek (Latin)
//   C  the running subscriber: "My Subscriptions" and the sidebar block, both languages
//   D  the ended subscriber: the same
//
// Needs Uzbek (Latin) installed on the site: run i09.js first (same fleet, no reset between).
// Run (twice):
//   PKP_E2E_DATASET=4 PROBE_RUN=b1 PROBE_FEATURE=U51 PROBE_AGENT=ccI09 node bin/probe.js ojs shared/playwright/checks/U51/I09/i09b.js
// Outputs: .reports/U51/ccI09/ (factsb-<run>-ojs.json and one snapshot per screen).
const {forEachApp, launch, signIn, signOut, screen, rawKeys, shot, record, loc, idle, tag, sql} = require('../../../probe');

const LOCALE = 'uz_Latn';
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Every unreplaced placeholder ("{$x}", "{$ x}") the page holds, folded per text and place. */
async function placeholders(page) {
    return page.evaluate(() => {
        const re = /\{\s*\$[^}]*\}/;
        const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        const where = (el) => {
            const near = el.closest('[class]');
            return `<${el.tagName.toLowerCase()}>${near && typeof near.className === 'string' ? ` .${near.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
        };
        const found = new Map();
        const add = (text, el, kind) => {
            const key = `${text} @ ${where(el)} (${kind})`;
            const e = found.get(key) || {text, where: where(el), kind, count: 0, rendered: false};
            e.count++;
            e.rendered = e.rendered || visible(el.tagName === 'OPTION' ? el.parentElement : el);
            found.set(key, e);
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
            const p = n.parentElement;
            if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
            if (re.test(n.nodeValue)) add(n.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 200), p, 'text');
        }
        for (const el of document.body.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
            for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
                const v = el.getAttribute(a);
                if (v && re.test(v)) add(v.slice(0, 200), el, a);
            }
        }
        return [...found.values()];
    });
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // subscriptions are a journal's
    if (!app.dataset) throw new Error('i09b.js follows i09.js on its dataset fleet (PKP_E2E_DATASET=<n>)');
    if (!sql(app, 'select installed_locales from site').includes(LOCALE)) {
        throw new Error('i09b.js: Uzbek (Latin) is not installed on this site; run i09.js first');
    }
    const {JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');

    const fact = (k, v) => {
        record('factsb', {[k]: v}, {merge: true});
        console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 900)}`);
    };
    const part = async (name, fn) => {
        try {
            await fn();
        } catch (e) {
            fact(`ERROR ${name}`, flat(e && e.stack ? e.stack : String(e), 1200));
        }
    };

    const scratch = tag('u51i09b');
    const U = (k) => `${scratch}${k}`;
    const ctxUrl = (locale, path) => app.url(`/index.php/${scratch}/${locale}${path}`);
    let articleId = null;
    let issueId = null;

    // ================= A: the journal
    const made = await app.api.createContext({
        tag: scratch,
        publishingMode: 'subscription',
        payments: {currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Pay by cheque.', purchaseArticleFee: 10},
        sidebar: ['subscriptionblockplugin'],
        subscriptionName: 'I09 Subs Desk',
        subscriptionEmail: `${scratch}desk@mail.test`,
        subscriptionMailingAddress: '1 Scratch Street',
        users: [
            {username: U('mg'), roles: ['manager']},
            {username: U('au'), roles: ['author']},
            {username: U('act'), roles: ['reader']},
            {username: U('past'), roles: ['reader']},
        ],
        subscriptionTypes: [{name: 'I09 Online', cost: 40, currency: 'USD', duration: 12}],
        subscriptions: [
            {user: U('act'), type: 'I09 Online', dateStart: '2026-01-01', dateEnd: '2026-12-31'},
            {user: U('past'), type: 'I09 Online', dateStart: '2025-01-01', dateEnd: '2025-12-31'},
        ],
        issues: [{volume: 1, number: 1, year: 2026, published: true}],
    });
    issueId = made.issues && made.issues[0] && made.issues[0].id;
    const sub = await app.api.createSubmission({
        tag: U('s1'),
        context: scratch,
        submitter: U('au'),
        title: `I09 Article ${scratch}`,
        galleys: [{label: 'PDF', file: 'article.pdf'}],
        issue: {volume: 1, number: 1, year: 2026},
        published: true,
    });
    articleId = sub.submissionId;
    fact('A journal', {path: scratch, issueId, articleId, status: sub.status, subscriptions: made.subscriptions});

    const {page, close} = await launch(app);
    const lang = () => page.evaluate(() => document.documentElement.lang);
    const snap = async (name) => {
        const s = await screen(page);
        const extra = {lang: await lang(), placeholders: await placeholders(page), rawKeys: await rawKeys(page)};
        record(name, {...s, ...extra});
        await shot(page, name).catch(() => {});
        return extra;
    };
    /** The galley links of the page as read: text, classes, the fee words. */
    const galleys = () =>
        page.locator('a.obj_galley_link').evaluateAll((as) =>
            as.map((a) => ({
                text: a.innerText.replace(/\s+/g, ' ').trim(),
                all: a.textContent.replace(/\s+/g, ' ').trim(),
                cls: a.className,
                cost: a.querySelector('.purchase_cost') ? a.querySelector('.purchase_cost').textContent.replace(/\s+/g, ' ').trim() : null,
            }))
        );
    /** "My Subscriptions" as read: the page's tables and the sidebar block. */
    const mySubs = async () => ({
        lang: await lang(),
        heading: flat(await page.locator('h1').first().innerText().catch(() => null)),
        individual: flat(await page.locator('.my_subscriptions_individual, .cmp_table').first().innerText().catch(() => null), 500),
        tables: (await page.locator('table').allInnerTexts()).map((t) => flat(t, 500)),
        block: flat(await page.locator('.pkp_block.block_subscription').first().innerText().catch(() => null), 400),
    });

    try {
        await part('A tick UI', async () => {
            await signIn(page, U('mg'), {contextPath: scratch});
            const tab = new JournalLanguagesTab(page, scratch);
            await tab.goto();
            const r = await tab.pressWebsite(LOCALE, 'uiLocale');
            await idle(page);
            fact('A tick UI', {status: r.response && r.response.status(), alerts: r.alerts, ticked: await tab.website.cell(LOCALE, 'uiLocale').isChecked()});
            await signOut(page);
        });

        // ================= B: signed out, the article and the issue
        await part('B signed out', async () => {
            for (const locale of ['en', LOCALE]) {
                await page.goto(ctxUrl(locale, `/article/view/${articleId}`));
                await idle(page);
                if (locale === 'en') await loc(page, 'Article page: a galley link', page.locator('a.obj_galley_link'));
                if (locale === 'en') await loc(page, 'Article page: the fee beside a restricted galley link', page.locator('a.obj_galley_link .purchase_cost'));
                const a = await snap(`b-${locale}-article-signed-out`);
                fact(`B ${locale} article page, signed out`, {lang: a.lang, galleys: await galleys(), placeholders: a.placeholders});
                await page.goto(ctxUrl(locale, `/issue/view/${issueId}`));
                await idle(page);
                const i = await snap(`b-${locale}-issue-signed-out`);
                fact(`B ${locale} issue page, signed out`, {lang: i.lang, galleys: await galleys(), placeholders: i.placeholders});
            }
        });

        // ================= C, D: the two subscribers
        for (const [key, who] of [['C', 'act'], ['D', 'past']]) {
            await part(`${key} ${who}`, async () => {
                await signIn(page, U(who), {contextPath: scratch});
                for (const locale of ['en', LOCALE]) {
                    await page.goto(ctxUrl(locale, '/user/subscriptions'));
                    await idle(page);
                    if (locale === 'en' && key === 'C') await loc(page, 'My Subscriptions: the sidebar "Subscription" block', page.locator('.pkp_block.block_subscription'));
                    const s = await snap(`${key.toLowerCase()}-${locale}-my-subscriptions-${who}`);
                    fact(`${key} ${locale} My Subscriptions, ${who}`, {...(await mySubs()), placeholders: s.placeholders});
                    await page.goto(ctxUrl(locale, `/article/view/${articleId}`));
                    await idle(page);
                    const a = await snap(`${key.toLowerCase()}-${locale}-article-${who}`);
                    fact(`${key} ${locale} article page, ${who}`, {
                        lang: a.lang,
                        galleys: await galleys(),
                        block: flat(await page.locator('.pkp_block.block_subscription').first().innerText().catch(() => null), 400),
                        placeholders: a.placeholders,
                    });
                }
                await signOut(page);
            });
        }
    } finally {
        await close();
    }
});
