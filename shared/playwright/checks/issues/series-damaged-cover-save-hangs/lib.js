// Helpers of walk.js (issue report docs/issues/U17-OMP10-series-damaged-cover-save-hangs.md: a series' or a
// category's "Cover Image" with a PNG whose picture data is damaged). Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tidy = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const legacy = (app) => (app.line || 'main') !== 'main';

// A 2×3 red PNG; damagedPng() is the same picture with the last byte of its IDAT checksum flipped
// (the Steps' `damaged.png`, base64 iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/efwAAAABJRU5ErkJggg==).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/egAAAAABJRU5ErkJggg==', 'base64');
function damagedPng() {
    const b = Buffer.from(PNG);
    const at = b.indexOf('IDAT');
    const len = b.readUInt32BE(at - 4);
    b[at + 4 + len + 3] ^= 0xff;
    return b;
}
// A 3×2 green JPEG (PHP GD), for the neighbour check's JPEG path.
const JPG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBkZWZhdWx0IHF1YWxpdHkK/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/9sAQwEJCQkMCwwYDQ0YMiEcITIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy/8AAEQgAAgADAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A8Coooqyz/9k=',
    'base64'
);

/** Every picture in `root`: its address, whether it drew (natural width), and what the address answers. */
async function pictures(page, root) {
    const imgs = await root.locator('img').evaluateAll((els) =>
        els.map((e) => ({src: e.getAttribute('src'), alt: e.getAttribute('alt'), naturalWidth: e.naturalWidth, complete: e.complete}))
    ).catch(() => []);
    for (const img of imgs) {
        if (!img.src) continue;
        const r = await page.request.get(new URL(img.src, page.url()).toString()).catch(() => null);
        img.answer = r ? {status: r.status(), type: r.headers()['content-type'], bytes: (await r.body().catch(() => Buffer.alloc(0))).length} : null;
    }
    return imgs;
}

/**
 * Settings › … › "Categories" on the main line's window ("Add Category" or a row's "Edit"), or the older form on a
 * stable line (the grid's "Add Category" link, or the category's name). Returns a handle with upload/save/close.
 */
async function openCategory(page, app, {add = false, name = null} = {}) {
    const {CategoriesTab} = require('../../../pages/CategoriesPages.js');
    const tab = new CategoriesTab(page, app.contextPath);
    if (!legacy(app)) {
        await tab.goto();
        const win = add ? await tab.openAdd() : await tab.openEdit(name);
        await idle(page);
        return {
            kind: 'vue',
            root: () => win.root(),
            async fill({title, path}) {
                await win.nameBox('en').fill(title);
                await win.pathBox().fill(path);
            },
            async upload(file) {
                const r = await win.uploadCover(file);
                return {status: r.status()};
            },
            async save() {
                const r = await win.save();
                return {status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300)};
            },
            async errors() {
                return (await win.root().locator('.pkpFieldError, .pkpFormErrors').allInnerTexts().catch(() => [])).map(tidy).filter(Boolean);
            },
            isOpen: () => win.root().isVisible().catch(() => false),
            async close() {
                if (await win.root().isVisible().catch(() => false)) {
                    await win.closeButton().click().catch(() => page.keyboard.press('Escape'));
                    await win.root().waitFor({state: 'hidden', timeout: 10_000}).catch(() => null);
                }
            },
        };
    }
    await page.goto(app.url(tab.url()));
    await page.locator('#categories-button').click();
    await page.locator('#categoriesContainer table').first().waitFor({timeout: T});
    await idle(page);
    if (add) await page.locator('#categoriesContainer').getByRole('link', {name: 'Add Category', exact: true}).click();
    else await page.locator('#categoriesContainer a.pkp_linkaction_editCategory').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)}).first().click();
    const form = page.locator('form#categoryForm');
    await form.locator('[name="name[en]"]').waitFor({timeout: T});
    await idle(page);
    return {
        kind: 'legacy',
        root: () => form,
        async fill({title, path}) {
            await form.locator('[name="name[en]"]').fill(title);
            await form.locator('[name="path"]').fill(path);
        },
        async upload(file) {
            const up = page.waitForResponse((r) => /upload-?[Ii]mage/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch((e) => e);
            await form.locator('#plupload input[type=file]').setInputFiles(file);
            const r = await up;
            if (r instanceof Error) throw r;
            await sleep(800);
            await idle(page);
            return {status: r.status()};
        },
        async save() {
            const s = page.waitForResponse((r) => /update-?[Cc]ategory/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
            await form.getByRole('button', {name: 'OK', exact: true}).click();
            const r = await s;
            await idle(page).catch(() => null);
            return {status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300)};
        },
        async errors() {
            return (await form.locator('label.error, #formErrors li').allInnerTexts().catch(() => [])).map(tidy).filter(Boolean);
        },
        isOpen: () => form.isVisible().catch(() => false),
        async close() {
            if (await form.isVisible().catch(() => false)) {
                await form.getByRole('link', {name: 'Cancel'}).first().click().catch(() => null);
                await form.waitFor({state: 'hidden', timeout: 10_000}).catch(() => null);
            }
        },
    };
}

/**
 * The dataset's categories the Steps use: "Applied Science" (steps 13-15) and "Social Sciences" (the neighbour check);
 * OPS's stable-3_5_0 dataset has other categories, so there "History" and "Biology".
 */
function datasetCategories(app) {
    return app.name === 'ops' && legacy(app) ? {steps: 'History', neighbour: 'Biology'} : {steps: 'Applied Science', neighbour: 'Social Sciences'};
}

/**
 * A 400×300 PNG of random colours (so it compresses little, like a photograph), written by Node itself, and the
 * same file cut to half its length: the PART=truncated walk's "a PNG whose download stopped halfway".
 */
function photoPng() {
    const zlib = require('zlib');
    const w = 400, h = 300;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 0xff;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rnd();
    const crcTable = Array.from({length: 256}, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buf) => {
        let c = 0xffffffff;
        for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type), data]);
        const c = Buffer.alloc(4);
        c.writeUInt32BE(crc(body));
        return Buffer.concat([len, body, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const halfOf = (buf) => buf.subarray(0, Math.floor(buf.length / 2));

/** A 400×300 JPEG and GIF of random shapes, made by the PHP command line's GD (the app's own decoder), each cut to half. */
function photoJpgGif(dir) {
    const {execFileSync} = require('child_process');
    const code = '$im=imagecreatetruecolor(400,300);mt_srand(7);for($i=0;$i<3000;$i++){imagefilledellipse($im,mt_rand(0,400),mt_rand(0,300),mt_rand(5,60),mt_rand(5,60),imagecolorallocate($im,mt_rand(0,255),mt_rand(0,255),mt_rand(0,255)));}imagejpeg($im,$argv[1]."/photo.jpg",85);imagegif($im,$argv[1]."/photo.gif");';
    execFileSync('php', ['-r', code, dir]);
    const fs = require('fs');
    return {jpg: halfOf(fs.readFileSync(`${dir}/photo.jpg`)), gif: halfOf(fs.readFileSync(`${dir}/photo.gif`))};
}

module.exports = {T, sleep, tidy, legacy, PNG, JPG, damagedPng, photoPng, halfOf, photoJpgGif, pictures, openCategory, datasetCategories};
