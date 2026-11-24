// PR review of pkp/pkp-lib#13242, round 2: a journal with announcements on, a
// number for the home page stored and no announcement posted. On `main` the
// home page carries no announcements block (U12 S1); the round-1 fix of the
// `count(null)` 500 tests `!empty($announcements)`, true for an empty
// collection. OJS, PKP's default dataset ("second" journal has none), Default theme.
// Run: PROBE_FEATURE=pr13242 PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13260/announcements-empty.js
const {forEachApp, launch, signIn, record, sql, outDir} = require('../../../probe');
const path = require('path');

const J = '/index.php/second/en';
forEachApp(async (app) => {
    const out = {};
    const admin = await launch(app);
    const visitor = await launch(app);
    try {
        out.count = sql(app, 'select count(*) from announcements where assoc_id = 2');
        await signIn(admin.page, 'admin', {contextPath: 'second'});
        await admin.page.goto(`${J}/management/settings/website`, {waitUntil: 'load'});
        out.put = await admin.page.evaluate(async () => {
            const res = await fetch('/index.php/second/api/v1/contexts/2', {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.pkp.currentUser.csrfToken}, body: JSON.stringify({enableAnnouncements: true, numAnnouncementsHomepage: 2})});
            const json = await res.json();
            return {status: res.status, enableAnnouncements: json.enableAnnouncements, numAnnouncementsHomepage: json.numAnnouncementsHomepage};
        });
        const r = await visitor.page.goto(J, {waitUntil: 'load'});
        out.home = {
            status: r.status(),
            sections: await visitor.page.locator('section.cmp_announcements').count(),
            sectionText: (await visitor.page.locator('section.cmp_announcements').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()),
            skipLink: await visitor.page.locator('a[href="#homepageAnnouncements"]').count(),
        };
        const section = visitor.page.locator('section.cmp_announcements');
        if (await section.count()) {
            await section.first().screenshot({path: path.join(outDir(), `empty-section-${app.name}.png`)});
        }
        await visitor.page.screenshot({path: path.join(outDir(), `home-${app.name}.png`)});
    } finally {
        record(`announcements-empty-${process.env.STATE || 'run'}`, out);
        await admin.close(); await visitor.close();
    }
});
