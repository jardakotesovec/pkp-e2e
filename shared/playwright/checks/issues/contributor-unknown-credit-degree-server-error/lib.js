// Helpers of walk.js here (U41 A29, A33). Requiring this file runs nothing. Self-contained: the screen
// helpers are copies (from the U41 A25 report's folder), not requires.
const path = require("path");
const { execFileSync } = require("child_process");
const { sql, idle } = require("../../../probe");

const T = 30_000;
const flat = (s, n = 400) =>
  s == null ? s : String(s).replace(/\s+/g, " ").trim().slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Per app, on PKP's default test dataset: the submission and its contributor (no CRediT roles yet). */
const CASES = {
  ojs: {
    id: 7,
    contributor: "Domatilia Sokoloff",
    given: "Domatilia",
    family: "Sokoloff",
  },
  omp: { id: 1, contributor: "Arthur Clark", given: "Arthur", family: "Clark" },
  ops: { id: 1, contributor: "Carlo Corino", given: "Carlo", family: "Corino" },
};

const CREDIT = "https://credit.niso.org/contributor-roles/";
/** A CRediT role's identifier from its slug ("conceptualization", "data-curation", "software"). */
const role = (slug) => `${CREDIT}${slug}/`;

/** Open the submission in the workflow and choose `label` in its side menu (the latest version's entry). */
async function openPage(wf, page, sub, label) {
  await wf.gotoEditorial(sub);
  await idle(page);
  await wf.expandLatestVersionNode().catch(() => {});
  const links = wf.menuLink(label);
  const n = await links.count();
  let target = null;
  for (let i = n - 1; i >= 0; i--) {
    if (
      await links
        .nth(i)
        .isVisible()
        .catch(() => false)
    ) {
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

/** Press "Edit" on the row naming `name` (the family name: the steps change the given name) and wait for the form. */
async function openContributorEdit(page, wf, name) {
  const item = wf
    .dialog()
    .locator("li.listPanel__item")
    .filter({ hasText: name })
    .first();
  await item.waitFor({ timeout: T });
  await item.getByRole("button", { name: /^Edit/ }).first().click();
  const dlg = page.getByRole("dialog", { name: "Edit", exact: true });
  await dlg.waitFor({ timeout: T });
  await idle(page);
  await sleep(500);
  return dlg;
}

/** The CRediT field of an open contributor form, and its rows. */
const creditField = (dlg) => dlg.locator(".pkpFormField--creditRoles").first();
const creditRows = (dlg) => creditField(dlg).locator("tbody tr");

/** What each CRediT row's two drop-downs show, row by row. */
const rowValues = (dlg) =>
  creditRows(dlg).evaluateAll((trs) =>
    trs.map((tr) =>
      [...tr.querySelectorAll("select")].map((s) =>
        s.selectedOptions[0] ? s.selectedOptions[0].innerText.trim() : null,
      ),
    ),
  );

/** Choose the option whose text is `text` in a select (a person's pick from the list). */
async function pick(sel, text) {
  const value = await sel.evaluate((el, t) => {
    const o = [...el.options].find((x) => x.innerText.trim() === t);
    return o ? o.value : null;
  }, text);
  if (value == null) throw new Error(`no option "${text}"`);
  await sel.selectOption(value, { timeout: 5000 });
  await sleep(300);
}

/** The options of a select as shown, in order. */
const optionTexts = (sel) =>
  sel.evaluate((el) => [...el.options].map((o) => o.innerText.trim()));

/** The rows of the "Affiliations" field of an open contributor form, as shown. */
const affiliationsShown = (dlg) =>
  dlg
    .locator(".pkpFormField--affiliations tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
    )
    .catch(() => null);

/** Server log lines kept as their kind only (a database error's text is not recorded). */
const logKind = (l) =>
  /SQLSTATE|Check violation|violates/i.test(l)
    ? `${(l.match(/production\.\w+|PHP \w+/) || ["error"])[0]}: database refusal (text not recorded)`
    : flat(l, 300);

/** The stored contributor id of `given` on the submission's latest publication. */
function authorId(app, submissionId, given) {
  const q = `select a.author_id from authors a join publications p on p.publication_id = a.publication_id
        join author_settings s on s.author_id = a.author_id and s.setting_name = 'givenName' and s.locale = 'en'
        where p.submission_id = ${Number(submissionId)} and s.setting_value = '${given.replace(/'/g, "''")}'
        order by p.publication_id desc limit 1`;
  const v = sql(app, q.replace(/\s+/g, " "));
  return v ? Number(v) : null;
}

/** What the database holds for the contributor: English given name, type, CRediT roles (slug and degree). */
function stored(app, id) {
  const given = sql(
    app,
    `select setting_value from author_settings where author_id = ${id} and setting_name = 'givenName' and locale = 'en'`,
  );
  const hasType =
    sql(
      app,
      `select count(*) from information_schema.columns where table_name = 'authors' and column_name = 'contributor_type'`,
    ) !== "0";
  const type = hasType
    ? sql(app, `select contributor_type from authors where author_id = ${id}`)
    : null;
  const hasCredit =
    sql(app, `select to_regclass('credit_contributor_roles') is not null`) ===
    "t";
  const credit = hasCredit
    ? sql(
        app,
        `select replace(replace(r.credit_role_identifier, '${CREDIT}', ''), '/', '') || ' ' || coalesce(c.credit_degree::text, '-') from credit_contributor_roles c join credit_roles r on r.credit_role_id = c.credit_role_id where c.contributor_id = ${id} order by r.credit_role_id`,
      )
        .split("\n")
        .filter(Boolean)
    : null;
  return { given, type, credit };
}

/** The contributor's affiliations as stored (id and English name). */
function storedAffiliations(app, id) {
  return sql(
    app,
    `select a.author_affiliation_id || ' ' || coalesce((select setting_value from author_affiliation_settings s where s.author_affiliation_id = a.author_affiliation_id and s.setting_name = 'name' and s.locale = 'en'), coalesce(a.ror, '-')) from author_affiliations a where a.author_id = ${id} order by 1`,
  )
    .split("\n")
    .filter(Boolean);
}

/** The contributor's family name and email as stored. */
function storedPerson(app, id) {
  return {
    family: sql(
      app,
      `select setting_value from author_settings where author_id = ${id} and setting_name = 'familyName' and locale = 'en'`,
    ),
    email: sql(app, `select email from authors where author_id = ${id}`),
  };
}

/**
 * Set `api_key_secret` in the dataset fleet's config (the dataset leaves it empty, so no API key can
 * be made); the reset rewrites the config, so call it after each reset. A team install sets it in
 * config.inc.php.
 */
function setApiKeySecret(app, secret = "h29f-api-key-secret-for-testing") {
  const fs = require("fs");
  const REPO = path.resolve(__dirname, "../../../../..");
  const file = path.resolve(REPO, app.configFile);
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(
    /^api_key_secret\s*=.*$/m,
    `api_key_secret = "${secret}"`,
  );
  fs.writeFileSync(file, after);
  return (after.match(/^api_key_secret\s*=.*$/m) || [])[0];
}

/**
 * One REST API call with curl, as a developer would send it: Bearer token, JSON body. An answer that
 * is not JSON, or that is not 2xx/4xx, is kept as its kind only (status and whether it had a body):
 * a server error's body is not recorded.
 */
function curl(method, url, token, body = null) {
  const args = [
    "-s",
    "-o",
    "-",
    "-w",
    "\n%{http_code}",
    "-X",
    method,
    "-H",
    `Authorization: Bearer ${token}`,
    "-H",
    "Accept: application/json",
  ];
  if (body)
    args.push(
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      JSON.stringify(body),
    );
  args.push(url);
  const out = execFileSync("curl", args, { encoding: "utf8", timeout: 60_000 });
  const i = out.lastIndexOf("\n");
  const text = out.slice(0, i);
  const status = Number(out.slice(i + 1));
  if (status >= 500)
    return {
      status,
      json: null,
      text: text ? "(server error body, not recorded)" : "",
    };
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status, json, text: json ? null : text.slice(0, 300) };
}

module.exports = {
  T,
  flat,
  sleep,
  CASES,
  CREDIT,
  role,
  openPage,
  openContributorEdit,
  creditField,
  creditRows,
  rowValues,
  pick,
  optionTexts,
  affiliationsShown,
  logKind,
  authorId,
  stored,
  storedAffiliations,
  storedPerson,
  setApiKeySecret,
  curl,
};
