// U07 drift sweep 2026-10-26, chunk SW3: helpers shared by read.js, tabs.js, team.js (not an entry script;
// see sw3.js). Records, never asserts: every helper returns data and the parts write it through the kit.
const {screen, shot: shot0, record: rec0, idle} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;
const flat = (s, n = 4000) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const words = (html) => flat(String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'").replace(/&amp;/g, '&'));
const THIS_YEAR = new Date().getUTCFullYear();
const LAST_YEAR = THIS_YEAR - 1;
const today = () => new Date().toISOString().slice(0, 10);

/** Per-part naming: record/shot with a prefix, and snap = screen() + record + shot. */
function namer(prefix) {
    const record = (n, d, o) => rec0(`${prefix}-${n}`, d, o);
    const shot = (p, n) => shot0(p, `${prefix}-${n}`).catch(() => null);
    async function snap(page, name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message || e).slice(0, 300)}; }
        Object.assign(s, extra);
        record(name, s);
        await shot(page, name);
        return s;
    }
    return {record, shot, snap};
}

/** A public page (frontend) as data. */
async function readPublic(page) {
    return page.evaluate(() => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main') || document.body;
        const pg = main.querySelector('.page') || main;
        const clone = pg.cloneNode(true);
        clone.querySelectorAll('nav.cmp_breadcrumbs, script').forEach((n) => n.remove());
        const aboutToggle = [...document.querySelectorAll('#navigationPrimary > li > a[data-toggle="dropdown"]')].find((a) => /About/.test(a.textContent));
        const aboutItems = aboutToggle ? [...aboutToggle.parentElement.querySelectorAll(':scope > ul > li > a')].map((a) => ({t: txt(a) || a.textContent.trim(), h: a.getAttribute('href')})) : null;
        const crumbs = [...document.querySelectorAll('nav.cmp_breadcrumbs li')].map((li) => { const c = li.cloneNode(true); c.querySelectorAll('.separator').forEach((s) => s.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
        const edit = [...main.querySelectorAll('a.cmp_edit_link')].map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), target: a.getAttribute('target')}));
        const blocks = [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((b) => ({cls: b.className, heading: txt(b.querySelector('h2,h3,.title')), links: [...b.querySelectorAll('a')].map((a) => [txt(a), a.getAttribute('href')])}));
        return {
            title: document.title,
            h1: [...document.querySelectorAll('h1')].map(txt),
            crumbs,
            bodyText: clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 3000),
            edit,
            aboutItems,
            siteName: txt(document.querySelector('.pkp_site_name')),
            blocks,
            footerLogo: (() => { const a = [...document.querySelectorAll('.pkp_brand_footer a')].find((x) => x.querySelector('img')); return a ? {href: a.getAttribute('href'), alt: a.querySelector('img').getAttribute('alt')} : null; })(),
            loginForm: !!document.querySelector('form#login, form.cmp_form.login'),
            denied: /The current role does not have access to this operation\./.test(document.body.innerText),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** The masthead / history page as data (.page_masthead). */
async function readList(page) {
    return page.evaluate(() => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const root = document.querySelector('.page_masthead') || document.querySelector('.pkp_structure_main') || document.body;
        const out = {h1: [...root.querySelectorAll('h1')].map(txt), title: document.title};
        out.sequence = [...root.children].map((e) => ({tag: e.tagName, text: txt(e).slice(0, 200)}));
        out.sections = [];
        let cur = null;
        for (const e of root.children) {
            if (e.tagName === 'H2') { cur = {heading: txt(e), afterHr: !!(e.previousElementSibling && [...root.children].slice(0, [...root.children].indexOf(e)).some((x) => x.tagName === 'HR')), items: []}; out.sections.push(cur); }
            if (e.tagName === 'UL' && cur) {
                for (const li of e.querySelectorAll(':scope > li')) {
                    const a = li.querySelector('.orcid a');
                    const nm = li.querySelector('.name');
                    let name = null;
                    if (nm) { const c = nm.cloneNode(true); c.querySelectorAll('.orcid').forEach((o) => o.remove()); name = c.textContent.replace(/\s+/g, ' ').trim(); }
                    cur.items.push({
                        text: txt(li), date: txt(li.querySelector('.date_start')), name,
                        affiliation: txt(li.querySelector('.affiliation')),
                        orcid: a ? {href: a.getAttribute('href'), target: a.getAttribute('target')} : null,
                        imgs: li.querySelectorAll('img').length, mailto: li.querySelectorAll('a[href^="mailto:"]').length, at: /@/.test(li.innerText),
                    });
                }
            }
        }
        out.paragraphs = [...root.querySelectorAll(':scope > p')].map((p) => ({text: txt(p), links: [...p.querySelectorAll('a')].map((a) => ({text: txt(a), href: a.getAttribute('href')}))}));
        out.hr = root.querySelectorAll(':scope > hr').length;
        out.afterHr = (() => { const kids = [...root.children]; const i = kids.findIndex((k) => k.tagName === 'HR'); return i < 0 ? null : kids.slice(i + 1).map((k) => k.tagName + ':' + txt(k).slice(0, 120)); })();
        out.edit = [...root.querySelectorAll('a.cmp_edit_link')].length;
        out.crumbs = [...document.querySelectorAll('nav.cmp_breadcrumbs li')].map((li) => { const c = li.cloneNode(true); c.querySelectorAll('.separator').forEach((s) => s.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
        out.pageText = txt(root).slice(0, 3000);
        return out;
    }).catch((e) => ({error: String(e.message || e)}));
}

/** "heading: a | b" lines of a readList() result. */
function brief(d) {
    if (!d || !d.sections) return d;
    return d.sections.map((s) => `${s.heading}${s.afterHr ? ' [after rule]' : ''}: ${s.items.map((i) => i.text).join(' | ')}`);
}

/** Open an address; status + url, settled. */
async function go(page, url) {
    let resp = null;
    try { resp = await page.goto(url); } catch (e) { return {error: String(e.message || e).slice(0, 300)}; }
    await idle(page).catch(() => {});
    return {status: resp ? resp.status() : null, url: page.url()};
}

/** The back-office side menu's "Settings" group (entries read from the DOM, open or closed). */
async function settingsGroup(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count())) return {nav: false};
    await nav.first().waitFor({timeout: T}).catch(() => {});
    const header = nav.locator('[role="button"][aria-label="Settings"]');
    if (!(await header.count())) return {nav: true, settings: null, topLevel: await nav.locator('[role="button"][aria-label], [role="treeitem"]').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim()).slice(0, 40)).catch(() => [])};
    const items = await header.first().evaluate((h) => {
        const region = document.getElementById(h.getAttribute('aria-controls') || '');
        return region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => (li.getAttribute('aria-label') || li.textContent).replace(/\s+/g, ' ').trim()) : [];
    });
    return {nav: true, settings: items};
}

/** A back-office Settings page as data: heading, title, tabs, notices above the tabs, denied. */
async function readSettings(page) {
    return page.evaluate(() => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('main') || document.body;
        const tablist = main.querySelector('[role="tablist"]');
        const tabs = tablist ? [...tablist.querySelectorAll(':scope > [role="tab"], [role="tab"]')].filter((t) => t.closest('[role="tablist"]') === tablist).map((t) => ({name: txt(t), selected: t.getAttribute('aria-selected') === 'true'})) : [];
        const visibleSide = [...main.querySelectorAll('[role="tab"]')].filter((t) => t.offsetParent !== null && t.closest('[role="tablist"]') !== tablist).map((t) => ({name: txt(t), selected: t.getAttribute('aria-selected') === 'true'}));
        let above = null;
        if (tablist) {
            const all = [...main.querySelectorAll('.pkpNotification, [role="alert"], .notification, p, div')];
            above = all.filter((n) => /not accepting submissions/.test(n.textContent) && n.children.length < 4 && (n.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING)).map(txt).slice(0, 3);
        }
        return {
            url: location.href, title: document.title, h1: txt(main.querySelector('h1')), tabs, sideTabs: visibleSide,
            notAccepting: /is not accepting submissions at this time/.test(main.innerText), noticeAboveTabs: above,
            noticeText: (main.innerText.match(/This (journal|press|server) is not accepting submissions at this time\.[^\n]*/) || [null])[0],
            denied: /The current role does not have access to this operation\./.test(document.body.innerText),
            login: !!document.querySelector('form#login, form.cmp_form.login'),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** Vue form state: errors under fields, footer summary, Save disabled, go-to buttons. */
async function readForm(form) {
    return form.evaluate((f) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const fields = [...f.querySelectorAll('.pkpFormField')].map((fld) => ({label: txt(fld.querySelector('.pkpFormFieldLabel, legend')), error: txt(fld.querySelector('.pkpFieldError'))})).filter((x) => x.error);
        const save = [...f.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save');
        return {
            fieldErrors: fields,
            summary: txt(f.querySelector('.pkpFormErrors')),
            goTo: [...f.querySelectorAll('.pkpFormErrors ul button')].map((b) => (b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim()),
            jump: [...f.querySelectorAll('button')].some((b) => /Jump to next error/.test(b.textContent)),
            saveDisabled: save ? save.disabled || save.getAttribute('aria-disabled') === 'true' : null,
            status: txt(f.querySelector('.pkpFormPage__status')),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** Press a Vue form's Save; waits for the context API request if one goes; returns status + form state. */
async function pressSave(page, form, {expectRequest = true} = {}) {
    const reqs = [];
    const onReq = (r) => { if (/\/api\/v1\/(contexts|site)/.test(r.url()) && r.method() !== 'GET') reqs.push(r.url()); };
    page.on('request', onReq);
    const w = expectRequest ? page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10_000}).catch(() => null) : Promise.resolve(null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    await sleep(600);
    page.off('request', onReq);
    const toasts = await page.locator('.app__notifications .pkpNotification, .pkpNotification').allInnerTexts().catch(() => []);
    const state = await readForm(form);
    return {...state, formStatus: state.status, status: resp ? resp.status() : null, requests: reqs.length, toasts: toasts.map((t) => flat(t, 300))};
}

async function waitMce(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
}
async function mceGet(page, id) {
    return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
}
/** Type into a rich-text box as a user does: select all, delete, type. */
async function mceSet(page, id, text) {
    await waitMce(page, id);
    const body = page.frameLocator(`#${id}_ifr`).locator('body');
    await body.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
    await sleep(400);
    return mceGet(page, id);
}

module.exports = {sleep, T, flat, words, THIS_YEAR, LAST_YEAR, today, namer, readPublic, readList, brief, go, settingsGroup, readSettings, readForm, pressSave, waitMce, mceGet, mceSet};
