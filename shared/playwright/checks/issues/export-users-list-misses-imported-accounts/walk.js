// Issue report docs/issues/U63-OMP7-export-users-list-misses-imported-accounts.md (U63 OMP7) {OJS OMP}: its Steps
// to reproduce, walked through the screens on PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets").
//
//   walk (default): as rvaca (the Press / Journal manager): left menu "Tools" › "Users XML Plugin"; "Export Users"
//        read (step 3); "Import Users" with the Steps' file (steps 4-5); "Export Users" read again (step 6); then the
//        control: the list's "Search" for "u63n16g", and the tool opened again from "Tools".
//   again: steps 1-6, then "Results" pressed again (jQuery UI 1.14 fetches a remote tab on every press, so the
//        import runs again), then the same file uploaded and "Import Users" pressed again; each followed by
//        "Export Users". Besides the screens it reads the accounts and their roles (SQL) and the mail (Evidence only).
//   nb:  the neighbour check for the fix: on "Export Users" a row ticked, "Import Users" pressed and "Export Users"
//        pressed again with no import: the tick stays and the list is not fetched again (fix in and out).
// OPS has no Users XML Plugin: the script records that its Tools list lacks the tool.
// The kit builds nothing; whatever the walk creates goes through the screens.
//
// Reset first:  npm run fleet-prep -- --feature issues-n16g --dataset 3 --reset
// Run (main):   PROBE_FEATURE=issues-n16g PROBE_AGENT=n16g node bin/probe.js all shared/playwright/checks/issues/export-users-list-misses-imported-accounts/walk.js [walk|nb|again]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-n16g-3_5 --dataset 3 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-n16g-3_5 PROBE_AGENT=n16g node bin/probe.js all shared/playwright/checks/issues/export-users-list-misses-imported-accounts/walk.js
// The fix (fix-ojs.diff, fix-omp.diff) is tried with PROBE_RUN=fix (walk), nb-in and nb-out (nb).
const {forEachApp, launch, signIn, record, idle, sql} = require('../../../probe');
const L = require('./lib');

const mode = process.argv.slice(2).find((a) => /^(walk|nb|again)$/.test(a)) || 'walk';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name}] ${k}: ${L.flat(JSON.stringify(v), 1500)}`); };
    const snap = L.snapper(`w-${mode}`);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        if (app.name === 'ops') {
            await page.goto(app.url(`/index.php/${app.contextPath}/en/management/tools`));
            await idle(page).catch(() => {});
            fact('ops tools list', {usersTool: await page.getByRole('link', {name: 'Users XML Plugin', exact: true}).count(), label: await snap(page, 'ops-tools')});
            return;
        }
        // Steps 1-2
        await L.openUsersTool(app, page);
        fact('step 2 tabs', {tabs: await L.toolTabs(page), label: await snap(page, 'tool-opened')});
        // Step 3
        await L.openTab(page, 'Export Users');
        const step3 = await L.readList(page);
        fact('step 3 list', {...step3, label: await snap(page, 'export-before')});

        if (mode === 'nb') {
            const box = page.locator('#usersGridContainer input[name="selectedUsers[]"]').first();
            await box.check().catch((e) => fact('nb tick error', L.flat(e.message, 200)));
            const ticked = await L.readList(page);
            const fetches = L.gridFetches(page);
            await L.openTab(page, 'Import Users');
            await L.openTab(page, 'Export Users');
            await L.sleep(1500);
            const after = await L.readList(page);
            fact('nb after tab switch', {tickedBefore: ticked.ticked, tickedAfter: after.ticked, pagingLine: after.pagingLine, gridFetches: fetches.count(), label: await snap(page, 'nb-after-switch')});
            fetches.stop();
            return;
        }

        // Steps 4-5
        await L.openTab(page, 'Import Users');
        const fetches = L.gridFetches(page);
        const res = await L.importUsers(page, L.writeFile(app));
        fact('step 5 import', {...res, gridFetchesSinceImport: fetches.count(), label: await snap(page, 'results')});
        // Step 6
        await L.openTab(page, 'Export Users');
        await L.sleep(1000);
        const step6 = await L.readList(page);
        fact('step 6 list', {...step6, gridFetchesSinceImport: fetches.count(), gridFetchUrls: fetches.urls(), label: await snap(page, 'export-after')});
        fetches.stop();
        if (mode === 'again') {
            const since = new Date();
            const db = () => { try { return sql(app, "select u.username || ' groups=' || count(uug.user_group_id) || ' must_change=' || coalesce(u.must_change_password::text,'null') from users u left join user_user_groups uug on uug.user_id = u.user_id where u.username like 'u63n16g%' group by u.username, u.must_change_password order by u.username").split('\n').filter(Boolean); } catch (e) { return [`sql error: ${L.flat(e.message, 200)}`]; } };
            const mail = async () => { try { return await app.mail.count({to: 'u63n16g', since}); } catch (e) { return `mail error: ${L.flat(e.message, 120)}`; } };
            fact('again db after first import', db());
            // "Results" pressed again
            const f2 = L.gridFetches(page);
            const imp = page.waitForResponse((r) => /UserImportExportPlugin\/import\?/.test(r.url()), {timeout: 60_000}).catch(() => null);
            await L.openTab(page, 'Results');
            const r2 = await imp;
            await L.sleep(1500);
            await idle(page).catch(() => {});
            const results2 = L.flat(await page.locator('#importExportTabs > [role="tabpanel"]:visible').first().innerText().catch(() => null), 2000);
            fact('again results pressed', {importRequest: r2 ? r2.status() : 'none', results: results2, gridFetches: f2.count(), db: db(), mail: await mail(), label: await snap(page, 'results-again')});
            await L.openTab(page, 'Export Users');
            fact('again list after results', {...(await L.readList(page)), gridFetches: f2.count(), label: await snap(page, 'export-after-results-again')});
            f2.stop();
            // The same file imported again
            await L.openTab(page, 'Import Users');
            const f3 = L.gridFetches(page);
            const res3 = await L.importUsers(page, L.writeFile(app));
            fact('again file imported again', {...res3, gridFetches: f3.count(), db: db(), mail: await mail(), label: await snap(page, 'results-reimport')});
            await L.openTab(page, 'Export Users');
            fact('again list after reimport', {...(await L.readList(page)), gridFetches: f3.count(), label: await snap(page, 'export-after-reimport')});
            f3.stop();
            return;
        }
        // Control 1: the list's own "Search"
        await L.searchList(page, 'u63n16g');
        fact('control search', {...(await L.readList(page)), label: await snap(page, 'control-search')});
        // Control 2: the tool opened again
        await L.openUsersTool(app, page);
        await L.openTab(page, 'Export Users');
        fact('control reopened', {...(await L.readList(page)), label: await snap(page, 'control-reopened')});
    } finally {
        record(`w-${mode}-facts`, facts);
        await close();
    }
});
