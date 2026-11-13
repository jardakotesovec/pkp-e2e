// Regression check — pkp/pkp-lib#13788 (issue pkp/pkp-lib#13459), `tools/repairRorAffiliations.php`,
// finding 2 of docs/reports/2026-11-13-pkp-lib-13788.md: an author whose affiliations the 3.5.0-0 or
// 3.5.0-1 upgrade wrote as one row per language, and whose old ROR plugin ROR ID that upgrade
// dropped, is neither repaired nor listed by the tool.
//
// The state is what that upgrade leaves, written by SQL (no screen on main or 3.5 makes pre-3.5 data,
// and the walk does not run a 3.4 → 3.5.0-1 upgrade): each author gets the pre-3.5 `author_settings`
// rows (an `affiliation` per language matching no ROR name, and the ROR plugin's `rorId`
// https://ror.org/01h531d29) and the `author_affiliations` rows the upgrade wrote from them:
//   split    bilingual; one row per language, no ROR: the 3.5.0-0/-1 migration (pkp-lib blob
//            62ee728c3c, migrateNonRorAffiliations() inserting per (author, locale) row)
//   grouped  bilingual; one row holding both names, no ROR: 3.5.0-2 to 3.5.0-5 (blob db4516a552,
//            after pkp/pkp-lib#11675). The control.
//   mono     English only; one row, no ROR: the same under either upgrade. The reach's control.
// Then the tool's dry run, as an administrator runs it from the app root.
//
// Fleets, each freshly reset (main or stable-3_5_0; PKP_E2E_LINE=stable-3_5_0 in front for 3.5):
//   - a dataset fleet: the three authors are the dataset's first three (their affiliations are
//     replaced); the dataset's registry copy is complete.
//       npm run fleet-prep -- --feature <f> --dataset <n> --reset --apps ojs
//   - a campaign fleet (main): a scratch bilingual journal and submission with three contributors;
//     NSERC seeded and the registry filled by SQL (lib.js), the fillers deleted at the end.
//   PROBE_FEATURE=<f> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13788/split-rows.js
// REPAIR_TOOL=<path> runs a copy of the tool instead (lib.js), for a fix tried outside the checkout.
//
// Reads fixed when: the dry run lists `split` as "repair" to [{"ror":"https://ror.org/01h531d29",
// "name":{}}], like `grouped` and `mono`. At c09ff30833 (and c79dddb5e6 on 3.5): `grouped` and `mono`
// are listed as "repair", `split` has no line at all and is in no count.
//
// Facts: split-rows-<app>.json.
const {forEachApp, record, sql, tag} = require('../../../probe');
const L = require('./lib');

forEachApp(async (app) => {
    const t = tag('r13788');
    const facts = {line: app.line, dataset: app.dataset, tool: process.env.REPAIR_TOOL || null};
    let ids;
    if (app.dataset) {
        ids = sql(app, 'select author_id from authors order by author_id limit 3').split('\n').map(Number);
    } else {
        await app.api.createContext({tag: t,
            context: {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [{username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
        const emails = ['split', 'grouped', 'mono'].map((k) => `${t}${k}@mail.test`);
        await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Split ${t}`,
            contributors: emails.map((email, i) => ({givenName: ['Split', 'Grouped', 'Mono'][i], familyName: 'Rows', email}))});
        ids = emails.map((e) => Number(sql(app, `select author_id from authors where email = '${e}'`)));
    }
    const [split, grouped, mono] = ids;
    const en = `Example Lab ${t}`;
    const fr = `Laboratoire Exemple ${t}`;
    const names = {[split]: {en, fr_CA: fr}, [grouped]: {en, fr_CA: fr}, [mono]: {en}};
    for (const a of ids) {
        sql(app, `delete from author_affiliation_settings where author_affiliation_id in (select author_affiliation_id from author_affiliations where author_id = ${a})`);
        sql(app, `delete from author_affiliations where author_id = ${a}`);
        sql(app, `delete from author_settings where author_id = ${a} and setting_name in ('affiliation', 'rorId')`);
        // Before the upgrade: the affiliation per language and the ROR plugin's ROR ID.
        const rows = Object.entries(names[a]).map(([l, n]) => `(${a}, '${l}', 'affiliation', '${n}')`);
        sql(app, `insert into author_settings (author_id, locale, setting_name, setting_value) values ${rows.join(', ')}, (${a}, '', 'rorId', '${L.ROR}')`);
    }
    const addRow = (a, byLocale) => {
        const id = sql(app, `insert into author_affiliations (author_id) values (${a}) returning author_affiliation_id`).split('\n')[0];
        const vals = Object.entries(byLocale).map(([l, n]) => `(${id}, '${l}', 'name', '${n}')`);
        sql(app, `insert into author_affiliation_settings (author_affiliation_id, locale, setting_name, setting_value) values ${vals.join(', ')}`);
    };
    // After 3.5.0-0/-1: one row per language. After 3.5.0-2 to -5: one row with every language.
    for (const [l, n] of Object.entries(names[split])) addRow(split, {[l]: n});
    addRow(grouped, names[grouped]);
    addRow(mono, names[mono]);

    const reg = await L.registry(app, t);
    try {
        facts.authors = {split, grouped, mono};
        facts.registry = {seeded: reg.seeded, fillers: reg.fillers};
        facts.stored = Object.fromEntries(ids.map((a) => [a, L.affiliations(app, a)]));
        const dry = L.runTool(app);
        const line = (a) => dry.rows.find((r) => Number(r.author_id) === a) || null;
        facts.dry = {code: dry.code, out: dry.out, csvFile: dry.csvFile, split: line(split), grouped: line(grouped), mono: line(mono),
            others: dry.rows.filter((r) => !ids.includes(Number(r.author_id))).map((r) => `${r.action}:${r.author_id}`)};
    } finally {
        facts.fillersDeleted = reg.cleanup();
        record('split-rows', facts);
    }
    console.log(JSON.stringify(facts, null, 1));
});
