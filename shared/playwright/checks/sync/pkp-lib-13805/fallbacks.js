// PR review pkp/pkp-lib#13805, the regression reader's S1 to S3 (.reports/sync/rr13805/suspicions.md). On OJS's
// dataset fleet freshly reset; reuses walk.js's setup of submission 9 (Production, publication 10, issue 2).
//   F1 the title's prefix "L'" (stored escaped by the server's html title): the preview's title
//   F2 submission 15 in French with a French title, issue 2's title "Yams and their diseases" (English only,
//      "Title" shown), keywords and the author's affiliation in English only: the preview's header
//   F3 a site administrator with no role in the journal (admin's Journal Manager membership removed): the preview's
//      issue line on submission 9, and GET issues/2
//   F4 the journal's publishing mode "none" (publishingMode 2), as dbarnes: the same
//   F5 (round 3) submission 15 in French with no French title or abstract: the English title and abstract
//   F6 (round 3) the French title and abstract put back: the French ones
// Run: npm run fleet-prep -- --feature pr-13805 --dataset --reset --apps ojs
//      PROBE_FEATURE=pr-13805 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const {forEachApp, launch, signIn, signOut, record, sql} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('fallbacks.js runs on a dataset fleet (fleet-prep --dataset)');
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const {expect} = require('@playwright/test');
    const side = process.env.PROBE_RUN || 'run';
    const facts = {app: app.name, side};
    const fact = (k, v) => { facts[k] = v; console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 1600)}`); };
    const api = (p) => app.url(`/index.php/${app.contextPath}/api/v1/${p}`);
    const call = (page, method, p, body) => page.evaluate(async ({url, method, body}) => {
        const r = await fetch(url, {method, headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'Content-Type': 'application/json'},
            body: body ? JSON.stringify(body) : undefined});
        let j = null; try { j = await r.json(); } catch { /* */ }
        return {status: r.status, json: j};
    }, {url: api(p), method, body});
    const {page, close} = await launch(app);
    await page.setViewportSize({width: 1280, height: 900});
    const frame = new WorkflowPage(page, app.contextPath);
    const body = new BodyTextPage(page, frame);
    const exportButton = page.getByRole('button', {name: 'Export', exact: true});
    const section = page.locator('section').filter({has: page.getByRole('button', {name: 'Create PDF'})}).last();
    const preview = page.frameLocator('section iframe[srcdoc]');
    const header = async (sub, pub, tag) => {
        const calls = [];
        const on = (r) => { if (/\/api\/v1\/issues\/\d+/.test(r.url())) calls.push(`${r.request().method()} ${r.url().replace(/.*api\/v1\//, '')} ${r.status()}`); };
        page.on('response', on);
        await body.open(sub, pub);
        await exportButton.click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        await expect(preview.locator('article')).toBeVisible({timeout: T});
        await page.waitForTimeout(1500);
        page.off('response', on);
        fact(`${tag} issue requests`, calls);
        const m = await preview.locator('body').evaluate(() => {
            const h = document.querySelector('.publication-pdf-metadata');
            return h ? {text: h.innerText.split('\n').map((s) => s.trim()).filter(Boolean), html: h.innerHTML} : null;
        });
        fact(`${tag} header`, m && m.text);
        fact(`${tag} header html`, m && flat(m.html, 600));
        await section.locator('header button').first().click();
        await expect(exportButton).toBeVisible({timeout: T});
    };
    try {
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        fact('setup PUT 10', (await call(page, 'PUT', 'submissions/9/publications/10', {issueId: 2, pages: '12-34', prefix: {en: "L'"}})).status);
        fact('F1 fullTitle in the API', (await call(page, 'GET', 'submissions/9/publications/10')).json?.fullTitle);
        await header(9, 10, 'F1');

        sql(app, `update submissions set locale = 'fr_CA' where submission_id = 15`);
        sql(app, `insert into publication_settings (publication_id, locale, setting_name, setting_value) values (16, 'fr_CA', 'title', 'Les maladies de l''igname')`);
        sql(app, `insert into author_settings (author_id, locale, setting_name, setting_value) values (24, 'fr_CA', 'givenName', 'Rana'), (24, 'fr_CA', 'familyName', 'Baiyewu')`);
        sql(app, `update issues set show_title = 1 where issue_id = 2`);
        sql(app, `delete from issue_settings where issue_id = 2 and setting_name = 'title'`);
        sql(app, `insert into issue_settings (issue_id, locale, setting_name, setting_value) values (2, 'en', 'title', 'Yams and their diseases')`);
        fact('F2 PUT 16', (await call(page, 'PUT', 'submissions/15/publications/16', {issueId: 2, keywords: {en: [{name: 'yam'}]}})).status);
        const p16 = (await call(page, 'GET', 'submissions/15/publications/16')).json;
        fact('F2 publication 16', {locale: p16?.locale, keywords: p16?.keywords, authors: (p16?.authors || []).map((a) => ({given: a.givenName, aff: a.affiliations?.map((x) => x.name)}))});
        await header(15, 16, 'F2');

        // F5 (round 3, ui-library fbeb74d1df): the same French submission with its French title removed, the
        // English title and abstract only: both fall back to the journal's primary language (en)
        sql(app, `delete from publication_settings where publication_id = 16 and locale = 'fr_CA' and setting_name in ('title', 'abstract', 'subtitle', 'prefix')`);
        const p16b = (await call(page, 'GET', 'submissions/15/publications/16')).json;
        fact('F5 publication 16', {locale: p16b?.locale, title: p16b?.title, fullTitle: p16b?.fullTitle, abstract: flat(JSON.stringify(p16b?.abstract), 300)});
        await header(15, 16, 'F5');
        // F6: an abstract in French and a title in French only: the French ones, no English mixed in
        sql(app, `insert into publication_settings (publication_id, locale, setting_name, setting_value) values (16, 'fr_CA', 'title', 'Les maladies de l''igname'), (16, 'fr_CA', 'abstract', '<p>Résumé en français.</p>')`);
        await header(15, 16, 'F6');
        await signOut(page);

        sql(app, `delete from user_user_groups where user_id = (select user_id from users where username = 'admin')
            and user_group_id in (select user_group_id from user_groups where context_id = 1)`);
        await signIn(page, 'admin');
        await frame.gotoEditorial(9, {menuKey: 'publication_10_bodyText'}).catch((e) => fact('F3 gotoEditorial error', flat(e.message, 200)));
        await page.waitForTimeout(4000);
        const reached = await exportButton.count();
        fact('F3 page as admin without journal role', {url: page.url(), exportButtons: reached,
            text: flat(await page.locator('body').innerText().catch(() => null), 300)});
        await page.screenshot({path: require('path').join(require('../../../probe').outDir(), `${side}-F3.png`)});
        if (reached) try {
            await header(9, 10, 'F3');
            fact('F3 GET issues/2 as admin without journal role', (await call(page, 'GET', 'issues/2')).status);
        } catch (e) {
            fact('F3 Body Text not reached', {url: page.url(), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120),
                text: flat(await page.locator('body').innerText().catch(() => null), 300)});
            await page.screenshot({path: require('path').join(require('../../../probe').outDir(), `${side}-F3.png`)});
        }
        await signOut(page);

        sql(app, `delete from journal_settings where journal_id = 1 and setting_name = 'publishingMode'`);
        sql(app, `insert into journal_settings (journal_id, locale, setting_name, setting_value) values (1, '', 'publishingMode', '2')`);
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        fact('F4 GET issues/2 with publishing mode none', (await call(page, 'GET', 'issues/2')).status);
        await header(9, 10, 'F4');
    } finally {
        record(`fallbacks-${side}`, facts);
        await close();
    }
});
