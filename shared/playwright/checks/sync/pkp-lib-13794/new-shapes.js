// PR review check — pkp/pkp-lib#13794 (issue pkp/pkp-lib#13459, stable-3_5_0), `tools/repairRorAffiliations.php`:
// the shapes and review reasons the PR adds beside the split rows (those are
// ../pkp-lib-13788/split-rows.js), plus one case it leaves out.
//
// Each author gets the pre-3.5 `author_settings` rows and the `author_affiliations` rows an upgrade
// would have left, by SQL (as split-rows.js). R1 is NSERC (`L.ROR`), R2 another record of the
// dataset's registry copy, read at run time.
//   regfail   legacy name = R1's name, plugin ROR R2; stored: the name only (the registry download
//             failed during the upgrade). Expected: repair → [R2].
//   regfail0  legacy name = R1's name, no plugin ROR; stored: the name only. Expected: no line
//             (already what the fixed migration gives).
//   lost      legacy "Example Lab", plugin ROR R2; stored: an edited name, no ROR. Expected: review,
//             reason "ROR plugin ROR missing".
//   control   legacy name = R1's name, plugin ROR R2; stored: [R1] (the faulty upgrade's own shape).
//             Expected: repair → [R2].
//   renamed   legacy "<t> Former Name", no plugin ROR; stored: [R2], as the upgrade left it when R2
//             was still called that; R2's cached name differs today (ROR renamed it, the cache keeps
//             ror_display and label names only). Expected by the issue's rules: listed (the ROR was
//             derived from the name). PR head a3da55ce64: no line; bb17ba1380 (round 2): review,
//             "ROR not explained by the legacy data" (reads fixed).
//
// Fleet: a stable-3_5_0 dataset fleet, freshly reset (the first five authors are rewritten):
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature <f> --dataset <n> --reset --apps ojs
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=<f> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13794/new-shapes.js
// Facts: new-shapes-<app>.json.
const {forEachApp, record, sql, tag} = require('../../../probe');
const L = require('../pkp-lib-13788/lib');

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('needs a dataset fleet (a complete registry copy)');
    const t = tag('r13794');
    const facts = {line: app.line, dataset: app.dataset};
    const ids = sql(app, 'select author_id from authors order by author_id limit 5').split('\n').map(Number);
    const [regfail, regfail0, lost, control, renamed] = ids;
    const r1Name = sql(app, `select s.setting_value from ror_settings s join rors r using (ror_id) where r.ror = '${L.ROR}' and s.setting_name = 'name' and s.locale = 'en'`);
    const R2 = sql(app, `select r.ror from rors r join ror_settings s using (ror_id) where s.setting_name = 'name' and r.ror <> '${L.ROR}' order by r.ror_id limit 1`);
    const former = `${t} Former Name`;
    const q = (s) => s.replace(/'/g, "''");
    const legacy = {
        [regfail]: {names: {en: r1Name}, ror: R2},
        [regfail0]: {names: {en: r1Name}, ror: null},
        [lost]: {names: {en: 'Example Lab'}, ror: R2},
        [control]: {names: {en: r1Name}, ror: R2},
        [renamed]: {names: {en: former}, ror: null},
    };
    const stored = {
        [regfail]: [{ror: null, names: {en: r1Name}}],
        [regfail0]: [{ror: null, names: {en: r1Name}}],
        [lost]: [{ror: null, names: {en: 'Example Lab (edited)'}}],
        [control]: [{ror: L.ROR, names: {}}],
        [renamed]: [{ror: R2, names: {}}],
    };
    for (const a of ids) {
        sql(app, `delete from author_affiliation_settings where author_affiliation_id in (select author_affiliation_id from author_affiliations where author_id = ${a})`);
        sql(app, `delete from author_affiliations where author_id = ${a}`);
        sql(app, `delete from author_settings where author_id = ${a} and setting_name in ('affiliation', 'rorId')`);
        const rows = Object.entries(legacy[a].names).map(([l, n]) => `(${a}, '${l}', 'affiliation', '${q(n)}')`);
        if (legacy[a].ror) rows.push(`(${a}, '', 'rorId', '${legacy[a].ror}')`);
        sql(app, `insert into author_settings (author_id, locale, setting_name, setting_value) values ${rows.join(', ')}`);
        for (const s of stored[a]) {
            const id = sql(app, `insert into author_affiliations (author_id, ror) values (${a}, ${s.ror ? `'${s.ror}'` : 'null'}) returning author_affiliation_id`).split('\n')[0];
            const vals = Object.entries(s.names).map(([l, n]) => `(${id}, '${l}', 'name', '${q(n)}')`);
            if (vals.length) sql(app, `insert into author_affiliation_settings (author_affiliation_id, locale, setting_name, setting_value) values ${vals.join(', ')}`);
        }
    }
    facts.r1 = {ror: L.ROR, name: r1Name};
    facts.r2 = {ror: R2, cachedNames: sql(app, `select string_agg(s.locale || '=' || s.setting_value, '; ') from ror_settings s join rors r using (ror_id) where r.ror = '${R2}' and s.setting_name = 'name'`)};
    facts.authors = {regfail, regfail0, lost, control, renamed};
    const dry = L.runTool(app);
    const line = (a) => dry.rows.find((r) => Number(r.author_id) === a) || null;
    facts.dry = {code: dry.code, out: dry.out, csvFile: dry.csvFile};
    for (const [k, a] of Object.entries(facts.authors)) facts.dry[k] = line(a);
    facts.dry.others = dry.rows.filter((r) => !ids.includes(Number(r.author_id))).map((r) => `${r.action}:${r.author_id}`);
    record('new-shapes', facts);
    console.log(JSON.stringify(facts, null, 1));
});
