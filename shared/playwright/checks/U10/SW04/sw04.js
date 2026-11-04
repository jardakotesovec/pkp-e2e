// U10 drift sweep, chunk SW04 (housekeeping 2026-11-04): the lines of
// docs/specs/U10-appearance-and-theming.md the kept checks (U10/K1–K5, I05,
// I28, I29, H21, I23H) and the register's issue walks do not reach, on all
// three apps: Fields, "The upload boxes" (a picture box holding a saved
// picture: no visible "Upload File", the keyboard's hidden "Upload File",
// "Restore Original" only on a box that opened with a saved file, a
// replacement arriving with an empty "Alternate text" and saved without a
// description; a BMP over a saved logo refused at "Save", the box showing it
// until a reload, the earlier logo kept on the page and in the visitor's
// header; a ".css" saved whatever it holds, an empty one and one opening with
// a comment block and a `:root` rule; the style sheet box's name, then
// "styleSheet.css" after a reload) and Rule 2's way out of "Setup" with an
// unsaved change.
//
// Seeds its own scratch context per app and run (tag prefix u10sw04, English
// only, one Journal/Press/Server Manager), signs in as that manager, reads
// the public pages signed out in a second browser, and records every screen
// with screen(). No assertions: the script records, the reader judges
// (facts in sw04-facts-<run>-<app>.json, screens sw04-<step>-<run>-<app>.json).
//
//   PROBE_FEATURE=U10 PROBE_AGENT=ccSW04 PROBE_RUN=r1 node bin/probe.js all shared/playwright/checks/U10/SW04/sw04.js
//   (PROBE_RUN=r2 for the second run; PHASES=boxes,bmp,css,leave narrows, default all; every phase seeds
//   nothing more than the run's one context, made on the first phase that runs)
//
// The register's issue walks run beside it through walks.sh in this folder (dataset fleet, one lane per
// app); no other script, file or env part.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, note, outFile} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const {png, bmp} = require(path.join(REPO, 'shared/playwright/checks/issues/logo-save-refusal-no-message-under-box/lib.js'));
const {WebsiteSettings} = require(path.join(REPO, 'shared/playwright/pages/AppearancePages.js'));

const RUN = process.env.PROBE_RUN || 'r0';
const PHASES = (process.env.PHASES || 'boxes,bmp,css,leave').split(',');
const T = 20_000;
const flat = (s) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim());
const log = (...a) => console.log('[sw04]', ...a);
const THUMB = {ojs: 'journalThumbnail', omp: 'pressThumbnail', ops: 'serverThumbnail'};

const pic = (name, w, h, rgb) => ({name, mimeType: 'image/png', buffer: png(w, h, rgb)});
const LOGO = pic('logo.png', 1600, 160, [0, 102, 204]);
const LOGO2 = pic('logo2.png', 400, 100, [204, 102, 0]);
const THUMBPIC = pic('thumb.png', 120, 120, [0, 153, 0]);
const BMP = {name: 'logo.bmp', mimeType: 'image/bmp', buffer: bmp(120, 40, [204, 0, 0])};
const CSS_EMPTY = {name: 'empty.css', mimeType: 'text/css', buffer: Buffer.from('')};
const CSS_ROOT = {
    name: 'root-rule.css',
    mimeType: 'text/css',
    buffer: Buffer.from('/*\n * U10 SW04 style sheet\n * a comment block first\n */\n:root {\n  --sw04: #ff0000;\n}\nh1, h2, h3 {\n  color: var(--sw04);\n}\n'),
};

async function boxState(box) {
    const out = {};
    out.preview = await box.preview.count();
    out.thumbSrc = (await box.thumbnail.count()) ? await box.thumbnail.first().getAttribute('src') : null;
    out.alt = (await box.altText.count()) ? await box.altText.first().inputValue() : null;
    out.uploadPresence = await box.uploadPresence().catch((e) => ({error: String(e.message || e).slice(0, 120)}));
    out.uploadOffered = await box.uploadOffered().catch(() => null);
    out.restoreVisible = await box.button('Restore Original').count();
    out.removeVisible = await box.button('Remove').count();
    out.dropVisible = await box.dropzone.isVisible().catch(() => null);
    out.dropText = await box.dropzone.evaluate((d) => (d.closest('.-screenReader') ? 'screenReader: ' : 'onScreen: ') + d.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
    out.fileName = (await box.fileName.count()) ? flat(await box.fileName.first().innerText()) : null;
    out.fileLink = (await box.fileLink.count()) ? await box.fileLink.first().getAttribute('href') : null;
    out.underBox = (await box.field.locator('.pkpFieldError').allInnerTexts()).map(flat).filter(Boolean);
    out.warnSign = await box.field.locator('.pkpFormField--upload__preview .fa-exclamation-triangle, .dz-error-mark, .pkpIcon--error').count().catch(() => null);
    return out;
}

async function footState(form) {
    const saved = await form.savedStatus.isVisible().catch(() => false);
    const foot = (await form.errorSummary.count()) ? flat(await form.errorSummary.first().innerText()) : null;
    const footA11y = (await form.errorSummary.count()) ? flat(await form.errorSummary.first().textContent()) : null;
    const saveDisabled = await form.saveButton.isDisabled().catch(() => null);
    return {saved, foot, footA11y, saveDisabled};
}

async function pressSave(page, form) {
    const answered = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await form.saveButton.click();
    const r = await answered;
    const savedSeen = await form.savedStatus.waitFor({state: 'visible', timeout: 6_000}).then(() => true).catch(() => false);
    await idle(page);
    return {status: r ? r.status() : null, savedSeen};
}

async function visitorHome(app, ctx) {
    const v = await launch(app);
    try {
        await v.page.goto(app.url(`/index.php/${ctx}`));
        await idle(v.page);
        const s = await screen(v.page);
        const look = await v.page.evaluate(() => {
            const img = document.querySelector('.pkp_site_name img, .pkp_site_name_wrapper img');
            const nameLink = document.querySelector('.pkp_site_name a');
            const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
            const h = document.querySelector('.pkp_structure_main h1, .pkp_structure_main h2, .page h1, .page h2');
            return {
                logo: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), hasAlt: img.hasAttribute('alt'), w: img.width, h: img.height} : null,
                nameLinkText: nameLink ? nameLink.innerText.trim() : null,
                nameLinkAria: nameLink ? nameLink.getAttribute('aria-label') : null,
                styleSheet: sheets.filter((h) => /styleSheet/.test(h || '')),
                heading: h ? {text: h.innerText.trim().slice(0, 60), colour: getComputedStyle(h).color} : null,
            };
        });
        return {look, aria: s.aria ? String(s.aria).split('\n').filter((l) => /img|link "/.test(l)).slice(0, 8) : null, screen: s};
    } finally {
        await v.close();
    }
}

forEachApp(async (app) => {
    const facts = {app: app.name, run: RUN};
    const fact = (k, v) => {
        facts[k] = v;
        log(app.name, k, JSON.stringify(v).slice(0, 900));
        fs.writeFileSync(outFile(`sw04-facts-${RUN}.json`), JSON.stringify(facts, null, 2));
    };
    const ctx = tag('u10sw04');
    const mgr = `${ctx}m`;
    await app.api.createContext({tag: ctx, context: {name: `U10 SW04 ${ctx}`, acronym: 'SW04', description: {en: '<p>The SW04 summary.</p>'}}, users: [{username: mgr, roles: ['manager'], givenName: 'Sam', familyName: 'Manager'}]});
    note(`ccSW04 [${app.name}] ${RUN}: scratch ${ctx} (en only), manager ${mgr}`);
    fact('seed', {ctx, mgr});

    const {page, close} = await launch(app);
    const settings = new WebsiteSettings(page, ctx, {thumbnailField: THUMB[app.name]});
    const snap = async (name) => {
        record(`sw04-${name}-${RUN}`, await screen(page));
    };
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message()});
        await d.accept().catch(() => {});
    });
    try {
        await signIn(page, mgr, {contextPath: ctx});

        // ---- boxes: a saved picture's box; the keyboard; Restore Original; a replacement saved without text ----
        if (PHASES.includes('boxes')) {
            await settings.goto();
            let setup = await settings.open('appearance-setup');
            await snap('boxes-0-setup-fresh');
            const logo = setup.logo();
            const thumb = setup.thumbnail();
            fact('boxes-0-empty', {logo: await boxState(logo), thumb: await boxState(thumb)});
            const up1 = await logo.choose(LOGO);
            await logo.altText.fill('Journal logo');
            const up2 = await thumb.choose(THUMBPIC);
            fact('boxes-1-uploaded', {up1, up2, logo: await boxState(logo), thumb: await boxState(thumb)});
            await snap('boxes-1-uploaded');
            fact('boxes-2-save', await pressSave(page, setup));
            fact('boxes-2-after-save-same-page', {logo: await boxState(logo), thumb: await boxState(thumb), foot: await footState(setup)});
            await settings.reload();
            setup = await settings.open('appearance-setup');
            await snap('boxes-3-reloaded');
            fact('boxes-3-reloaded', {logo: await boxState(logo), thumb: await boxState(thumb)});
            // a mouse click on the box's own "Upload File" while it holds the picture
            const clickHidden = await logo.uploadButton.click({timeout: 3_000}).then(() => 'clicked').catch((e) => String(e.message || e).split('\n')[0].slice(0, 160));
            fact('boxes-4-mouse-on-hidden-upload', {clickHidden, chooserOpened: false});
            // the keyboard: Tab from "Alternate text" to "Upload File", Enter, a file
            let presses = null;
            try {
                presses = await logo.tabToUpload();
            } catch (e) {
                presses = String(e.message || e).slice(0, 120);
            }
            const focused = await logo.uploadButton.evaluate((b) => b === document.activeElement).catch(() => null);
            let kb = null;
            try {
                kb = await logo.chooseByKeyboard(LOGO2);
            } catch (e) {
                kb = String(e.message || e).split('\n')[0].slice(0, 200);
            }
            fact('boxes-5-keyboard', {presses, focused, upload: kb, logo: await boxState(logo)});
            await snap('boxes-5-keyboard-replaced');
            // Restore Original brings back the saved file and its text
            const restore = logo.button('Restore Original');
            if (await restore.count()) await restore.first().click();
            await idle(page);
            fact('boxes-6-restored', {logo: await boxState(logo)});
            await snap('boxes-6-restored');
            // replaced again (Remove + mouse), saved with the empty "Alternate text"
            const rem = logo.button('Remove');
            if (await rem.count()) await rem.first().click();
            fact('boxes-7-removed', {logo: await boxState(logo)});
            let up3 = null;
            try {
                up3 = await logo.choose(LOGO2);
            } catch (e) {
                up3 = String(e.message || e).split('\n')[0].slice(0, 200);
            }
            fact('boxes-7-replaced', {up3, logo: await boxState(logo)});
            fact('boxes-8-save-empty-alt', await pressSave(page, setup));
            fact('boxes-8-same-page', {logo: await boxState(logo)});
            await settings.reload();
            setup = await settings.open('appearance-setup');
            fact('boxes-9-reloaded', {logo: await boxState(logo)});
            await snap('boxes-9-reloaded');
            const vis = await visitorHome(app, ctx);
            record(`sw04-boxes-10-visitor-${RUN}`, vis.screen);
            fact('boxes-10-visitor', {look: vis.look, aria: vis.aria});
            await shot(page, `sw04-boxes-9-${RUN}`);
        }

        // ---- bmp: a BMP over the saved logo, refused at "Save" ----
        if (PHASES.includes('bmp')) {
            await settings.goto();
            let setup = await settings.open('appearance-setup');
            const logo = setup.logo();
            const before = await boxState(logo);
            const visBefore = await visitorHome(app, ctx);
            fact('bmp-0-before', {logo: before, visitor: visBefore.look});
            const rem = logo.button('Remove');
            if (await rem.count()) await rem.first().click();
            let up = null;
            try {
                up = await logo.choose(BMP);
            } catch (e) {
                up = String(e.message || e).split('\n')[0].slice(0, 200);
            }
            fact('bmp-1-chosen', {up, logo: await boxState(logo)});
            const saved = await pressSave(page, setup);
            await page.waitForTimeout(1_000);
            fact('bmp-2-save', {saved, logo: await boxState(logo), foot: await footState(setup)});
            await snap('bmp-2-after-save');
            await shot(page, `sw04-bmp-2-${RUN}`);
            const visDuring = await visitorHome(app, ctx);
            fact('bmp-3-visitor-same-time', visDuring.look);
            await settings.reload();
            setup = await settings.open('appearance-setup');
            fact('bmp-4-reloaded', {logo: await boxState(logo)});
            await snap('bmp-4-reloaded');
            const visAfter = await visitorHome(app, ctx);
            record(`sw04-bmp-5-visitor-${RUN}`, visAfter.screen);
            fact('bmp-5-visitor', visAfter.look);
        }

        // ---- css: an empty ".css" and one opening with a comment block and a :root rule ----
        if (PHASES.includes('css')) {
            for (const [k, file] of [['empty', CSS_EMPTY], ['root', CSS_ROOT]]) {
                await settings.goto();
                let adv = await settings.open('advanced');
                const sheet = adv.styleSheet;
                const rem = sheet.button('Remove');
                if (await rem.count()) await rem.first().click();
                let up = null;
                try {
                    up = await sheet.choose(file);
                } catch (e) {
                    up = String(e.message || e).split('\n')[0].slice(0, 200);
                }
                fact(`css-${k}-1-chosen`, {up, sheet: await boxState(sheet)});
                const saved = await pressSave(page, adv);
                fact(`css-${k}-2-save`, {saved, sheet: await boxState(sheet), foot: await footState(adv)});
                await snap(`css-${k}-2-after-save`);
                await settings.reload();
                adv = await settings.open('advanced');
                fact(`css-${k}-3-reloaded`, {sheet: await boxState(adv.styleSheet)});
                await snap(`css-${k}-3-reloaded`);
                const vis = await visitorHome(app, ctx);
                let body = null;
                if (vis.look.styleSheet.length) {
                    const r = await page.request.get(new URL(vis.look.styleSheet[0], app.baseURL).toString());
                    body = {status: r.status(), bytes: (await r.body()).length, type: r.headers()['content-type']};
                }
                record(`sw04-css-${k}-4-visitor-${RUN}`, vis.screen);
                fact(`css-${k}-4-visitor`, {look: vis.look, sheetFile: body});
            }
        }

        // ---- leave: an unsaved upload and footer on "Setup", a side tab and back, then away ----
        if (PHASES.includes('leave')) {
            await settings.goto();
            let setup = await settings.open('appearance-setup');
            const thumb = setup.thumbnail();
            const rem = thumb.button('Remove');
            if (await rem.count()) await rem.first().click();
            await thumb.choose(LOGO2).catch(() => null);
            await setup.typeFooter('Unsaved footer');
            const n0 = dialogs.length;
            await settings.open('theme');
            setup = await settings.open('appearance-setup');
            fact('leave-1-side-tab-back', {thumb: await boxState(thumb), footer: await setup.richContent(setup.footerId()).catch(() => null), dialogs: dialogs.slice(n0)});
            await snap('leave-1-side-tab-back');
            const n1 = dialogs.length;
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`)).catch((e) => fact('leave-2-goto-error', String(e.message || e).slice(0, 160)));
            await idle(page);
            await page.waitForTimeout(2_000);
            fact('leave-2-away', {url: page.url(), dialogs: dialogs.slice(n1)});
            await settings.goto();
            setup = await settings.open('appearance-setup');
            fact('leave-3-back', {thumb: await boxState(setup.thumbnail()), footer: await setup.richContent(setup.footerId()).catch(() => null)});
            await snap('leave-3-back');
        }
        fact('dialogs', dialogs);
    } finally {
        await close();
    }
});
