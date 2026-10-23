// Issue report for U10 A22: a "Logo", thumbnail ("Journal thumbnail", "Press thumbnail", "Server thumbnail"),
// "Homepage Image" or "Favicon" replaced by a picture of another file type, and the site's "Logo" likewise, stays
// public at its old address. Takes the report's Steps on PKP's default test dataset (a dataset fleet):
//   WALK=steps (default)  as `rvaca`: "Setup": "Upload File" q23e-picture.png under "Logo", the thumbnail and
//                         "Homepage Image", "Save" (3); "Advanced": the same under "Favicon", "Save" (4); reloaded,
//                         the four addresses (5); "Setup": "Remove" + "Upload File" q23e-picture.jpg under the three,
//                         "Save" (6); "Advanced": "Remove" + q23e-picture.gif under "Favicon", "Save" (7); reloaded,
//                         the new addresses and the reader header's logo (8); signed out, the old and new addresses (9).
//   WALK=site             as `admin`: a second journal through "Create Journal" (the site's "Appearance" tab needs
//                         it), the site's "Logo" uploaded as a PNG, replaced by a JPEG, the old address opened signed out.
//   WALK=nb               the neighbour (fix in and out), as `rvaca`: English and French "Logo" PNGs; the English one
//                         replaced by another PNG (same name: the new picture must be served); then by a JPEG (the
//                         French PNG and the new JPEG must stay); "Save" untouched (the JPEG stays); "Remove" alone
//                         (the JPEG goes, as today).
// Each step records what it saw and the public folder's files, and never throws on a state the fix changes.
//
// Reset first:  npm run fleet-prep -- --feature issues-q23e --dataset 5 --reset
// Run (main):   PROBE_FEATURE=issues-q23e PROBE_AGENT=q23e node bin/probe.js all shared/playwright/checks/issues/replaced-picture-other-type-stays-public/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-q23e-3_5 PROBE_AGENT=q23e node bin/probe.js all shared/playwright/checks/issues/replaced-picture-other-type-stays-public/walk.js
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, record, shot, idle, outFile, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.WALK || 'steps';
const DIR = {ojs: 'journals', omp: 'presses', ops: 'contexts'};

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const name = (s) => `a22-${MODE}-${s}`;
    const runDir = path.dirname(outFile('files.txt'));
    const files = L.makeFiles(runDir);
    const pub = path.join(path.resolve(app.root), `public-ds${app.dataset}`);
    const ctxDir = path.join(pub, DIR[app.name], '1');
    const siteDir = path.join(pub, 'site');
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const {page, close} = await launch(app);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
    page.on('response', (r) => { if (r.status() >= 500 && !/plugin-gallery-grid/.test(r.url())) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
    page.on('dialog', (d) => {
        fact(`dialog ${Object.keys(facts.steps).length}`, {type: d.type(), message: d.message()});
        d.accept().catch(() => null);
    });
    const step = async (label, action) => {
        try {
            const out = await action();
            fact(label, out || {});
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        } finally {
            await idle(page).catch(() => null);
        }
    };
    const jpg = await L.makeJpeg(page, runDir, 'q23e-picture.jpg');
    const logo = L.box(page, 'appearanceSetup', 'pageHeaderLogoImage', 'en');
    const logoFr = L.box(page, 'appearanceSetup', 'pageHeaderLogoImage', 'fr_CA');
    const th = L.box(page, 'appearanceSetup', L.THUMB[app.name], 'en');
    const home = L.box(page, 'appearanceSetup', 'homepageImage', 'en');
    const fav = L.box(page, 'appearanceAdvanced', 'favicon', 'en');
    const siteLogo = L.box(page, 'siteAppearance', 'pageHeaderTitleImage', 'en');
    const setup = async () => { await L.openAppearance(page, app, 'setup'); await logo.field.waitFor({timeout: L.T}); };
    const advanced = async () => { await L.openAppearance(page, app, 'advanced'); await fav.field.waitFor({timeout: L.T}); };
    const srcs = async () => {
        await setup();
        const s = {logo: await L.pictureSrc(logo), thumbnail: await L.pictureSrc(th), homepage: await L.pictureSrc(home)};
        await advanced();
        s.favicon = await L.pictureSrc(fav);
        return s;
    };
    const openAll = async (s) => {
        const out = {};
        for (const [k, u] of Object.entries(s || {})) out[k] = await L.openAddress(page, u);
        return out;
    };
    const log = serverLog(app);
    try {
        if (MODE === 'steps') {
            await step('1 sign in as rvaca', async () => { await signIn(page, 'rvaca'); return {url: page.url()}; });
            await step('2-3 Setup: Upload File q23e-picture.png under Logo, thumbnail, Homepage Image; Save', async () => {
                await setup();
                const a = await L.pressUploadFile(page, logo, files.png);
                const b = await L.pressUploadFile(page, th, files.png);
                const c = await L.pressUploadFile(page, home, files.png);
                return {logo: a, thumbnail: b, homepage: c, ...(await L.save(page, logo))};
            });
            await step('4 Advanced: Upload File q23e-picture.png under Favicon; Save', async () => {
                await advanced();
                const a = await L.pressUploadFile(page, fav, files.png);
                return {favicon: a, ...(await L.save(page, fav))};
            });
            const first = await step('5 reload: the four addresses', srcs);
            fact('5 folder', L.listDir(ctxDir));
            await setup();
            record(name('stored'), await screen(page));
            await step('6 Setup: Remove + Upload File q23e-picture.jpg under the three; Save', async () => {
                await setup();
                const from = log.mark();
                const a = await L.replace(page, logo, jpg);
                const b = await L.replace(page, th, jpg);
                const c = await L.replace(page, home, jpg);
                const s = await L.save(page, logo);
                return {logo: a, thumbnail: b, homepage: c, ...s, serverLog: log.since(from)};
            });
            await step('7 Advanced: Remove + Upload File q23e-picture.gif under Favicon; Save', async () => {
                await advanced();
                const from = log.mark();
                const a = await L.replace(page, fav, files.gif);
                return {favicon: a, ...(await L.save(page, fav)), serverLog: log.since(from)};
            });
            const second = await step('8 reload: the new addresses', srcs);
            await setup();
            record(name('replaced'), await screen(page));
            await shot(page, name('replaced'));
            fact('8 folder', L.listDir(ctxDir));
            await step('8 the journal home page header logo', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}`));
                await idle(page);
                const img = page.locator('.pkp_site_name img, header img').first();
                return {src: (await img.count()) ? await img.getAttribute('src') : null};
            });
            await step('9 sign out, open the old addresses', async () => { await signOut(page); return openAll(first); });
            record(name('old-address'), await screen(page));
            await shot(page, name('old-address'));
            await step('9 the new addresses (control)', async () => openAll(second));
        } else if (MODE === 'site') {
            await step('S1 sign in as admin', async () => { await signIn(page, 'admin'); return {url: page.url()}; });
            await step('S2 Hosted Journals › Create Journal hkq23e second journal', async () => ({
                status: await L.createContext(page, app, {name: 'hkq23e second journal', initials: 'hkq23e', path: 'hkq23e', email: 'hkq23e@mailinator.com'}),
            }));
            await step('S3 Site Settings › Appearance › Setup: Upload File q23e-picture.png under Logo; Save', async () => {
                await L.openSiteAppearance(page, app);
                await siteLogo.field.waitFor({timeout: L.T});
                const a = await L.pressUploadFile(page, siteLogo, files.png);
                return {logo: a, ...(await L.save(page, siteLogo))};
            });
            const first = await step('S4 reload: the logo address', async () => {
                await L.openSiteAppearance(page, app);
                await siteLogo.field.waitFor({timeout: L.T});
                return {logo: await L.pictureSrc(siteLogo)};
            });
            fact('S4 folder', L.listDir(siteDir));
            await step('S5 Remove + Upload File q23e-picture.jpg under Logo; Save', async () => {
                const from = log.mark();
                const a = await L.replace(page, siteLogo, jpg);
                return {logo: a, ...(await L.save(page, siteLogo)), serverLog: log.since(from)};
            });
            const second = await step('S5 reload: the new address', async () => {
                await L.openSiteAppearance(page, app);
                await siteLogo.field.waitFor({timeout: L.T});
                return {logo: await L.pictureSrc(siteLogo)};
            });
            record(name('replaced'), await screen(page));
            fact('S5 folder', L.listDir(siteDir));
            await step('S6 sign out, open the old address', async () => { await signOut(page); return openAll(first); });
            record(name('old-address'), await screen(page));
            await step('S6 the new address (control)', async () => openAll(second));
        } else if (MODE === 'nb') {
            const logoSrcs = async () => {
                await setup();
                const en = await L.pictureSrc(logo);
                await L.showLanguage(logo, 'French');
                return {en, fr: await L.pictureSrc(logoFr)};
            };
            const out = async (s) => { await signOut(page); const o = await openAll(s); await signIn(page, 'rvaca'); return o; };
            await step('N1 sign in as rvaca; Setup: Logo PNG in English and French; Save', async () => {
                await signIn(page, 'rvaca');
                await setup();
                const a = await L.pressUploadFile(page, logo, files.png);
                await L.showLanguage(logo, 'French');
                const b = await L.pressUploadFile(page, logoFr, files.png);
                return {en: a, fr: b, ...(await L.save(page, logo))};
            });
            const s1 = await step('N1 reload: addresses', logoSrcs);
            await step('N2 English Logo: Remove + Upload File q23e-picture-2.png (same type); Save', async () => {
                await setup();
                return {en: await L.replace(page, logo, files.png2), ...(await L.save(page, logo))};
            });
            fact('N2 folder', L.listDir(ctxDir));
            await step('N2 signed out: both addresses (English must serve the new, smaller picture)', async () => out(s1));
            await step('N3 English Logo: Remove + Upload File q23e-picture.jpg; Save', async () => {
                await setup();
                return {en: await L.replace(page, logo, jpg), ...(await L.save(page, logo))};
            });
            const s3 = await step('N3 reload: addresses', logoSrcs);
            fact('N3 folder', L.listDir(ctxDir));
            await step('N3 signed out: the new English JPEG and the French PNG (both must stay)', async () => out(s3));
            await step('N4 Save untouched', async () => { await setup(); return L.save(page, logo); });
            await step('N4 signed out: both addresses (both must stay)', async () => out(s3));
            await step('N5 English Logo: Remove alone; Save', async () => {
                await setup();
                return {en: await L.pressRemove(logo), ...(await L.save(page, logo))};
            });
            fact('N5 folder', L.listDir(ctxDir));
            await step('N5 signed out: the English JPEG gone, the French PNG kept', async () => out(s3));
        }
    } finally {
        fact('errors (page scripts, 5xx)', errors);
        record(name('facts'), facts);
        await close();
    }
});
