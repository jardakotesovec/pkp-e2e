const {forEachApp, launch, signIn, screen, record, idle, loc} = require('/Users/jarda/git/pkp/pkp-main/pkp-e2e/shared/playwright/probe');
forEachApp(async (app) => {
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'manager.maya'); await idle(page);
        await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`)); await idle(page);
        const tab = page.locator('#emails-button').or(page.getByRole('tab', {name: 'Emails', exact: true})).first();
        await tab.waitFor({timeout: 30000}); await tab.click(); await idle(page);
        const radios = page.locator('input[name="notifyAllAuthors"]');
        await radios.first().waitFor({timeout: 30000});
        const read = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (document.querySelector(`label[for="${e.id}"]`) || e.closest('label') || {}).innerText?.trim()})));
        const block = await radios.first().evaluate((e) => { const f = e.closest('.pkpFormField, fieldset'); return f ? f.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : null; });
        const s = await screen(page); s.notifyAllAuthors = read; s.block = block;
        record('publicknowledge-settings-emails', s);
        await loc(page, 'Settings › Workflow › Emails: "Notify All Authors" radios (publicknowledge, read-only)', radios);
        console.log(app.name, JSON.stringify(read), '|', block);
    } finally { await close(); }
});
