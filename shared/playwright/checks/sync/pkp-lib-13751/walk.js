// PR review of pkp-lib#12899 (pkp-lib#13751 main, #13752 stable-3_5_0; ojs#6053, #6054 bump the
// pointers; zenodo#14): the ROR pattern `0[^ILOU]{6}\d{2}` becomes `0[a-hj-km-np-tv-z0-9]{6}\d{2}`
// in every check. On PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"),
// `publicknowledge`, as `admin`, each value below is sent, from the signed-in page as the forms
// send it, to every surface that checks a ROR:
//   inst  POST api/v1/institutions {name, ror}                     (schemas/institution.json)
//   aff   PUT  …/contributors/<the first author> {contributorType, affiliations: [{authorId, ror}]}  (schemas/affiliation.json)
//   fund  POST …/publications/<id>/funders {funder: {ror}} (main only)     (schemas/funder.json)
//   rors  POST api/v1/rors {ror}  (PKPRorController::addOrEdit: 400 = refused by the pattern; a
//         value that passes goes on to the registry lookup, 404 offline)
// The first author's affiliations are put back after each `aff` send. Each value is followed by
// what the pattern should say at the head (the base accepts every `head: 400` row but the
// uppercase-I one).
//   Reset first:  npm run fleet-prep -- --feature pr12899 --dataset --reset --apps ojs,omp,ops
//   Run:          PROBE_FEATURE=pr12899 PROBE_AGENT=walk PROBE_RUN=<base|head> node bin/probe.js ojs,omp,ops shared/playwright/checks/sync/pkp-lib-13751/walk.js
//   3.5:          PKP_E2E_LINE=stable-3_5_0 in front of both, feature pr12899-35 (no funders there)
// Facts: .reports/<feature>/walk/walk-<run>-<app>.json; one line per send on stdout.
const {forEachApp, launch, signIn, sql, record} = require('../../../probe');

const VALUES = [
    {v: 'https://ror.org/0213rcc28', head: 200, why: 'valid, lowercase'},
    {v: 'https://ror.org/0a/b-c.12', head: 400, why: "'/', '-', '.' in the id (the issue's 0a/b-c.d12 is one character too long for either pattern)"},
    {v: 'https://ror.org/0ab cde12', head: 400, why: 'a space in the id'},
    {v: 'https://ror.org/0abcil012', head: 400, why: "lowercase 'i' and 'l', outside Crockford base32"},
    {v: 'https://ror.org/0213RCC28', head: 400, why: 'uppercase letters (ROR ids are lowercase)'},
    {v: 'https://ror.org/0213ICC28', head: 400, why: "uppercase 'I' (refused at both refs)"},
    {v: 'https://ror.org/05njb9z20', head: 200, why: 'valid, a real registry id'},
];
const CTX_TABLE = {ojs: ['journals', 'journal_id'], omp: ['presses', 'press_id'], ops: ['servers', 'server_id']};

function send(page, url, method, json) {
    return page.evaluate(
        async ({url, method, json}) => {
            const headers = {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/json'};
            const r = await fetch(url, {method, headers, body: json ? JSON.stringify(json) : undefined});
            const text = await r.text();
            let j = null;
            try { j = JSON.parse(text); } catch (e) {}
            return {status: r.status, json: j, text: j ? null : text.replace(/\s+/g, ' ').slice(0, 200)};
        },
        {url, method, json},
    );
}

const said = (r) => (r.status >= 400 && r.json ? JSON.stringify(r.json.ror || r.json.affiliations || r.json.errorMessage || r.json).slice(0, 160) : '');

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet');
    const run = process.env.PROBE_RUN || 'run';
    const [table, idCol] = CTX_TABLE[app.name];
    const row = sql(app, `select s.submission_id, p.publication_id, a.author_id from submissions s
        join publications p on p.publication_id = s.current_publication_id
        join authors a on a.publication_id = p.publication_id
        join ${table} c on c.${idCol} = s.context_id
        where c.path = 'publicknowledge' and p.status = 1 order by s.submission_id, a.seq, a.author_id limit 1`).split('|').map(Number);
    const [submissionId, publicationId, authorId] = row;
    const base = `/index.php/${app.contextPath}/api/v1`;
    const pub = `${base}/submissions/${submissionId}/publications/${publicationId}`;
    const facts = {app: app.name, run, submissionId, publicationId, authorId, sends: []};
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/institutions`));
        const contributor = await send(page, app.url(`${pub}/contributors/${authorId}`), 'GET');
        const keep = (contributor.json && contributor.json.affiliations || []).map((a) => (a.ror ? {authorId, ror: a.ror} : {authorId, name: a.name}));
        facts.keptAffiliations = keep;
        // main: a PUT without contributorType empties the contributor (U41 A31), so send the current one
        const type = contributor.json && contributor.json.contributorType ? {contributorType: contributor.json.contributorType} : {};
        const hasFunders = (await send(page, app.url(`${pub}/funders`), 'GET')).status === 200;
        for (const [i, c] of VALUES.entries()) {
            const out = {value: c.v, why: c.why, expectHead: c.head};
            const inst = await send(page, app.url(`${base}/institutions`), 'POST', {name: {en: `Walk ${run} ${i}`}, ror: c.v});
            out.inst = {status: inst.status, said: said(inst), stored: inst.json && inst.json.ror};
            if (inst.status === 200 && inst.json.id) await send(page, app.url(`${base}/institutions/${inst.json.id}`), 'DELETE');
            const aff = await send(page, app.url(`${pub}/contributors/${authorId}`), 'PUT', {...type, affiliations: [{authorId, ror: c.v}]});
            out.aff = {status: aff.status, said: said(aff), stored: aff.json && (aff.json.affiliations || []).map((a) => a.ror)};
            if (aff.status === 200) await send(page, app.url(`${pub}/contributors/${authorId}`), 'PUT', {...type, affiliations: keep});
            if (hasFunders) {
                const fund = await send(page, app.url(`${pub}/funders`), 'POST', {funder: {ror: c.v}});
                out.fund = {status: fund.status, said: said(fund), stored: fund.json && fund.json.ror};
                if (fund.status === 200 && fund.json.id) await send(page, app.url(`${pub}/funders/${fund.json.id}`), 'DELETE');
            }
            const rors = await send(page, app.url(`${base}/rors`), 'POST', {ror: c.v});
            out.rors = {status: rors.status, said: said(rors)};
            facts.sends.push(out);
            const st = (k) => (out[k] ? out[k].status : '-');
            console.log(`[${app.name} ${run}] ${c.v.padEnd(29)} inst ${st('inst')} aff ${st('aff')} fund ${st('fund')} rors ${st('rors')}  (head should: ${c.head === 200 ? 'accept' : 'refuse'}; ${c.why})`);
        }
        const after = await send(page, app.url(`${pub}/contributors/${authorId}`), 'GET');
        facts.affiliationsAfter = (after.json && after.json.affiliations || []).map((a) => a.ror || a.name);
        facts.givenNameAfter = after.json && after.json.givenName;
    } finally {
        await close();
    }
    record(`walk-${run}-${app.name}`, facts);
});
