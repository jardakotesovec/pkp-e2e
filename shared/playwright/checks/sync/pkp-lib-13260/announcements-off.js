// PR review of pkp/pkp-lib#13242, finding 13: a journal whose announcements are switched off while a
// number of announcements for the home page is still stored. OJS, PKP's default dataset, Default theme.
// Run: PROBE_FEATURE=pr13242 PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13260/announcements-off.js
const {forEachApp, launch, signIn, record, serverLog} = require('../../../probe');
const J = '/index.php/publicknowledge/en';
forEachApp(async (app) => {
    const out = {};
    const log = serverLog(app);
    const from = log.mark();
    const editor = await launch(app);
    const visitor = await launch(app);
    const put = (body) => editor.page.evaluate(async (body) => {
        const res = await fetch('/index.php/publicknowledge/api/v1/contexts/1', {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.pkp.currentUser.csrfToken}, body: JSON.stringify(body)});
        const json = await res.json();
        return {status: res.status, enableAnnouncements: json.enableAnnouncements, numAnnouncementsHomepage: json.numAnnouncementsHomepage};
    }, body);
    const home = async () => { const r = await visitor.page.goto(J, {waitUntil: 'load'}); return {status: r.status(), h1: await visitor.page.locator('h1').allInnerTexts()}; };
    try {
        await signIn(editor.page, 'dbarnes', {contextPath: 'publicknowledge'});
        await editor.page.goto(`${J}/management/settings/website`, {waitUntil: 'load'});
        out.start = await home();
        out.on = await put({enableAnnouncements: true, numAnnouncementsHomepage: 2});
        out.homeOn = await home();
        out.off = await put({enableAnnouncements: false});
        out.homeOff = await home();
        out.log = log.since(from).filter((l) => !/plugin-gallery|PluginGalleryDAO|pkp\.sfu/.test(l)).map((l) => l.replace(/\s+/g, ' ').slice(0, 330)).slice(0, 4);
        out.back = await put({numAnnouncementsHomepage: 0});
    } finally {
        record(`announcements-off-${process.env.STATE || 'run'}`, out);
        await editor.close(); await visitor.close();
    }
});
