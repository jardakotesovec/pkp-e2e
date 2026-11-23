// PR review — pkp/pkp-lib#13624 for pkp/pkp-lib#11972: the native import of contributors without
// an email (NativeXmlPKPAuthorFilter). One submission is exported with the plugin's CLI, its
// <author> rewritten into four variants, and each variant imported as its own file:
//   org-noemail   contributor_type="ORGANIZATION", no <email>            → imported, email null
//   org-orcid     ORGANIZATION with an <orcid>                           → imported, no ORCID kept
//   person-noemail PERSON, no <email>                                    → refused, missingEmail
//   person-emptyemail PERSON, <email></email>                            → refused, missingEmail
//   person-orcid  PERSON with email and <orcid>                          → imported with the ORCID (control)
//   PROBE_FEATURE=sync PROBE_AGENT=r13624 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13624/import.js
// Facts: import-<app>.json, the XML files beside it.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, record, sql, tag, outFile} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');

function cli(app, args) {
    const root = path.resolve(REPO, app.root);
    const env = {...process.env, PKP_CONFIG_FILE: path.resolve(REPO, app.configFile)};
    try {
        return {code: 0, out: execFileSync('php', ['tools/importExport.php', 'NativeImportExportPlugin', ...args], {cwd: root, env, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe']})};
    } catch (e) {
        return {code: e.status, out: `${e.stdout || ''}${e.stderr || ''}`};
    }
}

forEachApp(async (app) => {
    const t = tag('i13624');
    const facts = {};
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Import ${t}`});
    const exp = outFile('import-export.xml');
    facts.export = cli(app, ['export', exp, t, 'article', String(S.submissionId)]);
    const xml = fs.readFileSync(exp, 'utf8');
    const author = xml.match(/<author [\s\S]*?<\/author>/)[0];
    facts.exportedAuthor = author.replace(/\s+/g, ' ');
    const noEmail = author.replace(/\s*<email>[^<]*<\/email>/, '');
    // An organization's name travels in <givenname> (NativeXmlPKPAuthorFilter).
    const org = noEmail
        .replace('contributor_type="PERSON"', 'contributor_type="ORGANIZATION"')
        .replace(/(<givenname[^>]*>)[^<]*/, '$1Imported Org')
        .replace(/\s*<familyname[\s\S]*?<\/familyname>/g, '');
    const variants = {
        'org-noemail': org,
        'org-orcid': org.replace(/<contributor_roles>/, '<orcid>https://orcid.org/0000-0002-1825-0097</orcid><contributor_roles>'),
        'person-noemail': noEmail,
        'person-emptyemail': author.replace(/<email>[^<]*<\/email>/, '<email></email>'),
    };
    variants['person-orcid'] = author.replace(/<contributor_roles>/, '<orcid>https://orcid.org/0000-0002-1825-0097</orcid><contributor_roles>');
    facts.variants = {};
    for (const [name, a] of Object.entries(variants)) {
        const file = outFile(`import-${name}.xml`);
        fs.writeFileSync(file, xml.replace(/<author [\s\S]*?<\/author>/, a).replace(/<title locale="en">([^<]*)<\/title>/, `<title locale="en">$1 ${name}</title>`));
        const before = Number(sql(app, 'select max(author_id) from authors'));
        const r = cli(app, ['import', file, t, `${t}mg`]);
        const rows = sql(app, `select a.author_id, a.contributor_type, coalesce(a.email,'<null>'),
            coalesce((select setting_value from author_settings s where s.author_id=a.author_id and s.setting_name='orcid'),'<no orcid>'),
            coalesce((select setting_value from author_settings s where s.author_id=a.author_id and s.setting_name='organizationName' limit 1),'')
            from authors a where a.author_id > ${before} order by 1`);
        facts.variants[name] = {code: r.code, out: r.out.split('\n').filter((l) => l.trim()).slice(0, 12), authors: rows.split('\n').filter(Boolean)};
    }
    record('import', facts);
    console.log(JSON.stringify(facts, null, 1));
});
