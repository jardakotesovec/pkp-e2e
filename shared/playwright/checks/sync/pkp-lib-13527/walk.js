// PR review walk — pkp/pkp-lib#13527 (locale keys used by the code but defined in no locale):
// pkp/pkp-lib#13861 (stable-3_5_0) / #13862 (main), pkp/ojs#6108 / #6109, pkp/ui-library#1064 /
// #1065 (edersotto, 2026-11-25). Each string the issue lists is driven where it can be reached,
// and the text the screen or the response shows is kept.
//
// Steps (OJS; a scratch journal "<t>", its manager and author, one submission; a second journal
// "<t>b" for the foreign section):
//   users     Users & Roles as the manager: the "…" buttons' accessible names, raw ##keys## on the page.
//   userReq   signed out, GET $$$call$$$/tab/user/profile-tab/identity: the JSON error text.
//   sec404    GET /api/v1/sections/999999 as the manager.
//   sec400    GET /api/v1/sections/<a section of "<t>b"> from "<t>".
//   orcid     orcid/verify?state=<publication>&token=<the author's orcidEmailToken>&error=access_denied:
//             the page's message.
//   navDup    3.5 only (on main the legacy NavigationMenuForm is never instantiated; the Vue window
//             posts to navigationMenus, which already says duplicateTitles): the grid's
//             update-navigation-menu with the title "Primary Navigation Menu", the JSON's content.
//   format    the notifications of type FORMAT_NEEDS_APPROVED_SUBMISSION (0x100001D) stored for the
//             submission, and notification/fetchNotification asked for that type: the rendered text.
//   competing 3.5 only: requireAuthorCompetingInterests on, a contributor PUT without the statement.
//   help      the header's help link's screen-reader text.
//
// Fleet: PKP_E2E_LINE=<line> npm run fleet-prep -- --feature <sync|sync-3_5> --reset --apps ojs
//   [PKP_E2E_LINE=stable-3_5_0] PROBE_FEATURE=pr13527 PROBE_AGENT=<head|base> node bin/probe.js ojs \
//     shared/playwright/checks/sync/pkp-lib-13527/walk.js
// The head is lib/pkp at the PR's merge ref and lib/ui-library at the PR head (built); the base is
// lib/pkp at the branch tip (the bundle left at the head: only the PHP strings are read there).
//
// Reads fixed when: no step shows a ##key##. Facts: walk-<app>.json.
const {forEachApp, launch, signIn, signOut, idle, record, apiAs, sql, tag, rawKeys} = require('../../../probe');

forEachApp(async (app) => {
    const t = tag('r13527');
    const sh = (dir) => require('child_process').execFileSync('git', ['-C', `${app.root}/${dir}`, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const facts = {line: app.line || 'main', libPkp: sh('lib/pkp'), uiLibrary: sh('lib/ui-library'), app: sh('.'), steps: {}};
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    await app.api.createContext({tag: `${t}b`, users: []});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Keys ${t}`});
    const submissionId = S.submissionId;
    const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${submissionId}`));
    const authorId = Number(sql(app, `select author_id from authors where publication_id = ${publicationId} order by seq, author_id limit 1`));
    const otherCtx = Number(sql(app, `select journal_id from journals where path = '${t}b'`));
    const otherSection = Number(sql(app, `select section_id from sections where journal_id = ${otherCtx} order by section_id limit 1`));
    const {page, close} = await launch(app);
    const step = (name, v) => { facts.steps[name] = v; };
    const body = async (r) => { const s = await r.text(); try { return JSON.parse(s); } catch (e) { return s.slice(0, 400); } };
    try {
        // Signed out first.
        await page.goto(app.url(`/index.php/${t}/en`));
        let r = await page.request.get(app.url(`/index.php/${t}/$$$call$$$/tab/user/profile-tab/identity`), {failOnStatusCode: false});
        step('userReq', {status: r.status(), body: await body(r)});

        // ORCID verify, denied (no sign-in needed).
        sql(app, `delete from author_settings where author_id = ${authorId} and setting_name = 'orcidEmailToken'`);
        sql(app, `insert into author_settings (author_id, locale, setting_name, setting_value) values (${authorId}, '', 'orcidEmailToken', 'tok${t}')`);
        await page.goto(app.url(`/index.php/${t}/en/orcid/verify?state=${publicationId}&token=tok${t}&error=access_denied&error_description=probe`));
        await idle(page);
        step('orcid', {text: (await page.locator('main, .page, body').first().innerText()).split('\n').map((s) => s.trim()).filter((s) => /ORCID|##/.test(s)).slice(0, 6), raw: await rawKeys(page)});

        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/management/settings/access`));
        await idle(page);
        await page.getByRole('table').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(1500);
        const ellipsis = await page.locator('table button[aria-haspopup], table button.pkpDropdownActions, table [class*="ropdown"] button').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim()).slice(0, 5));
        step('users', {buttonNames: ellipsis, options: await page.getByRole('button', {name: 'Options', exact: true}).count(), raw: await rawKeys(page)});
        step('help', {srText: await page.locator('header .-screenReader, nav .-screenReader').allInnerTexts().catch(() => null)});

        r = await apiAs(page, 'GET', 'sections/999999');
        step('sec404', {status: r.status(), body: await body(r)});
        r = await apiAs(page, 'GET', `sections/${otherSection}`);
        step('sec400', {status: r.status(), section: otherSection, body: await body(r)});

        if (facts.line !== 'main') {
            // 3.5 only (main defines the key): a contributor saved without a competing-interests
            // statement while the journal requires one.
            const ctxId = Number(sql(app, `select journal_id from journals where path = '${t}'`));
            sql(app, `delete from journal_settings where journal_id = ${ctxId} and setting_name = 'requireAuthorCompetingInterests'`);
            sql(app, `insert into journal_settings (journal_id, locale, setting_name, setting_value) values (${ctxId}, '', 'requireAuthorCompetingInterests', '1')`);
            r = await apiAs(page, 'PUT', `submissions/${submissionId}/publications/${publicationId}/contributors/${authorId}`, {givenName: {en: 'Adah'}});
            step('competing', {status: r.status(), body: await body(r)});
        }
        if (facts.line !== 'main') {
            const csrf = await page.evaluate(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken);
            r = await page.request.post(app.url(`/index.php/${t}/$$$call$$$/grid/navigation-menus/navigation-menus-grid/update-navigation-menu`), {
                form: {csrfToken: csrf, title: 'Primary Navigation Menu', areaName: ''}, failOnStatusCode: false});
            const j = await body(r);
            step('navDup', {status: r.status(), keys: typeof j === 'object' ? Object.keys(j) : null, raw: typeof j === 'object' ? JSON.stringify(j).replace(/\s+/g, ' ').slice(0, 1200) : null, content: typeof j === 'object' ? (String(j.content || '').replace(/<[^>]+>/g, '\n').split('\n').map((x) => x.trim()).filter((x) => /##|exist|error|correct/i.test(x))) : j});
        }

        // The approve-submission notifications: stored rows, then the rendered text of the format type.
        await apiAs(page, 'PUT', `submissions/${submissionId}`, {});
        const rows = sql(app, `select notification_id, type, user_id, level from notifications where assoc_type = 1048585 and assoc_id = ${submissionId} and type in (16777243, 16777245, 16777246) order by type`);
        const level = 2, type = 16777245;
        r = await page.request.get(app.url(`/index.php/${t}/en/notification/fetchNotification?requestOptions[${level}][${type}][assocType]=1048585&requestOptions[${level}][${type}][assocId]=${submissionId}`), {failOnStatusCode: false});
        const j = await body(r);
        step('format', {rows: rows.split('\n').filter(Boolean), fetchStatus: r.status(), content: typeof j === 'object' ? String(j.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : j});
    } finally {
        record('walk', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
