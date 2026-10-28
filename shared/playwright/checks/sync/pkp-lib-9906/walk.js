// PR review check — pkp/pkp-lib#9906 on stable-3_5_0: pkp/omp#2456 (Thema subject categories in OMP: the press
// setting, the suggestions, the save and submit rules, the ONIX export) with pkp/pkp-lib#13301 (the BIC files
// removed, `allowCustom` on FieldControlledVocab, overridable metadata forms). OMP, PKP's default test dataset,
// press `publicknowledge`. It changes the data: reset the fleet first, for each side.
//
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature r9906 --dataset --reset --apps omp
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=r9906 PROBE_AGENT=<base|head> node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-9906/walk.js
//   (onix.php, beside it, is run by the walk for the ONIX steps)
//
//   1 (admin) Settings › Workflow › Metadata: the "Thema Subjects" option; ticked, "allow free text"   → shot 1-settings
//   2 off (thema unset): the subjects suggestions, a free-text save, a Thema-shaped save, the ONIX export
//   3 enable: the suggestions (code, word, fr_CA, empty term), the save rules (FJ+FJH, unknown code, single letter)
//   4 enable, dbarnes on book 4's workflow "Metadata": type "FJH", pick it, add free text, save             → shots 4-*
//   5 enable: the ONIX export of book 4 (keywords and subjects in en)                                    → onix-enable.xml
//   6 require: the metadata form's subjects config, a free-text save refused, typing free text            → shots 6-*
//   7 require, subjects asked in the wizard: aclark's new submission, a free-text subject and FJ+FJH autosaved;
//     "For the Editors" (typing free text), "Review", submit                                              → shots 7-*
//   8 off again: the ONIX export, a free-text save
//
// Facts go to facts.json; no assertions. At the line tips (base, 2026-10-28) no Thema anywhere: the setting is
// ignored, no Thema suggestions, every code saved unchecked, ONIX keywords only. At the PR heads omp fb2adb7ced +
// pkp-lib 8c521a4cfb everything as the issue asks, except step 4: the code "FJH" typed offers only free-text "FJH"
// (ui-library filters the suggestions by description; fix-ui-library.diff, tried, lists FJH).
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {forEachApp, launch, signIn, idle, shot, outDir} = require('../../../probe');

const CTX = 'publicknowledge';
const T = 30_000;
const SUB = 4;
const ONIX_SUB = 14; // book 4's current version has no publication format, so its ONIX holds no Product

async function sessionApi(page, method, url, data) {
    return page.evaluate(async ({method, url, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data),
            credentials: 'same-origin',
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 1500); }
        return {status: res.status, body};
    }, {method, url, data});
}

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 2500)}`);
    };
    const api = (p) => app.url(`/index.php/${CTX}/api/v1/${p}`);
    const save = (name, text) => fs.writeFileSync(path.join(outDir(), name), text);
    const brief = (r) => ({status: r.status, body: r.status >= 400 ? r.body : undefined});
    const vocab = async (page, q) => {
        const r = await sessionApi(page, 'GET', api(`vocabs?vocab=submissionSubject&${q}`));
        const items = Array.isArray(r.body) ? r.body : [];
        return {status: r.status, count: items.length, thema: items.filter((e) => e.source === 'thema').length,
            first: items.slice(0, 4).map((e) => `${e.identifier || '-'}|${e.source || '-'}|${e.name}`), error: Array.isArray(r.body) ? undefined : r.body};
    };
    const setThema = async (page, value, subjects = 'enable') => {
        const r = await sessionApi(page, 'PUT', api('contexts/1'), {thema: value, subjects, keywords: 'enable',
            // the ONIX plugin refuses to export until these four are set (U74 note i)
            publisher: 'Public Knowledge Press', location: 'Vancouver', codeType: '01', codeValue: 'PKP-9906'});
        return {status: r.status, thema: r.body?.thema, subjects: r.body?.subjects, error: r.status >= 400 ? r.body : undefined};
    };
    const pubId = async (page, sid) => (await sessionApi(page, 'GET', api(`submissions/${sid}`))).body.currentPublicationId;
    const putSubjects = async (page, sid, pid, subjects, extra = {}) => {
        const r = await sessionApi(page, 'PUT', api(`submissions/${sid}/publications/${pid}`), {subjects, ...extra});
        return {status: r.status, stored: r.status === 200 ? r.body.subjects : undefined, errors: r.status >= 400 ? r.body : undefined};
    };
    // The export runs through onix.php (the plugin call the export button makes, validation on): the web
    // route answered an empty download to a scripted POST, and its result is the same plugin output.
    const onix = async (page, tag) => {
        const r = spawnSync('php', [path.join(__dirname, 'onix.php'), String(ONIX_SUB), CTX], {cwd: app.root, encoding: 'utf8',
            env: {...process.env, PKP_CONFIG_FILE: path.resolve(app.root, `config.test.ds${app.dataset}.inc.php`)}});
        const xml = r.stdout || '';
        save(`onix-${tag}.xml`, xml);
        return {exit: r.status, problems: (r.stderr || '').trim().split('\n').filter(Boolean).slice(0, 5), products: (xml.match(/<Product>/g) || []).length,
            subjects: [...xml.matchAll(/<Subject>([\s\S]*?)<\/Subject>/g)].map(([, x]) => x.replace(/\s+/g, ' ').trim())};
    };

    const {page, close} = await launch(app);
    const as = async (user) => {
        await page.context().clearCookies();
        await signIn(page, user, {contextPath: CTX});
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial`));
        await idle(page);
    };
    const options = async (scope) => (await scope.locator('.autosuggest__results-item').allInnerTexts().catch(() => [])).map((t) => t.trim()).slice(0, 8);
    try {
        // 1: the setting, as admin (a press manager)
        await as('admin');
        await page.goto(app.url(`/index.php/${CTX}/management/settings/workflow#submission/metadata`));
        await idle(page);
        await page.waitForTimeout(1500);
        const metaPanel = page.locator('#metadata, [id$="metadata"]').filter({hasText: 'Subjects'}).first();
        const panelText = await metaPanel.innerText().catch(() => '');
        fact('0 context as loaded', await (async () => {
            const c = (await sessionApi(page, 'GET', api('contexts/1'))).body;
            return {subjects: c.subjects, keywords: c.keywords, thema: c.thema, supportedSubmissionMetadataLocales: c.supportedSubmissionMetadataLocales};
        })());
        fact('1 metadata settings panel', {hasThema: /Thema/.test(panelText), excerpt: (panelText.match(/Subjects[\s\S]{0,600}/) || [''])[0]});
        await shot(page, '1-settings').catch(() => {});
        const themaBox = page.getByRole('checkbox', {name: /Enable Thema subject categories/}).first();
        if (await themaBox.isVisible().catch(() => false)) {
            await themaBox.check({timeout: T});
            await page.waitForTimeout(500);
            const freeText = page.getByRole('radio', {name: /Allow free-text subjects/}).first();
            const freeVisible = await freeText.isVisible().catch(() => false);
            if (freeVisible) await freeText.check({timeout: T}).catch(() => {});
            await shot(page, '1-settings-ticked').catch(() => {});
            await metaPanel.getByRole('button', {name: 'Save', exact: true}).first().click({timeout: T}).catch(() => {});
            await page.waitForTimeout(2000);
            fact('1 ticked and saved through the form', {radiosShown: freeVisible, thema: (await sessionApi(page, 'GET', api('contexts/1'))).body.thema});
        } else fact('1 ticked and saved through the form', {notDone: 'no "Enable Thema subject categories" checkbox'});

        // 2: off
        fact('2 off: set thema 0', await setThema(page, '0'));
        const pid = await pubId(page, SUB);
        fact('2 off: suggestions term=FJ', await vocab(page, 'term=FJ&locale=en'));
        fact('2 off: free-text save', await putSubjects(page, SUB, pid, {en: [{name: 'Off free text'}]}));
        fact('2 off: FJ + FJH thema-shaped save', await putSubjects(page, SUB, pid, {en: [{name: 'Fiction', source: 'thema', identifier: 'FJ'}, {name: 'Adventure', source: 'thema', identifier: 'FJH'}]}));
        const opid = await pubId(page, ONIX_SUB);
        fact('2 off: book 14 unpublished (to edit its subjects)', brief(await sessionApi(page, 'PUT', api(`submissions/${ONIX_SUB}/publications/${opid}/unpublish`))));
        const onixSubjects = {en: [{name: 'Adventure stories', source: 'thema', identifier: 'FJH'}, {name: 'Free text kept'}, {name: 'History', source: 'thema', identifier: 'NH'}],
            fr_CA: [{name: 'Fr', source: 'thema', identifier: 'FJ'}]};
        fact('2 off: book 14 subjects and keywords', await putSubjects(page, ONIX_SUB, opid, onixSubjects, {keywords: {en: [{name: 'kw one'}]}}));
        fact('2 off: ONIX export', await onix(page, 'off'));
        fact('2 off: unknown setting value', await setThema(page, 'maybe'));

        // 3: enable
        fact('3 enable: set', await setThema(page, 'enable'));
        fact('3 enable: suggestions term=FJH', await vocab(page, 'term=FJH&locale=en'));
        fact('3 enable: suggestions term=history', await vocab(page, 'term=history&locale=en'));
        fact('3 enable: suggestions term=FJH fr_CA', await vocab(page, 'term=FJH&locale=fr_CA'));
        fact('3 enable: suggestions empty term', await vocab(page, 'locale=en'));
        fact('3 enable: suggestions qualifier code 1KBC', await vocab(page, 'term=1KBC&locale=en'));
        fact('3 enable: suggestions locale de (unsupported)', await vocab(page, 'term=FJH&locale=de'));
        fact('3 enable: suggestions keywords vocab term=FJ', await (async () => {
            const r = await sessionApi(page, 'GET', api('vocabs?vocab=submissionKeyword&term=FJ&locale=en'));
            return {status: r.status, thema: (Array.isArray(r.body) ? r.body : []).filter((e) => e.source === 'thema').length};
        })());
        fact('3 enable: FJ + FJH', await putSubjects(page, SUB, pid, {en: [{name: 'Fiction', source: 'thema', identifier: 'FJ'}, {name: 'Adventure', source: 'thema', identifier: 'FJH'}]}));
        fact('3 enable: unknown code ZZQ', await putSubjects(page, SUB, pid, {en: [{name: 'Bogus', source: 'thema', identifier: 'ZZQ'}]}));
        fact('3 enable: qualifier code 1KBC as thema', await putSubjects(page, SUB, pid, {en: [{name: 'Canada', source: 'thema', identifier: '1KBC'}]}));
        fact('3 enable: single letter A', await putSubjects(page, SUB, pid, {en: [{name: 'The Arts', source: 'thema', identifier: 'A'}]}));
        fact('3 enable: fr_CA FJ + FJH', await putSubjects(page, SUB, pid, {fr_CA: [{name: 'x', source: 'thema', identifier: 'FJ'}, {name: 'y', source: 'thema', identifier: 'FJH'}]}));
        fact('3 enable: keywords-only save while stored subjects are fine', await (async () => {
            const r = await sessionApi(page, 'PUT', api(`submissions/${SUB}/publications/${pid}`), {keywords: {en: [{name: 'kw one'}]}});
            return brief(r);
        })());

        // 4: the workflow form as dbarnes
        await as('dbarnes');
        fact('4 enable: cleared', await putSubjects(page, SUB, pid, {en: []}));
        const form4 = await sessionApi(page, 'GET', api(`submissions/${SUB}/publications/${pid}/_components/metadata`));
        const subjField = (form4.body?.fields || []).find((f) => f.name === 'subjects');
        fact('4 enable: metadata form subjects config', {status: form4.status, allowCustom: subjField?.allowCustom, tooltip: subjField?.tooltip, description: subjField?.description});
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial?workflowSubmissionId=${SUB}`));
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').first();
        await dlg.getByRole('link', {name: 'Metadata', exact: true}).first().click({timeout: T}).catch(() => {});
        await idle(page);
        await page.waitForTimeout(1500);
        const subjInput = dlg.locator('#metadata-subjects-control-en, input[id*="subjects"][id*="en"]').first();
        if (await subjInput.isVisible().catch(() => false)) {
            await subjInput.click();
            await subjInput.pressSequentially('FJH', {delay: 60});
            await page.waitForTimeout(3000);
            fact('4 enable: options shown for the code "FJH"', await options(dlg));
            await shot(page, '4-typed-code').catch(() => {});
            await subjInput.fill('');
            await subjInput.pressSequentially('adventure', {delay: 60});
            await page.waitForTimeout(3000);
            fact('4 enable: options shown for the word "adventure"', await options(dlg));
            await shot(page, '4-typed-word').catch(() => {});
            const opt = dlg.locator('.autosuggest__results-item').filter({hasText: /Historical adventure fiction/}).first();
            fact('4 enable: picked "Historical adventure fiction"', await opt.isVisible().catch(() => false));
            if (await opt.isVisible().catch(() => false)) await opt.click();
            await page.waitForTimeout(800);
            await subjInput.pressSequentially('Typed free text', {delay: 30});
            await page.waitForTimeout(1500);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(800);
            await shot(page, '4-chips').catch(() => {});
            await dlg.getByRole('button', {name: 'Save', exact: true}).first().click({timeout: T}).catch(() => {});
            await page.waitForTimeout(2500);
            await shot(page, '4-saved').catch(() => {});
            const after = (await sessionApi(page, 'GET', api(`submissions/${SUB}/publications/${pid}`))).body.subjects;
            fact('4 enable: stored after the form save', after);
        } else fact('4 enable: workflow form', {notDone: 'no subjects input', text: (await dlg.innerText().catch(() => '')).slice(0, 400)});

        // 5: ONIX with Thema (book 14's subjects from step 2), and book 4 given the same for step 6
        fact('5 enable: book 4 subjects with free text', await putSubjects(page, SUB, pid, {en: [{name: 'Adventure stories', source: 'thema', identifier: 'FJH'}, {name: 'Free text kept'}]}));
        await as('admin');
        fact('5 enable: ONIX export', await onix(page, 'enable'));

        // 6: require
        fact('6 require: set', await setThema(page, 'require'));
        const form6 = await sessionApi(page, 'GET', api(`submissions/${SUB}/publications/${pid}/_components/metadata`));
        const subj6 = (form6.body?.fields || []).find((f) => f.name === 'subjects');
        fact('6 require: metadata form subjects config', {status: form6.status, allowCustom: subj6?.allowCustom, tooltip: subj6?.tooltip});
        fact('6 require: suggestions term=Free (stored free text hidden?)', await vocab(page, 'term=Free&locale=en'));
        fact('6 require: save with the stored free text', await putSubjects(page, SUB, pid, {en: [{name: 'Adventure stories', source: 'thema', identifier: 'FJH'}, {name: 'Free text kept'}]}));
        fact('6 require: save with Thema only', await putSubjects(page, SUB, pid, {en: [{name: 'Adventure stories', source: 'thema', identifier: 'FJH'}]}));
        fact('6 require: a plain-string subject', await putSubjects(page, SUB, pid, {en: ['plain string']}));
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial?workflowSubmissionId=${SUB}`));
        await idle(page);
        const dlg6 = page.locator('[role="dialog"]:visible').first();
        await dlg6.getByRole('link', {name: 'Metadata', exact: true}).first().click({timeout: T}).catch(() => {});
        await idle(page);
        await page.waitForTimeout(1500);
        const in6 = dlg6.locator('#metadata-subjects-control-en, input[id*="subjects"][id*="en"]').first();
        if (await in6.isVisible().catch(() => false)) {
            await in6.click();
            await in6.pressSequentially('Nothing like a code', {delay: 30});
            await page.waitForTimeout(3000);
            fact('6 require: options shown for free text', await options(dlg6));
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            await page.keyboard.press('Tab');
            await page.waitForTimeout(800);
            await shot(page, '6-require-typed').catch(() => {});
            fact('6 require: stored subjects untouched (not saved)', (await sessionApi(page, 'GET', api(`submissions/${SUB}/publications/${pid}`))).body.subjects);
            const chips = await dlg6.locator('[id*="subjects"]').locator('xpath=ancestor::*[contains(@class,"pkpFormField")][1]').first().innerText().catch(() => '');
            fact('6 require: field text after typing free text + Enter', chips.replace(/\s+/g, ' ').slice(0, 600));
        } else fact('6 require: workflow form', {notDone: 'no subjects input'});

        // 7: the wizard as aclark; subjects asked in the wizard ("request"), or its "For the Editors" step has no Subjects field
        fact('7 require: subjects requested in the wizard', await setThema(page, 'require', 'request'));
        await page.context().clearCookies();
        await signIn(page, 'aclark', {contextPath: CTX});
        await page.goto(app.url(`/index.php/${CTX}/submissions`));
        await idle(page);
        fact('7 require: aclark has a CSRF token', await page.evaluate(() => !!window.pkp?.currentUser?.csrfToken));
        const created = await sessionApi(page, 'POST', api('submissions'), {locale: 'en', seriesId: 1, workType: 2});
        fact('7 require: new submission', {status: created.status, id: created.body?.id, error: created.status >= 400 ? created.body : undefined});
        if (created.status === 200) {
            const nid = created.body.id;
            const npid = created.body.currentPublicationId;
            fact('7 require: autosave with free text', await putSubjects(page, nid, npid, {en: [{name: 'Wizard free text'}]}, {title: {en: 'Thema wizard check'}, abstract: {en: '<p>Abstract.</p>'}}));
            fact('7 require: autosave with FJ + FJH (as a stored value can hold)', await putSubjects(page, nid, npid, {en: [{name: 'Wizard free text'}, {name: 'Fiction', source: 'thema', identifier: 'FJ'}, {name: 'Adventure', source: 'thema', identifier: 'FJH'}]}));
            await page.goto(app.url(`/index.php/${CTX}/submission?id=${nid}`));
            await idle(page);
            const heading = page.locator('h1').first();
            for (let i = 0; i < 6; i++) {
                await page.waitForTimeout(1500);
                const h = (await heading.innerText().catch(() => '')).trim();
                if (/For the Editors/.test(h)) {
                    fact('7 require: For the Editors subjects text', (await page.locator('[id*="subjects"]').locator('xpath=ancestor::*[contains(@class,"pkpFormField")][1]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600));
                    const win = page.locator('input[id*="subjects"][id*="en"]').first();
                    if (await win.isVisible().catch(() => false)) {
                        await win.click();
                        await win.pressSequentially('Typed in wizard', {delay: 30});
                        await page.waitForTimeout(2500);
                        fact('7 require: wizard options for free text', (await page.locator('.autosuggest__results-item').allInnerTexts().catch(() => [])).map((t) => t.trim()));
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(500);
                        await win.fill('');
                    }
                    await shot(page, '7-for-the-editors').catch(() => {});
                }
                if (/Review/.test(h)) break;
                await page.getByRole('button', {name: 'Continue', exact: true}).first().click({timeout: T}).catch(() => {});
                await idle(page);
            }
            fact('7 require: wizard heading reached', (await heading.innerText().catch(() => '')).trim());
            const body = await page.locator('main, body').first().innerText().catch(() => '');
            fact('7 require: review step lines on Thema', (body.match(/[^\n]*(Thema|free-text|parent categor)[^\n]*/g) || []).slice(0, 6));
            await shot(page, '7-review').catch(() => {});
            const submitBtn = page.getByRole('button', {name: 'Submit', exact: true}).first();
            fact('7 require: the review step\'s Submit button', {visible: await submitBtn.isVisible().catch(() => false), disabled: await submitBtn.isDisabled().catch(() => null)});
            const sub = await sessionApi(page, 'PUT', api(`submissions/${nid}/submit`), {confirmCopyright: true});
            fact('7 require: submit', brief(sub));
        }

        // 8: off again
        await as('admin');
        fact('8 off again: set', await setThema(page, '0'));
        fact('8 off again: ONIX export', await onix(page, 'off-again'));
        fact('8 off again: free-text save', await putSubjects(page, SUB, pid, {en: [{name: 'Off free text'}]}));
        fact('8 off again: suggestions term=FJ', await vocab(page, 'term=FJ&locale=en'));
    } finally {
        save('facts.json', JSON.stringify(facts, null, 2));
        await close();
    }
});
