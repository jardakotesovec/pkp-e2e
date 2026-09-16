// U14 claim check, chunk K2: the article landing page's two comments blocks
// (OJS), and Rule 3c's side-menu entry on the three apps.
// Spec: docs/specs/U14-reader-comments-and-moderation.md — Actors rows read /
// write / report / delete (49–52), Fields: the landing page (60–66), Rules 3
// to 9 (105–193), Settings bullet "Items per page" (309–315, its "Show more"
// end), Cross-feature (322–331), register A1 and A3; footnotes d, e, f, g, h,
// i (landing part), f-a1, f-a3.
//
// Seeds its own scratch journal (public comments on; a manager, a section
// editor, an author, an external reviewer, two readers, two readers with an
// ORCID iD (verified / unverified)), three published articles (S1 with an
// approved and a pending seeded comment, S2 the other-article control, S3
// with 27 approved comments for "Show more"), and drives, in phases:
//   seed     the context and the articles
//   anon     S1 signed out; "All Comments (N)"; "Log in to comment" → Login →
//            back on the article; S3's "Show more" signed out
//   profile  the ORCID readers set an affiliation (Profile › Contact)
//   rd1      the writer: Submit's states, two comments (one with tags), the
//            pending notice, own menu, the Delete Comment dialog (Cancel and
//            Delete), S2 and S3 as the writer
//   rd2      a second Reader: no pending comment of another, "…" › Report,
//            the dialog empty / spaces / filled, a second report, Cancel
//   hide     the manager hides the reported comment on the Comments page; the
//            writer sees the pending notice (A1); the second reader nothing
//   levels   Author, Reviewer, Section Editor, Journal Manager, Site Admin on
//            S1 (the pending comment, the menus), the manager writing and
//            deleting a comment of their own; every level's side menu (3c)
//   delete   the writer deletes the hidden, twice-reported comment; the
//            manager's Comments page and Tasks afterwards
//   version  the manager publishes Version of Record 1.1; the two parts
//   lists    "Items per page" set to 5 on Settings › Website › Setup › Lists;
//            S3's "Show more" at that end
//   menus    OMP and OPS: the side menu with comments on and off, manager and
//            section editor (3c); OJS's off end too
//   extra    an approved comment on 1.1 (the sidebar count over both versions),
//            a 20,000-character comment, the login scroll once more, the
//            Hidden/Needs Approval tab after a hide, the Comments page and the
//            panel's "Reports" table at 5 per page, a changed affiliation
//
//   PROBE_FEATURE=U14 PROBE_AGENT=ccK2 node bin/probe.js ojs shared/playwright/checks/U14/K2/k2.js
//   PROBE_FEATURE=U14 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U14/K2/k2.js   (menus runs on the three)
//   PHASES=seed,anon,… narrows; later phases reuse k2-state-<app>.json from the seed phase.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'anon', 'profile', 'rd1', 'rd2', 'hide', 'levels', 'delete', 'version', 'lists', 'menus', 'extra'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;

const BOX_LABEL = 'What do you think about this publication? Type your comments here.';
const NOTICE = 'Your comment will be visible when the editor approves it';
const CLOSED = 'Discussion is closed on this version, please comment on the latest version above.';

// ---------------------------------------------------------------------------
// Reading helpers

async function textOf(locator) {
    try {
        if ((await locator.count()) === 0) return null;
        return (await locator.first().innerText()).trim();
    } catch { return null; }
}
async function state(locator) {
    const count = await locator.count().catch(() => 0);
    if (!count) return {count};
    const el = locator.first();
    return {
        count,
        visible: await el.isVisible().catch(() => null),
        enabled: await el.isEnabled().catch(() => null),
        text: (await el.innerText().catch(() => '')).trim(),
    };
}

/** The landing page's two blocks as data (Rules 3 to 9). */
async function readBlocks(page) {
    const section = page.locator('#public-comments');
    const out = {sectionCount: await section.count()};
    if (!out.sectionCount) return out;
    out.heading = await textOf(section.locator('h2.label'));
    out.parts = [];
    const headers = section.getByRole('heading', {level: 3});
    for (const h of await headers.all()) {
        const button = h.getByRole('button');
        out.parts.push({
            label: (await h.innerText()).trim(),
            expanded: await button.getAttribute('aria-expanded'),
        });
    }
    out.regions = [];
    for (const region of await section.getByRole('region').all()) {
        const name = await region.getAttribute('aria-label') || await region.evaluate((el) => {
            const id = el.getAttribute('aria-labelledby');
            return id ? (document.getElementById(id)?.innerText || '').trim() : null;
        });
        if (name && !/^Version|^Author Original|^Published Manuscript|^Unassigned/.test(name)) continue;
        const r = {
            name,
            visible: await region.isVisible(),
            box: await state(region.getByRole('textbox', {name: BOX_LABEL})),
            submit: await state(region.getByRole('button', {name: 'Submit', exact: true})),
            loginButton: await state(region.getByRole('button', {name: 'Log in to comment'})),
            closedNotice: await textOf(region.locator('[class*="PkpCommentsNotificationNotLatest"]')),
            showMore: await state(region.getByRole('button', {name: /^Show more/})),
            comments: [],
        };
        for (const article of await region.locator('article').all()) {
            const orcid = article.locator('footer a');
            r.comments.push({
                notice: await textOf(article.locator('[class*="NeedsApproval"]')),
                noticeIcon: await article.locator('[class*="NeedsApproval"] svg, [class*="NeedsApproval"] img').count(),
                time: await textOf(article.locator('time')),
                menuButton: await article.getByRole('button').count(),
                bodyText: await textOf(article.locator('[class*="messageBody"]')),
                bodyHtml: await article.locator('[class*="messageBody"]').first().innerHTML().catch(() => null),
                author: await textOf(article.locator('[class*="authorName"]')),
                affiliation: await textOf(article.locator('[class*="authorAffiliation"]')),
                orcid: (await orcid.count()) ? {
                    href: await orcid.first().getAttribute('href'),
                    text: (await orcid.first().innerText()).trim(),
                    icon: await orcid.first().locator('svg, img').first().evaluate((el) => ({class: el.getAttribute('class'), label: el.getAttribute('aria-label'), html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 260), paths: el.querySelectorAll('path').length})).catch(() => null),
                } : null,
                order: (await article.innerText()).trim().split('\n').map((s) => s.trim()).filter(Boolean),
            });
        }
        out.regions.push(r);
    }
    const sidebar = page.locator('.entry_details .item.comments');
    out.sidebar = {
        count: await sidebar.count(),
        heading: await textOf(sidebar.locator('h2.label')),
        link: await state(sidebar.getByRole('link', {name: /^All Comments/})),
        linkHref: await sidebar.getByRole('link', {name: /^All Comments/}).first().getAttribute('href').catch(() => null),
        loginButton: await state(sidebar.getByRole('button', {name: 'Log in to comment'})),
        otherButtons: await sidebar.getByRole('button').allInnerTexts(),
    };
    return out;
}

async function scrollState(page) {
    return page.evaluate(() => {
        const el = document.getElementById('public-comments');
        const rect = el ? el.getBoundingClientRect() : null;
        return {hash: location.hash, scrollY: Math.round(window.scrollY), top: rect ? Math.round(rect.top) : null, innerHeight: window.innerHeight};
    });
}

/** The backend side menu's nav as data (Rule 3c). */
async function readSideMenu(page) {
    const nav = page.locator('#app-nav, nav[aria-label="Site Navigation"]').first();
    const count = await nav.count();
    if (!count) return {count};
    return {count, aria: await nav.ariaSnapshot(), text: (await nav.innerText()).trim()};
}

/** The side menu's "Content" group: collapsed until pressed (patterns.md pitfall 2); returns its entries. */
async function openContentGroup(page) {
    const nav = page.locator('#app-nav, nav[aria-label="Site Navigation"]').first();
    const group = nav.getByText('Content', {exact: true});
    const count = await group.count();
    if (!count) return {group: 0, groups: (await nav.innerText().catch(() => '')).trim().split('\n').filter(Boolean)};
    await group.first().click();
    await sleep(500);
    const item = nav.locator('li, [role="treeitem"]').filter({has: group}).first();
    const entries = (await item.innerText().catch(() => '')).trim().split('\n').map((x) => x.trim()).filter(Boolean);
    const links = await item.locator('a').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
    return {group: count, entries, links, aria: await nav.ariaSnapshot()};
}

async function openMenu(page, article) {
    const trigger = article.getByRole('button').first();
    await trigger.click();
    await sleep(300);
    const items = await page.getByRole('menuitem').allInnerTexts();
    return items.map((s) => s.trim());
}
async function closeMenu(page) {
    await page.keyboard.press('Escape');
    await sleep(200);
}

/** The landing page for a signed-in user, recorded. */
async function landing(page, app, ctx, id, name, {shotToo = false} = {}) {
    await page.goto(app.url(`/index.php/${ctx}/article/view/${id}`));
    await idle(page);
    const s = await screen(page);
    const blocks = await readBlocks(page);
    record(name, {screen: s, blocks});
    if (shotToo) await shot(page, name);
    return blocks;
}

async function loadState(app) {
    return JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
}
function saveState(app, st) {
    fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
}

const captureResponse = async (page, predicate, action, timeout = 20_000) => {
    const waiting = page.waitForResponse(predicate, {timeout}).catch((e) => ({error: String(e)}));
    await action();
    const response = await waiting;
    if (response.error) return response;
    let body = null;
    try { body = await response.json(); } catch { body = await response.text().catch(() => null); }
    return {url: response.url(), method: response.request().method(), status: response.status(), postData: response.request().postData(), body};
};

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    let st = {};

    // ── seed ───────────────────────────────────────────────────────────────
    if (on('seed') && isOJS) {
        const t = tag('u14k2');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Sectioned'},
            {username: `${t}au`, roles: ['author'], givenName: 'Alex', familyName: 'Author'},
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewer'},
            {username: `${t}rd1`, roles: ['reader'], givenName: 'Rosa', familyName: 'Writer'},
            {username: `${t}rd2`, roles: ['reader'], givenName: 'Rob', familyName: 'Reporter'},
            {username: `${t}orcv`, roles: ['reader'], givenName: 'Vera', familyName: 'Verified', orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true},
            {username: `${t}orcu`, roles: ['reader'], givenName: 'Uma', familyName: 'Unverified', orcid: 'https://orcid.org/0000-0001-5109-3700', orcidIsVerified: false},
        ];
        st.tag = t;
        st.context = await app.api.createContext({tag: t, enablePublicComments: true, users});
        st.s1 = await app.api.createSubmission({
            tag: `${t}s1`, context: t, submitter: `${t}au`, published: true, title: `K2 article one ${t}`,
            userComments: [
                {user: `${t}rd1`, text: 'K2 approved comment by Rosa.', approved: true},
                {user: `${t}orcv`, text: 'K2 comment by the verified iD.', approved: true},
                {user: `${t}orcu`, text: 'K2 comment by the unverified iD.', approved: true},
                {user: `${t}rd1`, text: 'K2 seeded pending comment by Rosa.'},
            ],
        });
        st.s2 = await app.api.createSubmission({
            tag: `${t}s2`, context: t, submitter: `${t}au`, published: true, title: `K2 article two ${t}`,
            userComments: [{user: `${t}rd2`, text: 'K2 comment on article two by Rob.', approved: true}],
        });
        st.s3 = await app.api.createSubmission({
            tag: `${t}s3`, context: t, submitter: `${t}au`, published: true, title: `K2 article three ${t}`,
            userComments: Array.from({length: 27}, (_, i) => ({user: `${t}rd2`, text: `K2 bulk comment ${String(i + 1).padStart(2, '0')}.`, approved: true})),
        });
        saveState(app, st);
        record('seed', st);
        log('seeded', t, st.s1.submissionId, st.s2.submissionId, st.s3.submissionId);
    } else if (isOJS) {
        st = await loadState(app);
    }
    const t = st.tag;
    const ctx = t;
    const s1 = st.s1?.submissionId;
    const s2 = st.s2?.submissionId;
    const s3 = st.s3?.submissionId;

    const {page, close} = await launch(app);
    page.setDefaultTimeout(T);
    try {
        // ── anon ───────────────────────────────────────────────────────────
        if (on('anon') && isOJS) {
            const blocks = await landing(page, app, ctx, s1, 'anon-s1', {shotToo: true});
            log('anon parts', JSON.stringify(blocks.parts), 'sidebar', JSON.stringify(blocks.sidebar.link));
            await loc(page, 'the main block heading', page.locator('#public-comments h2.label'));
            await loc(page, 'a version part heading button', page.locator('#public-comments').getByRole('heading', {level: 3}).getByRole('button'));
            await loc(page, 'the main block "Log in to comment"', page.locator('#public-comments').getByRole('button', {name: 'Log in to comment'}));
            await loc(page, 'the sidebar block', page.locator('.entry_details .item.comments'));
            await loc(page, 'the sidebar "All Comments (N)" link', page.getByRole('link', {name: /^All Comments \(\d+\)$/}));
            await loc(page, 'the sidebar "Log in to comment"', page.locator('.entry_details').getByRole('button', {name: 'Log in to comment'}));
            // The "…" menu absence: buttons inside comment articles.
            record('anon-s1-menu-buttons', {count: await page.locator('#public-comments article button').count()});
            // Press "All Comments (N)" and record where the page scrolls.
            const before = await scrollState(page);
            await page.getByRole('link', {name: /^All Comments/}).click();
            await sleep(800);
            const after = await scrollState(page);
            record('anon-s1-allcomments-scroll', {before, after});
            // A heading closes and reopens its part.
            const header = page.locator('#public-comments').getByRole('heading', {level: 3}).first().getByRole('button');
            await header.click();
            await sleep(400);
            const closed = await readBlocks(page);
            await header.click();
            await sleep(400);
            const reopened = await readBlocks(page);
            record('anon-s1-toggle', {closed: {parts: closed.parts, regions: closed.regions.map((r) => ({name: r.name, visible: r.visible}))}, reopened: {parts: reopened.parts, regions: reopened.regions.map((r) => ({name: r.name, visible: r.visible, comments: r.comments.length}))}});
            // The sidebar's "Log in to comment": where it goes.
            await page.locator('.entry_details').getByRole('button', {name: 'Log in to comment'}).click();
            await page.waitForURL(/login/, {timeout: T});
            await idle(page);
            record('anon-sidebar-login', await screen(page));
            await page.goBack();
            await idle(page);
            // The main block's "Log in to comment" → Login → sign in → back.
            await page.locator('#public-comments').getByRole('button', {name: 'Log in to comment'}).click();
            await page.waitForURL(/login/, {timeout: T});
            await idle(page);
            const loginScreen = await screen(page);
            record('anon-main-login', loginScreen);
            await shot(page, 'anon-main-login');
            await page.locator('input#username').fill(`${t}rd1`);
            await page.locator('input#password').evaluate((el) => el.removeAttribute('maxlength'));
            await page.locator('input#password').fill(app.users.getPassword(`${t}rd1`));
            await page.locator('form#login button[type="submit"]').click();
            await page.waitForURL((u) => !u.pathname.includes('/login'), {timeout: T});
            await idle(page);
            await sleep(800);
            const landed = await screen(page);
            record('anon-after-login', {screen: landed, scroll: await scrollState(page), blocks: await readBlocks(page)});
            await shot(page, 'anon-after-login');
            await signOut(page);
            // S3 signed out: "Show more".
            const b3 = await landing(page, app, ctx, s3, 'anon-s3');
            log('anon s3 show more', JSON.stringify(b3.regions[0]?.showMore), 'comments', b3.regions[0]?.comments.length);
            await loc(page, 'the "Show more" button', page.getByRole('button', {name: /^Show more/}));
            const more = page.getByRole('button', {name: /^Show more/});
            const pressed = await captureResponse(page, (r) => r.url().includes('/comments/public') && r.request().method() === 'GET', () => more.click());
            await idle(page);
            await sleep(500);
            const b3after = await readBlocks(page);
            record('anon-s3-showmore', {request: {url: pressed.url, status: pressed.status}, parts: b3after.parts, showMore: b3after.regions[0]?.showMore, comments: b3after.regions[0]?.comments.length, texts: b3after.regions[0]?.comments.map((c) => c.bodyText)});
            // S2 signed out (the other-article control).
            await landing(page, app, ctx, s2, 'anon-s2');
        }

        // ── profile: the ORCID readers set an affiliation ───────────────────
        if (on('profile') && isOJS) {
            const {ProfilePage} = require('../../../pages/ProfilePage.js');
            for (const [user, aff] of [[`${t}orcv`, 'K2 Verified Institute'], [`${t}orcu`, 'K2 Unverified College']]) {
                await signIn(page, user, {contextPath: ctx});
                const profile = new ProfilePage(page, ctx);
                await profile.goto('contact');
                record(`profile-contact-${user.slice(-4)}`, await screen(page));
                await profile.country().selectOption({label: 'Canada'});   // the Contact tab's required Country (U03)
                await profile.affiliation('en').fill(aff);
                await profile.save();
                await idle(page);
                record(`profile-contact-saved-${user.slice(-4)}`, {text: await textOf(page.locator('#profileTabs')), affiliation: await profile.affiliation('en').inputValue()});
                await signOut(page);
            }
        }

        // ── rd1: the writer ─────────────────────────────────────────────────
        if (on('rd1') && isOJS) {
            await signIn(page, `${t}rd1`, {contextPath: ctx});
            const b0 = await landing(page, app, ctx, s1, 'rd1-s1-before', {shotToo: true});
            log('rd1 before parts', JSON.stringify(b0.parts), 'comments', b0.regions[0]?.comments.length);
            const region = page.locator('#public-comments').getByRole('region').filter({has: page.getByRole('textbox', {name: BOX_LABEL})}).first();
            const box = page.getByRole('textbox', {name: BOX_LABEL});
            const submit = region.getByRole('button', {name: 'Submit', exact: true});
            await loc(page, 'the comment box', box);
            await loc(page, 'the Submit button', submit);
            const states = {empty: await state(submit)};
            await box.fill('   ');
            await sleep(200);
            states.spaces = await state(submit);
            await box.fill('K2 first comment by Rosa through the box.');
            await sleep(200);
            states.filled = await state(submit);
            // Submit: capture the POST and poll the button's state while in flight.
            const inflight = [];
            const posted = captureResponse(page, (r) => /\/api\/v1\/comments$/.test(r.url()) && r.request().method() === 'POST', async () => {
                await submit.click();
                for (let i = 0; i < 25; i++) {
                    inflight.push({t: i * 40, enabled: await submit.isEnabled().catch(() => null), boxValue: await box.inputValue().catch(() => null)});
                    await sleep(40);
                }
            });
            states.post = await posted;
            states.inflight = inflight;
            await idle(page);
            await sleep(500);
            const b1 = await readBlocks(page);
            record('rd1-s1-after-first', {states, blocks: b1, screen: await screen(page)});
            await shot(page, 'rd1-s1-after-first');
            log('rd1 after first: parts', JSON.stringify(b1.parts), 'sidebar', b1.sidebar.link.text, 'comments', b1.regions[0]?.comments.map((c) => c.bodyText));
            // Mail to the writer?
            states.mailToWriter = await app.mail.count({to: `${t}rd1@mail.test`}).catch((e) => String(e));
            // The second comment with tags.
            await box.fill('<b>bold</b> <script>alert(1)</script> plain <a href="https://example.org">link</a>');
            const post2 = await captureResponse(page, (r) => /\/api\/v1\/comments$/.test(r.url()) && r.request().method() === 'POST', () => submit.click());
            await idle(page);
            await sleep(500);
            const b2 = await readBlocks(page);
            record('rd1-s1-after-second', {post: post2, blocks: b2, mailToWriter: states.mailToWriter, screen: await screen(page)});
            log('rd1 after second: parts', JSON.stringify(b2.parts), 'comments', b2.regions[0]?.comments.map((c) => c.bodyText));
            // Own comment's menu (the first typed one) and the pending seeded one.
            const own = page.locator('#public-comments article').filter({hasText: 'K2 first comment by Rosa through the box.'}).last();
            await loc(page, 'a comment\'s "…" menu button', own.getByRole('button'));
            const ownMenu = await openMenu(page, own);
            record('rd1-s1-own-menu', {items: ownMenu, screen: await screen(page)});
            await closeMenu(page);
            const approvedOwn = page.locator('#public-comments article').filter({hasText: 'K2 approved comment by Rosa.'}).last();
            const approvedMenu = await openMenu(page, approvedOwn);
            record('rd1-s1-own-approved-menu', {items: approvedMenu});
            await closeMenu(page);
            const other = page.locator('#public-comments article').filter({hasText: 'K2 comment by the verified iD.'}).last();
            const otherMenu = await openMenu(page, other);
            record('rd1-s1-other-menu', {items: otherMenu});
            await closeMenu(page);
            // Delete Comment on the tagged comment: the dialog, Cancel, then Delete.
            const tagged = page.locator('#public-comments article').filter({hasText: 'plain'}).filter({hasText: 'bold'}).last();
            await openMenu(page, tagged);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            await sleep(400);
            const dialog = page.getByRole('dialog');
            const dialogRead = async () => ({
                title: await textOf(dialog.locator('h1, h2, h3, [class*="title"]').first()),
                text: await textOf(dialog),
                strong: await dialog.locator('strong').allInnerTexts(),
                buttons: await dialog.getByRole('button').allInnerTexts(),
                buttonStates: await Promise.all((await dialog.getByRole('button').all()).map(async (b) => ({text: (await b.innerText()).trim(), enabled: await b.isEnabled()}))),
            });
            record('rd1-s1-delete-dialog', {dialog: await dialogRead(), screen: await screen(page)});
            await shot(page, 'rd1-s1-delete-dialog');
            await loc(page, 'the Delete Comment dialog\'s "Delete" button', dialog.getByRole('button', {name: 'Delete', exact: true}));
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(400);
            const afterCancel = await readBlocks(page);
            record('rd1-s1-delete-cancel', {dialogs: await page.getByRole('dialog').count(), parts: afterCancel.parts, comments: afterCancel.regions[0]?.comments.map((c) => c.bodyText)});
            await openMenu(page, tagged);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            await sleep(400);
            const del = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => page.getByRole('dialog').getByRole('button', {name: 'Delete', exact: true}).click());
            await sleep(600);
            const afterDelete = await readBlocks(page);
            record('rd1-s1-delete-done', {request: del, dialogs: await page.getByRole('dialog').count(), parts: afterDelete.parts, sidebar: afterDelete.sidebar.link.text, comments: afterDelete.regions[0]?.comments.map((c) => c.bodyText), screen: await screen(page)});
            const reloaded = await landing(page, app, ctx, s1, 'rd1-s1-after-delete-reload');
            log('rd1 after delete: before reload', JSON.stringify(afterDelete.parts), 'after', JSON.stringify(reloaded.parts));
            // S2 and S3 as the writer.
            await landing(page, app, ctx, s2, 'rd1-s2');
            const b3 = await landing(page, app, ctx, s3, 'rd1-s3');
            const more = page.getByRole('button', {name: /^Show more/});
            const pressed = await captureResponse(page, (r) => r.url().includes('/comments/public'), () => more.click());
            await idle(page);
            await sleep(500);
            const b3after = await readBlocks(page);
            record('rd1-s3-showmore', {before: {showMore: b3.regions[0]?.showMore, comments: b3.regions[0]?.comments.length, parts: b3.parts}, request: {url: pressed.url, status: pressed.status}, after: {showMore: b3after.regions[0]?.showMore, comments: b3after.regions[0]?.comments.length, parts: b3after.parts}});
            await signOut(page);
        }

        // ── rd2: a second Reader reports ────────────────────────────────────
        if (on('rd2') && isOJS) {
            await signIn(page, `${t}rd2`, {contextPath: ctx});
            const b = await landing(page, app, ctx, s1, 'rd2-s1', {shotToo: true});
            log('rd2 parts', JSON.stringify(b.parts), 'comments', b.regions[0]?.comments.map((c) => c.bodyText));
            const target = page.locator('#public-comments article').filter({hasText: 'K2 approved comment by Rosa.'}).last();
            const menu = await openMenu(page, target);
            record('rd2-s1-menu-other', {items: menu, screen: await screen(page)});
            await page.getByRole('menuitem', {name: 'Report', exact: true}).click();
            await sleep(400);
            const dialog = page.getByRole('dialog');
            const readDialog = async () => ({
                title: await textOf(dialog.locator('h1, h2, h3, [class*="title"]').first()),
                text: await textOf(dialog),
                textboxLabel: await dialog.getByRole('textbox').first().getAttribute('aria-label').catch(() => null),
                labels: await dialog.locator('label').allInnerTexts(),
                buttons: await dialog.getByRole('button').allInnerTexts(),
                alerts: await dialog.locator('[role="alert"], [class*="error"]').allInnerTexts(),
            });
            record('rd2-s1-report-dialog', {dialog: await readDialog(), screen: await screen(page)});
            await shot(page, 'rd2-s1-report-dialog');
            await loc(page, 'the Report Comment dialog\'s reason box', dialog.getByRole('textbox'));
            await loc(page, 'the Report Comment dialog\'s Submit', dialog.getByRole('button', {name: 'Submit', exact: true}));
            // Empty Submit.
            const emptyPost = await captureResponse(page, (r) => /\/reports$/.test(r.url()), () => dialog.getByRole('button', {name: 'Submit', exact: true}).click(), 3_000);
            await sleep(400);
            record('rd2-s1-report-empty', {request: emptyPost, dialogOpen: await page.getByRole('dialog').count(), dialog: await readDialog(), pageAlerts: await page.locator('[role="alert"], [role="status"]').allInnerTexts()});
            // Spaces.
            await dialog.getByRole('textbox').fill('   ');
            const spacesPost = await captureResponse(page, (r) => /\/reports$/.test(r.url()), () => dialog.getByRole('button', {name: 'Submit', exact: true}).click(), 3_000);
            await sleep(400);
            record('rd2-s1-report-spaces', {request: spacesPost, dialogOpen: await page.getByRole('dialog').count(), dialog: await readDialog()});
            // Cancel, then reopen and file.
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(400);
            record('rd2-s1-report-cancel', {dialogOpen: await page.getByRole('dialog').count(), blocks: await readBlocks(page)});
            await openMenu(page, target);
            await page.getByRole('menuitem', {name: 'Report', exact: true}).click();
            await sleep(400);
            await dialog.getByRole('textbox').fill('K2 report reason one.');
            const post1 = await captureResponse(page, (r) => /\/reports$/.test(r.url()) && r.request().method() === 'POST', () => dialog.getByRole('button', {name: 'Submit', exact: true}).click());
            await sleep(800);
            const afterReport = await readBlocks(page);
            record('rd2-s1-report-filed', {request: post1, dialogOpen: await page.getByRole('dialog').count(), pageAlerts: await page.locator('[role="alert"], [role="status"]').allInnerTexts(), blocks: afterReport, screen: await screen(page)});
            const menuAgain = await openMenu(page, target);
            record('rd2-s1-menu-after-report', {items: menuAgain});
            await page.getByRole('menuitem', {name: 'Report', exact: true}).click();
            await sleep(400);
            await dialog.getByRole('textbox').fill('K2 report reason two.');
            const post2 = await captureResponse(page, (r) => /\/reports$/.test(r.url()) && r.request().method() === 'POST', () => dialog.getByRole('button', {name: 'Submit', exact: true}).click());
            await sleep(600);
            record('rd2-s1-report-second', {request: post2, dialogOpen: await page.getByRole('dialog').count()});
            st.reportedCommentId = post1.url ? Number(post1.url.match(/comments\/(\d+)\/reports/)?.[1]) : null;
            // The dialog's first line on a writer with an affiliation.
            const withAff = page.locator('#public-comments article').filter({hasText: 'K2 comment by the verified iD.'}).last();
            await openMenu(page, withAff);
            await page.getByRole('menuitem', {name: 'Report', exact: true}).click();
            await sleep(400);
            record('rd2-s1-report-dialog-affiliation', {dialog: await readDialog(), screen: await screen(page)});
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(300);
            // Mail to the reporter?
            record('rd2-mail', {toReporter: await app.mail.count({to: `${t}rd2@mail.test`}).catch((e) => String(e)), toWriter: await app.mail.count({to: `${t}rd1@mail.test`}).catch((e) => String(e))});
            saveState(app, st);
            await signOut(page);
        }

        // ── hide: the manager hides the reported comment (A1) ───────────────
        if (on('hide') && isOJS) {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            record('mgr-comments-page-before-hide', await screen(page));
            // The journal holds 30+ comments (S3's 27 push S1's onto page 2): open the "Reported" tab, which lists the one reported comment.
            await page.getByRole('tab', {name: 'Reported'}).click();
            await idle(page);
            record('mgr-comments-page-reported-before-hide', await screen(page));
            const row = page.getByRole('row', {name: /K2 approved comment by Rosa\./}).first();
            await row.getByRole('button').first().click();
            await sleep(300);
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            await idle(page);
            await sleep(500);
            record('mgr-comment-panel-before-hide', await screen(page));
            const hide = page.getByRole('button', {name: 'Hide Comment'});
            const hidden = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => hide.click());
            await sleep(1500);
            record('mgr-comment-panel-after-hide', {request: hidden, bodyText: (await page.locator('body').innerText()).slice(0, 4000)});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            record('mgr-comments-page-after-hide', await screen(page));
            await signOut(page);
            // The writer: the hidden comment reads as pending (A1).
            await signIn(page, `${t}rd1`, {contextPath: ctx});
            const b1 = await landing(page, app, ctx, s1, 'rd1-s1-after-hide', {shotToo: true});
            log('rd1 after hide', JSON.stringify(b1.parts), b1.regions[0]?.comments.map((c) => [c.bodyText, c.notice]));
            const hiddenOwn = page.locator('#public-comments article').filter({hasText: 'K2 approved comment by Rosa.'}).last();
            record('rd1-s1-hidden-own-menu', {items: await openMenu(page, hiddenOwn)});
            await closeMenu(page);
            await signOut(page);
            await signIn(page, `${t}rd2`, {contextPath: ctx});
            const b2 = await landing(page, app, ctx, s1, 'rd2-s1-after-hide');
            log('rd2 after hide', JSON.stringify(b2.parts), b2.regions[0]?.comments.map((c) => c.bodyText));
            await signOut(page);
            const b3 = await landing(page, app, ctx, s1, 'anon-s1-after-hide');
            log('anon after hide', JSON.stringify(b3.parts), b3.regions[0]?.comments.map((c) => c.bodyText));
        }

        // ── levels: every permission level on S1 and its side menu (3c) ─────
        if (on('levels') && isOJS) {
            const levels = [
                ['au', `${t}au`, 'Author'], ['rev', `${t}rev`, 'Reviewer'], ['se', `${t}se`, 'Section Editor'],
                ['mgr', `${t}mgr`, 'Journal Manager'], ['admin', 'admin', 'Site Administrator'],
            ];
            for (const [key, user, label] of levels) {
                await signIn(page, user, {contextPath: ctx});
                await idle(page);
                const landedAt = page.url();
                // The side menu on the editorial dashboard (or wherever the address answers).
                await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`));
                await idle(page);
                const dash = await screen(page);
                record(`level-${key}-dashboard`, {label, landedAt, screen: dash, sideMenu: await readSideMenu(page)});
                if (key !== 'mgr' && key !== 'admin') {
                    await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions`));
                    await idle(page);
                    record(`level-${key}-mysubmissions`, {screen: await screen(page), sideMenu: await readSideMenu(page)});
                }
                const b = await landing(page, app, ctx, s1, `level-${key}-s1`);
                log('level', key, JSON.stringify(b.parts), b.regions[0]?.comments.map((c) => c.bodyText));
                const other = page.locator('#public-comments article').filter({hasText: 'K2 comment by the verified iD.'}).last();
                const items = await openMenu(page, other);
                record(`level-${key}-s1-other-menu`, {items});
                await closeMenu(page);
                if (key === 'mgr') {
                    // The manager writes a comment of their own, reads its menu, deletes it.
                    const box = page.getByRole('textbox', {name: BOX_LABEL});
                    await box.fill('K2 comment by the Journal Manager.');
                    const post = await captureResponse(page, (r) => /\/api\/v1\/comments$/.test(r.url()) && r.request().method() === 'POST', () => page.locator('#public-comments').getByRole('button', {name: 'Submit', exact: true}).click());
                    await idle(page);
                    await sleep(500);
                    const after = await readBlocks(page);
                    const own = page.locator('#public-comments article').filter({hasText: 'K2 comment by the Journal Manager.'}).last();
                    const ownMenu = await openMenu(page, own);
                    record('level-mgr-s1-own', {post: {status: post.status}, blocks: after, ownMenu, screen: await screen(page)});
                    await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
                    await sleep(400);
                    const dialog = page.getByRole('dialog');
                    record('level-mgr-s1-own-delete-dialog', {text: await textOf(dialog), buttons: await dialog.getByRole('button').allInnerTexts()});
                    const del = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => dialog.getByRole('button', {name: 'Delete', exact: true}).click());
                    await sleep(600);
                    record('level-mgr-s1-own-deleted', {request: del, blocks: await readBlocks(page)});
                }
                await signOut(page);
            }
        }

        // ── delete: the writer deletes the hidden, twice-reported comment ───
        if (on('delete') && isOJS) {
            // The manager's Tasks and Comments page before.
            const {openTasks} = require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js');
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`));
            await idle(page);
            let tasks = await openTasks(page);
            record('mgr-tasks-before-delete', {text: await textOf(tasks)});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            await page.getByRole('tab', {name: 'Reported'}).click();
            await idle(page);
            record('mgr-comments-page-reported-before-delete', await screen(page));
            await signOut(page);
            await signIn(page, `${t}rd1`, {contextPath: ctx});
            const b0 = await landing(page, app, ctx, s1, 'rd1-s1-before-delete-hidden');
            const own = page.locator('#public-comments article').filter({hasText: 'K2 approved comment by Rosa.'}).last();
            await openMenu(page, own);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            await sleep(400);
            const dialog = page.getByRole('dialog');
            record('rd1-s1-delete-hidden-dialog', {text: await textOf(dialog), strong: await dialog.locator('strong').allInnerTexts(), buttons: await dialog.getByRole('button').allInnerTexts(), screen: await screen(page)});
            const del = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => dialog.getByRole('button', {name: 'Delete', exact: true}).click());
            await sleep(600);
            const after = await readBlocks(page);
            record('rd1-s1-delete-hidden-done', {request: del, before: b0.parts, parts: after.parts, comments: after.regions[0]?.comments.map((c) => c.bodyText)});
            const reloaded = await landing(page, app, ctx, s1, 'rd1-s1-delete-hidden-reload');
            log('delete hidden: before', JSON.stringify(b0.parts), 'at once', JSON.stringify(after.parts), 'reload', JSON.stringify(reloaded.parts));
            await signOut(page);
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            record('mgr-comments-page-after-delete', await screen(page));
            await page.getByRole('tab', {name: 'Reported'}).click();
            await idle(page);
            record('mgr-comments-page-reported-after-delete', await screen(page));
            await page.getByRole('tab', {name: 'Hidden/Needs Approval'}).click();
            await idle(page);
            record('mgr-comments-page-hidden-after-delete', await screen(page));
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`));
            await idle(page);
            tasks = await openTasks(page);
            record('mgr-tasks-after-delete', {text: await textOf(tasks)});
            await signOut(page);
        }

        // ── version: a second published version moves the box ──────────────
        if (on('version') && isOJS) {
            const {PublishScreen} = require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js');
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            const pub = new PublishScreen(page, ctx);
            await pub.gotoWorkflow(s1);
            const dialog = await pub.openCreateVersionDialog();
            st.s1v2 = await pub.confirmVersionDialog(dialog);
            await pub.openVersionEntry('Version of Record 1.1', 'Title & Abstract');
            await pub.publish();
            record('mgr-s1-v2-published', {publicationId: st.s1v2, screen: await screen(page)});
            saveState(app, st);
            await signOut(page);
            const anon = await landing(page, app, ctx, s1, 'anon-s1-two-versions', {shotToo: true});
            log('two versions anon', JSON.stringify(anon.parts), anon.regions.map((r) => [r.name, r.visible, r.comments.length]));
            // Open the older part.
            const older = page.locator('#public-comments').getByRole('heading', {level: 3}).filter({hasText: 'Version of Record 1.0'}).getByRole('button');
            await older.click();
            await sleep(500);
            const opened = await readBlocks(page);
            record('anon-s1-two-versions-older-open', {parts: opened.parts, regions: opened.regions, screen: await screen(page)});
            await shot(page, 'anon-s1-two-versions-older-open');
            await loc(page, 'the older part\'s closed-discussion notice', page.locator('[class*="PkpCommentsNotificationNotLatest"]'));
            await signIn(page, `${t}rd1`, {contextPath: ctx});
            const rd1 = await landing(page, app, ctx, s1, 'rd1-s1-two-versions');
            await older.click();
            await sleep(500);
            const rd1open = await readBlocks(page);
            record('rd1-s1-two-versions-older-open', {parts: rd1open.parts, regions: rd1open.regions, screen: await screen(page)});
            log('two versions rd1', JSON.stringify(rd1.parts), rd1open.regions.map((r) => [r.name, r.visible, r.box.count, r.closedNotice, r.comments.length]));
            // The older version's own address.
            const v1 = st.s1.publicationId;
            await page.goto(app.url(`/index.php/${ctx}/article/view/${s1}/version/${v1}`));
            await idle(page);
            record('rd1-s1-v1-address', {screen: await screen(page), blocks: await readBlocks(page)});
            await signOut(page);
        }

        // ── lists: "Items per page" at the other end ────────────────────────
        if (on('lists') && isOJS) {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/website`));
            await idle(page);
            await page.locator('#setup-button').click();
            await idle(page);
            await page.getByRole('tab', {name: 'Lists'}).click();
            await idle(page);
            const field = page.getByLabel('Items per page');
            record('mgr-lists-before', {value: await field.inputValue(), screen: await screen(page)});
            await loc(page, 'the Lists tab\'s "Items per page" box', field);
            await field.fill('5');
            const form = page.locator('form', {has: field});
            const saved = await captureResponse(page, (r) => r.url().includes('/api/v1/contexts/') && r.request().method() !== 'GET', () => form.getByRole('button', {name: 'Save', exact: true}).click());
            await idle(page);
            record('mgr-lists-saved', {request: {status: saved.status, postData: saved.postData}, status: await page.locator('[role="status"]').allInnerTexts()});
            await signOut(page);
            const b3 = await landing(page, app, ctx, s3, 'anon-s3-perpage5');
            log('per page 5', JSON.stringify(b3.parts), JSON.stringify(b3.regions[0]?.showMore), b3.regions[0]?.comments.length);
            const more = page.getByRole('button', {name: /^Show more/});
            const steps = [];
            for (let i = 0; i < 6 && (await more.count()); i++) {
                const r = await captureResponse(page, (x) => x.url().includes('/comments/public'), () => more.click());
                await idle(page);
                await sleep(400);
                const b = await readBlocks(page);
                steps.push({press: i + 1, url: r.url, status: r.status, showMore: b.regions[0]?.showMore, comments: b.regions[0]?.comments.length, parts: b.parts});
            }
            record('anon-s3-perpage5-presses', steps);
            // S1 at 5 per page as a control (fewer than 5 comments).
            await landing(page, app, ctx, s1, 'anon-s1-perpage5');
        }

        // ── menus: OMP and OPS side menus (3c); OJS's off end ──────────────
        if (on('menus')) {
            const t2 = tag('u14k2m');
            const roster = (x) => [{username: `${x}mgr`, roles: ['manager']}, {username: `${x}se`, roles: ['sectionEditor']}];
            const onCtx = await app.api.createContext({tag: `${t2}on`, enablePublicComments: true, users: roster(`${t2}on`)});
            const offCtx = await app.api.createContext({tag: `${t2}off`, users: roster(`${t2}off`)});
            record('menus-contexts', {on: onCtx, off: offCtx});
            for (const [key, c] of [['on', `${t2}on`], ['off', `${t2}off`]]) {
                for (const role of ['mgr', 'se']) {
                    await signIn(page, `${c}${role}`, {contextPath: c});
                    await page.goto(app.url(`/index.php/${c}/dashboard/editorial`));
                    await idle(page);
                    record(`menus-${key}-${role}`, {screen: await screen(page), sideMenu: await readSideMenu(page), content: await openContentGroup(page)});
                    if (role === 'mgr' && key === 'on') await shot(page, `menus-${key}-${role}`);
                    await signOut(page);
                }
                await signIn(page, 'admin', {contextPath: c});
                await page.goto(app.url(`/index.php/${c}/dashboard/editorial`));
                await idle(page);
                record(`menus-${key}-admin`, {screen: await screen(page), sideMenu: await readSideMenu(page), content: await openContentGroup(page)});
                await signOut(page);
            }
        }
        // ── extra: the remaining axes ───────────────────────────────────────
        if (on('extra') && isOJS) {
            const v2 = st.s1v2;
            // 1. rd1 writes on 1.1; the manager approves it; the sidebar counts both versions.
            await signIn(page, `${t}rd1`, {contextPath: ctx});
            await landing(page, app, ctx, s1, 'extra-rd1-s1-v2');
            const box = page.getByRole('textbox', {name: BOX_LABEL});
            const submit = page.locator('#public-comments').getByRole('button', {name: 'Submit', exact: true});
            await box.fill('K2 comment on version 1.1 by Rosa.');
            const post11 = await captureResponse(page, (r) => /\/api\/v1\/comments$/.test(r.url()) && r.request().method() === 'POST', () => submit.click());
            await idle(page);
            await sleep(400);
            // 2. The long comment (20,000 characters), then deleted.
            const long = ('K2 long comment. ' + 'x'.repeat(83) + ' ').repeat(200).trim();
            await box.fill(long);
            const postLong = await captureResponse(page, (r) => /\/api\/v1\/comments$/.test(r.url()) && r.request().method() === 'POST', () => submit.click());
            await idle(page);
            await sleep(600);
            const afterLong = await readBlocks(page);
            const longArticle = page.locator('#public-comments article').filter({hasText: 'K2 long comment.'}).last();
            record('extra-rd1-long', {typedLength: long.length, post: {status: postLong.status, storedLength: postLong.body && postLong.body.commentText ? postLong.body.commentText.length : null, error: postLong.body && postLong.body.error}, parts: afterLong.parts, renderedLength: (await textOf(longArticle.locator('[class*="messageBody"]')) || '').length, comments: afterLong.regions.map((r) => r.comments.map((c) => c.bodyText.slice(0, 40)))});
            if ((await longArticle.count()) && postLong.status === 200) {
                await openMenu(page, longArticle);
                await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
                await sleep(400);
                await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => page.getByRole('dialog').getByRole('button', {name: 'Delete', exact: true}).click());
                await sleep(500);
            }
            record('extra-rd1-after-v2-write', {post11: {status: post11.status, publicationId: post11.body && post11.body.publicationId}, blocks: await readBlocks(page)});
            await signOut(page);
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            // 5a. The Comments page at 5 per page.
            record('extra-mgr-comments-page-perpage5', await screen(page));
            const row = page.getByRole('row', {name: /K2 comment on version 1\.1 by Rosa\./}).first();
            await row.getByRole('button').first().click();
            await sleep(300);
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            await idle(page);
            await sleep(500);
            const approved = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => page.getByRole('button', {name: 'Approve Comment'}).click());
            await sleep(1200);
            record('extra-mgr-approve-v2', {request: {status: approved.status, postData: approved.postData}});
            await signOut(page);
            const anon = await landing(page, app, ctx, s1, 'extra-anon-s1-both-versions', {shotToo: true});
            log('both versions approved: parts', JSON.stringify(anon.parts), 'sidebar', anon.blocks?.sidebar?.link?.text || anon.sidebar.link.text);
            // 3. The login scroll once more (as rd2), read after a longer settle.
            await page.locator('#public-comments').getByRole('button', {name: 'Log in to comment'}).click();
            await page.waitForURL(/login/, {timeout: T});
            await idle(page);
            await page.locator('input#username').fill(`${t}rd2`);
            await page.locator('input#password').evaluate((el) => el.removeAttribute('maxlength'));
            await page.locator('input#password').fill(app.users.getPassword(`${t}rd2`));
            await page.locator('form#login button[type="submit"]').click();
            await page.waitForURL((u) => !u.pathname.includes('/login'), {timeout: T});
            await idle(page);
            const early = await scrollState(page);
            await sleep(2000);
            record('extra-after-login-scroll', {url: page.url(), early, settled: await scrollState(page), box: await state(page.getByRole('textbox', {name: BOX_LABEL}))});
            // 5b. rd2 reports the verified-iD comment six times (A3) for the Reports table's paging at 5.
            await landing(page, app, ctx, s1, 'extra-rd2-s1');
            const older = page.locator('#public-comments').getByRole('heading', {level: 3}).filter({hasText: 'Version of Record 1.0'}).getByRole('button');
            await older.click();
            await sleep(500);
            const target = page.locator('#public-comments article').filter({hasText: 'K2 comment by the verified iD.'}).last();
            const reports = [];
            for (let i = 1; i <= 6; i++) {
                await openMenu(page, target);
                await page.getByRole('menuitem', {name: 'Report', exact: true}).click();
                await sleep(300);
                const dialog = page.getByRole('dialog');
                await dialog.getByRole('textbox').fill(`K2 repeated report ${i}.`);
                const r = await captureResponse(page, (x) => /\/reports$/.test(x.url()) && x.request().method() === 'POST', () => dialog.getByRole('button', {name: 'Submit', exact: true}).click());
                reports.push({i, status: r.status, id: r.body && r.body.id});
                await sleep(400);
            }
            record('extra-rd2-six-reports', {reports, menuOnOlderVersion: await openMenu(page, target)});
            await closeMenu(page);
            await signOut(page);
            // 6. orcv renames the affiliation; the next load shows the new one.
            const {ProfilePage} = require('../../../pages/ProfilePage.js');
            await signIn(page, `${t}orcv`, {contextPath: ctx});
            const profile = new ProfilePage(page, ctx);
            await profile.goto('contact');
            await profile.affiliation('en').fill('K2 Renamed Institute');
            await profile.save();
            await signOut(page);
            const renamed = await landing(page, app, ctx, s1, 'extra-anon-s1-renamed');
            await older.click();
            await sleep(500);
            const renamedOpen = await readBlocks(page);
            record('extra-anon-s1-renamed-older', {comments: renamedOpen.regions.map((r) => r.comments.map((c) => [c.author, c.affiliation]))});
            // 4 and 5c. The manager: the panel's Reports table at 5 per page; hide the 1.1 comment; the Hidden/Needs Approval tab; re-approve.
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            await page.getByRole('tab', {name: 'Reported'}).click();
            await idle(page);
            record('extra-mgr-reported-tab', await screen(page));
            const reportedRow = page.getByRole('row', {name: /K2 comment by the verified iD\./}).first();
            await reportedRow.getByRole('button').first().click();
            await sleep(300);
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            await idle(page);
            await sleep(600);
            record('extra-mgr-panel-reports-perpage5', await screen(page));
            await page.getByRole('dialog').getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(400);
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            const row11 = page.getByRole('row', {name: /K2 comment on version 1\.1 by Rosa\./}).first();
            await row11.getByRole('button').first().click();
            await sleep(300);
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            await idle(page);
            await sleep(500);
            const hid = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => page.getByRole('button', {name: 'Hide Comment'}).click());
            await sleep(1200);
            await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments`));
            await idle(page);
            await page.getByRole('tab', {name: 'Hidden/Needs Approval'}).click();
            await idle(page);
            await sleep(800);
            record('extra-mgr-hidden-tab', {hide: {status: hid.status, postData: hid.postData}, screen: await screen(page)});
            await signOut(page);
            await signIn(page, `${t}rd1`, {contextPath: ctx});
            const rd1v2 = await landing(page, app, ctx, s1, 'extra-rd1-s1-v2-hidden');
            log('rd1 1.1 hidden', JSON.stringify(rd1v2.parts), JSON.stringify(rd1v2.regions[0]?.comments.map((c) => [c.bodyText, c.notice])));
            await signOut(page);
        }
    } finally {
        await close();
    }
});
