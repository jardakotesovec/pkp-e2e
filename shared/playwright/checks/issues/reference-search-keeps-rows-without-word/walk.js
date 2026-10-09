// Issue report docs/issues/U42-A3-reference-search-keeps-rows-without-word.md
// (U42 A3): "Search references here" keeps rows whose shown text lacks
// the typed word, because it matches everything the reference's record
// holds. Takes the report's Steps on PKP's default test dataset (main):
// dbarnes opens OJS submission 8, OMP 3 or OPS 1, adds five references and
// searches "false", "0" and "5".
// After the steps the same walk types, and records, what the report's
// Cause and control rest on (a search changes nothing): "citations" and
// "http" (kept every row until pkp/pkp-lib#13475 took the reference's API
// address out of the record), "null" and a double quote (the record's
// empty fields and JSON's punctuation), then the control words the rows do
// show ("epsilon", "ZETA piece", "2021").
// MODE=nb runs the neighbour check alone (the control words; clearing
// shows all). MODE=lookup: see lookupMode() below.
// Reset the dataset fleet first; the walk changes the dataset.
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/reference-search-keeps-rows-without-word/walk.js
const {forEachApp, launch, signIn, signOut, record, shot, idle} = require('../../../probe');
const {SUBMISSION, openReferences, addLines, search, rowTexts} = require('../pasted-repeat-reference-dropped-saved/lib');

const MODE = process.env.MODE || 'steps';
const LINES = ['Alpha study 2020', 'Beta trial 2021', 'Gamma report 2022', 'Epsilon note', 'Zeta final piece'];

// MODE=lookup: a manager turns metadata lookup on; one reference is given
// shown details (URL, title, an author) and a hidden one ("Publisher or
// Host") through "Edit citation"; searches for a shown word, the
// reference's own text, the hidden word and "true".
async function lookupMode(app, facts) {
    const {tickMetadata} = require('../citation-author-row-kept-after-close/lib');
    {
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'rvaca');
            facts.lookupOn = await tickMetadata(page, app, ['lookup']);
            console.log(`[fact] lookup on: ${JSON.stringify(facts.lookupOn)}`);
            await signOut(page);
        } finally {
            await close();
        }
    }
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        const refs = await openReferences(page, app, SUBMISSION[app.name], 'a3-lookup-open');
        facts.added = await addLines(page, refs, ['Delta paper 2023', 'Epsilon note'], 'a3-lookup-add');
        const panel = await refs.edit('Delta paper 2023');
        await panel.field('URL').fill('https://example.org/u42rdelta');
        await panel.field('Title').fill('Harbour tides u42rtitle');
        await panel.field('Publisher or Host').fill('U42rhost Press');
        await panel.addAuthor({givenName: 'Ada', familyName: 'U42rfamily'});
        await panel.save();
        await idle(page);
        facts.rowsAfterEdit = await rowTexts(refs);
        console.log(`[fact] rows after edit: ${JSON.stringify(facts.rowsAfterEdit)}`);
        await shot(page, 'a3-lookup-after-edit');
        facts.searches = {};
        for (const [i, w] of ['u42rtitle', 'u42rfamily', 'delta', 'u42rhost', 'true'].entries()) {
            facts.searches[w] = await search(page, refs, w, `a3-lookup-search${i + 1}`);
        }
        const hit = (rows) => rows.some((r) => /u42rtitle/i.test(r));
        facts.verdict = {
            titleFound: hit(facts.searches.u42rtitle),
            authorFound: hit(facts.searches.u42rfamily),
            rawTextFound: hit(facts.searches.delta),
            hiddenNotFound: !hit(facts.searches.u42rhost),
            trueRows: facts.searches.true.filter((r) => /u42rtitle|Epsilon/.test(r)).length,
            epsilonNotInShownSearches: !facts.searches.u42rtitle.some((r) => /Epsilon/.test(r)),
        };
        await signOut(page);
    } finally {
        await close();
    }
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const sid = SUBMISSION[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: sid};
    if (MODE === 'lookup') {
        await lookupMode(app, facts);
        console.log(`[fact] ${app.name} verdict: ${JSON.stringify(facts.verdict)}`);
        record(`a3-facts-${MODE}`, facts);
        return;
    }
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        const refs = await openReferences(page, app, sid, 'a3-step2');
        facts.step3 = await addLines(page, refs, LINES, 'a3-step3');
        const CONTROL = ['epsilon', 'ZETA piece', '2021'];
        const words = MODE === 'nb' ? CONTROL : ['false', '0', '5'];
        facts.searches = {};
        for (const [i, w] of words.entries()) {
            facts.searches[w] = await search(page, refs, w, `a3-${MODE}-search${i + 1}`);
        }
        await shot(page, `a3-${MODE}-last-search`);
        if (MODE !== 'nb') {
            // Not steps: the Cause's and the control's searches, recorded apart.
            facts.after = {};
            for (const [i, w] of ['citations', 'http', 'null', '"', ...CONTROL].entries()) {
                facts.after[w] = await search(page, refs, w, `a3-${MODE}-after${i + 1}`);
            }
        }
        await refs.clearSearchButton().click().catch(() => {});
        await page.waitForTimeout(500);
        facts.cleared = await rowTexts(refs);
        const s = facts.searches;
        const one = (rows, text) => (rows || []).join('|') === text;
        const kept = (rows) => (rows || []).filter((r) => LINES.includes(r));
        const control = MODE === 'nb' ? s : facts.after;
        const controlVerdict = {
            epsilon: one(control.epsilon, 'Epsilon note'),
            zeta: one(control['ZETA piece'], 'Zeta final piece'),
            y2021: one(control['2021'], 'Beta trial 2021'),
            clearedAll: facts.cleared.length === 5,
        };
        facts.verdict = MODE === 'nb'
            ? controlVerdict
            : {
                falseRows: kept(s.false).length,
                zeroRows: kept(s['0']),
                fiveRows: kept(s['5']),
                // Expected: no row for "false" and "5", the three dated rows for "0".
                asExpected: kept(s.false).length === 0 && kept(s['5']).length === 0
                    && kept(s['0']).join('|') === LINES.slice(0, 3).join('|'),
                after: {
                    citationsRows: kept(facts.after.citations).length,
                    httpRows: kept(facts.after.http).length,
                    nullRows: kept(facts.after.null).length,
                    quoteRows: kept(facts.after['"']).length,
                },
                control: controlVerdict,
            };
        console.log(`[fact] ${app.name} verdict: ${JSON.stringify(facts.verdict)}`);
        await signOut(page);
    } finally {
        await close();
    }
    record(`a3-facts-${MODE}`, facts);
    console.log(`[fact] ${app.name} done`);
});
