// U12 drift sweep, chunk SWB (housekeeping 2026-11-09): the spec's Canonical
// scenarios 1, 2, 3 and 5 walked as written, bullet by bullet, plus the
// register and Coverage lines the kept checks K1-K5 and the issue walks do not
// reach (PART=x). Spec: docs/specs/U12-announcements.md, lines 484-1329.
//
// Seeds its own scratch context per scenario and run (tag prefix u12swb), signs
// in from the roster (scratch users, password rule) and records every screen
// with screen() before it is read. No assertions: each bullet's facts go to
// swb-<part>-facts (one file per part, run and app), each screen to
// swb-<part>-<nn>-<name>. Nothing is read from another script or file.
//
// Parts (PART=s1,s2,s3,s5,x,a11; default s1,s2,s3,s5):
//   s1  scenario 1: switch announcements on (the public side off/on, the side
//       menu, the tab, the refused counts, the "Edit" link, the controls at the
//       "on" end as Section Editor, Author, Reader)
//   s2  scenario 2: add, edit and delete (the panel, the refusals, the picture,
//       the public pages, View, expiry, Restore Original, Delete, the control)
//   s3  scenario 3: search and the types (the table, the window, edit, a typed
//       announcement, the type printed or not, remove with its announcement)
//   s5  scenario 5: a second language (the French boxes, the refusals, the
//       /fr_CA pages, the type window in two languages, A17's English page)
//   x   site-wide (run it alone, one app at a time; it puts the site's
//       announcements back off and deletes what it added): A3 on the site's
//       panel from a browser west of UTC; A18 on an edit with the email box
//       ticked; OMP2's "no block when it has none" (a press with its own count
//       and no announcements) with its control (count empty); then the site
//       restored as found
//   a11 register A11's second half: "Edit" after a close shows the unsaved title, and
//       a "Save" made to change "Short Description" stores it (row, reload, public page)
//   a14 register A14's remedy: on a French-primary context, the "New Announcement"
//       template's French body typed in Settings › Workflow › Emails, then an
//       announcement with the email: the sentence the reader gets (needs drainJobs)
//
// Run on the slot's campaign fleet (.reports/U12/fleet.json), each part twice
// (PROBE_RUN=r1, r2), main only, through the shared app lock, one app per call:
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U12 PROBE_AGENT=ccSWB PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U12/SWB/swb.js
//   bin/app-lock.sh shared ojs -- env PART=x PROBE_FEATURE=U12 PROBE_AGENT=ccSWB PROBE_RUN=x3 \
//       node bin/probe.js ojs shared/playwright/checks/U12/SWB/swb.js
//   (likewise omp, ops; then PROBE_RUN=r2 / x4; PART=a11,a14 under r1, r2). PART=x and a14 need drainJobs (the
//   fleet's job queue) and reads the mail catcher by the admin's address.
// The register's site-picture lines (A12 on the site) are the issue walk's
// MODE=site (shared/playwright/checks/issues/announcement-image-files-left-behind/walk.js)
// on a dataset fleet, reset before each run (2026-11-09: fleet 7, runs w1, w2):
//   npm run fleet-prep -- --feature issues-sw09w --dataset 7 --reset
//   bin/app-lock.sh shared omp -- env MODE=site PKP_E2E_DATASET=7 PROBE_FEATURE=issues-sw09w PROBE_NOTES_FEATURE=U12 \
//       PROBE_AGENT=ccSWB-a12site PROBE_RUN=w1 node bin/probe.js omp shared/playwright/checks/issues/announcement-image-files-left-behind/walk.js
// Outputs: .reports/U12/ccSWB/swb-<part>-…-<run>-<app>.json and .png.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, note, idle, tag, drainJobs, sql, serverLog} =
    require('../../../probe');

const PARTS = (process.env.PART || 's1,s2,s3,s5').split(',').map((s) => s.trim()).filter(Boolean);
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = path.join(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/profile-image-400.png');
// The OJS page objects: their locators are lib/pkp's and the default theme's, the same on OMP and OPS.
const PO = () => require(path.join(__dirname, '../../../../../apps/ojs/playwright/pages/AnnouncementsPages.js'));

function isoDate(offsetDays = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}
function account(t, suffix, givenName, familyName, role) {
    return {username: `${t}${suffix}`, givenName, familyName, email: `${t}${suffix}@mail.test`, roles: [role]};
}
const flat = (s) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim());

forEachApp(async (app) => {
    const P = PO();
    for (const part of PARTS) {
        const facts = {app: app.name, part, run: process.env.PROBE_RUN || null};
        let n = 0;
        const F = (k, v) => {
            facts[k] = v;
            console.log(`[${app.name} ${part}] ${k}: ${JSON.stringify(v).slice(0, 300)}`);
        };
        // Every bullet's read: the screen first, then the answer; an error is a fact, never the end of the part.
        const snap = async (page, name, extra = {}) => {
            const s = await screen(page).catch((e) => ({error: String(e).slice(0, 200)}));
            const label = `swb-${part}-${String(++n).padStart(2, '0')}-${name}`;
            record(label, {...s, ...extra});
            await shot(page, label).catch(() => {});
            return s;
        };
        const step = async (k, fn) => {
            try {
                const v = await fn();
                if (v !== undefined) F(k, v);
            } catch (e) {
                F(k, {error: String(e && e.message ? e.message : e).split('\n').slice(0, 3).join(' | ').slice(0, 400)});
            }
        };
        const M = await launch(app); // the signed-in browser
        const V = await launch(app); // the signed-out visitor
        const page = M.page;
        const visitor = V.page;
        const dialogs = [];
        page.on('dialog', async (d) => {
            dialogs.push({type: d.type(), message: d.message()});
            await d.accept().catch(() => {});
        });
        try {
            if (part === 's1') await s1(app, P, page, visitor, F, snap, step, dialogs);
            else if (part === 's2') await s2(app, P, page, visitor, F, snap, step);
            else if (part === 's3') await s3(app, P, page, visitor, F, snap, step);
            else if (part === 's5') await s5(app, P, page, visitor, F, snap, step);
            else if (part === 'x') await partX(app, P, M, visitor, F, snap, step);
            else if (part === 'a11') await partA11(app, P, page, visitor, F, snap, step);
            else if (part === 'a14') await partA14(app, P, page, visitor, F, snap, step);
            else F('unknown part', part);
        } catch (e) {
            F('threw', String(e && e.stack ? e.stack : e).slice(0, 600));
        } finally {
            F('dialogs', dialogs);
            record(`swb-${part}-facts`, facts);
            await M.close().catch(() => {});
            await V.close().catch(() => {});
        }
    }
});

async function sideLabels(P, page) {
    return new P.SideMenu(page).topLevelLabels();
}

// ---------------------------------------------------------------- scenario 1
async function s1(app, P, page, visitor, F, snap, step) {
    const t = tag('u12swb');
    const users = {mg: `${t}mg`, se: `${t}se`, au: `${t}au`, rd: `${t}rd`};
    await app.api.createContext({
        tag: t,
        users: [
            account(t, 'mg', 'Mira', 'Manager', 'manager'),
            account(t, 'se', 'Sara', 'Sectioneditor', 'sectionEditor'),
            account(t, 'au', 'Ada', 'Author', 'author'),
            account(t, 'rd', 'Rita', 'Reader', 'reader'),
        ],
    });
    F('context', t);
    note(`ccSWB s1 [${app.name}]: scratch context ${t} (announcements off at creation; mg/se/au/rd)`);
    const publicList = new P.PublicAnnouncements(visitor, t);
    const home = P.homeBlock(visitor);

    // 498: the public side while off
    await step('498 public list off', async () => {
        const r = await visitor.goto(publicList.url());
        const s = await snap(visitor, 'public-list-off');
        return {status: r && r.status(), h1: flat(await visitor.locator('h1').first().innerText().catch(() => null)), nav: await visitor.locator('#navigationPrimary').count(), main: flat(s.text && s.text.main).slice(0, 200)};
    });
    await step('498 home off', async () => {
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-off');
        return {header: await P.primaryNavItems(visitor), block: await home.section.count()};
    });
    // 502: the side menu while off
    await signIn(page, users.mg);
    await step('502 side menu off', async () => {
        await page.goto(`/index.php/${t}/dashboard/editorial`);
        await idle(page);
        await snap(page, 'side-menu-off');
        return await sideLabels(P, page);
    });
    // 504: the tab
    const settings = new P.AnnouncementsSettingsTab(page, t);
    await step('504 tab before tick', async () => {
        await settings.goto();
        await snap(page, 'tab-before-tick');
        return {
            ticked: await settings.enableBox().isChecked(),
            sentence: flat(await settings.enableField().innerText()),
            fields: await settings.panel.locator('.pkpFormField').count(),
            labels: await settings.panel.locator('.pkpFormField label.pkpFormFieldLabel, .pkpFormField legend').allInnerTexts(),
        };
    });
    await step('504 tab after tick', async () => {
        await settings.enableBox().check();
        await sleep(400);
        await snap(page, 'tab-after-tick');
        return {
            fields: await settings.panel.locator('.pkpFormField').count(),
            labels: (await settings.panel.locator('.pkpFormField label.pkpFormFieldLabel, .pkpFormField legend').allInnerTexts()).map(flat),
            countHelp: flat(await settings.countField().innerText()),
        };
    });
    // 512: a refused count
    const formRead = async () => ({
        fieldError: flat(await settings.fieldError(settings.countField()).innerText().catch(() => null)),
        summary: flat(await settings.errorSummary().innerText().catch(() => null)),
        saveDisabled: await settings.saveButton().isDisabled(),
    });
    await step('512 abc saved', async () => {
        await settings.countInput().fill('abc');
        await settings.saveButton().click();
        await sleep(1500);
        const s = await snap(page, 'count-abc');
        return {...(await formRead()), notices: s.notices};
    });
    await step('512 -1 typed, before Save', async () => {
        await settings.countInput().fill('-1');
        await sleep(400);
        await snap(page, 'count-minus1-typed');
        return await formRead();
    });
    await step('512 -1 saved', async () => {
        await settings.saveButton().click();
        await sleep(1500);
        const s = await snap(page, 'count-minus1-saved');
        return {...(await formRead()), notices: s.notices};
    });
    // 518: saved
    await step('518 saved, no reload', async () => {
        await settings.typeIntroduction('News from the editors.');
        await settings.countInput().fill('2');
        await settings.saveButton().click();
        await settings.savedStatus().waitFor({timeout: T}).catch(() => {});
        await sleep(800);
        const s = await snap(page, 'saved-no-reload');
        const entry = new P.SideMenu(page).announcementsEntry();
        return {
            labels: await sideLabels(P, page),
            entryIcon: await entry.locator('svg, img, [class*="icon"], [class*="Icon"]').count(),
            settingsIcon: await new P.SideMenu(page).nav().locator('[role="button"]').filter({hasText: /^\s*Settings\s*$/}).first().locator('svg, img, [class*="icon"], [class*="Icon"]').count(),
            notices: s.notices,
        };
    });
    await step('518 after reload', async () => {
        await page.reload();
        await idle(page);
        await snap(page, 'after-reload');
        return await sideLabels(P, page);
    });
    // 523: the public side on
    await step('523 home on', async () => {
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-on');
        return {header: await P.primaryNavItems(visitor), block: await home.section.count(), skip: await P.skipToAnnouncements(visitor).count()};
    });
    await step('523 header item pressed', async () => {
        await P.primaryNavItem(visitor, 'Announcements').click();
        await idle(visitor);
        const s = await snap(visitor, 'public-list-on-empty');
        return {
            url: visitor.url(),
            breadcrumb: flat(await publicList.breadcrumb().innerText().catch(() => null)),
            heading: flat(await publicList.heading().innerText().catch(() => null)),
            container: flat(await publicList.container().innerText().catch(() => null)),
            articles: await publicList.articles().count(),
            lists: await publicList.list().count(),
            listHtml: flat(await publicList.list().first().innerHTML().catch(() => null)),
            editLink: await publicList.editLink().count(),
            main: flat(s.text && s.text.main),
        };
    });
    // 531: the "Edit" link
    await step('531 edit link as manager', async () => {
        const mgrList = new P.PublicAnnouncements(page, t);
        await mgrList.goto();
        await snap(page, 'public-list-as-manager');
        const link = mgrList.editLink();
        return {
            count: await link.count(),
            text: flat(await link.first().innerText().catch(() => null)),
            srText: flat(await link.first().locator('.pkp_screen_reader').innerText().catch(() => null)),
            ariaName: await link.first().evaluate((a) => a.getAttribute('aria-label') || a.getAttribute('title')).catch(() => null),
            href: await link.first().getAttribute('href').catch(() => null),
            target: await link.first().getAttribute('target').catch(() => null),
            placement: await link.first().evaluate((a) => {
                const h1 = a.closest('.page_announcements')?.querySelector('h1');
                return h1 ? (h1.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after h1' : 'before h1') : 'no h1';
            }).catch(() => null),
        };
    });
    await step('531 edit link pressed', async () => {
        const mgrList = new P.PublicAnnouncements(page, t);
        const pages = page.context().pages().length;
        await mgrList.editLink().first().click();
        await sleep(1500);
        const target = page.context().pages().length > pages ? page.context().pages().at(-1) : page;
        await idle(target);
        await snap(target, 'edit-link-landing');
        const adminPage = new P.AnnouncementsPage(target, t);
        const out = {
            newWindow: target !== page,
            url: target.url(),
            heading: flat(await adminPage.heading().innerText().catch(() => null)),
            tabs: (await target.locator('main [role="tab"]').allInnerTexts()).map(flat),
            selected: flat(await target.locator('main [role="tab"][aria-selected="true"]').first().innerText().catch(() => null)),
            empty: await adminPage.list().emptyMessage().count(),
            rows: await adminPage.list().rows().count(),
        };
        if (target !== page) await target.close();
        return out;
    });
    // 539: the control, at the "on" end
    for (const who of ['se', 'au', 'rd']) {
        await step(`539 control ${who}`, async () => {
            await signIn(page, users[who]);
            await idle(page);
            const landed = page.url();
            const out = {landed};
            await page.goto(`/index.php/${t}/en/management/settings/website`);
            await idle(page);
            let s = await snap(page, `control-${who}-website`);
            out.website = {url: page.url(), denied: /The current role does not have access to this operation\./.test((s.text && (s.text.main || '')) + (s.text && s.text.header || '')) || /authorizationDenied/.test(page.url()), setupTab: await page.locator('#setup-button').count()};
            await page.goto(`/index.php/${t}/en/management/settings/announcements`);
            await idle(page);
            s = await snap(page, `control-${who}-announcements`);
            out.announcements = {url: page.url(), denied: /authorizationDenied/.test(page.url()), listPanel: await page.locator('main .listPanel').count()};
            const dash = {se: `/index.php/${t}/dashboard/editorial`, au: `/index.php/${t}/dashboard/mySubmissions`, rd: `/index.php/${t}/user/profile`}[who];
            await page.goto(dash);
            await idle(page);
            await snap(page, `control-${who}-side-menu`);
            out.sideMenu = await sideLabels(P, page).catch((e) => ({error: String(e).slice(0, 120)}));
            return out;
        });
    }
}

// ---------------------------------------------------------------- scenario 2
async function s2(app, P, page, visitor, F, snap, step) {
    const t = tag('u12swb');
    const mg = `${t}mg`;
    const created = await app.api.createContext({tag: t, enableAnnouncements: true, numAnnouncementsHomepage: 2, users: [account(t, 'mg', 'Mira', 'Manager', 'manager')]});
    F('context', {tag: t, id: created.contextId});
    note(`ccSWB s2 [${app.name}]: scratch context ${t} (id ${created.contextId}; on, count 2)`);
    const today = isoDate(0);
    const tomorrow = isoDate(1);
    const admin = new P.AnnouncementsPage(page, t);
    const list = admin.list();
    const publicList = new P.PublicAnnouncements(visitor, t);
    const view = new P.AnnouncementView(visitor, t);
    const home = P.homeBlock(visitor);
    const summaryRead = async (sum) => ({
        img: await sum.image.count(),
        alt: await sum.image.first().getAttribute('alt').catch(() => null),
        title: flat(await sum.titleLink.innerText().catch(() => null)),
        href: await sum.titleLink.getAttribute('href').catch(() => null),
        date: flat(await sum.date.first().innerText().catch(() => null)),
        summary: flat(await sum.summary.first().innerText().catch(() => null)),
        readMore: flat(await sum.readMoreVisible.first().innerText().catch(() => null)),
        readMoreSr: flat(await sum.readMoreScreenReader.first().innerText().catch(() => null)),
    });
    await signIn(page, mg);
    // 551: the empty list
    await step('551 empty list from side menu', async () => {
        await page.goto(`/index.php/${t}/dashboard/editorial`);
        await idle(page);
        await new P.SideMenu(page).announcementsEntry().click();
        await idle(page);
        await snap(page, 'empty-list');
        return {url: page.url(), heading: flat(await admin.heading().innerText()), empty: await list.emptyMessage().count(), rows: await list.rows().count(), search: await list.searchBox().count(), add: await list.addButton().count(), tabs: (await page.locator('main [role="tab"]').allInnerTexts()).map(flat)};
    });
    // 554: an empty save
    let panel;
    await step('554 add panel', async () => {
        panel = await list.openAdd();
        await snap(page, 'add-panel');
        const d = panel.dialog;
        return {
            heading: flat(await d.locator('h1, h2').first().innerText().catch(() => null)),
            labels: (await d.locator('.pkpFormField label.pkpFormFieldLabel, .pkpFormField legend').allInnerTexts()).map(flat),
            shortHelp: flat(await panel.shortDescriptionField().locator('.pkpFormField__description').innerText().catch(() => null)),
            longHelp: flat(await panel.announcementField().locator('.pkpFormField__description').innerText().catch(() => null)),
            expiryHelp: flat(await panel.expiryField().locator('.pkpFormField__description').innerText().catch(() => null)),
            imageLabel: flat(await panel.label(panel.imageField()).innerText().catch(() => null)),
            email: await panel.sendEmailBox().count(),
            emailTicked: await panel.sendEmailBox().isChecked().catch(() => null),
            typeField: await panel.typeField().count(),
        };
    });
    await step('554 empty save', async () => {
        await panel.saveButton().click();
        await sleep(1200);
        const s = await snap(page, 'add-empty-save');
        return {
            open: await panel.dialog.count(),
            summary: flat(await panel.errorSummary().innerText().catch(() => null)),
            summaryPlace: await panel.errorSummary().evaluate((el) => {
                const save = [...el.closest('[role="dialog"]').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save');
                return save ? (el.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING ? 'above Save' : 'below Save') : null;
            }).catch(() => null),
            titleError: flat(await panel.fieldError(panel.titleField()).innerText().catch(() => null)),
            saveDisabled: await panel.saveButton().isDisabled(),
            notices: s.notices,
        };
    });
    // 567: a refused date and a refused file
    await step('567 bad date', async () => {
        await panel.titleInput().fill('Call for papers');
        await panel.expiryInput().fill('tomorrow');
        await sleep(300);
        await panel.saveButton().click();
        await sleep(1200);
        const s = await snap(page, 'add-bad-date');
        return {expiryError: flat(await panel.fieldError(panel.expiryField()).innerText().catch(() => null)), summary: flat(await panel.errorSummary().innerText().catch(() => null)), titleError: await panel.fieldError(panel.titleField()).count(), notices: s.notices};
    });
    await step('567 txt file', async () => {
        await panel.expiryInput().fill('');
        const notes = path.join(os.tmpdir(), `swb-notes-${process.pid}.txt`);
        fs.writeFileSync(notes, 'Not a picture.\n');
        const target = path.join(path.dirname(notes), 'notes.txt');
        fs.copyFileSync(notes, target);
        await panel.fileInput().setInputFiles(target);
        await sleep(1500);
        await snap(page, 'add-txt-refused');
        return {
            refused: flat(await panel.refusedFile().innerText().catch(() => null)),
            removeLink: flat(await panel.removeFileLink().innerText().catch(() => null)),
            removeLinkCss: await panel.removeFileLink().evaluate((a) => getComputedStyle(a).textTransform).catch(() => null),
            error: flat(await panel.dropzoneError().innerText().catch(() => null)),
            summary: flat(await panel.errorSummary().innerText().catch(() => null)),
            saveDisabled: await panel.saveButton().isDisabled(),
            uploadDisabled: await panel.uploadFileButton().isDisabled().catch(() => null),
        };
    });
    await step('567 remove file', async () => {
        await panel.removeFileLink().click();
        await sleep(600);
        await snap(page, 'add-txt-removed');
        return {refused: await panel.refusedFile().count(), error: await panel.dropzoneError().count(), saveDisabled: await panel.saveButton().isDisabled(), summary: flat(await panel.errorSummary().innerText().catch(() => null))};
    });
    // 576: the first announcement, with a picture
    let callId;
    await step('576 picture and save', async () => {
        await panel.typeShortDescription('Deadline 1 June.');
        await panel.typeAnnouncement('Submissions are open until 1 June.');
        const target = path.join(os.tmpdir(), 'photo.png');
        fs.copyFileSync(PNG, target);
        await panel.uploadImage(target);
        await snap(page, 'add-picture-preview');
        const alt = await panel.altTextInput().count();
        const altLabel = flat(await panel.imageField().innerText().catch(() => null));
        await panel.altTextInput().fill('Journal logo');
        callId = await panel.save();
        await idle(page);
        await snap(page, 'add-saved');
        const row = list.row('Call for papers');
        return {
            altBox: alt,
            imageFieldText: altLabel,
            id: callId,
            rows: await list.rowTitles(),
            rowLinks: (await row.getByRole('link').allInnerTexts()).map(flat),
            rowButtons: (await row.getByRole('button').allInnerTexts()).map(flat),
            rowText: flat(await row.innerText()),
        };
    });
    // 584: the public pages, signed out
    await step('584 public list', async () => {
        await publicList.goto();
        await snap(visitor, 'public-list-call');
        return {articles: await publicList.articles().count(), today, call: await summaryRead(publicList.summary('Call for papers'))};
    });
    await step('584 home block', async () => {
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-call');
        return {heading: flat(await home.heading.innerText().catch(() => null)), articles: await home.articles.count(), first: await summaryRead(home.first), skip: flat(await P.skipToAnnouncements(visitor).innerText().catch(() => null))};
    });
    await step('584 read more', async () => {
        await home.first.readMore.click();
        await idle(visitor);
        await snap(visitor, 'view-call');
        return {
            url: visitor.url(),
            title: await visitor.title(),
            breadcrumb: flat(await view.breadcrumb().innerText().catch(() => null)),
            heading: flat(await view.heading().innerText().catch(() => null)),
            date: flat(await view.date().innerText().catch(() => null)),
            alt: await view.image().first().getAttribute('alt').catch(() => null),
            order: await view.article().locator('img, .description').evaluateAll((els) => els.map((e) => e.className)).catch(() => null),
            text: flat(await view.description().innerText().catch(() => null)),
            links: (await view.container().locator('a').allInnerTexts()).map(flat),
            controls: await view.container().locator('button, input, select').count(),
        };
    });
    // 596: "View"
    await step('596 view from row', async () => {
        const pages = page.context().pages().length;
        await list.viewLink('Call for papers').click();
        await sleep(1500);
        await idle(page);
        await snap(page, 'row-view');
        const out = {sameWindow: page.context().pages().length === pages, url: page.url(), target: await page.locator('a').first().count()};
        await admin.goto();
        return out;
    });
    // 598: the second announcement, short description only
    let workshopId;
    await step('598 workshop added', async () => {
        const p = await list.openAdd();
        await p.titleInput().fill('Workshop');
        await p.typeShortDescription('Registration open.');
        await p.expiryInput().fill(tomorrow);
        workshopId = await p.save();
        await idle(page);
        await snap(page, 'workshop-saved');
        return {id: workshopId, rows: await list.rowTitles(), tomorrow};
    });
    await step('598 workshop public', async () => {
        await publicList.goto();
        await snap(visitor, 'public-list-workshop');
        const titles = await publicList.titles();
        await view.goto(workshopId);
        await idle(visitor);
        await snap(visitor, 'view-workshop');
        const v = {heading: flat(await view.heading().innerText().catch(() => null)), text: flat(await view.description().innerText().catch(() => null)), img: await view.image().count()};
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-workshop');
        return {
            titles,
            view: v,
            home: {articles: await home.articles.count(), first: await summaryRead(home.first), moreTitles: await home.moreTitles(), moreDates: (await home.moreDates.allInnerTexts()).map(flat), moreSummary: await home.more.first().locator('.summary').count(), moreText: flat(await home.more.first().innerText().catch(() => null))},
        };
    });
    // 607: edit
    await step('607 edit workshop', async () => {
        const p = await list.openEdit('Workshop');
        await sleep(800);
        await snap(page, 'edit-workshop-panel');
        const out = {heading: flat(await p.dialog.locator('h1, h2').first().innerText().catch(() => null)), title: await p.titleInput().inputValue(), short: flat(await p.richText(p.shortDescriptionField()).catch(() => null)), expiry: await p.expiryInput().inputValue()};
        await p.titleInput().fill('Workshop 2027');
        await p.save();
        await idle(page);
        await snap(page, 'edit-workshop-saved');
        out.rows = await list.rowTitles();
        await publicList.goto();
        await snap(visitor, 'public-list-workshop2027');
        out.publicTitles = await publicList.titles();
        return out;
    });
    // 613: expired
    await step('613 expired', async () => {
        const p = await list.openEdit('Workshop 2027');
        await p.expiryInput().fill(today);
        await p.save();
        await idle(page);
        await snap(page, 'expired-saved');
        const out = {rows: await list.rowTitles(), today};
        await publicList.goto();
        await snap(visitor, 'public-list-expired');
        out.publicTitles = await publicList.titles();
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-expired');
        out.home = {articles: await home.articles.count(), first: await summaryRead(home.first), more: await home.more.count()};
        const r1 = await view.goto(workshopId);
        await idle(visitor);
        let s = await snap(visitor, 'view-expired');
        out.expiredAddress = {status: r1 && r1.status(), url: visitor.url(), heading: flat(await visitor.locator('h1').first().innerText().catch(() => null)), notices: s.notices, article: await view.container().count(), titles: await publicList.titles().catch(() => null)};
        const r2 = await view.goto(999999);
        await idle(visitor);
        s = await snap(visitor, 'view-999999');
        out.unknownAddress = {status: r2 && r2.status(), url: visitor.url(), heading: flat(await visitor.locator('h1').first().innerText().catch(() => null)), notices: s.notices};
        await list.viewLink('Workshop 2027').click();
        await sleep(1500);
        await idle(page);
        s = await snap(page, 'row-view-expired');
        out.rowView = {url: page.url(), heading: flat(await page.locator('h1').first().innerText().catch(() => null)), notices: s.notices};
        await admin.goto();
        return out;
    });
    // 621: back from expiry
    await step('621 back from expiry', async () => {
        const p = await list.openEdit('Workshop 2027');
        const before = await p.expiryInput().inputValue();
        await p.expiryInput().fill('');
        await p.save();
        await idle(page);
        await publicList.goto();
        await snap(visitor, 'public-list-back');
        return {expiryShown: before, publicTitles: await publicList.titles()};
    });
    // 624: the picture removed
    await step('624 picture removed', async () => {
        const p = await list.openEdit('Call for papers');
        await sleep(800);
        await snap(page, 'edit-call-panel');
        const out = {preview: await p.preview().count(), alt: await p.altTextInput().inputValue().catch(() => null), remove: await p.removeButton().count(), restore: await p.restoreButton().count(), uploadBox: await p.uploadFileButton().count(), fieldText: flat(await p.imageField().innerText().catch(() => null))};
        await p.removeButton().click();
        await sleep(500);
        await snap(page, 'edit-call-removed');
        out.afterRemove = {preview: await p.preview().count(), restore: await p.restoreButton().count(), fieldText: flat(await p.imageField().innerText().catch(() => null))};
        await p.restoreButton().click();
        await sleep(500);
        await snap(page, 'edit-call-restored');
        out.afterRestore = {preview: await p.preview().count(), alt: await p.altTextInput().inputValue().catch(() => null), restore: await p.restoreButton().count()};
        await p.removeButton().click();
        await sleep(300);
        await p.save();
        await idle(page);
        await view.goto(callId);
        await idle(visitor);
        await snap(visitor, 'view-call-text-only');
        out.view = {heading: flat(await view.heading().innerText().catch(() => null)), img: await view.image().count(), text: flat(await view.description().innerText().catch(() => null))};
        await publicList.goto();
        await snap(visitor, 'public-list-text-only');
        out.listImgs = await publicList.container().locator('img').count();
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-text-only');
        out.homeImgs = await home.section.locator('img').count();
        out.homeArticles = await home.articles.count();
        return out;
    });
    // 631: delete
    await step('631 delete', async () => {
        await list.deleteButton('Workshop 2027').click();
        await list.deleteDialog().waitFor({timeout: T});
        await snap(page, 'delete-dialog');
        const out = {dialog: flat(await list.deleteDialog().innerText()), buttons: (await list.deleteDialog().getByRole('button').allInnerTexts()).map(flat)};
        await list.deleteDialog().getByRole('button', {name: 'No', exact: true}).click();
        await sleep(600);
        await snap(page, 'delete-no');
        out.afterNo = {dialog: await list.deleteDialog().count(), rows: await list.rowTitles()};
        await list.deleteAnnouncement('Workshop 2027');
        await idle(page);
        await snap(page, 'delete-yes');
        out.afterYes = {rows: await list.rowTitles()};
        const r = await view.goto(workshopId);
        await idle(visitor);
        const s = await snap(visitor, 'view-deleted');
        out.deletedAddress = {status: r && r.status(), url: visitor.url(), heading: flat(await visitor.locator('h1').first().innerText().catch(() => null)), notices: s.notices};
        await publicList.goto();
        out.publicTitles = await publicList.titles();
        return out;
    });
    // 638: control
    await step('638 control publicknowledge', async () => {
        const r = await visitor.goto(`/index.php/${app.contextPath}/en/announcement`);
        await snap(visitor, 'control-publicknowledge');
        return {status: r && r.status(), h1: flat(await visitor.locator('h1').first().innerText().catch(() => null))};
    });
}

// ---------------------------------------------------------------- scenario 3
async function s3(app, P, page, visitor, F, snap, step) {
    const t = tag('u12swb');
    const created = await app.api.createContext({
        tag: t,
        enableAnnouncements: true,
        numAnnouncementsHomepage: 2,
        announcements: [
            {title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'},
            {title: 'Workshop', descriptionShort: '<p>Registration open.</p>'},
            {title: 'Reading group', description: '<p>Meets monthly.</p>'},
        ],
        users: [account(t, 'mg', 'Mira', 'Manager', 'manager')],
    });
    const workshopId = (created.announcements || []).find((a) => a.title === 'Workshop')?.id;
    F('context', {tag: t, id: created.contextId, workshopId});
    note(`ccSWB s3 [${app.name}]: scratch context ${t} (id ${created.contextId}; three announcements, no types)`);
    const admin = new P.AnnouncementsPage(page, t);
    const list = admin.list();
    const publicList = new P.PublicAnnouncements(visitor, t);
    const view = new P.AnnouncementView(visitor, t);
    const home = P.homeBlock(visitor);
    await signIn(page, `${t}mg`);
    // 650: search
    await step('650 search', async () => {
        await admin.goto();
        await idle(page);
        const out = {start: await list.rowTitles()};
        for (const q of ['call', 'june', 'june call', '']) {
            await list.search(q);
            await idle(page);
            await snap(page, `search-${q.replace(/\s+/g, '-') || 'cleared'}`);
            out[q || '(cleared)'] = {rows: await list.rowTitles(), empty: await list.emptyMessage().count()};
        }
        return out;
    });
    // 657: the empty types table
    const types = () => admin.types();
    await step('657 empty types table', async () => {
        await admin.openTypesTab();
        await idle(page);
        await snap(page, 'types-empty');
        const g = types();
        return {text: flat(await g.grid.innerText()), nameHeader: await g.grid.getByRole('columnheader', {name: 'Name', exact: true}).count(), empty: await g.emptyMessage().isVisible().catch(() => false), add: await g.addLink().count()};
    });
    // 661: a refused name
    await step('661 refused name', async () => {
        const g = types();
        await g.openAdd();
        await snap(page, 'type-window');
        const w = g.window();
        const out = {heading: flat(await w.getByRole('heading').first().innerText().catch(() => null)), labels: (await w.locator('label').allInnerTexts()).map(flat).filter(Boolean), save: await g.windowSaveButton().count(), cancel: await g.windowCancelLink().count()};
        await g.windowSaveButton().click();
        await sleep(800);
        await snap(page, 'type-window-empty-save');
        out.error = flat(await g.nameError().innerText().catch(() => null));
        out.open = await g.nameInput('en').isVisible();
        return out;
    });
    // 665: two types added
    await step('665 two types', async () => {
        const g = types();
        await g.nameInput('en').fill('Conference');
        await g.save();
        await sleep(600);
        const s1 = await snap(page, 'type-conference-added');
        await g.openAdd();
        await g.nameInput('en').fill('Event');
        await g.save();
        await sleep(600);
        const s2 = await snap(page, 'type-event-added');
        return {notices1: s1.notices, notices2: s2.notices, rows: await g.rowNames()};
    });
    // 669: a type edited
    await step('669 type edited', async () => {
        const g = types();
        await g.openEdit('Conference');
        await snap(page, 'type-edit-window');
        const heading = flat(await g.window().getByRole('heading').first().innerText().catch(() => null));
        await g.nameInput('en').fill('Conference 2027');
        await g.save();
        await sleep(800);
        const s = await snap(page, 'type-edited');
        const atOnce = await g.rowNames();
        await sleep(3000);
        const later = await g.rowNames();
        await page.reload();
        await idle(page);
        await admin.openTypesTab();
        await idle(page);
        await snap(page, 'type-edited-reloaded');
        return {heading, notices: s.notices, atOnce, after3s: later, afterReload: await types().rowNames()};
    });
    // 674: a typed announcement
    await step('674 typed announcement', async () => {
        await admin.openAnnouncementsTab();
        let p = await list.openEdit('Workshop');
        await sleep(600);
        await snap(page, 'edit-workshop-types');
        const out = {
            caption: flat(await p.typeField().locator('legend, .pkpFormFieldLabel').first().innerText().catch(() => null)),
            radios: (await p.typeField().locator('label').allInnerTexts()).map(flat),
            checked: await p.typeRadios().evaluateAll((els) => els.filter((e) => e.checked).length),
        };
        await p.typeRadio('Event').check();
        await p.save();
        await idle(page);
        p = await list.openEdit('Workshop');
        await sleep(600);
        await snap(page, 'edit-workshop-event-chosen');
        out.again = {radios: (await p.typeField().locator('label').allInnerTexts()).map(flat), eventChecked: await p.typeRadio('Event').isChecked(), checked: await p.typeRadios().evaluateAll((els) => els.filter((e) => e.checked).map((e) => e.value))};
        await p.close();
        await publicList.goto();
        await snap(visitor, 'public-list-typed');
        out.publicListEvent = (await publicList.container().innerText()).includes('Event');
        await view.goto(workshopId);
        await snap(visitor, 'view-workshop-typed');
        out.viewEvent = (await visitor.locator('body').innerText()).includes('Event');
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-typed');
        out.homeEvent = (await visitor.locator('body').innerText()).includes('Event');
        out.homeTitles = await home.articles.locator('h2 a, h3 a').allInnerTexts();
        return out;
    });
    // 682: a type removed with its announcement
    await step('682 type removed', async () => {
        await admin.openTypesTab();
        const g = types();
        await g.openRemove('Event');
        await snap(page, 'type-remove-dialog');
        const out = {dialog: flat(await g.confirmDialog().innerText()), buttons: (await g.confirmDialog().locator('button, a').allInnerTexts()).map(flat).filter(Boolean)};
        await g.confirmDialog().getByRole('button', {name: 'OK', exact: true}).click();
        await sleep(1200);
        const s = await snap(page, 'type-removed');
        out.notices = s.notices;
        out.rows = await g.rowNames();
        await publicList.goto();
        await snap(visitor, 'public-list-after-remove');
        out.publicTitles = await publicList.titles();
        await P.gotoHome(visitor, t);
        await snap(visitor, 'home-after-remove');
        out.homeArticles = await home.articles.count();
        out.homeHasWorkshop = (await home.section.innerText().catch(() => '')).includes('Workshop');
        const r = await view.goto(workshopId);
        await idle(visitor);
        const sv = await snap(visitor, 'view-workshop-after-remove');
        out.workshopAddress = {status: r && r.status(), url: visitor.url(), heading: flat(await visitor.locator('h1').first().innerText().catch(() => null)), notices: sv.notices};
        await admin.openAnnouncementsTab();
        await idle(page);
        await snap(page, 'list-after-remove-no-reload');
        out.listNoReload = await list.rowTitles();
        await admin.goto();
        await idle(page);
        await snap(page, 'list-after-remove-reload');
        out.listReload = await list.rowTitles();
        return out;
    });
    // 692: control
    await step('692 control', async () => {
        await publicList.goto();
        await snap(visitor, 'public-list-control');
        return {publicTitles: await publicList.titles(), articles: await publicList.articles().count()};
    });
}

// ---------------------------------------------------------------- scenario 5
async function s5(app, P, page, visitor, F, snap, step) {
    const t = tag('u12swb');
    const created = await app.api.createContext({
        tag: t,
        context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        enableAnnouncements: true,
        numAnnouncementsHomepage: 2,
        announcements: [{title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'}],
        users: [account(t, 'mg', 'Mira', 'Manager', 'manager')],
    });
    F('context', {tag: t, id: created.contextId});
    note(`ccSWB s5 [${app.name}]: scratch context ${t} (id ${created.contextId}; en + fr_CA, one English-only announcement)`);
    const admin = new P.AnnouncementsPage(page, t);
    const list = admin.list();
    const publicList = new P.PublicAnnouncements(visitor, t);
    const home = P.homeBlock(visitor);
    await signIn(page, `${t}mg`);
    let p;
    await step('747 two-language panel', async () => {
        await admin.goto();
        p = await list.openAdd();
        const before = await p.titleInput('fr_CA').isVisible().catch(() => false);
        const buttons = (await p.dialog.locator('.pkpFormLocales button').allInnerTexts()).map(flat);
        await p.localeButton('French').first().click();
        await sleep(600);
        await snap(page, 'add-panel-french');
        const labels = (await p.dialog.locator('.pkpFormField label.pkpFormFieldLabel').allInnerTexts()).map(flat);
        return {frenchVisibleBefore: before, buttons, labels};
    });
    await step('751 french-only refused', async () => {
        await p.titleInput('fr_CA').fill('Appel à contributions');
        await p.saveButton().click();
        await sleep(1200);
        await snap(page, 'french-only-refused');
        return {open: await p.dialog.count(), summary: flat(await p.errorSummary().innerText().catch(() => null)), titleError: flat(await p.fieldError(p.titleField('en')).innerText().catch(() => null)), frError: await p.fieldError(p.titleField('fr_CA')).count()};
    });
    await step('755 saved in both', async () => {
        await p.titleInput('en').fill('Second call');
        await p.typeShortDescription('Date limite le 1er juin.', 'fr_CA');
        await p.save();
        await idle(page);
        await snap(page, 'both-saved');
        return {rows: await list.rowTitles()};
    });
    await step('759 french pages', async () => {
        await admin.goto({locale: 'fr_CA'});
        await idle(page);
        await snap(page, 'list-fr');
        const rows = await list.rowTitles();
        await publicList.goto('fr_CA');
        await snap(visitor, 'public-list-fr');
        const sum = async (title) => flat(await publicList.summary(title).summary.first().innerText().catch(() => null));
        const out = {rows, publicTitles: await publicList.titles()};
        out.appel = await sum('Appel à contributions');
        out.call = await sum('Call for papers');
        await P.gotoHome(visitor, t, 'fr_CA');
        await snap(visitor, 'home-fr');
        out.home = {articles: await home.articles.count(), text: flat(await home.section.innerText().catch(() => null))};
        return out;
    });
    await step('766 primary emptied', async () => {
        await admin.goto({locale: 'en'});
        const e = await list.openEdit('Second call');
        await e.titleInput('en').fill('');
        await e.saveButton().click();
        await sleep(1200);
        await snap(page, 'primary-emptied');
        const out = {open: await e.dialog.count(), titleError: flat(await e.fieldError(e.titleField('en')).innerText().catch(() => null)), summary: flat(await e.errorSummary().innerText().catch(() => null))};
        await e.close().catch(() => {});
        return out;
    });
    await step('770 type in two languages', async () => {
        await admin.openTypesTab();
        const g = admin.types();
        await g.openAdd();
        await g.nameInput('en').focus();
        await sleep(400);
        await snap(page, 'type-window-two-languages');
        const out = {enBox: await g.nameInput('en').isVisible(), frBox: await g.nameInput('fr_CA').isVisible().catch(() => false)};
        await g.nameInput('fr_CA').fill('Conférence');
        await g.windowSaveButton().click();
        await sleep(800);
        await snap(page, 'type-french-only');
        out.error = flat(await g.nameError().innerText().catch(() => null));
        await g.nameInput('en').fill('Conference');
        await g.save();
        await sleep(600);
        const s = await snap(page, 'type-added');
        out.notices = s.notices;
        out.rows = await g.rowNames();
        return out;
    });
    await step('776 english page (A17)', async () => {
        await publicList.goto('en');
        await snap(visitor, 'public-list-en');
        const second = publicList.summary('Second call');
        return {
            publicTitles: await publicList.titles(),
            call: flat(await publicList.summary('Call for papers').summary.first().innerText().catch(() => null)),
            secondSummaryCount: await second.summary.count(),
            secondSummary: flat(await second.summary.first().innerText().catch(() => null)),
            secondArticle: flat(await second.article.innerText().catch(() => null)),
        };
    });
}

// ---------------------------------------------------------------- part x (site-wide)
async function partX(app, P, M, visitor, F, snap, step) {
    const page = M.page;
    const adminMail = (sql(app, "select email from users where username = 'admin'") || '').trim();
    F('admin email', adminMail);
    await signIn(page, 'admin');
    const site = new P.SiteAnnouncementsTab(page);
    // The site's tab needs a second context: the campaign fleet has scratch contexts already.
    let asFound;
    await step('site as found', async () => {
        await site.goto();
        await site.openSideTab('settings');
        await snap(page, 'site-settings-asfound');
        const f = site.settingsForm();
        asFound = {ticked: await f.enableBox().isChecked(), count: await f.countInput().inputValue().catch(() => null)};
        return asFound;
    });
    await step('site switched on', async () => {
        const f = site.settingsForm();
        if (!(await f.enableBox().isChecked())) await f.enableBox().check();
        await f.countInput().fill('1');
        await f.save();
        await snap(page, 'site-settings-on');
        return {ticked: await f.enableBox().isChecked()};
    });
    // A3 on the site: a site announcement with an expiry, opened on "Edit" from a browser west of UTC
    const title = `SWB ${process.env.PROBE_RUN || ''} west`.trim();
    await step('A3 site add with expiry', async () => {
        await site.openSideTab('items');
        const list = site.list();
        const p = await list.openAdd();
        await p.titleInput().fill(title);
        await p.expiryInput().fill('2027-03-31');
        await p.save();
        await idle(page);
        await snap(page, 'site-a3-added');
        return {rows: await list.rowTitles(), stored: sql(app, `select date_expire from announcements where assoc_id is null and announcement_id = (select max(announcement_id) from announcements where assoc_id is null)`)};
    });
    await step('A3 site edit, west browser', async () => {
        const ny = await page.context().browser().newContext({baseURL: app.baseURL, viewport: {width: 1280, height: 900}, timezoneId: 'America/New_York', reducedMotion: 'reduce'});
        const wp = await ny.newPage();
        const crashes = [];
        wp.on('response', (r) => { if (r.status() >= 500) crashes.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
        wp.on('pageerror', (e) => crashes.push(`script ${String(e).slice(0, 200)}`));
        try {
            await signIn(wp, 'admin');
            const ws = new P.SiteAnnouncementsTab(wp);
            await ws.goto();
            await ws.openSideTab('items');
            const l = ws.list();
            const p = await l.openEdit(title);
            await sleep(800);
            await snap(wp, 'site-a3-west-edit');
            const box = await p.expiryInput().inputValue();
            const sent = wp.waitForRequest((r) => /\/api\/v1\/announcements\/\d+$/.test(r.url()) && r.method() === 'POST', {timeout: T});
            await p.saveButton().click();
            const req = await sent.catch(() => null);
            await sleep(1500);
            await snap(wp, 'site-a3-west-saved');
            const stored = sql(app, `select date_expire from announcements where assoc_id is null and announcement_id = (select max(announcement_id) from announcements where assoc_id is null)`);
            const p2 = await l.openEdit(title);
            await sleep(800);
            const box2 = await p2.expiryInput().inputValue();
            await p2.close().catch(() => {});
            return {boxOnOpen: box, sentDateExpire: req ? ((req.postData() || '').match(/dateExpire=[^&]*/) || [null])[0] : null, storedAfterSave: stored, boxNextOpen: box2, crashes};
        } finally {
            await ny.close();
        }
    });
    // A18 / scenario 6 "No email" on an add: the box ticked on the site's "Add Announcement", the jobs run, the admin's mail read
    await step('A18 site add with email', async () => {
        await site.goto();
        await site.openSideTab('items');
        const list = site.list();
        const since = new Date();
        const jobsBefore = sql(app, 'select count(*) from jobs');
        const p = await list.openAdd();
        const offered = await p.sendEmailBox().count();
        await p.titleInput().fill(`${title} added`);
        await p.typeShortDescription('Sunday morning.');
        if (offered) await p.sendEmailBox().check();
        const sent = page.waitForRequest((r) => /\/api\/v1\/announcements$/.test(r.url()) && r.method() === 'POST', {timeout: T});
        await p.save();
        const req = await sent.catch(() => null);
        await idle(page);
        await snap(page, 'site-a18-add-ticked');
        const jobsAfter = sql(app, 'select count(*) from jobs');
        await drainJobs(app);
        await sleep(2000);
        const count = adminMail ? await app.mail.count({to: adminMail, subject: `${title} added`, since}) : null;
        return {offered, sendEmailSent: req ? ((req.postData() || '').match(/sendEmail=[^&]*/) || [null])[0] : null, jobsBefore, jobsAfter, adminMails: count, rows: await list.rowTitles()};
    });
    // A18 on an edit: the email box ticked on the site's "Edit Announcement", the jobs run, the admin's mail read
    await step('A18 site edit with email', async () => {
        await site.goto();
        await site.openSideTab('items');
        const list = site.list();
        const since = new Date();
        // the add above is the one edited: its title is unique on the list ("… added")
        const p = await list.openEdit(`${title} added`);
        const offered = await p.sendEmailBox().count();
        const jobsBefore = sql(app, 'select count(*) from jobs');
        await p.titleInput().fill(`${title} mailed`);
        if (offered) await p.sendEmailBox().check();
        await p.saveButton().click();
        await sleep(1500);
        await snap(page, 'site-a18-edit-ticked');
        const jobsAfter = sql(app, 'select count(*) from jobs');
        await drainJobs(app);
        await sleep(2000);
        const count = adminMail ? await app.mail.count({to: adminMail, subject: `${title} mailed`, since}) : null;
        return {offered, jobsBefore, jobsAfter, adminMails: count, rows: await list.rowTitles()};
    });
    // OMP2: a press with its own count and no announcements, and its control (count empty)
    if (app.name === 'omp') {
        for (const [key, count] of [['own count, none', 1], ['count empty (control)', null]]) {
            await step(`OMP2 ${key}`, async () => {
                const t = tag('u12swb');
                const spec = {tag: t, enableAnnouncements: true, users: [account(t, 'mg', 'Mira', 'Manager', 'manager')]};
                if (count !== null) spec.numAnnouncementsHomepage = count;
                await app.api.createContext(spec);
                await P.gotoHome(visitor, t);
                await snap(visitor, `omp2-${count === null ? 'nocount' : 'owncount'}`);
                const sec = visitor.locator('section.cmp_announcements');
                return {press: t, blocks: await sec.count(), text: flat(await sec.first().innerText().catch(() => null))};
            });
        }
    }
    // the site restored as found: the added announcement deleted, the box back
    await step('site restored', async () => {
        await site.goto();
        await site.openSideTab('items');
        const list = site.list();
        for (const tt of await list.rowTitles()) {
            if (tt.startsWith(title)) await list.deleteAnnouncement(tt);
        }
        await site.openSideTab('settings');
        const f = site.settingsForm();
        if (asFound) {
            await f.countInput().fill(asFound.count || '');
            if (!asFound.ticked && (await f.enableBox().isChecked())) await f.enableBox().uncheck();
            await f.save();
        }
        await snap(page, 'site-restored');
        return {ticked: await f.enableBox().isChecked(), rows: await (async () => { await site.openSideTab('items').catch(() => {}); return site.list().rowTitles().catch(() => null); })()};
    });
}

// ---------------------------------------------------------------- part a11 (register A11's second half)
// "Edit" after a close keeps the unsaved title in "Title"; a "Save" made to change another box stores it.
async function partA11(app, P, page, visitor, F, snap, step) {
    const t = tag('u12swb');
    await app.api.createContext({tag: t, enableAnnouncements: true, announcements: [{title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>'}], users: [account(t, 'mg', 'Mira', 'Manager', 'manager')]});
    F('context', t);
    const admin = new P.AnnouncementsPage(page, t);
    const list = admin.list();
    const publicList = new P.PublicAnnouncements(visitor, t);
    await signIn(page, `${t}mg`);
    await step('A11 close, reopen, save another box', async () => {
        await admin.goto();
        let p = await list.openEdit('Call for papers');
        await p.titleInput().fill('Call for papers UNSAVED');
        await p.close();
        await sleep(600);
        await snap(page, 'a11-after-close');
        const out = {rowsAfterClose: await list.rowTitles()};
        p = await list.openEdit(out.rowsAfterClose[0]);
        await sleep(600);
        await snap(page, 'a11-reopened');
        out.titleOnReopen = await p.titleInput().inputValue();
        await p.typeShortDescription('Deadline 2 June.');
        await p.save();
        await idle(page);
        await snap(page, 'a11-saved-other-box');
        out.rowsAfterSave = await list.rowTitles();
        await admin.goto();
        await idle(page);
        out.rowsAfterReload = await list.rowTitles();
        await publicList.goto();
        await snap(visitor, 'a11-public');
        out.publicTitles = await publicList.titles();
        return out;
    });
}

// ---------------------------------------------------------------- part a14 (register A14's remedy)
async function partA14(app, P, page, visitor, F, snap, step) {
    const t = tag('u12swb');
    await app.api.createContext({
        tag: t,
        context: {name: `SWB ${t} French`, acronym: 'SWBF', primaryLocale: 'fr_CA', supportedLocales: ['fr_CA', 'en'], supportedFormLocales: ['fr_CA', 'en']},
        enableAnnouncements: true,
        users: [account(t, 'mg', 'Marie', 'Gestionnaire', 'manager'), account(t, 'rd', 'Rex', 'Reader', 'reader')],
    });
    F('context', t);
    await signIn(page, `${t}mg`);
    const SENTENCE = 'Visitez notre site pour lire tout le texte.';
    await step('A14 template French fields before', async () => {
        await page.goto(`/index.php/${t}/en/management/settings/manageEmails`);
        await idle(page);
        const search = page.getByRole('searchbox').first();
        if (await search.count()) { await search.fill('New Announcement'); await search.press('Enter'); await idle(page); await sleep(600); }
        const item = page.locator('.listPanel__item').filter({hasText: /New Announcement/}).first();
        await item.getByRole('button', {name: /Edit/}).first().click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.locator('iframe').first().waitFor({timeout: T});
        await idle(page);
        await sleep(800);
        await snap(page, 'a14-template-dialog');
        return {
            localeButtons: (await dlg.locator('.pkpFormLocales button').allInnerTexts()).map(flat),
            inputs: await dlg.locator('input[type=text]').evaluateAll((els) => els.map((i) => ({name: i.name, value: i.value, visible: !!i.offsetParent}))),
            iframes: await dlg.locator('iframe').evaluateAll((frs) => frs.map((f) => ({id: f.id, visible: !!f.offsetParent, text: (f.contentDocument && f.contentDocument.body ? f.contentDocument.body.innerText : '').slice(0, 200)}))),
        };
    });
    await step('A14 French body typed and saved', async () => {
        const dlg = page.locator('[role="dialog"]:visible').last();
        // the French twin of "Body": its frame id ends with fr_CA_ifr; show it first if hidden
        let frame = dlg.locator('iframe[id*="body"][id$="fr_CA_ifr"]').first();
        if (!(await frame.isVisible().catch(() => false))) {
            const b = dlg.locator('.pkpFormLocales button').filter({hasText: /French|fran/i}).first();
            if (await b.count()) { await b.click(); await sleep(500); }
        }
        frame = dlg.locator('iframe[id*="body"][id$="fr_CA_ifr"]').first();
        const body = frame.contentFrame().locator('body');
        await body.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Delete');
        await body.pressSequentially(`{$announcementTitle} ${SENTENCE}`);
        const subj = dlg.locator('input[name="subject-fr_CA"]');
        if (await subj.count() && !(await subj.inputValue())) await subj.fill('{$announcementTitle}');
        const nm = dlg.locator('input[name="name-fr_CA"]');
        if (await nm.count() && !(await nm.inputValue())) await nm.fill('Nouvelle annonce');
        await dlg.getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(1500);
        const s = await snap(page, 'a14-template-saved');
        return {dialogOpen: await page.locator('[role="dialog"]:visible').count(), notices: s.notices, errors: (await page.locator('.pkpFieldError:visible').allInnerTexts()).map(flat)};
    });
    await step('A14 announcement mailed after the template edit', async () => {
        const admin = new P.AnnouncementsPage(page, t);
        await admin.goto();
        const p = await admin.list().openAdd();
        const titles = p.dialog.locator('input[name^="title-"]');
        const names = await titles.evaluateAll((els) => els.map((e) => ({name: e.name, visible: !!e.offsetParent})));
        await p.dialog.locator('input[name="title-fr_CA"]').fill('Appel SWB');
        if (await p.sendEmailBox().count()) await p.sendEmailBox().check();
        const since = new Date();
        await p.save();
        await idle(page);
        await snap(page, 'a14-added');
        await drainJobs(app);
        let mail = null;
        try { mail = await app.mail.find({to: `${t}rd@mail.test`, subject: 'Appel SWB', since, timeoutMs: 30000}); } catch (e) { mail = null; }
        const full = mail ? await app.mail.fullMessage(mail.ID) : null;
        return {titleBoxes: names, found: !!mail, text: full ? flat(full.Text).slice(0, 400) : null, frenchSentence: full ? (full.Text || '').includes(SENTENCE) : null, englishSentence: full ? /Visit our website/.test(full.Text || '') : null};
    });
}
