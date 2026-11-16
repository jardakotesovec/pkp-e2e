// U15 claim check K16b (incidentals row "Rule 4, how words match"): every sentence of Rule 4
// (fragments, a word's other forms, common words, capitals, no syntax, the punctuation list, the
// hyphen, how several words combine) and register entry A5, driven on the Search page of OJS, OMP
// and OPS on each database the apps support: PostgreSQL (the slot's campaign fleet), MySQL 8.0 and
// MariaDB 10.11 (the `mysql` and `mariadb` lines, fresh installs of `main` with the campaign seed).
//
// One run, per app:
//   1. seeds a scratch context (tag u15k16b…) with eight published items whose titles and abstracts
//      carry the words under test (made-up words per run, plus "publications", "children",
//      "Quarterly", "notes", "studies", "studied", "public", "note", a hyphenated word, "and", "ox"),
//      drains the queue (the index fills through jobs) and reads the index rows it wrote;
//   2. as a visitor: the context's home page, its header "Search" link, the bare Search page, then
//      every query of QUERIES typed into the page's own box and sent with its "Search" button; each
//      results page is saved with screen() and its listed items read by their landing links;
//   3. the page's controls on a results page (the sweep), and the page left once with words typed
//      and not searched (dialogs on the way out);
//   4. signed in as the scratch context's reader and its manager: a subset of the queries (LEVEL_Q).
// Outputs (in .reports/<PROBE_FEATURE>/<PROBE_AGENT>/): k16b-facts[-<run>]-<app>.json (the seed, the
// index rows, and per query the listed item keys), k16b-screens[-<run>]-<app>.json (every screen()),
// k16b-*.png (a few full-page shots), the kit's run record.
// PART=phrase (default PART=all) runs step 1 and only the quoted-phrase queries of step 2, under the
// same output names (give it its own PROBE_RUN, e.g. p1). No other script is needed. Run each line twice, each run under its own PROBE_RUN:
//   PROBE_FEATURE=U15 PROBE_AGENT=ccK16b PROBE_RUN=r1 node bin/probe.js all shared/playwright/checks/U15/K16b/k16b.js
//   PKP_E2E_LINE=mysql PROBE_FEATURE=cfg-mysql PROBE_AGENT=ccK16b PROBE_NOTES_FEATURE=U15 PROBE_RUN=my1 \
//     node bin/probe.js all shared/playwright/checks/U15/K16b/k16b.js
//   PKP_E2E_LINE=mariadb PROBE_FEATURE=cfg-mariadb PROBE_AGENT=ccK16b PROBE_NOTES_FEATURE=U15 PROBE_RUN=ma1 \
//     node bin/probe.js all shared/playwright/checks/U15/K16b/k16b.js
// (r2 / my2 / ma2 for the second runs). Never in CI.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, drainJobs, sql, tag} =
    require('../../../probe');

const T = 30_000;
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** A made-up letters-only word (as the U15 suites make theirs: endings outside the stemmer's suffixes). */
function makeWord(seen) {
    const pick = (s) => s[Math.floor(Math.random() * s.length)];
    for (;;) {
        let w = '';
        for (let i = 0; i < 4; i++) w += pick('bcfklmnprtvz') + pick('aeiou');
        w += pick('kmnptv');
        if (!seen.has(w)) { seen.add(w); return w; }
    }
}

function words() {
    const seen = new Set();
    const w = {};
    for (const k of ['A', 'Abs', 'Fam', 'B', 'G', 'D', 'E1', 'E2', 'C']) w[k] = makeWord(seen);
    w.Fam = w.Fam.charAt(0).toUpperCase() + w.Fam.slice(1);
    return w;
}

/** The eight items: key -> {title, abstract, author?}. */
function items(w) {
    return {
        A: {title: `The publications of children about ${w.A}`, abstract: `An abstract about ${w.Abs} and its measurement.`, author: w.Fam},
        B: {title: `Quarterly notes on ${w.B} studies`, abstract: `Researchers studied ${w.B} by ox cart.`},
        G: {title: `A public note on ${w.G}`, abstract: 'A plain abstract.'},
        D: {title: `The ${w.D}-harbour survey`, abstract: 'A plain abstract.'},
        E1: {title: `Notes on ${w.E1}`, abstract: 'A plain abstract.'},
        E2: {title: `Notes on ${w.E2}`, abstract: 'A plain abstract.'},
        E3: {title: `Notes on ${w.E1} and ${w.E2}`, abstract: 'A plain abstract.'},
        C: {title: `The ${w.C} study`, abstract: 'A plain abstract about a regional periodical.'},
    };
}

/** [group, query]: every sentence of Rule 4. */
function queries(w) {
    return [
        // fragments (Rule 4 sentence 1) and the whole words as controls
        ['fragment', 'publi'], ['fragment', 'quarterl'], ['fragment', 'stud'], ['fragment', w.A.slice(0, 6)],
        ['fragment', 'Quarterly'], ['fragment', w.A],
        // a word's other forms (sentence 2) and an irregular form (sentence 3)
        ['forms', 'public'], ['forms', 'publication'], ['forms', 'publications'],
        ['forms', 'study'], ['forms', 'studies'], ['forms', 'studied'],
        ['forms', 'note'], ['forms', 'notes'],
        ['forms', 'child'], ['forms', 'children'], ['forms', 'Children'],
        // common words (sentence 4), alone and beside a word
        ['common', 'the'], ['common', 'of'], ['common', 'and'], ['common', 'or'], ['common', 'the of'],
        ['common', `the ${w.A}`], ['common', `of ${w.A}`], ['common', `and ${w.A}`], ['common', `or ${w.A}`],
        // capitals (sentence 5)
        ['caps', w.A.toUpperCase()], ['caps', 'CHILDREN'], ['caps', w.E1.charAt(0).toUpperCase() + w.E1.slice(1)],
        // no phrase, wildcard or AND/OR/NOT syntax (sentence 6), and several words (sentence 9, A5)
        ['several', `${w.E1} ${w.E2}`], ['several', `"${w.E1} ${w.E2}"`], ['several', `${w.E1} AND ${w.E2}`],
        ['several', `${w.E1} OR ${w.E2}`], ['several', `${w.E1} NOT ${w.E2}`], ['several', `+${w.E1} +${w.E2}`],
        ['several', `${w.E1} -${w.E2}`], ['several', `${w.E1.slice(0, 6)}*`], ['several', `${w.A} children`],
        ['several', `${w.A} ${w.Abs}`], ['several', `${w.A} ${w.Fam}`], ['several', `${w.B} ${w.Abs}`],
        ['several', `${w.A} ${w.B}`], ['several', `${w.A} AND children`],
        // the punctuation list (sentence 7)
        ['punct', `"${w.A}"`], ['punct', `${w.A},`], ['punct', `${w.A}.`], ['punct', `(${w.A})`], ['punct', `[${w.A}]`],
        ['punct', `${w.A}!`], ['punct', `${w.A}'s`], ['punct', `${w.A} & children`], ['punct', `${w.A}&children`],
        ['punct', `${w.A},children`], ['punct', `${w.A}.children`],
        // the hyphen (sentence 8): both words in a title unhyphenated, and a title hyphenated the same way
        ['hyphen', `${w.A}-children`], ['hyphen', `children-${w.A}`], ['hyphen', `${w.D}-harbour`],
        ['hyphen', w.D], ['hyphen', 'harbour'], ['hyphen', `${w.D} harbour`], ['hyphen', `${w.B}-${w.G}`],
        // phrases: quoted words that stand together in a title, and quoted words that do not
        ...phraseQueries(w),
        // word length: a two-letter word and a three-letter word ("ox" in B's abstract, "cart" four)
        ['length', 'ox'], ['length', 'cart'], ['length', 'abc'],
    ];
}

/** Quotation marks around several words (MySQL's natural language mode reads a quoted phrase). */
function phraseQueries(w) {
    return [
        ['phrase', `"${w.E1} and ${w.E2}"`], ['phrase', `"${w.E2} ${w.E1}"`], ['phrase', `"${w.E1} ${w.E2}"`],
        ['phrase', `"children about ${w.A}"`], ['phrase', `"${w.A} children"`], ['phrase', `"notes on ${w.B}"`],
        ['phrase', `"${w.B} notes"`], ['phrase', `${w.E1} "${w.E2} ${w.E1}"`],
    ];
}

const LEVEL_Q = (w) => ['publication', `${w.A}-children`, `${w.E1} ${w.E2}`, 'and', 'publi'];

/** The listed items of a results page, by their landing links, and the page's own words about it. */
async function readResults(page, byId) {
    const ids = await page.locator('.page_search a[href*="/article/view/"], .page_search a[href*="/catalog/book/"], .page_search a[href*="/preprint/view/"]')
        .evaluateAll((as) => [...new Set(as.map((a) => (a.getAttribute('href').match(/\/(?:article\/view|catalog\/book|preprint\/view)\/(\d+)/) || [])[1]).filter(Boolean))]);
    const notice = await page.locator('.page_search .cmp_notification, .page_search .search_results[role="status"], .page_search .monograph_count')
        .evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
    const count = await page.locator('.page_search .cmp_pagination').first().innerText({timeout: 1000}).catch(() => null);
    const box = await page.locator('.page_search input[name="query"]').last().inputValue().catch(() => null);
    return {url: page.url().replace(/^https?:\/\/[^/]+/, ''), listed: ids.map((id) => byId[id] || `other:${id}`), notice, count: flat(count, 80), box};
}

function searchForm(page) {
    return page.locator('.page_search form').filter({has: page.locator('input[name="query"]')}).last();
}

async function searchFor(page, text) {
    const form = searchForm(page);
    await form.locator('input[name="query"]').fill(text);
    await Promise.all([page.waitForEvent('load', {timeout: T}), form.locator('button[type="submit"]').first().click()]);
    await idle(page).catch(() => {});
}

forEachApp(async (app) => {
    const run = process.env.PROBE_RUN || 'r0';
    const db = app.line === 'mysql' || app.line === 'mariadb' ? app.line : 'pgsql';
    const isOJS = app.name === 'ojs';
    const facts = {run, line: app.line, db};
    const screens = {};
    const save = () => { record('k16b-facts', facts); record('k16b-screens', screens); };
    const snap = async (page, key) => { const s = await screen(page); screens[key] = s; return s; };

    // ------------------------------------------------------------- 1. seed
    const t = tag('u15k16b');
    const w = words();
    const its = items(w);
    await app.api.createContext({
        tag: t,
        context: {name: `U15 K16b ${t}`, acronym: 'K16b'},
        users: [
            {username: `${t}m`, roles: ['manager']},
            {username: `${t}r`, roles: ['reader']},
            {username: `${t}a`, roles: ['author'], givenName: 'Zelda', familyName: w.Fam},
            {username: `${t}b`, roles: ['author'], givenName: 'Sam', familyName: 'Smith'},
        ],
        ...(isOJS ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {}),
    });
    const byId = {};
    const seeded = {};
    for (const [k, it] of Object.entries(its)) {
        const r = await app.api.createSubmission({
            tag: `${t}${k.toLowerCase()}`, context: t, submitter: it.author ? `${t}a` : `${t}b`,
            title: it.title, abstract: it.abstract, published: true,
            ...(isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {}),
        });
        byId[String(r.submissionId)] = k;
        seeded[k] = {id: r.submissionId, ...it};
    }
    const drain = await drainJobs(app).catch((e) => ({error: flat(e.message)}));
    facts.drain = {passes: drain.passes, counts: drain.counts, error: drain.error};
    facts.seed = {ctx: t, words: w, items: seeded};
    const idList = Object.keys(byId).join(',');
    facts.index = sql(app, `select submission_id, title, abstract, authors from submissions_fulltext where submission_id in (${idList}) order by submission_id`).split('\n');
    save();
    console.log(`[k16b ${run} ${app.name} ${db}] seeded ${t} ids ${idList}; index rows ${facts.index.filter(Boolean).length}`);

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const E = (rest = '') => app.url(`/index.php/${t}${rest}`);
    try {
        // ------------------------------------------------------------- 2. visitor
        await page.goto(E());
        await idle(page).catch(() => {});
        await snap(page, 'visitor-home');
        const link = page.locator('header').getByRole('link', {name: 'Search', exact: true});
        await loc(page, 'context home: header Search link', link);
        if (await link.first().isVisible().catch(() => false)) {
            await Promise.all([page.waitForEvent('load', {timeout: T}), link.first().click()]);
            await idle(page).catch(() => {});
            facts.reachedBy = 'header link';
        } else {
            await page.goto(E('/search'));
            await idle(page).catch(() => {});
            facts.reachedBy = 'address';
        }
        const bare = await snap(page, 'visitor-bare');
        facts.bare = {...(await readResults(page, byId)), syntaxHint: /\b(AND|OR|NOT|all of|any of|phrase|wildcard|syntax)\b/.test(bare.text.main || '')};
        await shot(page, 'k16b-bare');
        await loc(page, 'Search page: the query box', searchForm(page).locator('input[name="query"]'));
        await loc(page, 'Search page: the Search button', searchForm(page).locator('button[type="submit"]').first());

        facts.queries = [];
        const PART = process.env.PART || 'all';
        facts.part = PART;
        for (const [group, q] of PART === 'phrase' ? phraseQueries(w) : queries(w)) {
            await searchFor(page, q);
            const key = `visitor ${group} ${q}`;
            const s = await snap(page, key);
            const r = await readResults(page, byId);
            facts.queries.push({group, q, ...r, notices: s.notices});
            console.log(`[k16b ${run} ${app.name} ${db}] ${group.padEnd(8)} ${JSON.stringify(q).padEnd(32)} -> ${r.listed.join(',') || '(none)'} | ${flat(r.notice.join(' / '), 90)}`);
        }
        save();
        if (PART === 'phrase') return;

        // ------------------------------------------------------------- 3. sweep: controls on a results page, the page left with words typed
        await searchFor(page, `${w.E1} ${w.E2}`);
        await snap(page, 'visitor-sweep-results');
        await shot(page, 'k16b-several');
        facts.sweep = {
            controls: await page.locator('.page_search').locator('a, button, input, select').evaluateAll((els) => els.map((e) => ({
                tag: e.tagName.toLowerCase(), type: e.getAttribute('type'), name: e.getAttribute('name'),
                text: (e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
                href: e.getAttribute('href') ? e.getAttribute('href').replace(/^https?:\/\/[^/]+/, '') : null,
            }))),
        };
        await searchForm(page).locator('input[name="query"]').fill('typed not searched');
        await searchForm(page).locator('input[name="query"]').blur();
        const before = dialogs.length;
        await page.goto(E('/about'));
        await idle(page).catch(() => {});
        facts.sweep.leaveTyped = {dialogs: dialogs.slice(before), landed: page.url().replace(/^https?:\/\/[^/]+/, '')};
        await snap(page, 'visitor-left-typed');
        await page.goBack();
        await idle(page).catch(() => {});
        await snap(page, 'visitor-back-after-leave');
        facts.sweep.backBox = await searchForm(page).locator('input[name="query"]').inputValue().catch(() => null);
        save();

        // ------------------------------------------------------------- 4. signed in: reader and manager
        facts.levels = {};
        for (const who of [`${t}r`, `${t}m`]) {
            await signIn(page, who, {contextPath: t});
            facts.levels[who] = [];
            await page.goto(E('/search'));
            await idle(page).catch(() => {});
            await snap(page, `${who}-bare`);
            for (const q of LEVEL_Q(w)) {
                await searchFor(page, q);
                const s = await snap(page, `${who} ${q}`);
                const r = await readResults(page, byId);
                facts.levels[who].push({q, ...r, notices: s.notices});
                console.log(`[k16b ${run} ${app.name} ${db}] ${who.slice(-1) === 'r' ? 'reader ' : 'manager'} ${JSON.stringify(q).padEnd(32)} -> ${r.listed.join(',') || '(none)'}`);
            }
            await signOut(page);
        }
        facts.dialogs = dialogs;
        save();
    } finally {
        save();
        await close();
    }
});
