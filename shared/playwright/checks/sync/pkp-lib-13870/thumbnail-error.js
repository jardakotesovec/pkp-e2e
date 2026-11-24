// Kept check for the PR review of pkp/pkp-lib#13870 (npm workspaces; the regenerated lockfile takes
// dropzone from 6.0.0-beta.2 to 6.3.5). Dropzone 6.3.5 emits "error" ("Failed to load the image. The
// file may be corrupted.") when it cannot draw a thumbnail for a file whose type is image/*. This reads
// what an editor and an author then see, OJS only (the ui-library components are the same in OMP/OPS):
//   PROBE_FEATURE=sync PROBE_AGENT=r13870 LABEL=<head|base> node bin/probe.js ojs \
//     shared/playwright/checks/sync/pkp-lib-13870/thumbnail-error.js
// Files: the suite's not-an-image.png (text named .png) and a valid 8x8 RGB baseline TIFF written here
// (Chrome cannot draw TIFF). Surfaces:
//   image   an announcement's "Image" box (FieldUploadImage) in a scratch journal, manager
//   wizard  the submission wizard's "Upload Files" step (FileUploader), author.alex
// THROTTLE=<bytes/s> holds each upload's body (CDP upload throttle) so the thumbnail step ends before the
// upload does, as on a slow connection with a larger figure; LABEL names the run (head, base, head-slow …).
// Each read: the box's text, the .dz-error previews, the field's error text, at 0.3 s, 1.5 s and 5 s
// after the file is set, plus a screenshot. No assertions: the session judges.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {forEachApp, launch, signIn, record, shot, tag} = require('../../../probe');

const LABEL = process.env.LABEL || 'run';

function tiff(file) {
    const w = 8, h = 8, px = Buffer.alloc(w * h * 3, 0x80);
    const entries = [
        [256, 3, 1, w], [257, 3, 1, h], [258, 3, 3, 0], [259, 3, 1, 1], [262, 3, 1, 2],
        [273, 4, 1, 0], [277, 3, 1, 3], [278, 3, 1, h], [279, 4, 1, px.length],
    ];
    const ifdOff = 8, ifdLen = 2 + entries.length * 12 + 4, bpsOff = ifdOff + ifdLen, dataOff = bpsOff + 6;
    const b = Buffer.alloc(dataOff + px.length);
    b.write('II', 0); b.writeUInt16LE(42, 2); b.writeUInt32LE(ifdOff, 4); b.writeUInt16LE(entries.length, ifdOff);
    entries.forEach(([tagId, type, count, value], i) => {
        const o = ifdOff + 2 + i * 12;
        b.writeUInt16LE(tagId, o); b.writeUInt16LE(type, o + 2); b.writeUInt32LE(count, o + 4);
        if (tagId === 258) b.writeUInt32LE(bpsOff, o + 8);
        else if (tagId === 273) b.writeUInt32LE(dataOff, o + 8);
        else if (type === 3) b.writeUInt16LE(value, o + 8);
        else b.writeUInt32LE(value, o + 8);
    });
    b.writeUInt32LE(0, ifdOff + 2 + entries.length * 12);
    [8, 8, 8].forEach((v, i) => b.writeUInt16LE(v, bpsOff + i * 2));
    px.copy(b, dataOff);
    fs.writeFileSync(file, b);
    return file;
}

const THROTTLE = Number(process.env.THROTTLE || 0);

let cdp = null;

async function throttle(page) {
    if (!THROTTLE) return;
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: THROTTLE});
}

/** With THROTTLE: lift it, so the held upload completes, and read the box once it has answered. */
async function finish(page, box, name, uploaded) {
    if (!cdp) return;
    await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
    const r = await uploaded;
    await page.waitForTimeout(2000);
    record(`${LABEL}-${name}-done`, {
        status: r && r.status(),
        text: (await box.innerText()).replace(/\s+/g, ' ').trim(),
        dzError: await box.locator('.dz-error').count(),
    });
    await shot(page, `${LABEL}-${name}-done`);
    cdp = null;
}

async function readBox(page, box, name) {
    const out = [];
    for (const ms of THROTTLE ? [300, 1200, 3500, 8000] : [300, 1200, 3500]) {
        await page.waitForTimeout(ms);
        out.push({
            after: ms,
            text: (await box.innerText()).replace(/\s+/g, ' ').trim(),
            dzError: await box.locator('.dz-error').count(),
            fieldErrors: (await box.locator('.pkpFormFieldError, .pkpFieldError, [class*="Error"]:not(.dz-error-message)').allInnerTexts()).map((t) => t.trim()).filter(Boolean),
        });
    }
    record(`${LABEL}-${name}`, out);
    await shot(page, `${LABEL}-${name}`);
    return out;
}

forEachApp(async (app) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13870-'));
    const files = {
        notimage: path.join(app.root, '..', '..', 'apps', 'ojs', 'playwright', 'fixtures', 'files', 'not-an-image.png'),
        tiff: tiff(path.join(dir, 'figure.tif')),
    };
    if (!fs.existsSync(files.notimage)) files.notimage = path.resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/not-an-image.png');
    const {AnnouncementsPage} = require(path.resolve(__dirname, '../../../../../apps/ojs/playwright/pages/AnnouncementsPages.js'));

    // The announcement "Image" box, once per file, each in a fresh "Add Announcement" panel.
    const t = tag('r13870');
    const manager = `${t}mg`;
    await app.api.createContext({
        tag: t, enableAnnouncements: true,
        users: [{username: manager, givenName: 'Mira', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']}],
    });
    for (const [name, file] of Object.entries(files)) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, manager, {contextPath: t});
            const admin = new AnnouncementsPage(page, t);
            await admin.goto();
            const panel = await admin.list().openAdd();
            await panel.titleInput().fill(`Probe ${name}`);
            await throttle(page);
            const uploaded = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: 30_000}).catch(() => null);
            await panel.fileInput().setInputFiles(file);
            const reads = await readBox(page, panel.imageField(), `image-${name}`);
            await finish(page, panel.imageField(), `image-${name}`, uploaded);
            const r = await uploaded;
            record(`${LABEL}-image-${name}-upload`, {status: r && r.status()});
            if (name === 'notimage') {
                await panel.saveButton().click();
                await page.waitForTimeout(2500);
                record(`${LABEL}-image-${name}-aftersave`, {
                    box: (await panel.imageField().innerText()).replace(/\s+/g, ' ').trim(),
                    dzError: await panel.imageField().locator('.dz-error').count(),
                });
                await shot(page, `${LABEL}-image-${name}-aftersave`);
            }
            void reads;
        } finally {
            await close();
        }
    }

    // The submission wizard's "Upload Files" step, author.alex's draft.
    for (const [name, file] of Object.entries(files)) {
        const {submissionId} = await app.api.createSubmission({
            tag: `${t}${name}`, context: app.contextPath, submitter: 'author.alex', title: `Probe ${name}`, submitted: false,
        });
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'author.alex');
            await page.goto(app.url(`/index.php/${app.contextPath}/en/submission?id=${submissionId}`));
            const panel = page.locator('.submissionFilesListPanel').first();
            await panel.getByRole('button', {name: 'Add File', exact: true}).waitFor({timeout: 30_000});
            await throttle(page);
            const uploaded = page.waitForResponse((r) => /submissions\/\d+\/files/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000}).catch(() => null);
            await panel.locator('input[type="file"]').first().setInputFiles(file);
            await readBox(page, panel, `wizard-${name}`);
            await finish(page, panel, `wizard-${name}`, uploaded);
        } finally {
            await close();
        }
    }
});
