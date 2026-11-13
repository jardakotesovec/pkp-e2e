// Helpers for org-ror.js and split-rows.js (pkp/pkp-lib#13788, docs/reports/2026-11-13-pkp-lib-13788.md).
// Requiring this file runs nothing.
//
// The tool needs a complete ROR registry copy (it refuses fewer than 100000 `rors` rows). PKP's
// default test dataset holds one (146716 rows on main and stable-3_5_0, NSERC among them); a
// campaign fleet's copy is empty and the server is offline, so there `registry()` seeds NSERC through
// the test API and adds 100000 filler rows by SQL (PostgreSQL's generate_series), under a prefix of
// this run's own, which `cleanup()` deletes again. On a dataset fleet it adds nothing.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {sql, outFile} = require('../../../probe');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const ROR = 'https://ror.org/01h531d29';
const ROR_NAME = 'Natural Sciences and Engineering Research Council of Canada';
const MIN_ROR_COUNT = 100000; // RepairRorAffiliationsTool::MIN_ROR_COUNT

const abs = (p) => (path.isAbsolute(p) ? p : path.join(REPO_ROOT, p));

/** Make the registry what the tool needs; returns {seeded, fillers, cleanup()}. */
async function registry(app, t) {
    const out = {seeded: false, fillers: 0, prefix: null};
    if (Number(sql(app, `select count(*) from rors where ror = '${ROR}'`)) === 0) {
        if (app.dataset || !app.testApi) throw new Error(`${ROR} is not in this install's rors table`);
        await app.api.setSite({rors: [{id: ROR, status: 'active', names: [{value: ROR_NAME, types: ['ror_display', 'label'], lang: 'en'}]}]});
        out.seeded = true;
    }
    const count = Number(sql(app, 'select count(*) from rors'));
    if (count < MIN_ROR_COUNT) {
        out.prefix = `https://filler.invalid/${t}/`;
        out.fillers = MIN_ROR_COUNT - count;
        sql(app, `insert into rors (ror, display_locale, is_active) select '${out.prefix}' || g, 'en', 1 from generate_series(1, ${out.fillers}) g`);
    }
    out.cleanup = () => (out.prefix ? Number(sql(app, `with d as (delete from rors where ror like '${out.prefix}%' returning 1) select count(*) from d`)) : 0);
    return out;
}

/** A minimal RFC 4180 reader for the tool's CSV (its JSON columns hold commas and quotes). */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else field += c;
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    const [head, ...body] = rows;
    return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/**
 * `php lib/pkp/tools/repairRorAffiliations.php [args]` from the app root, as an administrator runs
 * it, with this fleet's config; the CSV and SQL files go to the run's output folder.
 * REPAIR_TOOL=<path> runs another copy instead (a fix tried outside the checkout; its bootstrap
 * `require` must then name the app root, e.g. `getcwd() . '/tools/bootstrap.php'`).
 */
function runTool(app, args = []) {
    const out = path.dirname(outFile('x.csv'));
    const tool = process.env.REPAIR_TOOL ? abs(process.env.REPAIR_TOOL) : 'lib/pkp/tools/repairRorAffiliations.php';
    let code = 0;
    let text;
    try {
        text = execFileSync('php', [tool, `--out=${out}`, ...args], {
            cwd: abs(app.root), env: {...process.env, PKP_CONFIG_FILE: abs(app.configFile)}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (e) {
        code = e.status;
        text = `${e.stdout || ''}${e.stderr || ''}`;
    }
    const m = /Report: (\S+)/.exec(text);
    const csv = m ? fs.readFileSync(m[1], 'utf8') : null;
    return {tool: process.env.REPAIR_TOOL || null, args, code, out: text.trim().split('\n'), csvFile: m ? path.relative(REPO_ROOT, m[1]) : null, rows: csv ? parseCsv(csv) : []};
}

/** An author's stored affiliations: [{id, ror, names: {locale: name}}]. */
function affiliations(app, authorId) {
    const lines = sql(app, `select aa.author_affiliation_id, coalesce(aa.ror, ''), coalesce(s.locale, ''), coalesce(s.setting_value, '') from author_affiliations aa left join author_affiliation_settings s on s.author_affiliation_id = aa.author_affiliation_id and s.setting_name = 'name' where aa.author_id = ${Number(authorId)} order by 1, 3`);
    const byId = new Map();
    for (const l of lines.split('\n').filter(Boolean)) {
        const [id, ror, locale, name] = l.split('|');
        if (!byId.has(id)) byId.set(id, {id: Number(id), ror: ror || null, names: {}});
        if (locale) byId.get(id).names[locale] = name;
    }
    return [...byId.values()];
}

module.exports = {ROR, ROR_NAME, registry, runTool, parseCsv, affiliations};
