// U07 drift sweep 2026-10-26, chunk SW3, PART=read: the read-only scenarios on the seeded context
// `publicknowledge` with roster accounts (scenarios 1, 2 and 12, footnote y) and the register reads that
// need no scratch data: A6 (history heading), A7 (side tab reload), A9 (For Readers' privacy link),
// OMP1 (Settings › Press heading), OMP2 (the site's software page), OPS4 and A12 (French headings and the
// French Masthead tab). Changes nothing (a reload and a French address only). Entry: sw3.js PART=read.
const {forEachApp, launch, signIn, signOut, loc, note, idle, rawKeys} = require('../../../probe');
const C = require('./common.js');
const {sleep, T, flat, namer, readPublic, readList, brief, go, settingsGroup, readSettings, mceGet, waitMce} = C;
const {record, snap} = namer('rd');

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const PK = app.contextPath;
    const cu = (p = '') => app.url(`/index.php/${PK}${p}`);
    const PAGES = ['about', 'masthead', 'history', 'contact', 'privacy', 'software'];
    const PATH = {about: '/about', masthead: '/about/editorialMasthead', history: '/about/editorialHistory', contact: '/about/contact', privacy: '/about/privacy', software: '/about/aboutThisPublishingSystem'};
    const SETTINGS = [['Journal', 'context'], ['Website', 'website'], ['Workflow', 'workflow'], ['Distribution', 'distribution'], ['Users & Roles', 'access']];
    const ctxEntry = isOjs ? 'Journal' : isOmp ? 'Press' : 'Server';
    const F = {app: app.name, errors: []};
    const phases = (process.env.PHASES || 's1,s2,s12,a7,a9,omp2,french').split(',');
    const step = async (name, fn) => {
        if (!phases.includes(name)) return;
        console.log(`[sw3 read ${app.name}] ${name}`);
        try { await fn(); } catch (e) { F.errors.push({step: name, error: String(e.stack || e).slice(0, 800)}); console.log(`[sw3 read ${app.name}] ERROR ${name}`, String(e.message || e).slice(0, 300)); }
    };
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const aboutToggle = () => page.locator('#navigationPrimary > li > a[data-toggle="dropdown"]').filter({hasText: /^\s*About\s*$/});
    const chooseAbout = async (label) => {
        const t = aboutToggle();
        await t.waitFor({timeout: T});
        const items = t.locator('xpath=following-sibling::ul[1]').locator('> li > a');
        if (!(await items.first().isVisible())) await t.click();
        await items.filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}).first().click();
        await page.waitForLoadState('load'); await idle(page);
    };
    try {
        // ── Scenario 1: a visitor reads the seeded About pages ────────────────
        await step('s1', async () => {
            const o = F.s1 = {};
            await signOut(page).catch(() => {});
            o.home = (await go(page, cu())), o.homeRead = await readPublic(page);
            await snap(page, 's1-01-home');
            const aboutLabel = isOjs ? 'About the Journal' : isOmp ? 'About the Press' : 'About the Server';
            await chooseAbout(aboutLabel);
            o.about = {url: page.url(), ...(await readPublic(page))};
            await snap(page, 's1-02-about');
            await chooseAbout('Editorial Masthead');
            o.masthead = {url: page.url(), ...(await readList(page)), pub: await readPublic(page)};
            await snap(page, 's1-03-masthead');
            await loc(page, 'Editorial Masthead: the "Editorial History" link of "View Editorial History"', page.locator('.page_masthead > p a'));
            await page.locator('.page_masthead > p a').filter({hasText: 'Editorial History'}).first().click();
            await page.waitForLoadState('load'); await idle(page);
            o.history = {url: page.url(), ...(await readList(page)), pub: await readPublic(page)};
            await snap(page, 's1-04-history');
            await chooseAbout('Contact');
            o.contact = {url: page.url(), ...(await readPublic(page))};
            o.contactBlocks = await page.evaluate(() => [...document.querySelectorAll('.page_contact .contact')].map((b) => ({cls: b.className, h2: b.querySelector('h2') && b.querySelector('h2').innerText.trim(), name: b.querySelector('.name') && b.querySelector('.name').innerText.trim(), mail: [...b.querySelectorAll('a[href^="mailto:"]')].map((a) => [a.innerText.trim(), a.getAttribute('href')])})));
            await snap(page, 's1-05-contact');
            await chooseAbout('Privacy Statement');
            o.privacy = {url: page.url(), ...(await readPublic(page))};
            await snap(page, 's1-06-privacy');
            const logo = page.locator('.pkp_brand_footer a').filter({has: page.locator('img')}).last();
            o.logo = {href: await logo.getAttribute('href').catch(() => null), alt: await logo.locator('img').getAttribute('alt').catch(() => null)};
            await logo.click(); await page.waitForLoadState('load'); await idle(page);
            o.software = {url: page.url(), ...(await readPublic(page))};
            o.softwareLinks = await page.locator('.pkp_structure_main .page a').evaluateAll((as) => as.map((a) => ({t: a.innerText.trim(), h: a.getAttribute('href'), target: a.getAttribute('target')})));
            o.softwareParagraphs = await page.locator('.pkp_structure_main .page p').allInnerTexts().catch(() => []);
            await snap(page, 's1-07-software');
            const contactLink = page.locator('.pkp_structure_main .page a').filter({hasText: /^contact the (journal|press|server)$/});
            o.contactLinkCount = await contactLink.count();
            if (o.contactLinkCount) { await contactLink.first().click(); await page.waitForLoadState('load'); await idle(page); o.afterContactLink = {url: page.url(), h1: (await readPublic(page)).h1}; await snap(page, 's1-08-after-contact-link'); }
            // control: the Reader
            await signIn(page, 'reader.rosa', {contextPath: PK});
            o.reader = {};
            for (const k of PAGES) {
                const g = await go(page, cu(PATH[k]));
                const r = await readPublic(page);
                o.reader[k] = {status: g.status, h1: r.h1, crumbs: r.crumbs, bodyText: r.bodyText, edit: r.edit};
                await snap(page, `s1-09-reader-${k}`);
            }
            await signOut(page);
        });

        // ── Scenario 2: who opens the Settings pages and sees "Edit" ────────────
        await step('s2', async () => {
            const o = F.s2 = {};
            await signIn(page, 'manager.maya', {contextPath: PK});
            await go(page, cu('/submissions'));
            o.mgrMenu = await settingsGroup(page);
            await snap(page, 's2-01-mgr-landing');
            o.mgrPages = {};
            for (const [entry] of SETTINGS) {
                const label = entry === 'Journal' ? ctxEntry : entry;
                const nav = page.getByRole('navigation', {name: 'Site Navigation'});
                const header = nav.locator('[role="button"][aria-label="Settings"]').first();
                if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
                const region = page.locator(`[id="${await header.getAttribute('aria-controls')}"]`);
                await region.getByRole('link', {name: label, exact: true}).click();
                await page.waitForLoadState('load'); await idle(page); await sleep(500);
                o.mgrPages[label] = await readSettings(page);
                await snap(page, `s2-02-mgr-${label.replace(/\W+/g, '')}`);
            }
            o.mgrEdits = {};
            for (const k of ['about', 'history', 'contact', 'masthead', 'privacy']) {
                await go(page, cu(PATH[k]));
                const link = page.locator('.pkp_structure_main a.cmp_edit_link');
                const e = {count: await link.count()};
                if (e.count) {
                    e.accessibleName = await link.first().evaluate((a) => a.textContent.replace(/\s+/g, ' ').trim());
                    e.sr = await link.first().locator('.pkp_screen_reader').innerText().catch(() => null);
                    e.target = await link.first().getAttribute('target');
                    e.href = await link.first().getAttribute('href');
                    e.underHeading = await link.first().evaluate((a) => { const h = document.querySelector('.pkp_structure_main h1'); return !!h && !!(h.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING); });
                    await snap(page, `s2-03-mgr-${k}-page`);
                    const pages = page.context().pages().length;
                    await link.first().click(); await page.waitForLoadState('load'); await idle(page); await sleep(1500);
                    e.newWindow = page.context().pages().length > pages;
                    e.landed = await readSettings(page);
                    await snap(page, `s2-04-mgr-${k}-edit-landed`);
                }
                o.mgrEdits[k] = e;
            }
            await loc(page, 'About page "Edit" link (manager)', page.locator('.pkp_structure_main a.cmp_edit_link'));
            // every other role
            const others = ['sectioneditor.ana', 'assistant.rita', 'author.alex', ...(isOps ? [] : ['reviewer.julia']), 'reader.rosa'];
            o.others = {};
            for (const u of others) {
                const r = {};
                await signIn(page, u, {contextPath: PK});
                r.landing = await go(page, cu('/submissions'));
                r.menu = await settingsGroup(page);
                await snap(page, `s2-05-${u}-landing`);
                r.pages = {};
                for (const [entry, slug] of SETTINGS) {
                    const g = await go(page, cu(`/management/settings/${slug}`));
                    const s = await readSettings(page);
                    r.pages[entry] = {status: g.status, url: s.url, denied: s.denied, tabs: s.tabs.length, title: s.title};
                    if (entry === 'Journal') await snap(page, `s2-06-${u}-settings-context`);
                }
                r.edits = {};
                for (const k of ['about', 'history', 'contact']) {
                    await go(page, cu(PATH[k]));
                    r.edits[k] = await page.locator('.pkp_structure_main a.cmp_edit_link').count();
                }
                o.others[u] = r;
            }
            await signOut(page);
            o.signedOut = {};
            for (const [entry, slug] of SETTINGS) {
                const g = await go(page, cu(`/management/settings/${slug}`));
                const s = await readSettings(page);
                o.signedOut[entry] = {status: g.status, url: s.url, login: s.login};
                if (entry === 'Journal') await snap(page, 's2-07-signedout-context');
            }
        });

        // ── Scenario 12 (OPS; OJS and OMP the control) ───────────────────────────
        await step('s12', async () => {
            const o = F.s12 = {};
            await signIn(page, 'manager.maya', {contextPath: PK});
            await go(page, cu('/management/settings/website'));
            await page.locator('#setup-button').click(); await idle(page); await sleep(600);
            o.setupSideTabs = await page.locator('#setup [role="tab"]').allInnerTexts().then((a) => a.map((x) => flat(x)));
            await snap(page, 's12-01-website-setup');
            const priv = page.locator('#setup').getByRole('tab', {name: 'Privacy Statement', exact: true});
            if (await priv.count()) {
                await priv.click(); await idle(page); await sleep(800);
                o.privacyBox = await page.locator('[id^="privacy-privacyStatement-control"]').count();
                await waitMce(page, 'privacy-privacyStatement-control-en').catch(() => {});
                o.privacyBoxVisible = await page.locator('#privacy-privacyStatement-control-en_ifr, [id^="privacy-privacyStatement-control"]').first().isVisible().catch(() => null);
                await snap(page, 's12-02-privacy-sidetab');
            }
            await page.locator('#appearance-button').click(); await idle(page);
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(600);
            o.sidebar = await page.locator('#appearance input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap(page, 's12-03-appearance-setup');
            await signOut(page);
            o.info = {};
            for (const w of ['readers', 'authors', 'librarians']) {
                const g = await go(page, cu(`/information/${w}`));
                o.info[w] = {status: g.status, h1: (await readPublic(page)).h1};
                await snap(page, `s12-04-info-${w}`);
            }
            await go(page, cu());
            await chooseAbout('Editorial Masthead');
            o.masthead = await readList(page);
            await snap(page, 's12-05-masthead');
            await chooseAbout('Contact');
            o.contact = {url: page.url(), h1: (await readPublic(page)).h1};
            await snap(page, 's12-06-contact');
        });

        // ── A7: a side tab reloaded (and a top tab, the control) ───────────────
        await step('a7', async () => {
            const o = F.a7 = {};
            const hashWait = async () => { for (let i = 0; i < 20; i++) { const h = await page.evaluate(() => location.hash); if (h) return h; await sleep(200); } return ''; };
            const tabsNow = async () => page.evaluate(() => [...document.querySelectorAll('main [role="tab"][aria-selected="true"]')].filter((t) => t.offsetParent !== null).map((t) => t.innerText.trim()));
            const trial = async (who, ctxPath, slug, top, side, name) => {
                await go(page, ctxPath ? app.url(`/index.php/${ctxPath}/management/settings/${slug}`) : app.url(`/index.php/index/admin/settings`));
                await page.locator(`#${top}-button`).first().click(); await idle(page); await sleep(500);
                const sideTabs = await page.locator(`#${top}`).first().locator('[role="tab"]').allInnerTexts().catch(() => []);
                if (side === '@last') side = flat(sideTabs[sideTabs.length - 1] || '');
                if (side) { await page.locator(`#${top}`).first().getByRole('tab', {name: side, exact: true}).first().click(); await idle(page); }
                const hash = await hashWait();
                await sleep(800);
                const before = await tabsNow();
                await snap(page, `a7-${name}-before`);
                await page.reload(); await idle(page); await sleep(1500);
                const after = await tabsNow();
                await snap(page, `a7-${name}-after-reload`);
                return {who, slug, top, side, sideTabs: sideTabs.map((x) => flat(x)), hash, before, after, kept: JSON.stringify(before) === JSON.stringify(after)};
            };
            await signIn(page, 'manager.maya', {contextPath: PK});
            o.privacy = await trial('manager.maya', PK, 'website', 'setup', 'Privacy Statement', 'web-setup-privacy');
            o.contactTop = await trial('manager.maya', PK, 'context', 'contact', null, 'context-contact');
            o.advanced = await trial('manager.maya', PK, 'website', 'appearance', 'Advanced', 'web-appearance-advanced');
            if (!isOps) o.workflowReview = await trial('manager.maya', PK, 'workflow', 'review', 'Reviewer Guidance', 'workflow-review');
            await signIn(page, 'admin');
            o.siteAppearance = await trial('admin', null, null, 'appearance', '@last', 'site-appearance-last');
            o.siteSetupLast = await trial('admin', null, null, 'setup', '@last', 'site-setup-last');
            await signOut(page);
        });

        // ── A9: the default "For Readers" text's "Privacy Statement" link ──────
        await step('a9', async () => {
            const o = F.a9 = {};
            await signOut(page).catch(() => {});
            const g = await go(page, cu('/information/readers'));
            o.readers = {status: g.status, ...(await readPublic(page))};
            await snap(page, 'a9-01-readers');
            if (isOps) return;
            const link = page.locator('.pkp_structure_main .page a').filter({hasText: /^Privacy Statement$/});
            o.links = await page.locator('.pkp_structure_main .page a').evaluateAll((as) => as.map((a) => [a.innerText.trim(), a.getAttribute('href')]));
            if (await link.count()) {
                await link.first().click(); await page.waitForLoadState('load'); await idle(page);
                o.after = {url: page.url(), h1: (await readPublic(page)).h1, scrolledTo: await page.evaluate(() => location.hash)};
                await snap(page, 'a9-02-after-privacy-link');
            }
            // the About menu's own item, the control
            await go(page, cu());
            await chooseAbout('Privacy Statement');
            o.menuPrivacy = {url: page.url(), h1: (await readPublic(page)).h1};
            // the registration form's own privacy link (A9: "the registration form open[s]" the page)
            await go(page, cu('/user/register'));
            const regLink = page.locator('form#register a, .pkp_structure_main form a').filter({hasText: /privacy statement/i}).first();
            o.registerLink = {count: await page.locator('form#register a, .pkp_structure_main form a').filter({hasText: /privacy statement/i}).count(), text: await regLink.innerText().catch(() => null), href: await regLink.getAttribute('href').catch(() => null), target: await regLink.getAttribute('target').catch(() => null)};
            await snap(page, 'a9-03-register');
            if (o.registerLink.count) {
                const pages0 = page.context().pages().length;
                const [popup] = await Promise.all([page.context().waitForEvent('page', {timeout: 5000}).catch(() => null), regLink.click()]);
                const tgt = popup || page;
                await tgt.waitForLoadState('load').catch(() => {}); await sleep(800);
                o.registerLinkOpened = {newTab: !!popup || page.context().pages().length > pages0, url: tgt.url(), h1: await tgt.locator('h1').allInnerTexts().catch(() => [])};
                if (popup) await popup.close().catch(() => {});
            }
        });

        // ── OMP2: the site's page about the software (two or more contexts on the fleet) ──
        await step('omp2', async () => {
            const o = F.omp2 = {};
            await signOut(page).catch(() => {});
            const g = await go(page, app.url('/index.php/index'));
            o.siteHome = {status: g.status, url: page.url(), contexts: await page.locator('.page_index_site h3 a').count(), h1: (await readPublic(page)).h1};
            await snap(page, 'omp2-01-site-home');
            const logo = page.locator('.pkp_brand_footer a').filter({has: page.locator('img')}).last();
            o.logoHref = await logo.getAttribute('href').catch(() => null);
            if (await logo.count()) { await logo.click(); await page.waitForLoadState('load'); await idle(page); }
            o.software = {url: page.url(), ...(await readPublic(page))};
            o.paragraphs = await page.locator('.pkp_structure_main .page p').allInnerTexts().catch(() => []);
            o.links = await page.locator('.pkp_structure_main .page a').evaluateAll((as) => as.map((a) => [a.innerText.trim(), a.getAttribute('href')]));
            await snap(page, 'omp2-02-site-software');
        });

        // ── OPS4, A12: French headings (signed out) and the French Masthead tab (manager.maya) ──
        await step('french', async () => {
            const o = F.french = {};
            await signOut(page).catch(() => {});
            const g = await go(page, cu('/fr_CA/about/editorialMasthead'));
            o.masthead = {status: g.status, ...(await readList(page)), raw: await rawKeys(page).catch((e) => String(e))};
            await snap(page, 'fr-01-masthead');
            const g2 = await go(page, cu('/en/about/editorialMasthead'));
            o.mastheadEn = {status: g2.status, headings: (await readList(page)).sections.map((s) => s.heading)};
            await signIn(page, 'manager.maya', {contextPath: PK});
            await go(page, cu('/fr_CA/management/settings/website'));
            await page.locator('#appearance-button').click(); await idle(page);
            await page.locator('#appearance-masthead-button').click().catch(() => {}); await idle(page); await sleep(800);
            o.order = {text: flat(await page.locator('[id="appearance-masthead"] form').first().innerText().catch(() => ''), 1500), raw: await rawKeys(page).catch((e) => String(e))};
            await snap(page, 'fr-02-appearance-masthead');
            await go(page, cu('/fr_CA/management/settings/context'));
            await sleep(800);
            o.contextTab = {h1: (await readSettings(page)).h1, tabs: (await readSettings(page)).tabs, raw: await rawKeys(page).catch((e) => String(e))};
            await snap(page, 'fr-03-settings-context');
            // the users list in French (OPS4's cross-reference: the same key)
            await go(page, cu('/fr_CA/management/settings/access')); await sleep(1500);
            o.usersRaw = (await rawKeys(page).catch(() => [])).filter((r) => /groups\.name/.test(r));
            await snap(page, 'fr-04-users-list');
            await go(page, cu('/en/submissions'));
            await signOut(page);
        });
    } finally {
        F.dialogs = dialogs;
        record('facts', F, {merge: true});
        await close();
    }
});
