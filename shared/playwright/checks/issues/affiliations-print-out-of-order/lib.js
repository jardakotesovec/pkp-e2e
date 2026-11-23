// Helpers of walk.js here (issue report docs/issues/U41-A26-affiliations-print-out-of-order.md).
// Requiring this file runs nothing.
// Every step drives the screens a person uses: the workflow's "Contributors" page (its "Edit" and
// "Add Contributor"), "Unpublish"/"Publish" on 3.5, and the item's public page.
const {idle} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Per app, on PKP's default test dataset, for A26: a published item and its first contributor (one
 * affiliation), the version node its published version sits under when it is not the newest
 * (OJS submission 1's 1.0; its 1.1 is unpublished), and how many contributors the Steps add (none on OJS, whose
 * item already has three).
 */
const CASES = {
    ojs: {id: 1, contributor: 'Alan Mwandenga', institution: 'University of Cape Town', page: '/index.php/publicknowledge/article/view/1', version: 'Version of Record 1.0', add: 0},
    omp: {id: 14, contributor: 'Michael Dawson', institution: 'University of Alberta', page: '/index.php/publicknowledge/catalog/book/14', version: null, add: 1},
    ops: {id: 7, contributor: 'Elinor Ostrom', institution: 'Indiana University', page: '/index.php/publicknowledge/preprint/view/7', version: null, add: 2},
};

/** Neighbour items: published, several contributors, at most one affiliation each (read only). */
const NEIGHBOURS = {
    ojs: {id: 1, page: '/index.php/publicknowledge/article/view/1'},
    omp: {id: 14, page: '/index.php/publicknowledge/catalog/book/14'},
    ops: {id: 7, page: '/index.php/publicknowledge/preprint/view/7'},
};

const SECOND = 'Second Institute u41n23e';
const PEOPLE = [
    {given: 'Lea', family: 'u41n23e', email: 'lea.u41n23e@mailinator.com', country: 'Canada'},
    {given: 'Max', family: 'u41n23e', email: 'max.u41n23e@mailinator.com', country: 'Canada'},
];

/**
 * Keep, from the browser's own traffic, the last publication the workflow page fetched
 * (GET …/submissions/<id>/publications/<pid>): each contributor's name and affiliation names in order.
 */
function watchPublication(page) {
    const seen = {last: null};
    page.on('response', async (r) => {
        if (r.request().method() !== 'GET' || !/\/submissions\/\d+\/publications\/\d+(\?|$)/.test(r.url())) return;
        try {
            const j = await r.json();
            seen.last = (j.authors || []).map((a) => ({
                name: flat(a.fullName || '', 80),
                affiliations: (a.affiliations || []).map((f) => ({id: f.id, name: f.name && (f.name.en || Object.values(f.name)[0])})),
            }));
        } catch (e) {
            /* not JSON */
        }
    });
    return seen;
}

/**
 * The workflow's "Contributors" page of the submission: the newest version's, or, with `version`, the
 * one under that version node (pressed open first). Reads the published-version warning and whether
 * "Add Contributor" can be pressed (a published version cannot be edited on 3.5).
 */
async function openContributors(page, wf, sid, version = null) {
    let opened;
    if (version) {
        await wf.gotoEditorial(sid);
        await idle(page);
        await wf.menuLink(version).first().click();
        await idle(page);
        await sleep(500);
        const links = wf.menuLink('Contributors');
        opened = false;
        for (let i = 0; i < (await links.count()); i++) {
            if (await links.nth(i).isVisible().catch(() => false)) {
                await links.nth(i).click();
                opened = true;
                break;
            }
        }
        await idle(page);
        await sleep(500);
    } else {
        opened = await openPage(wf, page, sid, 'Contributors');
    }
    const out = {opened, version};
    out.heading = flat(await wf.dialog().locator('h1, h2').filter({hasText: /Contributors/i}).first().innerText().catch(() => null), 120);
    out.status = flat(await wf.dialog().getByText(/^Status:/).first().innerText().catch(() => null), 80);
    out.warning = flat(await wf.dialog().getByText(/This version has been published/).first().innerText().catch(() => null), 200);
    const add = page.getByRole('button', {name: 'Add Contributor', exact: true});
    out.addEnabled = (await add.count()) ? await add.first().isEnabled().catch(() => false) : false;
    return out;
}

/** 3.5 only: "Unpublish" ("Unpost") and back to "Contributors". */
async function unpublishThenContributors(page, app, wf, sid, version = null) {
    const status = await unpublish(page);
    await openWorkflow(page, app, sid);
    const again = await openContributors(page, wf, sid, version);
    return {unpublish: status, ...again};
}

/** 3.5 only: "Publish" ("Post", "Schedule For Publication") from the workflow. */
async function republish(page, app, sid) {
    await openWorkflow(page, app, sid);
    return publish(page);
}

/** Step 4: "Edit" on the contributor, the typed institution added, "Save". */
async function addSecondAffiliation(page, wf, c) {
    const dlg = await openContributorEdit(page, wf, c.contributor);
    const before = await affiliationRows(dlg);
    const offered = await addTypedInstitution(page, dlg, SECOND);
    const inForm = await affiliationRows(dlg);
    const saved = await saveContributor(page, dlg);
    return {rowsBefore: before.map((r) => r.text), suggestions: offered, rowsBeforeSave: inForm.map((r) => r.text), save: saved};
}

/** "Add Contributor" with a plain Person, "Save". */
async function addContributor(page, person) {
    const dlg = await openAddContributor(page, person);
    const answer = page
        .waitForResponse((r) => /\/contributors(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T})
        .catch(() => null);
    await dlg.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await answer;
    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(800);
    return {status: r ? r.status() : null};
}

/** Step 8: "Edit" on the contributor, its "Affiliations" rows read, the form closed unsaved. */
async function readEdit(page, wf, c) {
    const dlg = await openContributorEdit(page, wf, c.contributor);
    const rows = (await affiliationRows(dlg)).map((r) => r.text);
    await closeForm(page, dlg);
    return rows;
}

/**
 * The item's public page: per contributor block holding an affiliation, the name and the
 * affiliation line as shown (innerText) and as served (innerHTML), and the meta tags indexes read.
 */
async function readItemPage(page, app, address) {
    const r = await page.goto(app.url(address));
    await idle(page).catch(() => {});
    const blocks = await page.locator('.affiliation').evaluateAll((els) =>
        els.map((el) => {
            const box = el.closest('li, .sub_item, .author') || el.parentElement;
            const name = box && box.querySelector('.name, .label');
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {name: f(name ? name.innerText : ''), shown: f(el.innerText), html: el.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 500)};
        })
    );
    const meta = await page
        .locator('meta[name="citation_author"], meta[name="citation_author_institution"]')
        .evaluateAll((ms) => ms.map((m) => `${m.getAttribute('name').replace('citation_', '')}: ${m.getAttribute('content')}`));
    const roles = flat(await page.locator('.contributor_roles').first().innerText().catch(() => null), 200);
    return {status: r ? r.status() : null, blocks, meta, roles};
}

/** A stored read beside the screens: the contributor's affiliation rows by id (not a step). */
function storedAffiliations(app, sql, sid, family) {
    return sql(
        app,
        `select f.author_affiliation_id, (select s.setting_value from author_affiliation_settings s where s.author_affiliation_id = f.author_affiliation_id and s.setting_name = 'name' and s.locale = 'en')
         from author_affiliations f join authors a on a.author_id = f.author_id join publications p on p.publication_id = a.publication_id
         where p.submission_id = ${Number(sid)} and exists (select 1 from author_settings x where x.author_id = a.author_id and x.setting_name = 'familyName' and x.setting_value = '${family}') order by 1`
    )
        .split('\n')
        .filter(Boolean);
}

/**
 * A read beside the screens (not a step): the plan PostgreSQL picks for the affiliations query the item
 * page sends (PKP\affiliation\Collector::getQueryBuilder() with the contributor ids of every version of
 * the submission, since the page loads them as one batch through getData('publications')), the rows it
 * returns (contributor id, affiliation id) and the tables' size estimates the planner used.
 */
function collectorPlan(app, sql, sid) {
    const ids = sql(app, `select string_agg(a.author_id::text, ',' order by a.author_id) from authors a join publications p on p.publication_id = a.publication_id where p.submission_id = ${Number(sid)}`);
    const q = `select a.author_id, a.author_affiliation_id from author_affiliations as a join authors as au on a.author_id = au.author_id join publications as p on au.publication_id = p.publication_id join submissions as s on p.submission_id = s.submission_id where a.author_id in (${ids})`;
    return {
        ids,
        joins: sql(app, `explain (costs off) ${q}`).split('\n').filter((l) => /Join|Nested Loop|Memoize/.test(l)).map((l) => l.replace(/^\s*(->\s*)?/, '').replace(/\s+Hash Cond.*$/, '')),
        rows: sql(app, q).split('\n').join(' '),
        sizes: sql(app, `select relname || '=' || reltuples::int || '/' || relpages from pg_class where relname in ('author_affiliations', 'authors', 'publications', 'submissions') order by relname`).split('\n').join(' '),
    };
}

// Copied from the kept scripts of other reports (registry-pick-saves-nameless, affiliation-error-list-object-object,
// one-item-reads-1-items), so this walk stays whole when those reports go.
const CTX = 'publicknowledge';
const controls = (page) => page.locator('[data-cy="workflow-controls-right"]');


async function openPage(wf, page, sub, label) {
    await wf.gotoEditorial(sub);
    await idle(page);
    await wf.expandLatestVersionNode().catch(() => {}); // 3.5 has no version nodes
    const links = wf.menuLink(label);
    const n = await links.count();
    if (!n) return false;
    let target = null;
    for (let i = n - 1; i >= 0; i--) {
        if (await links.nth(i).isVisible().catch(() => false)) {
            target = links.nth(i);
            break;
        }
    }
    if (!target) return false;
    await target.click();
    await idle(page);
    await sleep(500);
    return true;
}

/** The open form's "Affiliations" rows: each row's text and links. */
async function affiliationRows(dlg) {
    const rows = dlg.locator('.pkpFormField--affiliations tbody tr');
    const out = [];
    for (let i = 0; i < (await rows.count()); i++) {
        const row = rows.nth(i);
        out.push({
            text: flat(await row.innerText().catch(() => ''), 300),
            links: await row.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))).catch(() => []),
            red: flat(await row.locator('.text-negative').allInnerTexts().catch(() => []), 200),
        });
    }
    return out;
}

/** The contributor row's "Edit" in the Contributors list; returns the open form's dialog. */
async function openContributorEdit(page, wf, name) {
    const item = wf.dialog().locator('li.listPanel__item').filter({hasText: name}).first();
    await item.waitFor({timeout: T});
    await item.getByRole('button', {name: /^Edit/}).first().click();
    const dlg = page.getByRole('dialog', {name: 'Edit', exact: true});
    await dlg.waitFor({timeout: T});
    await dlg.locator('.pkpFormField--affiliations').first().waitFor({timeout: T});
    await idle(page);
    return dlg;
}

/** Press the open form's "Save" and wait on the contributor save's answer. */
async function saveContributor(page, dlg) {
    const answer = page
        .waitForResponse((r) => /\/contributors\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T})
        .catch(() => null);
    await dlg.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await answer;
    const out = {status: r ? r.status() : null};
    if (r) {
        try {
            const body = r.request().postDataJSON() || {};
            out.sentAffiliations = (body.affiliations || []).map((a) => ({ror: a.ror, name: a.name}));
        } catch (e) {
            out.sentAffiliations = 'unreadable';
        }
        try {
            const j = await r.json();
            out.answerAffiliations = (j.affiliations || []).map((a) => ({ror: a.ror, name: a.name}));
        } catch (e) {
            out.answer = 'unreadable';
        }
    }
    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    return out;
}

/** Close an open form with its own "Close" (never Escape: the workflow is a dialog too). */
async function closeForm(page, dlg) {
    await dlg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await sleep(800);
    await idle(page);
}


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


async function openWorkflow(page, app, sid) {
    const lang = app.line && /3_[34]/.test(app.line) ? '' : '/en';
    await page.goto(app.url(`/index.php/${CTX}${lang}/dashboard/editorial?workflowSubmissionId=${sid}`));
    await idle(page).catch(() => {});
    await controls(page).waitFor({timeout: T});
    await sleep(1500);
}

/** "Unpublish" ("Unpost" on a preprint server), confirmed. Returns the request's status. */
async function unpublish(page) {
    await controls(page).getByRole('button', {name: /^(Unpublish|Unpost)$/}).first().click();
    const win = page.getByRole('dialog').filter({hasText: /Are you sure you don't want this to be/}).last();
    await win.waitFor({timeout: T});
    const w = page.waitForResponse((x) => /\/unpublish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await win.getByRole('button', {name: /^(Unpublish|Unpost)$/}).last().click();
    const r = await w;
    await controls(page).getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).first().waitFor({timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await sleep(800);
    return r ? r.status() : null;
}

/** "Publish" ("Post", "Schedule For Publication") through its panel and confirmation. */
async function publish(page) {
    const out = {};
    const button = controls(page).getByRole('button', {name: /^(Schedule For Publication|Publish|Post)$/}).first();
    await button.waitFor({state: 'visible', timeout: T});
    out.button = flat(await button.innerText(), 60);
    await button.click();
    const pnl = page.locator('[data-cy="active-modal"], [role=dialog]').filter({hasText: 'Review Publishing Details'}).last();
    const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
    const opened = await Promise.race([
        pnl.getByRole('button', {name: 'Confirm', exact: true}).waitFor({state: 'visible', timeout: 15_000}).then(() => 'panel'),
        confirm.waitFor({state: 'visible', timeout: 15_000}).then(() => 'confirm'),
    ]).catch(() => null);
    out.opened = opened;
    await idle(page).catch(() => {});
    await sleep(2500);
    if (opened === 'panel') {
        out.panel = flat(await pnl.innerText().catch(() => null), 600);
        await pnl.getByRole('button', {name: 'Confirm', exact: true}).click();
        await confirm.waitFor({state: 'visible', timeout: T});
        await idle(page).catch(() => {});
        await sleep(800);
    }
    out.confirmText = flat(await confirm.innerText().catch(() => null), 300);
    const w = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await confirm.getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).last().click();
    const r = await w;
    out.status = r ? r.status() : null;
    await controls(page).getByRole('button', {name: /^(Unpublish|Unpost|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    out.after = flat(await controls(page).innerText().catch(() => null), 200);
    return out;
}


module.exports = {T, flat, sleep, CASES, NEIGHBOURS, SECOND, PEOPLE, watchPublication, openContributors, unpublishThenContributors, republish, addSecondAffiliation, addContributor, readEdit, readItemPage, storedAffiliations, collectorPlan};
