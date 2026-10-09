// U51 Subscriptions, claim check I09 (housekeeping 2026-10-09): the incidental row of
// docs/tracking/incidentals.md on the Uzbek (Latin) month and week lists {OJS}.
//
// The row (read in locale/uz_Latn/manager.po, never on screen): the uz_Latn translations of
// manager.subscriptionPolicies.xMonths / .xWeeks write the placeholder as "{$ x}", so the
// "Delayed Open Access" list (Settings › Distribution › "Access") and the four "Subscription
// Expiry Reminders" lists ("Payments" page › "Subscription Policies") would read "{$ x} oy" /
// "{$ x} hafta" for every count.
//
// What the script does, on a dataset fleet of its own (the language list is the site's):
//   A  admin installs "Uzbek (Latin)" through Administration › Site Settings › Site Setup ›
//      Languages › "Install Locale"
//   B  a scratch journal with a Journal manager and a Subscription Manager (the _test API)
//   C  the scratch manager ticks Uzbek (Latin) under "UI" on Settings › Website › Setup ›
//      Languages
//   D  control, English: the "Access" tab, the subscriptions "Publishing Mode" chosen and saved,
//      the "Delayed Open Access" list read
//   E  control, English: the "Payments" page › "Subscription Policies", the four lists read
//   F  the manager switches the interface to Uzbek (Latin) from the user menu; the six tabs of
//      the "Payments" page are read and swept for unreplaced placeholders and raw keys; the
//      four lists read
//   G  Uzbek: the "Access" tab's list read; the fourth entry chosen and saved, read on the page
//      and after a reload; an unsaved change carried to another tab and off the page
//   H  Uzbek: "Subscription Policies" saved with the third month entry and the second week
//      entry, read on the page and after a reload
//   I  the Subscription Manager reads the four lists in Uzbek; admin reads the "Access" list
//
// Reset first (the fleet is the checker's alone):
//   npm run fleet-prep -- --feature issues-c1 --dataset 4 --reset --apps ojs
// Run (twice, a reset before each):
//   PKP_E2E_DATASET=4 PROBE_RUN=r1 PROBE_FEATURE=U51 PROBE_AGENT=ccI09 node bin/probe.js ojs shared/playwright/checks/U51/I09/i09.js
// Outputs: .reports/U51/ccI09/ (facts-<run>-ojs.json and one snapshot per screen).
const {forEachApp, launch, signIn, signOut, switchLanguage, screen, rawKeys, shot, record, loc, idle, tag, sql} = require('../../../probe');

const T = 30_000;
const LOCALE = 'uz_Latn';
const REMINDERS = [
    'numMonthsBeforeSubscriptionExpiryReminder',
    'numWeeksBeforeSubscriptionExpiryReminder',
    'numMonthsAfterSubscriptionExpiryReminder',
    'numWeeksAfterSubscriptionExpiryReminder',
];
const PAY_TABS = ['individualSubscription', 'institutionalSubscriptions', 'subscriptionTypes', 'subscriptionPolicies', 'paymentTypes', 'payments'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** A <select> as the screen shows it: its label, the chosen entry and every entry. */
async function readSelect(select) {
    return select.evaluate((s) => {
        const opts = [...s.options].map((o) => ({value: o.value, text: o.text.trim()}));
        const label = s.id ? document.querySelector(`label[for="${s.id}"]`) : null;
        const texts = opts.map((o) => o.text);
        return {
            label: label ? label.innerText.replace(/\s+/g, ' ').trim() : null,
            name: s.name || s.id,
            selectedIndex: s.selectedIndex,
            value: s.value,
            shown: s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : '',
            count: opts.length,
            first: texts.slice(0, 4),
            last: texts.slice(-1),
            distinct: [...new Set(texts)],
            all: opts,
        };
    });
}

/**
 * Every unreplaced placeholder ("{$x}", "{$ x}") the page holds, in text, list entries and
 * the attributes a person reads, folded per text: how often, where, rendered or not.
 */
async function placeholders(page) {
    return page.evaluate(() => {
        const re = /\{\s*\$[^}]*\}/;
        const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        const where = (el) => {
            const land = el.closest('nav[aria-label], [role="dialog"], header, main, aside, footer');
            const near = el.closest('[id]');
            return `${land ? land.tagName.toLowerCase() : 'body'}${near ? ` #${near.id}` : ''} <${el.tagName.toLowerCase()}>`;
        };
        const found = new Map();
        const add = (text, el, kind) => {
            const key = `${text} @ ${where(el)} (${kind})`;
            const shown = visible(el.tagName === 'OPTION' ? el.parentElement : el);
            const e = found.get(key) || {text, where: where(el), kind, count: 0, rendered: false};
            e.count++;
            e.rendered = e.rendered || shown;
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
        if (re.test(document.title)) add(document.title, document.body, 'title');
        return [...found.values()];
    });
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // subscriptions are a journal's: OMP and OPS have neither list
    if (!app.dataset) throw new Error('i09.js installs a site language: run it on a dataset fleet of its own (PKP_E2E_DATASET=<n>), never on a campaign fleet');
    const {SiteLanguagesList, JournalLanguagesTab, noticeDuring} = require('../../../pages/LanguagesPages.js');

    const facts = {};
    const fact = (k, v) => {
        facts[k] = v;
        record('facts', {[k]: v}, {merge: true});
        console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 900)}`);
    };
    const part = async (name, fn) => {
        try {
            await fn();
        } catch (e) {
            fact(`ERROR ${name}`, flat(e && e.stack ? e.stack : String(e), 1200));
        }
    };

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => {
        dialogs.push({type: d.type(), message: d.message().slice(0, 300)});
        d.accept().catch(() => {});
    });
    const takeDialogs = () => dialogs.splice(0);
    const lang = () => page.evaluate(() => document.documentElement.lang);
    /** The screen recorded, with its language, unreplaced placeholders and raw keys. */
    const snap = async (name, {sweep = true} = {}) => {
        const s = await screen(page);
        const extra = {lang: await lang()};
        if (sweep) {
            extra.placeholders = await placeholders(page);
            extra.rawKeys = await rawKeys(page);
        }
        record(name, {...s, ...extra});
        await shot(page, name).catch(() => {});
        return {notices: s.notices, ...extra};
    };
    const short = (s) => ({label: s.label, shown: s.shown, value: s.value, count: s.count, first: s.first, last: s.last, distinct: s.distinct.length});

    const scratch = tag('u51i09');
    const mgr = `${scratch}mgr`;
    const sub = `${scratch}sub`;
    const ctxUrl = (locale, path) => app.url(`/index.php/${scratch}/${locale}${path}`);
    const stored = (names) => {
        const t = app.contextTables;
        const list = names.map((n) => `'${n}'`).join(',');
        return sql(app, `select s.setting_name, s.setting_value from ${t.settings} s join ${t.table} j on j.${t.id} = s.${t.id} where j.path = '${scratch}' and s.setting_name in (${list}) order by 1`);
    };

    // --- screens, read by markup the interface language does not change ---------------------
    const accessPanel = () => page.locator('[id="access"]');
    const modeRadios = () => accessPanel().locator('input[type="radio"][name="publishingMode"]');
    const delayed = () => accessPanel().locator('select').first();
    const accessSave = () => accessPanel().locator('.pkpFormPage__footer button, .pkpFormPage__buttons button').filter({visible: true}).last();
    const openAccess = async (locale) => {
        await page.goto(ctxUrl(locale, '/management/settings/distribution'));
        await idle(page);
        await page.locator('#access-button').first().click();
        await modeRadios().first().waitFor({state: 'visible', timeout: T});
        await idle(page);
    };
    const saveAccess = async () => {
        const answered = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
        await accessSave().click();
        const r = await answered;
        const status = accessPanel().locator('[role="status"]');
        // "Saving" and then "Saved" (the language's words for them), each kept as it shows
        const seen = [];
        for (let i = 0; i < 20; i++) {
            for (const t of await status.allInnerTexts().catch(() => [])) {
                const w = flat(t);
                if (w && !seen.includes(w)) seen.push(w);
            }
            await sleep(150);
        }
        const words = seen;
        await idle(page);
        let answer = null;
        try {
            const j = await r.json();
            answer = {publishingMode: j.publishingMode, delayedOpenAccessDuration: j.delayedOpenAccessDuration};
        } catch {}
        return {status: r.status(), statusWords: words, answer};
    };
    const payTab = (name) => page.locator(`#subscriptionsTabs a[name="${name}"]`);
    const payPanel = () => page.locator('#subscriptionsTabs .ui-tabs-panel').filter({visible: true}).first();
    const openPayments = async (locale) => {
        await page.goto(ctxUrl(locale, '/payments'));
        await payTab(PAY_TABS[0]).waitFor({state: 'visible', timeout: T});
        await idle(page);
    };
    const showPayTab = async (name) => {
        await payTab(name).click();
        await page.waitForFunction(
            (n) => {
                const a = document.querySelector(`#subscriptionsTabs a[name="${n}"]`);
                const li = a && a.closest('li');
                if (!li || li.getAttribute('aria-selected') !== 'true' || li.classList.contains('ui-tabs-loading')) return false;
                const panel = document.getElementById(li.getAttribute('aria-controls'));
                return !!panel && panel.getAttribute('aria-busy') !== 'true' && panel.children.length > 0;
            },
            name,
            {timeout: T}
        );
        await idle(page);
    };
    const policiesForm = () => payPanel().locator('form').first();
    const reminder = (name) => policiesForm().locator(`select[name="${name}"]`);
    const readReminders = async () => {
        await reminder(REMINDERS[0]).waitFor({state: 'visible', timeout: T});
        const out = {};
        for (const name of REMINDERS) out[name] = await readSelect(reminder(name));
        return out;
    };
    const shortAll = (lists) => Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, short(v)]));

    try {
        // ================= A: admin installs Uzbek (Latin)
        await part('A install', async () => {
            await signIn(page, 'admin');
            const site = new SiteLanguagesList(page);
            await site.goto();
            const before = await site.codes();
            fact('A site languages before', before);
            await snap('a1-site-languages-before', {sweep: false});
            if (before.includes(LOCALE)) {
                // a second run without a reset between: the language is there already
                fact('A install save', 'skipped: Uzbek (Latin) was installed already (no reset before this run)');
                await signOut(page);
                return;
            }
            const win = await site.openInstall();
            await loc(page, 'Install Locale window: the Uzbek (Latin) box', win.box(LOCALE));
            fact('A install window box', {
                boxes: await win.boxes.count(),
                uzLatnLabel: flat(await win.box(LOCALE).evaluate((b) => (b.closest('label') || b.parentElement).innerText).catch(() => null)),
                uzLabel: flat(await win.box('uz').evaluate((b) => (b.closest('label') || b.parentElement).innerText).catch(() => null)),
            });
            await snap('a2-install-locale-window', {sweep: false});
            await win.box(LOCALE).check();
            const started = Date.now();
            let answer;
            let noticeSeen = true;
            try {
                await noticeDuring(page, 'All selected locale(s) installed and activated.', async () => {
                    answer = await win.save();
                });
            } catch (e) {
                noticeSeen = flat(String(e), 200);
            }
            fact('A install save', {status: answer && answer.status(), seconds: Math.round((Date.now() - started) / 1000), notice: noticeSeen});
            await site.reload();
            fact('A site languages after', await site.codes());
            fact('A site row uz_Latn', await site.cellTexts(LOCALE).catch((e) => flat(String(e), 200)));
            await snap('a3-site-languages-after', {sweep: false});
            await signOut(page);
        });

        // ================= B: the scratch journal
        await part('B scratch', async () => {
            const made = await app.api.createContext({
                tag: scratch,
                users: [
                    {username: mgr, roles: ['manager']},
                    {username: sub, roles: ['subscriptionManager']},
                ],
            });
            fact('B scratch journal', {path: scratch, manager: mgr, subscriptionManager: sub, id: made && (made.contextId || made.id || (made.context && made.context.id))});
        });

        // ================= C: the manager ticks Uzbek (Latin) under "UI"
        await part('C tick UI', async () => {
            await signIn(page, mgr, {contextPath: scratch});
            const tab = new JournalLanguagesTab(page, scratch);
            await tab.goto();
            fact('C website languages before', {codes: await tab.website.codes(), columns: await tab.website.columns(), uzLatn: await tab.website.cellTexts(LOCALE)});
            await snap('c1-website-languages-before', {sweep: false});
            await loc(page, 'Website Languages: the "UI" box of Uzbek (Latin)', tab.website.cell(LOCALE, 'uiLocale'));
            const r = await tab.pressWebsite(LOCALE, 'uiLocale');
            await idle(page);
            fact('C tick UI', {
                status: r.response && r.response.status(),
                alerts: r.alerts,
                ticked: await tab.website.cell(LOCALE, 'uiLocale').isChecked(),
                forms: await tab.website.cell(LOCALE, 'formLocale').isChecked().catch(() => null),
                stored: stored(['supportedLocales', 'supportedFormLocales']),
            });
            takeDialogs();
            const c2 = await snap('c2-website-languages-after', {sweep: false});
            fact('C notices', c2.notices);
        });

        // ================= D: control, English: the "Access" tab
        await part('D access en', async () => {
            await openAccess('en');
            fact('D en lang', await lang());
            fact('D en radios fresh', await modeRadios().evaluateAll((rs) => rs.map((r) => ({value: r.value, checked: r.checked}))));
            fact('D en list shown before the choice', await delayed().isVisible().catch(() => false));
            await snap('d1-en-access-fresh');
            await modeRadios().nth(1).check();
            await delayed().waitFor({state: 'visible', timeout: T});
            await loc(page, 'Access tab: the subscriptions "Publishing Mode" radio', modeRadios().nth(1));
            await loc(page, 'Access tab: the "Delayed Open Access" list', delayed());
            await loc(page, 'Access tab: "Save"', accessSave());
            const list = await readSelect(delayed());
            fact('D en Delayed Open Access', short(list));
            record('d2-en-delayed-list', list);
            await snap('d2-en-access-subscription');
            fact('D en save (mode only)', await saveAccess());
            fact('D en stored', stored(['publishingMode', 'delayedOpenAccessDuration']));
            const d3 = await snap('d3-en-access-saved');
            fact('D en notices', d3.notices);
        });

        // ================= E: control, English: "Subscription Policies"
        await part('E policies en', async () => {
            await openPayments('en');
            fact('E en tabs', (await page.locator('#subscriptionsTabs > ul a').allInnerTexts()).map((t) => flat(t)));
            await showPayTab('subscriptionPolicies');
            await loc(page, 'Payments page: the "Subscription Policies" tab', payTab('subscriptionPolicies'));
            await loc(page, 'Subscription Policies: the months-before list', reminder(REMINDERS[0]));
            const lists = await readReminders();
            fact('E en reminder lists', shortAll(lists));
            record('e1-en-reminder-lists', lists);
            const e1 = await snap('e1-en-subscription-policies');
            fact('E en placeholders', e1.placeholders);
        });

        // ================= F: Uzbek (Latin): the "Payments" page
        await part('F payments uz', async () => {
            await switchLanguage(page, LOCALE);
            fact('F after the language switch', {url: page.url().replace(app.baseURL, ''), lang: await lang()});
            await openPayments(LOCALE);
            fact('F uz heading and tabs', {
                lang: await lang(),
                heading: flat(await page.locator('main h1').first().innerText().catch(() => null)),
                tabs: (await page.locator('#subscriptionsTabs > ul a').allInnerTexts()).map((t) => flat(t)),
            });
            const sweep = {};
            for (const name of PAY_TABS) {
                if (name !== PAY_TABS[0]) await showPayTab(name);
                else await idle(page);
                const s = await snap(`f-uz-payments-${name}`);
                sweep[name] = {placeholders: s.placeholders, rawKeys: s.rawKeys, notices: s.notices};
            }
            fact('F uz sweep of the six tabs', sweep);
            await showPayTab('subscriptionPolicies');
            const lists = await readReminders();
            fact('F uz reminder lists', shortAll(lists));
            record('f1-uz-reminder-lists', lists);
            fact('F uz policies labels', (await policiesForm().locator('label, legend').allInnerTexts()).map((t) => flat(t, 160)).filter(Boolean));
            await snap('f1-uz-subscription-policies');
        });

        // ================= G: Uzbek (Latin): the "Access" tab
        await part('G access uz', async () => {
            await openAccess(LOCALE);
            fact('G uz lang', await lang());
            fact('G uz radios', await modeRadios().evaluateAll((rs) => rs.map((r) => ({value: r.value, checked: r.checked, label: (r.closest('label') || r.parentElement).innerText.replace(/\s+/g, ' ').trim()}))));
            await delayed().waitFor({state: 'visible', timeout: T});
            const list = await readSelect(delayed());
            fact('G uz Delayed Open Access', short(list));
            record('g1-uz-delayed-list', list);
            const g1 = await snap('g1-uz-access');
            fact('G uz placeholders', g1.placeholders);
            fact('G uz raw keys', g1.rawKeys);
            // the fourth entry (value 3: "3 Months" in English) chosen and saved
            await delayed().selectOption({index: 3});
            const chosen = await readSelect(delayed());
            fact('G uz chosen before save', {shown: chosen.shown, value: chosen.value, index: chosen.selectedIndex});
            fact('G uz save', await saveAccess());
            const onPage = await readSelect(delayed());
            fact('G uz after save, same page', {shown: onPage.shown, value: onPage.value, index: onPage.selectedIndex});
            const g2 = await snap('g2-uz-access-saved');
            fact('G uz save notices', g2.notices);
            fact('G uz stored', stored(['publishingMode', 'delayedOpenAccessDuration']));
            await openAccess(LOCALE);
            await delayed().waitFor({state: 'visible', timeout: T});
            const reloaded = await readSelect(delayed());
            fact('G uz after reload', {shown: reloaded.shown, value: reloaded.value, index: reloaded.selectedIndex});
            await snap('g3-uz-access-reloaded');
            // the same value read back in English
            await openAccess('en');
            await delayed().waitFor({state: 'visible', timeout: T});
            const en = await readSelect(delayed());
            fact('G en read of the saved value', {shown: en.shown, value: en.value, index: en.selectedIndex});
            // an unsaved change, carried to another tab and off the page
            await openAccess(LOCALE);
            await delayed().waitFor({state: 'visible', timeout: T});
            await delayed().selectOption({index: 7});
            await delayed().blur();
            takeDialogs();
            const tabs = await page.locator('[role="tab"]:visible').evaluateAll((ts) => ts.map((t) => ({id: t.id, text: t.innerText.trim(), selected: t.getAttribute('aria-selected')})));
            const otherId = (tabs.find((t) => t.id && t.id !== 'access-button') || {}).id;
            await page.locator(`[id="${otherId}"]`).first().click();
            await idle(page);
            await sleep(600);
            const leaveTab = {tabs, pressed: otherId, dialogs: takeDialogs()};
            await page.locator('#access-button').first().click();
            await idle(page);
            const back = await readSelect(delayed());
            leaveTab.backOnAccess = {shown: back.shown, value: back.value, index: back.selectedIndex};
            await snap('g4-uz-access-unsaved-back', {sweep: false});
            await page.goto(ctxUrl(LOCALE, '/payments')).catch((e) => (leaveTab.gotoError = flat(String(e), 200)));
            await idle(page).catch(() => {});
            await sleep(600);
            leaveTab.leavePage = {dialogs: takeDialogs(), url: page.url().replace(app.baseURL, '')};
            fact('G uz unsaved change', leaveTab);
            fact('G uz stored after leaving', stored(['delayedOpenAccessDuration']));
        });

        // ================= H: Uzbek (Latin): "Subscription Policies" saved
        await part('H policies save uz', async () => {
            await openPayments(LOCALE);
            await showPayTab('subscriptionPolicies');
            await reminder(REMINDERS[0]).waitFor({state: 'visible', timeout: T});
            const form = policiesForm();
            await form.locator('[name="subscriptionName"]').fill('Subs Contact');
            await form.locator('[name="subscriptionEmail"]').fill(`${scratch}@mail.test`);
            await form.locator('[name="subscriptionMailingAddress"]').fill('1 Scratch Street');
            await reminder(REMINDERS[0]).selectOption({index: 2});
            await reminder(REMINDERS[1]).selectOption({index: 1});
            const before = await readReminders();
            fact('H uz chosen before save', Object.fromEntries(Object.entries(before).map(([k, v]) => [k, {shown: v.shown, value: v.value}])));
            const submit = form.locator('button[type="submit"], button.submitFormButton').filter({visible: true}).first();
            await loc(page, 'Subscription Policies: "Save"', submit);
            takeDialogs();
            const answered = page.waitForResponse((r) => /saveSubscriptionPolicies|save-subscription-policies/i.test(r.url()), {timeout: T}).catch(() => null);
            await submit.click();
            const r = await answered;
            let body = null;
            try {
                body = flat(await r.text(), 300);
            } catch {}
            await sleep(1200);
            await idle(page);
            const h1 = await snap('h1-uz-policies-saved');
            fact('H uz save', {status: r && r.status(), url: r && r.url().replace(app.baseURL, ''), body, notices: h1.notices, dialogs: takeDialogs()});
            const onPage = await readReminders().catch((e) => flat(String(e), 200));
            fact('H uz after save, same page', typeof onPage === 'string' ? onPage : Object.fromEntries(Object.entries(onPage).map(([k, v]) => [k, {shown: v.shown, value: v.value}])));
            fact('H uz stored', stored(REMINDERS));
            await openPayments(LOCALE);
            await showPayTab('subscriptionPolicies');
            const reloaded = await readReminders();
            fact('H uz after reload', Object.fromEntries(Object.entries(reloaded).map(([k, v]) => [k, {shown: v.shown, value: v.value}])));
            await snap('h2-uz-policies-reloaded');
            await openPayments('en');
            await showPayTab('subscriptionPolicies');
            const en = await readReminders();
            fact('H en read of the saved values', Object.fromEntries(Object.entries(en).map(([k, v]) => [k, {shown: v.shown, value: v.value}])));
            await signOut(page);
        });

        // ================= I: the Subscription Manager and the Site Administrator
        await part('I subscription manager uz', async () => {
            await signIn(page, sub, {contextPath: scratch});
            await openPayments('en');
            let switched = 'user menu';
            try {
                await switchLanguage(page, LOCALE);
            } catch (e) {
                switched = `address (${flat(String(e), 160)})`;
            }
            await openPayments(LOCALE);
            await showPayTab('subscriptionPolicies');
            const lists = await readReminders();
            fact('I subscription manager, uz reminder lists', {switched, lang: await lang(), lists: shortAll(lists)});
            const i1 = await snap('i1-uz-policies-subscription-manager');
            fact('I subscription manager placeholders', i1.placeholders);
            await signOut(page);
        });
        await part('I admin uz', async () => {
            await signIn(page, 'admin');
            await openAccess(LOCALE);
            await delayed().waitFor({state: 'visible', timeout: T});
            const list = await readSelect(delayed());
            fact('I admin, uz Delayed Open Access', {lang: await lang(), ...short(list)});
            await snap('i2-uz-access-admin');
            await signOut(page);
        });
    } finally {
        fact('dialogs left unread', takeDialogs());
        await close();
    }
});
