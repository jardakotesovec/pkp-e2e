// PR review check — pkp/pkp-lib#13730 (pkp-e2e#598, U16 OMP1): pkp/omp#2553 hands the category case of
// CatalogHandler::fullSize() and ::thumbnail() to PKPCatalogHandler, which reads the public files folder that
// 3.6 stores category pictures in (pkp-lib#10404, its upgrade migration I10404_UpdateCategoryImageNameFields
// moves 3.5's pictures there). Signed out, on an OMP dataset fleet, this reads:
//   - the category page of CATEGORY (default applied-science): the picture block, its <img> drawn or broken
//     (complete + naturalWidth), the network answer for the thumbnail;
//   - the full-size and small-copy addresses for that category: status, content type, bytes, and whether the
//     bytes match the file in the fleet's public folder (sha1);
//   - edge addresses: a category with no picture (NOPIC, default 2), an id no category has (999999), a
//     non-integer id ("1abc"), each for fullSize and thumbnail;
//   - the server log lines the run added.
// No assertions. The upgrade case: a 3.5 install whose "Applied Science" got its picture through 3.5's own
// category form (checks/issues/category-picture/walk.js PART=picture on the 3.5 dataset fleet), dumped and
// loaded with PKP_E2E_DATASET_BRANCH so the reset runs main's upgrade:
//   PKP_E2E_DATASET_BRANCH=<custom> npm run fleet-prep -- --feature pr2553 --dataset 4 --reset --apps omp
//   PROBE_FEATURE=pr2553 PROBE_AGENT=x PROBE_RUN=<base|head> node bin/probe.js omp \
//     shared/playwright/checks/sync/omp-2553/upgraded-picture.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, record, shot, serverLog} = require('../../../probe');

const CATEGORY = process.env.CATEGORY || 'applied-science';
const NOPIC = process.env.NOPIC || '2';

forEachApp(async (app) => {
    const run = process.env.PROBE_RUN || 'run';
    const ctx = app.contextPath || 'publicknowledge';
    const facts = {app: app.name, run, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${run} ${k}: ${JSON.stringify(v).slice(0, 900)}`);
    };
    const slog = serverLog(app);
    const logFrom = slog.mark();
    const {page, close} = await launch(app);
    const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
    const publicDir = path.join(app.root, `public-ds${app.dataset}`, 'presses', '1');
    const publicFiles = {};
    if (fs.existsSync(publicDir)) {
        for (const f of fs.readdirSync(publicDir)) publicFiles[sha1(fs.readFileSync(path.join(publicDir, f)))] = f;
    }
    const typeAddress = async (address) => {
        const res = await page.goto(address).catch((e) => ({error: e.message}));
        if (!res || res.error) return {address, error: res && res.error};
        const body = await res.body().catch(() => Buffer.alloc(0));
        return {
            address: address.replace(/^https?:\/\/[^/]+/, ''),
            status: res.status(),
            contentType: res.headers()['content-type'] || null,
            bytes: body.length,
            matchesPublicFile: body.length ? publicFiles[sha1(body)] || null : null,
        };
    };
    try {
        const thumbAnswers = [];
        page.on('response', (r) => {
            if (/catalog\/thumbnail/.test(r.url())) thumbAnswers.push({status: r.status(), type: r.headers()['content-type'] || null});
        });
        const res = await page.goto(app.url(`/index.php/${ctx}/en/catalog/category/${CATEGORY}`));
        await page.waitForLoadState('networkidle').catch(() => {});
        const block = await page.evaluate(() => {
            const cover = document.querySelector('.about_section .cover');
            const img = cover && cover.querySelector('img');
            return {
                hasImageClass: !!document.querySelector('.about_section.has_image'),
                cover: cover ? {href: cover.getAttribute('href')} : null,
                img: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, drawn: img.complete && img.naturalWidth > 0} : null,
            };
        });
        fact('category page', {status: res && res.status(), block, thumbAnswers});
        await shot(page, `pr2553-${run}-category`);
        fact('fullSize', await typeAddress(app.url(`/index.php/${ctx}/en/catalog/fullSize?type=category&id=1`)));
        fact('thumbnail', await typeAddress(app.url(`/index.php/${ctx}/en/catalog/thumbnail?type=category&id=1`)));
        for (const [label, id] of [['no picture', NOPIC], ['no such id', '999999'], ['non-integer id', '1abc']]) {
            fact(`${label} fullSize`, await typeAddress(app.url(`/index.php/${ctx}/en/catalog/fullSize?type=category&id=${id}`)));
            fact(`${label} thumbnail`, await typeAddress(app.url(`/index.php/${ctx}/en/catalog/thumbnail?type=category&id=${id}`)));
        }
        fact('series thumbnail control (id 1)', await typeAddress(app.url(`/index.php/${ctx}/en/catalog/thumbnail?type=series&id=1`)));
        fact('server log lines added', slog.since(logFrom).map((l) => String(l).slice(0, 300)));
    } finally {
        record(`pr2553-${run}`, facts);
        await close();
    }
});
