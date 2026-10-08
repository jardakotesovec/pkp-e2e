// Issue report docs/issues/U41-A7-affiliation-error-list-object-object.md (U41 A7): when a
// contributor's affiliation is refused, the form's error list (the one a screen reader reads)
// says "Go to Affiliations: [object Object]" instead of the message.
//
// Takes the report's Steps through the screens on a dataset fleet freshly reset to PKP's default
// test dataset, as the dataset's editor `dbarnes` on `publicknowledge`: on the submission of
// lib.js CASES, the contributor's "Edit", the typed affiliation's "Edit institution name", the
// English name cleared, "Save". The save is refused, so nothing is stored. The kit builds nothing.
//
// Modes (first argument):
//   steps (default)  the Steps.
//   add              the Cause's reach, the workflow's "Add Contributor": on the same Contributors
//                    page, "Add Contributor", a person (lib.js NEW) typed in, an institution entered
//                    by hand and added, its "Edit institution name", the English name cleared, "Save".
//   wizard           the Cause's reach, the submission wizard: the dataset author of lib.js WIZARD
//                    starts a submission ("Begin Submission"), "Continue" to the step "Contributors",
//                    then as `add`.
//   dropped          the Cause's reach, a name in a language the journal no longer takes: the
//                    Steps' contributor, "Edit institution name", a French name typed beside the
//                    English one, "Save"; then Settings > Website > Setup > Languages, "Submission
//                    Languages", French's "Metadata" box unticked; then the contributor's "Edit"
//                    and "Save" with nothing changed.
//   goto             the Steps, then a press on the list's "Go to Affiliations": where focus and
//                    the scroll are afterwards.
//   nb               what a fix must leave alone (runs alone): on the same form, the English
//                    "Given Name" cleared and "Country" emptied, "Save": the list's entries for a
//                    per-language field and a plain field.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/affiliation-error-list-object-object/walk.js [steps|goto|nb]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 in front of both, the line's feature, PROBE_RUN=r35.
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (nb), with fix.diff applied or not.
// Facts: .reports/<feature>/<id>/affiliation-error-facts[-add|-wizard|-dropped][-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record} = require('../../../probe');
const L = require('./lib');
const R = require('../registry-pick-saves-nameless/lib.js');
const W = require('../wizard-refused-save-hangs-saving/lib.js');

const mode = process.argv[2] || 'steps';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const run = `${['add', 'wizard', 'dropped'].includes(mode) ? `-${mode}` : ''}${process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : ''}`;
    const facts = {app: app.name, line: app.line || 'main', mode, run: process.env.PROBE_RUN || null};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${L.flat(JSON.stringify(v), 1600)}`);
    };
    const {page, close} = await launch(app);
    const group = app.name === 'ops' ? 'Preprint' : 'Publication';
    const wf = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: group}});
    const c = L.CASES[app.name];
    /** The reach paths' shared end: the form's person, the typed institution, its English name cleared, "Save". */
    const refusedAdd = async () => {
        const dlg = await L.openAddContributor(page, L.NEW);
        fact('add: suggestions for the typed name', await L.addTypedInstitution(page, dlg, L.NEW.institution));
        fact('add: affiliations rows', await R.affiliationRows(dlg));
        await L.rowAction(page, dlg, L.NEW.institution, 'Edit institution name');
        const boxes = dlg.locator('.pkpFormField--affiliations tbody input.pkpFormField--text__input');
        await boxes.first().waitFor({timeout: L.T});
        fact('add: name boxes (values)', await boxes.evaluateAll((bs) => bs.map((b) => b.value)));
        await boxes.first().fill('');
        await boxes.first().blur();
        fact('add: save', await L.pressSave(page, dlg));
        fact('add: error box at the foot', await L.errorBox(dlg));
        fact('add: Affiliations field', await L.fieldText(dlg, '.pkpFormField--affiliations'));
        record(`affiliation-error${run}`, await screen(page));
        await shot(page, `affiliation-error${run}`);
        await R.closeForm(page, dlg);
    };
    try {
        if (mode === 'wizard') {
            const w = L.WIZARD[app.name];
            await signIn(page, w.author);
            fact('wizard: submission started', await W.beginSubmission(page, app, {title: 'u41ir1 wizard', section: w.section}));
            for (let i = 0; i < 6 && !/Contributors/.test(await W.currentStep(page)); i++) await W.pressContinue(page);
            fact('wizard: current step', await W.currentStep(page));
            await refusedAdd();
            return;
        }
        // step 1
        await signIn(page, 'dbarnes');
        // steps 2-3
        if (!(await R.openPage(wf, page, c.id, 'Contributors'))) {
            fact('3 Contributors page', 'absent');
            return;
        }
        if (mode === 'add') {
            await refusedAdd();
            return;
        }
        // step 4
        const dlg = await R.openContributorEdit(page, wf, c.contributor);
        fact('4 affiliations rows', await R.affiliationRows(dlg));

        if (mode === 'steps' || mode === 'goto') {
            // step 5
            await L.rowAction(page, dlg, c.institution, 'Edit institution name');
            const boxes = dlg.locator('.pkpFormField--affiliations tbody input.pkpFormField--text__input');
            await boxes.first().waitFor({timeout: L.T});
            fact('5 name boxes (values)', await boxes.evaluateAll((bs) => bs.map((b) => b.value)));
            // step 6: the English box is the first (the submission's language)
            await boxes.first().fill('');
            await boxes.first().blur();
            // step 7
            fact('7 save', await L.pressSave(page, dlg));
            fact('7 error box at the foot', await L.errorBox(dlg));
            fact('7 Affiliations field', await L.fieldText(dlg, '.pkpFormField--affiliations'));
            record(`affiliation-error${run}`, await screen(page));
            await shot(page, `affiliation-error${run}`);
            if (mode === 'goto') {
                // a screen reader's press on the list's button (it is clipped off screen, so a DOM click)
                const before = await L.focusFacts(page, dlg);
                await dlg.locator('.pkpFormErrors ul button').first().evaluate((b) => b.click());
                await L.sleep(1200);
                fact('goto before the press', before);
                fact('goto after "Go to Affiliations"', await L.focusFacts(page, dlg));
            }
            fact('stored affiliations after (a read)', R.storedAffiliations(app, R.authorId(app, c.id, c.contributor)));
        } else if (mode === 'dropped') {
            const {JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');
            const boxes = dlg.locator('.pkpFormField--affiliations tbody input.pkpFormField--text__input');
            // the French name beside the English one
            await L.rowAction(page, dlg, c.institution, 'Edit institution name');
            await boxes.first().waitFor({timeout: L.T});
            await boxes.nth(1).fill('u41ir1 nom');
            await boxes.nth(1).blur();
            fact('dropped 1 name boxes (values)', await boxes.evaluateAll((bs) => bs.map((b) => b.value)));
            fact('dropped 1 save with the French name', await L.pressSave(page, dlg));
            await dlg.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
            fact('dropped 1 stored affiliations', R.storedAffiliations(app, R.authorId(app, c.id, c.contributor)));
            // the journal stops taking French for submission metadata
            const tab = new JournalLanguagesTab(page, app.contextPath, {locale: 'en'});
            await tab.goto();
            fact('dropped 2 French row before', await L.submissionLanguageRow(tab, 'fr_CA'));
            fact('dropped 2 press "Metadata"', await L.pressBox(tab, 'fr_CA', 'submissionMetadataLocale'));
            let row = await L.submissionLanguageRow(tab, 'fr_CA');
            if (row.metadata && row.submissions) {
                // refused while French is still a language to submit in: that box first
                fact('dropped 2 press "Submissions"', await L.pressBox(tab, 'fr_CA', 'submissionLocale'));
                fact('dropped 2 press "Metadata" again', await L.pressBox(tab, 'fr_CA', 'submissionMetadataLocale'));
                row = await L.submissionLanguageRow(tab, 'fr_CA');
            }
            fact('dropped 2 French row after', row);
            record(`affiliation-error-languages${run}`, await screen(page));
            // the contributor again, nothing changed
            await R.openPage(wf, page, c.id, 'Contributors');
            const again = await R.openContributorEdit(page, wf, c.contributor);
            fact('dropped 3 affiliations rows', await R.affiliationRows(again));
            await L.rowAction(page, again, c.institution, 'Edit institution name');
            const boxes2 = again.locator('.pkpFormField--affiliations tbody input.pkpFormField--text__input');
            await boxes2.first().waitFor({timeout: L.T});
            fact('dropped 3 name boxes', await boxes2.evaluateAll((bs) => bs.map((b) => ({label: b.getAttribute('aria-label') || b.getAttribute('placeholder') || b.name, value: b.value}))));
            fact('dropped 3 save', await L.pressSave(page, again));
            fact('dropped 3 error box at the foot', await L.errorBox(again));
            fact('dropped 3 Affiliations field', await L.fieldText(again, '.pkpFormField--affiliations'));
            fact('dropped 3 messages the form shows', await again.locator('.pkpFormFieldError, [id$="-error"]').evaluateAll((es) => es.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)));
            const snapshot = await screen(page);
            fact('dropped 3 page notices', snapshot.notices);
            record(`affiliation-error${run}`, snapshot);
            await shot(page, `affiliation-error${run}`);
            fact('dropped 3 stored affiliations', R.storedAffiliations(app, R.authorId(app, c.id, c.contributor)));
            await R.closeForm(page, again);
            return;
        } else if (mode === 'nb') {
            const given = dlg.locator('input[name^="givenName"]').first();
            fact('nb given name box', {name: await given.getAttribute('name'), value: await given.inputValue()});
            await given.fill('');
            await given.blur();
            const country = dlg.locator('select[name="country"]').first();
            if (await country.count()) {
                await country.selectOption('').catch((e) => fact('nb country empty option', L.flat(e.message, 200)));
            } else fact('nb country select', 'absent');
            fact('nb save', await L.pressSave(page, dlg));
            fact('nb error box at the foot', await L.errorBox(dlg));
            record(`affiliation-error-nb${run}`, await screen(page));
            await shot(page, `affiliation-error-nb${run}`);
        }
        await R.closeForm(page, dlg);
    } catch (e) {
        fact('error', L.flat(e.message, 500));
        await shot(page, `affiliation-error-${mode}-error${run}`).catch(() => {});
    } finally {
        record(`affiliation-error-facts${run}`, facts);
        await close();
    }
});
