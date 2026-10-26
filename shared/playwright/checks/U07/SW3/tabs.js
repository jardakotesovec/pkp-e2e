// U07 drift sweep 2026-10-26, chunk SW3, PART=tabs: scenarios 3, 4, 5, 6 (OJS OMP), 10 as each scenario
// says, each on a scratch context of its own (footnote y recipes), plus register A3 (scenario 4's first
// save), A8 (scenario 10's open page after the untick), A9 on a new context (scenario 6's context before its
// edit), A11 (Hosted Journals "Edit" and "Create Journal" with no country), OPS2 (the sponsoring
// organization, OPS; OJS OMP the control) and OPS3 (French ticked under "Forms"; OJS OMP the control).
// Entry: sw3.js PART=tabs. Phases (PHASES=a,b): s3 (with OPS2) s4 s5 s6 s10 a11 (with A3 on the created journal)
// ops3. Seeds per phase, tag hksw3t*.
const path = require('path');
const {forEachApp, launch, signIn, signOut, loc, note, idle, tag, rawKeys} = require('../../../probe');
const C = require('./common.js');
const {sleep, T, flat, words, namer, readPublic, readList, go, readSettings, readForm, pressSave, waitMce, mceGet, mceSet} = C;
const {record, snap} = namer('tb');
const REPO = path.resolve(__dirname, '../../../../..');

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const F = {app: app.name, errors: []};
    const phases = (process.env.PHASES || 's3,s4,s5,s6,s10,a11,ops3').split(',');
    const step = async (name, fn) => {
        if (!phases.includes(name)) return;
        if (name === 's6' && isOps) return;
        console.log(`[sw3 tabs ${app.name}] ${name}`);
        try { await fn(); } catch (e) { F.errors.push({step: name, error: String(e.stack || e).slice(0, 900)}); console.log(`[sw3 tabs ${app.name}] ERROR ${name}`, String(e.message || e).slice(0, 300)); await snap(page, `err-${name}`).catch(() => {}); }
    };
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const mgrOf = (t) => `${t}mg`;
    const newCtx = async (t, extra = {}, users = []) => app.api.createContext({tag: t, users: [{username: mgrOf(t), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, ...users], ...extra});
    const formOf = (sel) => page.locator('form').filter({has: page.locator(sel)}).first();
    const openContextTab = async (ctx, tab) => {
        await go(page, cu(ctx, `/management/settings/context#${tab}`));
        await page.locator(`#${tab}-button`).click().catch(() => {});
        await idle(page); await sleep(800);
    };
    const aboutMenu = async () => {
        const t = page.locator('#navigationPrimary > li > a[data-toggle="dropdown"]').filter({hasText: /^\s*About\s*$/});
        if (!(await t.count())) return null;
        const items = t.locator('xpath=following-sibling::ul[1]').locator('> li > a');
        return items.evaluateAll((as) => as.map((a) => a.textContent.trim()));
    };
    const chooseAbout = async (label) => {
        const t = page.locator('#navigationPrimary > li > a[data-toggle="dropdown"]').filter({hasText: /^\s*About\s*$/});
        const items = t.locator('xpath=following-sibling::ul[1]').locator('> li > a');
        if (!(await items.first().isVisible())) await t.click();
        await items.filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}).first().click();
        await page.waitForLoadState('load'); await idle(page);
    };

    try {
        // ── Scenario 3: save the "Masthead" tab ────────────────────────────────
        await step('s3', async () => {
            const o = F.s3 = {};
            const t = tag('hksw3ta');
            await newCtx(t);
            o.tag = t;
            await signOut(page).catch(() => {});
            await go(page, cu(t, '/about'));
            o.before = await readPublic(page);
            await snap(page, 's3-01-about-before');
            await signIn(page, mgrOf(t), {contextPath: t});
            await openContextTab(t, 'masthead');
            const f = formOf('[id^="masthead-name-control"]');
            await f.waitFor({timeout: T});
            o.labels = await f.locator('.pkpFormFieldLabel, legend').allInnerTexts().then((a) => a.map((x) => flat(x, 80)));
            o.initial = {name: await page.locator('#masthead-name-control-en').inputValue(), acronym: await page.locator('#masthead-acronym-control-en').inputValue(), country: await page.locator('#masthead-country-control').inputValue()};
            await snap(page, 's3-02-masthead-tab');
            await page.locator('#masthead-name-control-en').fill('');
            o.empty = await pressSave(page, f, {expectRequest: false});
            await snap(page, 's3-03-required');
            await loc(page, 'Masthead tab footer: "Jump to next error"', f.getByRole('button', {name: 'Jump to next error'}));
            await page.locator('#masthead-name-control-en').fill('Probe Journal of Identity');
            await page.locator('#masthead-acronym-control-en').fill('PJI');
            await sleep(400);
            o.filledTwo = await readForm(f);
            await page.locator('#masthead-country-control').selectOption({label: 'Canada'});
            await sleep(400);
            o.filledCountry = await readForm(f);
            await snap(page, 's3-04-filled');
            o.aboutTyped = await mceSet(page, 'masthead-about-control-en', 'Our journal publishes probe articles.');
            o.historyTyped = await mceSet(page, 'masthead-editorialHistory-control-en', 'Founded in 2001.');
            if (isOjs) {
                await page.locator('#masthead-onlineIssn-control').fill('1234-5678');
                await page.locator('#masthead-publisherUrl-control').fill('example.org');
                const t0 = Date.now();
                o.malformed = await pressSave(page, f);
                await snap(page, 's3-05-malformed');
                // the notice's lifetime
                const notice = page.locator('.app__notifications .pkpNotification, .pkpNotification').filter({hasText: 'The form was not saved'});
                o.noticeGoneAfterMs = await notice.first().waitFor({state: 'hidden', timeout: 20_000}).then(() => Date.now() - t0).catch(() => 'still there at 20 s');
                await page.locator('#masthead-onlineIssn-control').fill('0378-5955');
                await page.locator('#masthead-publisherUrl-control').fill('https://example.org');
                await sleep(300);
                o.afterFix = await readForm(f);
            } else {
                o.issnField = await page.locator('#masthead-onlineIssn-control').count();
            }
            if (isOps) {
                // OPS2: the sponsoring organization typed with the save
                const sp = f.locator('[id^="masthead-sponsoringOrganization"], [id*="sponsor" i]').first();
                o.sponsorField = await sp.count();
                if (o.sponsorField) { o.sponsorId = await sp.getAttribute('id'); await sp.fill('Probe Sponsor Foundation'); }
            }
            o.save = await pressSave(page, f);
            await snap(page, 's3-06-saved');
            await page.reload(); await idle(page); await sleep(1000);
            o.afterReload = {name: await page.locator('#masthead-name-control-en').inputValue(), acronym: await page.locator('#masthead-acronym-control-en').inputValue(), country: await page.locator('#masthead-country-control').inputValue(), about: await mceGet(page, 'masthead-about-control-en'), history: await mceGet(page, 'masthead-editorialHistory-control-en')};
            if (isOps && o.sponsorId) o.afterReload.sponsor = await page.locator(`[id="${o.sponsorId}"]`).inputValue().catch(() => null);
            await snap(page, 's3-07-reloaded');
            await signOut(page);
            await go(page, cu(t, '/about'));
            o.after = await readPublic(page);
            await snap(page, 's3-08-about-after');
            await go(page, cu(t, '/about/editorialHistory'));
            o.history = await readPublic(page);
            await snap(page, 's3-09-history-after');
            await go(page, app.url('/index.php/index'));
            o.siteEntry = await page.locator(`.page_index_site h3 a[href$="/index.php/${t}"]`).allInnerTexts().catch(() => []);
            await snap(page, 's3-10-site-home');
            if (isOps) {
                // OPS2: the saved sponsor on the public pages
                o.sponsorShown = {};
                for (const p of ['', '/about', '/about/contact', '/about/editorialMasthead']) { await go(page, cu(t, p)); o.sponsorShown[p || '/'] = (await page.content()).includes('Probe Sponsor Foundation'); }
            }
        });

        // ── Scenario 4: save the "Contact" tab; the emails follow ──────────────
        await step('s4', async () => {
            const o = F.s4 = {};
            const t = tag('hksw3tb');
            const au = `${t}au`;
            await newCtx(t, {}, [{username: au, roles: ['author'], givenName: 'Ada', familyName: 'Author'}]);
            o.tag = t;
            let sub = null;
            if (isOjs) sub = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: au, title: `Submission ${t}s`, decisions: ['sendExternalReview', 'accept', 'sendToProduction']});
            o.sub = sub ? sub.submissionId : null;
            await signIn(page, mgrOf(t), {contextPath: t});
            if (isOjs) {
                const {createIssue} = require(path.join(REPO, 'apps/ojs/playwright/pages/PublicationMetadataPages.js'));
                await createIssue(page, t, {volume: '9', number: '9', year: '2099', title: 'Future issue 2099'});
            }
            await signOut(page);
            await go(page, cu(t, '/about/contact'));
            o.before = await readPublic(page);
            await snap(page, 's4-01-contact-before');
            await signIn(page, mgrOf(t), {contextPath: t});
            await openContextTab(t, 'contact');
            const f = formOf('#contact-contactName-control');
            await f.waitFor({timeout: T});
            o.labels = await f.locator('.pkpFormFieldLabel, legend').allInnerTexts().then((a) => a.map((x) => flat(x, 80)));
            await snap(page, 's4-02-contact-tab');
            await page.locator('#contact-contactPhone-control').fill('+1 555 0100');
            o.phoneAlone = await pressSave(page, f, {expectRequest: false});
            await snap(page, 's4-03-phone-alone');
            await page.locator('#contact-supportName-control').fill('Sam Support');
            await page.locator('#contact-supportEmail-control').fill('sam.support@mail.test');
            await page.locator('#contact-contactEmail-control').fill('not-an-email');
            o.invalid = await pressSave(page, f);
            await snap(page, 's4-04-invalid');
            await page.locator('#contact-contactName-control').fill('Pat Principal');
            await page.locator('#contact-contactEmail-control').fill('pat.principal@mail.test');
            await page.locator('[id^="contact-contactAffiliation-control"]').first().fill('Probe University');
            await page.locator('#contact-mailingAddress-control').fill('1 Probe Street\nProbe City');
            await page.locator('#contact-supportPhone-control').fill('+1 555 0199');
            o.save = await pressSave(page, f);
            await snap(page, 's4-05-saved');
            await page.reload(); await idle(page); await sleep(800);
            o.afterReload = await f.locator('input, textarea').evaluateAll((els) => els.filter((e) => e.id).map((e) => [e.id, e.value]));
            await signOut(page);
            await go(page, cu(t, '/about/contact'));
            o.after = await readPublic(page);
            o.afterBlocks = await page.evaluate(() => ({address: (document.querySelector('.page_contact .address') || {}).innerText || null, blocks: [...document.querySelectorAll('.page_contact .contact')].map((b) => ({cls: b.className, text: b.innerText, mail: [...b.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href'))}))}));
            await snap(page, 's4-06-contact-after');
            if (isOjs && sub) {
                const since = new Date(Date.now() - 2000);
                await signIn(page, mgrOf(t), {contextPath: t});
                const {PublishScreen} = require(path.join(REPO, 'apps/ojs/playwright/pages/PublishSchedulePages.js'));
                const pub = new PublishScreen(page, t);
                await pub.gotoWorkflow(sub.submissionId);
                await pub.openEntry('Title & Abstract');
                const panel = await pub.openPublishPanelExpectingIssueFields();
                await pub.fillVersionDetails(panel);
                const continuous = panel.getByRole('radio', {name: 'Assign To Future Issue and Publish Immediately'});
                await continuous.waitFor({timeout: T});
                await snap(page, 's4-07-publish-panel');
                await continuous.check();
                await pub.selectIssueOption(panel, /Vol\. 9 No\. 9 \(2099\)/);
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                await pub.confirmPublish(pub.confirmationDialog('published immediately as continuous publication'), 'Publish');
                await sleep(1500);
                await snap(page, 's4-08-published');
                const m = await app.mail.find({to: `${au}@mail.test`, subject: 'Publication Published', since}).catch((e) => ({error: String(e.message || e)}));
                o.publishedMail = m && m.From ? {from: m.From, subject: m.Subject} : m;
                await signOut(page);
            }
            const since2 = new Date(Date.now() - 2000);
            await go(page, cu(t, '/login'));
            await page.getByRole('link', {name: 'Forgot your password?'}).click();
            await page.locator('form#lostPasswordForm input#email').fill(`${au}@mail.test`);
            await page.locator('form#lostPasswordForm').getByRole('button', {name: 'Reset Password'}).click();
            await page.waitForLoadState('load'); await idle(page);
            await snap(page, 's4-09-reset-requested');
            const r = await app.mail.find({to: `${au}@mail.test`, since: since2}).catch((e) => ({error: String(e.message || e)}));
            o.resetMail = r && r.From ? {from: r.From, subject: r.Subject} : r;
        });

        // ── Scenario 5: change and empty the "Privacy Statement" ───────────────
        await step('s5', async () => {
            const o = F.s5 = {};
            const t = tag('hksw3tc');
            await newCtx(t);
            o.tag = t;
            await signOut(page).catch(() => {});
            await go(page, cu(t));
            o.menuBefore = await aboutMenu();
            await signIn(page, mgrOf(t), {contextPath: t});
            await go(page, cu(t, '/management/settings/website'));
            await page.locator('#setup-button').click(); await idle(page);
            await page.locator('#setup').getByRole('tab', {name: 'Privacy Statement', exact: true}).click(); await idle(page); await sleep(800);
            const id = 'privacy-privacyStatement-control-en';
            await waitMce(page, id);
            o.default = words(await mceGet(page, id));
            o.label = await formOf(`#${id}`).locator('.pkpFormFieldLabel').allInnerTexts().catch(() => []);
            await snap(page, 's5-01-privacy-tab');
            await mceSet(page, id, 'We keep your data in Probe City.');
            o.save1 = await pressSave(page, formOf(`#${id}`));
            await snap(page, 's5-02-saved');
            await signOut(page);
            await go(page, cu(t));
            await chooseAbout('Privacy Statement');
            o.page = {url: page.url(), ...(await readPublic(page))};
            await snap(page, 's5-03-page');
            await signIn(page, mgrOf(t), {contextPath: t});
            await go(page, cu(t, '/about'));
            o.mgrAboutEdit = (await readPublic(page)).edit.length;
            await go(page, cu(t, '/about/privacy'));
            o.mgrPrivacy = await readPublic(page);
            await snap(page, 's5-04-mgr-privacy-page');
            await go(page, cu(t, '/management/settings/website'));
            await page.locator('#setup-button').click(); await idle(page);
            await page.locator('#setup').getByRole('tab', {name: 'Privacy Statement', exact: true}).click(); await idle(page); await sleep(800);
            await mceSet(page, id, '');
            o.save2 = await pressSave(page, formOf(`#${id}`));
            await snap(page, 's5-05-emptied');
            await page.reload(); await idle(page); await sleep(800);
            await signOut(page);
            await go(page, cu(t));
            o.menuAfter = await aboutMenu();
            const g = await go(page, cu(t, '/about/privacy'));
            o.pageAfter = {status: g.status, h1: (await readPublic(page)).h1};
            await snap(page, 's5-06-page-after');
            const g2 = await go(page, app.url('/index.php/index/about/privacy'));
            o.site = {status: g2.status, h1: (await readPublic(page)).h1};
            await snap(page, 's5-07-site-privacy');
        });

        // ── Scenario 6: change and empty the Information texts (OJS OMP); A9 on a new context ──
        await step('s6', async () => {
            const o = F.s6 = {};
            const t = tag('hksw3td');
            await newCtx(t, {sidebar: ['informationblockplugin']});
            o.tag = t;
            const block = async () => page.evaluate(() => { const b = document.querySelector('.pkp_structure_sidebar .block_information'); return b ? {heading: (b.querySelector('h2') || {}).innerText || null, links: [...b.querySelectorAll('a')].map((a) => [a.innerText.trim(), a.getAttribute('href')])} : null; });
            await signOut(page).catch(() => {});
            await go(page, cu(t));
            o.blockDefault = await block();
            await snap(page, 's6-01-home-block');
            // A9: the default "For Readers" text's "Privacy Statement" link on a new context
            await page.locator('.pkp_structure_sidebar .block_information a').filter({hasText: 'For Readers'}).first().click();
            await page.waitForLoadState('load'); await idle(page);
            o.a9Readers = await readPublic(page);
            const pl = page.locator('.pkp_structure_main .page a').filter({hasText: /^Privacy Statement$/});
            o.a9LinkHref = await pl.first().getAttribute('href').catch(() => null);
            if (await pl.count()) { await pl.first().click(); await page.waitForLoadState('load'); await idle(page); o.a9After = {url: page.url(), h1: (await readPublic(page)).h1}; await snap(page, 's6-02-a9-after-link'); }
            await signIn(page, mgrOf(t), {contextPath: t});
            await go(page, cu(t, '/management/settings/website#setup/information'));
            await sleep(1200);
            const rid = 'information-readerInformation-control-en', aid = 'information-authorInformation-control-en', lid = 'information-librarianInformation-control-en';
            await waitMce(page, rid);
            const f = formOf(`#${rid}`);
            o.tab = {selected: await page.evaluate(() => [...document.querySelectorAll('main [role="tab"][aria-selected="true"]')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim())), groups: await f.locator('fieldset legend, [role="group"]').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText).trim().slice(0, 60))), labels: await f.locator('.pkpFormFieldLabel').allInnerTexts(), readers: words(await mceGet(page, rid)), authors: words(await mceGet(page, aid)), librarians: words(await mceGet(page, lid))};
            await snap(page, 's6-03-information-tab');
            await mceSet(page, rid, 'Readers start here.');
            o.save1 = await pressSave(page, f);
            await signOut(page);
            await go(page, cu(t));
            await page.locator('.pkp_structure_sidebar .block_information a').filter({hasText: 'For Readers'}).first().click();
            await page.waitForLoadState('load'); await idle(page);
            o.readersPage = await readPublic(page);
            await snap(page, 's6-04-readers-page');
            await signIn(page, mgrOf(t), {contextPath: t});
            await go(page, cu(t, '/information/readers'));
            o.mgrReaders = (await readPublic(page)).edit;
            const pages0 = page.context().pages().length;
            await page.locator('.pkp_structure_main a.cmp_edit_link').first().click();
            await page.waitForLoadState('load'); await idle(page); await sleep(1500);
            o.editLanded = {...(await readSettings(page)), newWindow: page.context().pages().length > pages0, infoFormVisible: await page.locator(`#${rid}`).count()};
            await snap(page, 's6-05-edit-landed');
            const empty = async (id, nm) => {
                await go(page, cu(t, '/management/settings/website#setup/information')); await sleep(1200);
                await waitMce(page, id);
                await mceSet(page, id, '');
                const r = await pressSave(page, formOf(`#${rid}`));
                await snap(page, `s6-06-${nm}-emptied`);
                return r;
            };
            o.saveLib = await empty(lid, 'librarians');
            await signOut(page);
            await go(page, cu(t)); o.blockAfterLib = await block();
            const gl = await go(page, cu(t, '/information/librarians'));
            o.libPage = {status: gl.status, ...(await readPublic(page))};
            await snap(page, 's6-07-librarians-page');
            await signIn(page, mgrOf(t), {contextPath: t});
            o.saveAuth = await empty(aid, 'authors');
            await signOut(page);
            await go(page, cu(t)); o.blockAfterAuth = await block();
            await snap(page, 's6-08-home-one-left');
            await go(page, cu(t, '/about')); o.aboutBlockOneLeft = await block();
            await signIn(page, mgrOf(t), {contextPath: t});
            o.saveRead = await empty(rid, 'readers');
            await signOut(page);
            o.blockAllEmpty = {};
            for (const p of ['', '/about', '/about/editorialMasthead', '/about/contact', '/about/privacy']) { await go(page, cu(t, p)); o.blockAllEmpty[p || '/'] = await block(); }
            await snap(page, 's6-09-home-none');
        });

        // ── Scenario 10: a journal not accepting submissions; A8 ──────────────────
        await step('s10', async () => {
            const o = F.s10 = {};
            const t = tag('hksw3te');
            await newCtx(t);
            o.tag = t;
            await signIn(page, mgrOf(t), {contextPath: t});
            await go(page, cu(t, '/management/settings/context')); await sleep(600);
            o.control = await readSettings(page);
            const openDisable = async () => {
                await go(page, cu(t, '/management/settings/workflow#submission')); await sleep(800);
                const side = page.getByRole('tab', {name: 'Disable Submissions', exact: true});
                await side.click(); await idle(page); await sleep(500);
                return formOf('input[name="disableSubmissions"]');
            };
            let f = await openDisable();
            o.boxLabel = await f.locator('label').allInnerTexts().then((a) => a.map((x) => flat(x, 200)));
            await f.locator('input[name="disableSubmissions"]').check();
            o.save1 = await pressSave(page, f);
            o.samePageAfterTick = await readSettings(page);
            await snap(page, 's10-01-ticked');
            o.pages = {};
            for (const slug of ['context', 'website', 'workflow', 'distribution', 'access']) {
                await go(page, cu(t, `/management/settings/${slug}`)); await sleep(600);
                o.pages[slug] = await readSettings(page);
                await snap(page, `s10-02-${slug}`);
            }
            f = await openDisable();
            await f.locator('input[name="disableSubmissions"]').uncheck();
            o.save2 = await pressSave(page, f);
            await sleep(1500);
            o.samePageAfterUntick = await readSettings(page);
            await snap(page, 's10-03-unticked-same-page');
            await go(page, cu(t, '/management/settings/context')); await sleep(600);
            o.afterReloadContext = await readSettings(page);
            await snap(page, 's10-04-context-after');
        });

        // ── A11: Hosted Journals "Edit" and "Create Journal" with no country ──────
        await step('a11', async () => {
            const o = F.a11 = {};
            const t = tag('hksw3tf');
            await app.api.createContext({tag: t, context: {name: `SW3 NoCountry ${t}`, acronym: 'SNC'}, users: [{username: mgrOf(t), roles: ['manager']}]});
            o.tag = t;
            await signIn(page, 'admin');
            await go(page, app.url('/index.php/index/admin/contexts')); await sleep(500);
            const row = page.locator('tr.gridRow').filter({hasText: `SW3 NoCountry ${t}`}).first();
            await row.locator('a.show_extras').click(); await idle(page); await sleep(300);
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
            const cb = page.getByRole('checkbox', {name: /appear publicly on the site/});
            await cb.waitFor({timeout: T});
            const dlg = page.locator('[role="dialog"]:visible').last();
            o.countryLabel = await dlg.locator('label[for^="context-country-control"], [id^="context-country-control"]').evaluateAll((els) => els.map((e) => e.tagName === 'LABEL' ? e.innerText : (e.closest('.pkpFormField') || e).querySelector('.pkpFormFieldLabel') && (e.closest('.pkpFormField') || e).querySelector('.pkpFormFieldLabel').innerText)).catch(() => []);
            o.countryValue = await dlg.locator('select[id^="context-country-control"]').first().inputValue().catch(() => null);
            await cb.uncheck();
            await snap(page, 'a11-01-edit-window');
            o.save1 = await pressSave(page, dlg.locator('form').first());
            await snap(page, 'a11-02-refused');
            await dlg.locator('select[id^="context-country-control"]').first().selectOption('CA');
            o.save2 = await pressSave(page, dlg.locator('form').first());
            await snap(page, 'a11-03-with-country');
            await page.keyboard.press('Escape').catch(() => {});
            // "Create Journal" with an empty Country
            await go(page, app.url('/index.php/index/admin/contexts')); await sleep(500);
            const createName = isOjs ? 'Create Journal' : isOmp ? 'Create Press' : 'Create Server';
            await page.getByRole('link', {name: createName}).or(page.getByRole('button', {name: createName})).first().click();
            const nameBox = page.locator('[id^="context-name-control"]').first();
            await nameBox.waitFor({timeout: T});
            const cdlg = page.locator('[role="dialog"]:visible').last();
            o.createCountryLabel = flat(await cdlg.locator('.pkpFormField').filter({has: page.locator('[id^="context-country-control"]')}).locator('.pkpFormFieldLabel').first().innerText().catch(() => ''), 100);
            const c2 = tag('hksw3tg');
            await nameBox.fill(`SW3 Create ${c2}`);
            await cdlg.locator('[id^="context-acronym-control"]').first().fill('SWC');
            await cdlg.locator('[id^="context-urlPath-control"]').first().fill(c2);
            await cdlg.locator('[id^="context-contactName-control"]').first().fill('Cora Create').catch(() => {});
            await cdlg.locator('[id^="context-contactEmail-control"]').first().fill(`${c2}@mail.test`).catch(() => {});
            await cdlg.locator('input[type=checkbox][value=en]').first().check().catch(() => {});
            await cdlg.locator('input[type=radio][value=en]').first().check().catch(() => {});
            await snap(page, 'a11-04-create-filled');
            o.create = await pressSave(page, cdlg.locator('form').first());
            await snap(page, 'a11-05-create-refused');
            // A3: the journal "Create Journal" makes once a country is picked: its Contact tab
            await cdlg.locator('select[id^="context-country-control"]').first().selectOption('CA');
            o.create2 = await pressSave(page, cdlg.locator('form').first());
            await page.waitForURL(/admin\/wizard/, {timeout: T}).catch(() => {});
            o.afterCreateUrl = page.url();
            await go(page, cu(c2, '/management/settings/context#contact')); await sleep(1200);
            const cf = formOf('#contact-contactName-control');
            o.createdContact = await cf.locator('input, textarea').evaluateAll((els) => els.filter((e) => e.id).map((e) => [e.id, e.value])).catch(() => null);
            await snap(page, 'a11-06-created-contact-tab');
            await page.locator('#contact-contactPhone-control').fill('+1 555 0100').catch(() => {});
            o.createdPhoneAlone = await pressSave(page, cf, {expectRequest: false}).catch((e) => ({error: String(e.message || e)}));
            await snap(page, 'a11-07-created-phone-alone');
            await signOut(page);
        });

        // ── OPS3: French ticked under "Forms" (OPS; OJS OMP the control) ──────────
        await step('ops3', async () => {
            const o = F.ops3 = {};
            const t = tag('hksw3th');
            await newCtx(t, {context: {supportedLocales: ['en', 'fr_CA']}});
            o.tag = t;
            await signIn(page, mgrOf(t), {contextPath: t});
            await go(page, cu(t, '/management/settings/website'));
            await page.locator('#setup-button').click(); await idle(page);
            await page.locator('#setup').getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page); await sleep(1000);
            const box = page.locator('input[id^="select-cell-fr_CA-formLocale"]').first();
            o.boxBefore = await box.isChecked().catch(() => null);
            const w = page.waitForResponse((r) => /save-language-setting/.test(r.url()), {timeout: T}).catch(() => null);
            await box.click();
            const r = await w;
            await sleep(800);
            o.boxAfter = await page.locator('input[id^="select-cell-fr_CA-formLocale"]').first().isChecked().catch(() => null);
            o.tickStatus = r ? r.status() : null;
            await sleep(1000);
            await snap(page, 'ops3-01-forms-ticked');
            await page.locator('#setup').getByRole('tab', {name: 'Privacy Statement', exact: true}).click(); await idle(page); await sleep(1000);
            o.frSamePage = await mceGet(page, 'privacy-privacyStatement-control-fr_CA');
            await page.reload(); await idle(page); await sleep(1000);
            await go(page, cu(t, '/management/settings/website#setup/privacy')); await sleep(1500);
            await waitMce(page, 'privacy-privacyStatement-control-fr_CA').catch(() => {});
            o.frAfterLoad = await mceGet(page, 'privacy-privacyStatement-control-fr_CA');
            await snap(page, 'ops3-02-privacy-tab');
            await signOut(page);
            const g = await go(page, cu(t, '/fr_CA/about/privacy'));
            o.frPage = {status: g.status, ...(await readPublic(page)), raw: await rawKeys(page).catch(() => null)};
            await snap(page, 'ops3-03-fr-privacy-page');
        });
    } finally {
        F.dialogs = dialogs;
        record('facts', F, {merge: true});
        await close();
    }
});
