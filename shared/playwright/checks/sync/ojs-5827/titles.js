// Kept reproduction for pkp/ojs#5827 on stable-3_5_0 (jatsTemplate 14f51fa667..26c6ca0aa2, issue pkp/pkp-lib#12414):
// titles in the default JATS XML. Written by the rr16 reader 2026-09-25. Run on the line:
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=sync-3_5 PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ojs-5827/titles.js
// and on main the same without PKP_E2E_LINE (PROBE_FEATURE=sync). RR16_ONLY=s1|s2 runs one half. Fixed on the line when
// s2-jats.xml's article-title reads "Effects at p&lt;0.05 in small trials" (S2) and s1-jats.xml's reads
// "The &lt;i&gt;species&lt;/i&gt; element in HTML" as text (S1, shared with main's pkp/ojs#5813 mechanism).
// One scratch journal (en + fr_CA), manager + author. S1: the English title typed through Publication > Title & Abstract
// (the rich-text box), the other three title fields PUT in the stored form the box produced; S2: an API key made on the
// manager's profile, then a Bearer PUT of raw "p<0.05" titles. Reads: stored publication, GET .../jats, the JATS XML page.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, outDir, note} = require('../../../probe');

const log = (...a) => console.log('[rr16]', ...a);
const save = (name, text) => { fs.writeFileSync(path.join(outDir(), name), text); log('wrote', name, text.length); };

async function sessionApi(page, method, url, data) {
    return page.evaluate(async ({method, url, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(url, {method, headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data), credentials: 'same-origin'});
        const text = await res.text();
        let body; try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 800); }
        return {status: res.status, body};
    }, {method, url, data});
}

function titleGroup(xml) { const m = xml.match(/<title-group>[\s\S]*?<\/title-group>/); return m ? m[0] : null; }

forEachApp(async (app) => {
    const scratch = tag('rr16');
    const mgr = `${scratch}mgr`, au = `${scratch}au`;
    const ctx = await app.api.createContext({
        tag: scratch,
        context: {path: scratch, name: `Scratch ${scratch}`, primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'],
            supportedFormLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']},
        users: [{username: mgr, roles: ['manager']}, {username: au, roles: ['author']}],
    });
    record('seed-context', ctx);
    const a = await app.api.createSubmission({tag: `${scratch}a`, context: scratch, submitter: au, title: 'rr16 S1 base title', submitted: true});
    const b = await app.api.createSubmission({tag: `${scratch}b`, context: scratch, submitter: au, title: 'rr16 S2 base title', submitted: true});
    record('seed-submissions', {a, b});
    log('subs', a.submissionId, a.publicationId, b.submissionId, b.publicationId);
    const api = (p) => app.url(`/index.php/${scratch}/api/v1/${p}`);
    const pubUrl = (s) => api(`submissions/${s.submissionId}/publications/${s.publicationId}`);

    const {page, close} = await launch(app);
    try {
        await signIn(page, mgr, {contextPath: scratch});
        if (process.env.RR16_ONLY !== 's2') {
        // ---- S1: type the English title in the Title & Abstract rich-text box
        await page.goto(app.url(`/index.php/${scratch}/dashboard/editorial?workflowSubmissionId=${a.submissionId}`));
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').first();
        await dlg.getByRole('link', {name: 'Title & Abstract', exact: true}).first().click({timeout: 20000});
        await idle(page);
        await page.waitForFunction(() => window.tinymce && window.tinymce.get().length > 0, null, {timeout: 20000});
        await page.waitForTimeout(1000);
        const eds = await page.evaluate(() => window.tinymce.get().map((e) => ({id: e.id, inline: e.inline})));
        record('s1-editors', eds);
        const ed = eds.find((e) => /title/i.test(e.id) && !/subtitle/i.test(e.id) && /-en$|-en-|_en/.test(e.id)) || eds.find((e) => /-title-/.test(e.id));
        log('editors', JSON.stringify(eds), 'using', ed && ed.id);
        const box = ed.inline ? page.locator(`#${ed.id}`) : page.frameLocator(`#${ed.id}_ifr`).locator('body');
        await box.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.keyboard.type(process.env.RR16_TYPED || 'The <i>species</i> element in HTML'); // RR16_TYPED: the editor control for S2
        await shot(page, 's1-typed');
        await dlg.getByRole('button', {name: 'Save', exact: true}).first().click();
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 20000}).catch((e) => log('no Saved status', e.message.slice(0, 100)));
        const storedA1 = await sessionApi(page, 'GET', pubUrl(a));
        const typedTitle = storedA1.body?.title?.en;
        record('s1-stored-after-ui', {status: storedA1.status, title: storedA1.body?.title});
        log('S1 stored en title:', JSON.stringify(typedTitle));
        // the other three fields in the same stored form the box produced
        const enc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const putA = await sessionApi(page, 'PUT', pubUrl(a), {
            subtitle: {en: enc('Why <b>bold</b> is not <strong>strong</strong>'), fr_CA: enc('Pourquoi <sup>exposant</sup> est une balise')},
            title: {en: typedTitle, fr_CA: enc("L'élément <i>espèce</i> en HTML")},
        });
        record('s1-put-others', {status: putA.status, title: putA.body?.title, subtitle: putA.body?.subtitle, error: putA.status >= 400 ? putA.body : undefined});
        log('S1 PUT others', putA.status);
        const jA = await sessionApi(page, 'GET', `${pubUrl(a)}/jats`);
        if (jA.body?.jatsContent) { save('s1-jats.xml', jA.body.jatsContent); record('s1-title-group', {group: titleGroup(jA.body.jatsContent), isDefault: jA.body.isDefaultContent}); log(titleGroup(jA.body.jatsContent)); }
        else record('s1-jats', jA);
        // the JATS XML page as the manager sees it
        await page.goto(app.url(`/index.php/${scratch}/dashboard/editorial?workflowSubmissionId=${a.submissionId}`));
        await idle(page);
        await page.locator('[role="dialog"]:visible').first().getByRole('link', {name: 'JATS XML', exact: true}).first().click({timeout: 20000}).catch((e) => log('JATS XML link', e.message.slice(0, 100)));
        await idle(page); await page.waitForTimeout(1500);
        const s1screen = await screen(page);
        record('s1-jats-page', {url: s1screen.url, dialogHead: (s1screen.text?.dialog || '').match(/<title-group>[\s\S]*?<\/title-group>/)?.[0] || (s1screen.text?.dialog || '').slice(0, 1500)});
        await shot(page, 's1-jats-page');

        }
        // ---- S2: API key through the manager's profile screen
        await page.goto(app.url(`/index.php/${scratch}/user/profile`));
        await idle(page);
        await page.getByRole('tab', {name: /API Key/i}).or(page.getByRole('link', {name: /API Key/i})).first().click();
        await idle(page); await page.waitForTimeout(1000);
        const form = page.locator('form#apiProfileForm');
        await form.waitFor({timeout: 20000});
        await shot(page, 's2-profile-apikey-before');
        await form.getByRole('button').first().click();
        await idle(page); await page.waitForTimeout(2000);
        await page.goto(app.url(`/index.php/${scratch}/user/profile`)); await idle(page);
        await page.getByRole('tab', {name: /API Key/i}).or(page.getByRole('link', {name: /API Key/i})).first().click();
        await idle(page); await page.waitForTimeout(1000);
        const key = await page.locator('form#apiProfileForm input[name="apiKey"]').first().inputValue().catch(() => null);
        record('s2-apikey', {got: !!key, len: key ? key.length : 0, screen: (await screen(page)).text?.main?.slice(0, 800)});
        await shot(page, 's2-profile-apikey');
        log('api key length', key ? key.length : 0);
        if (!key) throw new Error('no API key read from the profile screen');
        const bearer = async (method, url, data) => {
            const res = await fetch(url, {method, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`}, body: data === undefined ? undefined : JSON.stringify(data)});
            const text = await res.text(); let body; try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 800); }
            return {status: res.status, body};
        };
        const putB = await bearer('PUT', pubUrl(b), {
            title: {en: 'Effects at p<0.05 in small trials', fr_CA: 'Effets à p<0,05 dans de petits essais'},
            subtitle: {en: 'Cohorts of n<30 patients'},
        });
        record('s2-put', {status: putB.status, title: putB.body?.title, subtitle: putB.body?.subtitle, error: putB.status >= 400 ? putB.body : undefined});
        log('S2 PUT', putB.status, JSON.stringify(putB.body?.title));
        const jB = await bearer('GET', `${pubUrl(b)}/jats`);
        if (jB.body?.jatsContent) { save('s2-jats.xml', jB.body.jatsContent); record('s2-title-group', {group: titleGroup(jB.body.jatsContent)}); log(titleGroup(jB.body.jatsContent)); }
        else record('s2-jats', jB);
        // the same title where a person sees it: the workflow header
        await page.goto(app.url(`/index.php/${scratch}/dashboard/editorial?workflowSubmissionId=${b.submissionId}`));
        await idle(page); await page.waitForTimeout(1000);
        const s2w = await screen(page);
        record('s2-workflow', {dialogHead: (s2w.text?.dialog || '').slice(0, 400)});
        await shot(page, 's2-workflow');
        record('done', {scratch, a: a.submissionId, b: b.submissionId});
    } finally {
        await close();
    }
});
