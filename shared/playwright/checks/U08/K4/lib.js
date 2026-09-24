// U08 claim check K4: readers for the editorial chrome (the editorial header, the
// journals switcher, the initials menu, the side menu) and small helpers k4.js uses.
const {screen, shot, record, idle, signIn, signOut} = require('../../../probe');

const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');

/** Save the kit's screen() and a PNG under `name`, with extra data merged in. */
async function snap(page, name, extra = {}, png = true) {
    const s = await screen(page).catch((e) => ({error: String(e)}));
    const header = await page.locator('header.app__header').ariaSnapshot({timeout: 3000}).catch(() => null);
    const nav = await page.locator('nav#app-nav').ariaSnapshot({timeout: 3000}).catch(() => null);
    record(name, {...s, aria2: {header, nav}, extra});
    if (png) await shot(page, name).catch(() => {});
    return s;
}

/** Sign in through the journal's own login page (or the site's), then settle. */
async function as(page, user, ctx) {
    if (!user) { await signOut(page).catch(() => {}); return; }
    await signIn(page, user, ctx ? {contextPath: ctx} : {});
    await idle(page).catch(() => {});
}

/** The editorial header as data. */
async function edHeader(page) {
    return page.evaluate(() => {
        const tc = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
        const h = document.querySelector('header.app__header');
        if (!h) return null;
        const sw = h.querySelector('.app__contexts');
        const title = h.querySelector('.app__contextTitle');
        const help = h.querySelector('a[target="_blank"]');
        const tasks = [...h.querySelectorAll('button')].find((b) => /Tasks|Tâches/.test(b.textContent));
        const user = h.querySelector('[data-cy="app-user-nav"] > button, [data-cy="app-user-nav"] button');
        const skip = [...h.querySelectorAll('button')].filter((b) => /^Skip|^Aller|^Passer/.test(b.textContent.trim())).map(tc);
        const order = [...h.querySelectorAll('.app__contexts, .app__contextTitle, a[target="_blank"], [data-cy="app-user-nav"]')].map((e) => (e.classList.contains('app__contexts') ? 'switcher' : e.classList.contains('app__contextTitle') ? 'title' : e.matches('a[target="_blank"]') ? 'help' : 'initials'));
        const bg = getComputedStyle(h).backgroundColor;
        return {
            text: h.innerText.replace(/\n+/g, ' | '),
            bg,
            order,
            switcher: sw ? {sr: tc(sw.querySelector('.-screenReader')), button: !!sw.querySelector('button')} : null,
            title: title ? {tag: title.tagName, text: tc(title), href: title.getAttribute('href')} : null,
            help: help ? {href: help.getAttribute('href'), target: help.getAttribute('target'), sr: tc(help.querySelector('.-screenReader')), aria: help.getAttribute('aria-label')} : null,
            tasks: tasks ? {text: tc(tasks), disabled: tasks.disabled} : null,
            initials: user ? {text: tc(user), expanded: user.getAttribute('aria-expanded')} : null,
            skip,
        };
    }).catch((e) => ({error: String(e)}));
}

/** The side menu (PrimeVue panelmenu) as data: panels top to bottom with their items. */
async function sideNav(page) {
    return page.evaluate(() => {
        const nav = document.querySelector('nav#app-nav') || document.querySelector('nav[aria-label="Site Navigation"]');
        if (!nav) return null;
        const selRe = /bg-selection-dark/;
        return [...nav.querySelectorAll('[data-pc-section="panel"]')].map((p) => {
            const h = p.querySelector('[data-pc-section="header"]');
            const a = h && h.querySelector('a');
            const region = p.querySelector(':scope > [data-pc-section="contentcontainer"]');
            const items = [...p.querySelectorAll('[role="treeitem"]')].map((li) => {
                const la = li.querySelector('a');
                const input = li.querySelector('input');
                return {label: li.getAttribute('aria-label'), href: la ? la.getAttribute('href') : null, input: input ? input.getAttribute('placeholder') : null, sel: la ? selRe.test(la.className) : false};
            });
            return {
                label: h ? h.getAttribute('aria-label') : null,
                href: a ? a.getAttribute('href') : null,
                expanded: h ? h.getAttribute('aria-expanded') : null,
                sel: a ? selRe.test(a.className) : false,
                open: region ? getComputedStyle(region).display !== 'none' : null,
                items,
            };
        });
    }).catch((e) => ({error: String(e)}));
}

/** One line per panel: "Label › item, item" (the dashboard views collapsed). */
function navLine(nav) {
    if (!nav) return null;
    if (nav.error) return nav;
    return nav.map((p) => {
        let items = p.items.map((i) => i.label + (i.sel ? '*' : ''));
        if (/Editor Dashboard|Tableau de bord/.test(p.label || '') && items.length > 3) items = [items[0], `…${items.length - 1} views`];
        return `${p.label}${p.sel ? '*' : ''}${p.open ? '(open)' : ''}${items.length ? ' › ' + items.join(', ') : ''}`;
    });
}

/** Open the journals switcher; return its entries. Leaves it open. */
async function openSwitcher(page) {
    const sw = page.locator('header.app__header .app__contexts');
    if (!(await sw.count())) return {present: false};
    const btn = sw.locator('button').first();
    const name = await btn.evaluate((b) => b.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
    await btn.click();
    await sleep(500);
    const entries = await sw.locator('a').evaluateAll((as) => as.filter((a) => a.offsetParent !== null).map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')}))).catch(() => []);
    const all = await sw.locator('a').evaluateAll((as) => as.map((a) => a.textContent.replace(/\s+/g, ' ').trim())).catch(() => []);
    const expanded = await btn.getAttribute('aria-expanded').catch(() => null);
    return {present: true, name, expanded, entries, allInDom: all.length};
}

/** Open the initials menu; return its entries (text, href, sections). Leaves it open. */
async function openInitials(page) {
    const btn = page.locator('[data-cy="app-user-nav"] button').first();
    if (!(await btn.count())) return {present: false};
    const name = await btn.evaluate((b) => b.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
    await btn.click();
    await sleep(500);
    const menu = page.locator('[data-cy="app-user-nav"] nav, nav[aria-label="User Navigation"]').first();
    const info = await menu.evaluate((n) => ({
        label: n.getAttribute('aria-label'),
        text: n.innerText.replace(/\n+/g, ' | '),
        links: [...n.querySelectorAll('a')].map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), ticked: !!a.querySelector('svg')})),
    })).catch((e) => ({error: String(e).slice(0, 200)}));
    return {present: true, name, ...info};
}

/** The public header's user menu as data. */
async function publicUser(page) {
    return page.evaluate(() => {
        const tc = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
        const ul = document.getElementById('navigationUser');
        if (!ul) return null;
        return [...ul.children].map((li) => {
            const a = li.querySelector(':scope > a');
            const sub = li.querySelector(':scope > ul');
            return {text: tc(a), children: sub ? [...sub.querySelectorAll(':scope > li > a')].map((c) => `${tc(c)}>${c.getAttribute('href')}`) : null};
        });
    }).catch(() => null);
}

/** Classify the page an address lands on. */
async function classify(page, resp) {
    const body = flat(await page.locator('body').innerText().catch(() => ''), 4000);
    return {
        status: resp ? resp.status() : null,
        url: rel(page.url()),
        title: await page.title().catch(() => null),
        denied: /does not have access to this operation|not have access|Access denied|n'a pas accès/i.test(body),
        login: /\/login/.test(page.url()),
        bodyStart: body.slice(0, 300),
    };
}

async function go(page, url) {
    let resp = null;
    try { resp = await page.goto(url, {timeout: 45_000}); } catch (e) { return {error: String(e.message || e).slice(0, 200)}; }
    await idle(page).catch(() => {});
    return resp;
}

module.exports = {T, sleep, flat, rel, snap, as, edHeader, sideNav, navLine, openSwitcher, openInitials, publicUser, classify, go, signOut};
