// K1 one-off: the article's "Identifiers" page on the Rule 19 context: what the screen's own form GET answers.
const fs = require('fs'); const path = require('path');
const {forEachApp, launch, signIn, idle, record, outDir, shot} = require('../../../probe');
forEachApp(async (app) => {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k1-state-${app.name}.json`), 'utf8'));
    const {page, close} = await launch(app);
    const got = [];
    page.on('response', async (r) => { if (/_components\/identifier/.test(r.url())) got.push({status: r.status(), body: (await r.text().catch(() => '')).slice(0, 4000)}); });
    try {
        await signIn(page, S.uu.mg, {contextPath: S.U}); await idle(page);
        await page.goto(app.url(`/index.php/${S.U}/dashboard/editorial?workflowSubmissionId=${S.V.id}&workflowMenuKey=publication_${S.V.pub}_identifiers`));
        await idle(page); await page.waitForTimeout(4000); await idle(page);
        await shot(page, 'idprobe');
        record('idprobe', {got});
        console.log(JSON.stringify(got).slice(0, 3000));
    } finally { await close(); }
});
