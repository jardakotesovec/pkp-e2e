// Helpers of walk.js here (U41 A7). Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Per app, on PKP's default test dataset: the submission and its contributor (one typed affiliation, English only). */
const CASES = {
    ojs: {id: 7, contributor: 'Domatilia Sokoloff', institution: 'University College Cork'},
    omp: {id: 1, contributor: 'Arthur Clark', institution: 'University of Calgary'},
    ops: {id: 1, contributor: 'Carlo Corino', institution: 'University of Bologna'},
};

/** Open the Affiliations row's actions ("Click to edit or delete") and choose `item`. */
async function rowAction(page, dlg, institution, item) {
    const row = dlg.locator('.pkpFormField--affiliations tbody tr').filter({hasText: institution}).first();
    await row.getByRole('button', {name: 'Click to edit or delete'}).click();
    await page.getByRole('menuitem', {name: item}).click();
    await sleep(300);
    await idle(page);
}

/**
 * Press the open form's "Save" and take what follows: the contributor save's answer (status and
 * body, null when the form refused before sending), and whether the form stayed open.
 */
async function pressSave(page, dlg) {
    const answer = page
        .waitForResponse((r) => /\/contributors(\/\d+)?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 8000})
        .catch(() => null);
    await dlg.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await answer;
    await idle(page);
    await sleep(500);
    return {
        request: r ? {status: r.status(), body: flat(await r.text().catch(() => ''), 600)} : null,
        formOpen: await dlg.isVisible().catch(() => false),
    };
}

/**
 * The error box at the form's foot (`.pkpFormErrors`): its visible line and button, the
 * screen-reader list's entries (text, and whether each is drawn on screen), and the aria snapshot.
 */
async function errorBox(dlg) {
    const box = dlg.locator('.pkpFormErrors');
    if (!(await box.count())) return {shown: false};
    return box.first().evaluate((el) => {
        const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const drawn = (e) => {
            const r = e.getBoundingClientRect();
            const s = getComputedStyle(e.closest('ul') || e);
            return r.width > 1 && r.height > 1 && s.clip !== 'rect(0px, 0px, 0px, 0px)' && s.position !== 'absolute';
        };
        return {
            shown: true,
            visibleText: f(el.innerText),
            list: [...el.querySelectorAll('ul button')].map((b) => ({text: f(b.textContent), drawnOnScreen: drawn(b)})),
        };
    }).then(async (o) => ({...o, aria: flat(await box.first().ariaSnapshot().catch(() => null), 800)}));
}

/** The text a field shows (its label, boxes' values aside, and its messages). */
async function fieldText(dlg, cls) {
    return flat(await dlg.locator(cls).first().innerText().catch(() => null), 600);
}

/** Where focus is, and whether the Affiliations field sits inside the side window's visible area. */
async function focusFacts(page, dlg) {
    return dlg.evaluate((d) => {
        const a = document.activeElement;
        const f = d.querySelector('.pkpFormField--affiliations');
        const box = [...document.querySelectorAll('div.pkp-modal-scroll-container')].pop();
        const fr = f.getBoundingClientRect();
        const cr = box ? box.getBoundingClientRect() : {top: 0, bottom: window.innerHeight};
        return {
            focus: a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''} "${(a.innerText || a.value || '').replace(/\s+/g, ' ').trim().slice(0, 80)}"` : null,
            focusInsideAffiliations: !!(a && f.contains(a)),
            scrollTop: box ? Math.round(box.scrollTop) : null,
            affiliationsTopInView: fr.top >= cr.top && fr.top < cr.bottom,
        };
    });
}

/** The wizard path: the dataset author who starts a submission per app, and the section the start asks for. */
const WIZARD = {
    ojs: {author: 'dsokoloff', section: 'Articles'},
    omp: {author: 'aclark', section: null},
    ops: {author: 'ccorino', section: 'Preprints'},
};

/** The contributor the `add` and `wizard` paths type in, and the institution they enter by hand. */
const NEW = {given: 'Lea', family: 'u41ir1', email: 'lea.u41ir1@mailinator.com', country: 'Canada', institution: 'Probe Institute u41ir1'};

/**
 * "Add Contributor" on the contributors list the page shows (the workflow's or the wizard step's):
 * "Person" when the form asks for the kind, the names, email and country, "Author" (a box on
 * `main`, a choice on 3.5). The form is left open, unsaved; returns its dialog.
 */
async function openAddContributor(page, who) {
    await page.getByRole('button', {name: 'Add Contributor', exact: true}).last().click();
    const dlg = page.getByRole('dialog', {name: 'Add Contributor'});
    await dlg.waitFor({timeout: T});
    await dlg.locator('input[name="email"]').waitFor({timeout: T});
    await idle(page);
    const person = dlg.getByRole('radio', {name: 'Person', exact: true});
    if (await person.count()) await person.check();
    await dlg.locator('input[name^="givenName"]').first().fill(who.given);
    await dlg.locator('input[name^="familyName"]').first().fill(who.family);
    await dlg.locator('input[name="email"]').fill(who.email);
    await dlg.locator('select[name="country"]').selectOption({label: who.country});
    const box = dlg.getByRole('checkbox', {name: 'Author', exact: true});
    const radio = dlg.getByRole('radio', {name: 'Author', exact: true});
    if (await box.count()) await box.first().check();
    else if (await radio.count()) await radio.first().check();
    return dlg;
}

/**
 * Under "Affiliations": the name typed into the search box, the typed text itself chosen among the
 * suggestions (the entry without a ROR mark), "Add". Returns the suggestions offered.
 */
async function addTypedInstitution(page, dlg, name) {
    const f = dlg.locator('.pkpFormField--affiliations');
    const search = f.locator('input.pkpAutosuggest__input');
    await search.click();
    await search.pressSequentially(name, {delay: 20});
    const options = f.locator('li.autosuggest__results-item');
    const own = options.filter({hasText: name}).filter({hasNot: page.locator('a[href^="https://ror.org/"]')}).first();
    await own.waitFor({timeout: T});
    const offered = (await options.allInnerTexts()).map((x) => flat(x, 100)).slice(0, 6);
    await own.click();
    const add = f.getByRole('button', {name: 'Add', exact: true});
    await add.waitFor({timeout: T});
    await add.click();
    await f.locator('tbody tr').filter({hasText: name}).first().waitFor({timeout: T});
    await idle(page);
    return offered;
}

/** A "Submission Languages" row of Settings > Website > Setup > Languages: its "Submissions" and "Metadata" boxes. */
async function submissionLanguageRow(tab, code) {
    if (!(await tab.submission.row(code).count())) return {present: false};
    const read = (col) => tab.submission.cell(code, col).isChecked().catch(() => null);
    return {present: true, default: await read('defaultSubmissionLocale'), submissions: await read('submissionLocale'), metadata: await read('submissionMetadataLocale')};
}

/** Press a box of the "Submission Languages" list; the answer's status and any alert the page raised. */
async function pressBox(tab, code, column) {
    const {response, alerts} = await tab.pressSubmission(code, column);
    return {status: response ? response.status() : null, alerts};
}

module.exports = {T, flat, sleep, CASES, WIZARD, NEW, rowAction, pressSave, errorBox, fieldText, focusFacts, openAddContributor, addTypedInstitution, submissionLanguageRow, pressBox};
