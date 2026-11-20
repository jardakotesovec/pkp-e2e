/**
 * @file shared/playwright/checks/sync/pkp-lib-13849/walk.js
 *
 * PR review of pkp/pkp-lib#13849 (stable-3_3_0, issue pkp/pkp-lib#13848):
 * CategoryDAO::categoryExistsByPath() counted a path over every context, so
 * the Add Category form refused a path another journal / press / server
 * already used ("The category path already exists. Please enter a unique
 * path."), though `categories` is unique on (context_id, path). After the
 * fix the check is scoped to the form's context.
 *
 * Per app, through the screens (Settings › <context> › Categories, Add
 * Category), the installer's `admin` managing two scratch contexts A and B
 * (lineScratchContext):
 *   a-first     A: add category, path P              -> saved (both refs)
 *   b-cross     B: add category, path P              -> saved at the head
 *                                                       (pathExists before)
 *   b-dup       B (or A before): add path P again     -> pathExists (both refs)
 *   edit-keep   edit the category of step 1, rename,  -> saved (both refs)
 *               path unchanged
 *   reader      <ctx>/catalog/category/P (OPS: preprints/category/P) for each
 *               context holding P -> 200, that context's own category name
 * plus the categories rows and the server log lines the walk wrote.
 *
 *   PKP_E2E_LINE=stable-3_3_0 npm run fleet-prep -- --feature sync-13849 --reset
 *   PKP_E2E_LINE=stable-3_3_0 PROBE_FEATURE=sync-13849 PROBE_AGENT=w13849 \
 *     node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13849/walk.js
 */
const {forEachApp, launch, signIn, record, shot, idle, sql, tag, serverLog, lineScratchContext} = require('../../../probe');

const PATH_EXISTS = 'The category path already exists';

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const from = log.mark();
    const results = [];
    const locale = app.primaryLocale;
    const catalogPage = app.name === 'ops' ? 'preprints' : 'catalog';

    const openCategories = async (ctx) => {
        await page.goto(app.url(`/index.php/${ctx}/management/settings/context#categories`));
        await idle(page);
        await page.locator('#categories-button, [role="tab"]:has-text("Categories"), button:has-text("Categories")').first().click();
        const grid = page.locator('#categoriesContainer');
        await grid.locator('a:has-text("Add Category")').first().waitFor({state: 'visible', timeout: 20000});
        return grid;
    };

    // Fill and submit the open category form; returns {saved, error}.
    const submitForm = async (fields) => {
        const form = page.locator('form#categoryForm');
        await form.waitFor({state: 'visible', timeout: 20000});
        if (fields.name !== undefined) {
            await form.locator(`input[name="name[${locale}]"]`).fill(fields.name);
        }
        if (fields.path !== undefined) {
            await form.locator('input[name="path"]').fill(fields.path);
        }
        const responseP = page.waitForResponse((r) => r.url().includes('update-category') && r.request().method() === 'POST', {timeout: 30000});
        await form.locator('button[type="submit"]').first().click();
        const response = await responseP;
        let body = {};
        try {
            body = await response.json();
        } catch (e) {
            body = {raw: (await response.text()).slice(0, 300)};
        }
        await idle(page);
        const content = typeof body.content === 'string' ? body.content : '';
        const error = content.includes(PATH_EXISTS) ? PATH_EXISTS : null;
        const formStillOpen = await page.locator('form#categoryForm').isVisible().catch(() => false);
        if (formStillOpen) {
            const visibleError = await page.locator('form#categoryForm').innerText();
            if (!error && visibleError.includes(PATH_EXISTS)) {
                return {saved: false, error: PATH_EXISTS, status: response.status()};
            }
            await page.keyboard.press('Escape');
            await page.locator('.pkp_modal_panel .close, .pkp_modal_panel button:has-text("Close")').first().click({timeout: 2000}).catch(() => {});
        }
        return {saved: !formStillOpen && !error, error, status: response.status()};
    };

    const add = async (ctx, name, catPath, label) => {
        const grid = await openCategories(ctx);
        await grid.locator('a:has-text("Add Category")').first().click();
        const r = await submitForm({name, path: catPath});
        await shot(page, label);
        return r;
    };

    const edit = async (ctx, categoryId, name, label) => {
        const grid = await openCategories(ctx);
        // On 3.3 the category's title in the grid is its edit link.
        await grid.locator(`a[href*="edit-category?categoryId=${categoryId}"]`).first().click();
        const r = await submitForm({name});
        await shot(page, label);
        return r;
    };

    const rows = (ids) => sql(app, `SELECT c.category_id, c.context_id, c.path, s.setting_value FROM categories c LEFT JOIN category_settings s ON s.category_id = c.category_id AND s.setting_name = 'title' AND s.locale = '${locale}' WHERE c.context_id IN (${ids.join(',')}) ORDER BY c.category_id`);

    try {
        await signIn(page, 'admin');
        const a = await lineScratchContext(app, page);
        const b = await lineScratchContext(app, page);
        const ids = [a.contextId, b.contextId];
        const P = tag('cat');
        const check = (name, got, want) => {
            const r = {case: name, ...got, want, ok: Object.entries(want).every(([k, v]) => got[k] === v)};
            results.push(r);
            console.log(`[13849] ${app.name} ${app.line} ${name}: ${JSON.stringify(got)} want ${JSON.stringify(want)} ${r.ok ? 'OK' : 'MISMATCH'}`);
        };

        check('a-first', await add(a.path, 'A category', P, 'a-first'), {saved: true});
        const bCross = await add(b.path, 'B category', P, 'b-cross');
        check('b-cross', bCross, {saved: true});
        // A same-context duplicate: B when b-cross saved, else A.
        const dupCtx = bCross.saved ? b : a;
        check(`dup-in-${bCross.saved ? 'b' : 'a'}`, await add(dupCtx.path, 'Duplicate', P, 'dup'), {saved: false, error: PATH_EXISTS});

        const aCat = sql(app, `SELECT category_id FROM categories WHERE context_id = ${a.contextId} AND path = '${P}'`);
        check('edit-keep', await edit(a.path, aCat, 'A category renamed', 'edit-keep'), {saved: true});

        const reader = [];
        for (const ctx of [a, b]) {
            const res = await page.request.get(app.url(`/index.php/${ctx.path}/${catalogPage}/category/${P}`));
            const html = await res.text();
            const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
            reader.push({ctx: ctx.path, status: res.status(), h1: title ? title.replace(/<[^>]+>/g, '').trim() : null});
        }
        console.log(`[13849] ${app.name} reader: ${JSON.stringify(reader)}`);

        await new Promise((r) => setTimeout(r, 500));
        const logLines = log.since(from).map((l) => l.slice(0, 220));
        const db = rows(ids);
        console.log(`[13849] ${app.name} rows:\n${db}`);
        if (logLines.length) console.log(`[13849] ${app.name} log: ${logLines.join(' / ')}`);
        record('cases', {
            line: app.line,
            libPkp: process.env.W13849_REF || null,
            contexts: {a: a.path, b: b.path},
            path: P,
            results,
            reader,
            rows: db,
            log: logLines,
        });
    } finally {
        await close();
    }
});
