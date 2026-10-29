// Issue report docs/issues/U41-A29-contributor-unknown-credit-degree-server-error.md (U41 A29, A33): a
// contributor saved through the REST API with a CRediT degree other than LEAD, EQUAL or SUPPORTING (or none),
// or a contributor type other than PERSON, ORGANIZATION or ANONYMOUS, fails with a server error after part
// of the change is written (the type: the affiliations are deleted). The form offers no other value.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`, the
// submission and contributor of lib.js CASES (OJS 7 Domatilia Sokoloff, OMP 1 Arthur Clark, OPS 1 Carlo
// Corino), the report's Steps:
//   steps (default)
//     P     `api_key_secret` set in the fleet's config; Profile › "API Key" › "Create API Key".
//     S1-S2 screens: "Contributors", "Edit", the "Degree" options of a new CRediT row; Conceptualization
//           "Lead" and Data Curation with no degree; "Save".
//     S3    GET the contributor with the key.
//     S4    PUT the record as read (contributorRoles as ids, null fields left out), given name
//           "<given> h29f", creditRoles Conceptualization EQUAL + Software "lead".
//     S5    screens: "Edit" again.
//     S6    PUT S4's body with Software "LEAD".
//     S7    PUT S6's body with contributorType "person" and given name "<given> h29f2".
//     S8    screens: "Edit" again.
//   s8      step 8 alone (a read), on the state a `steps` walk left.
//   wayround (runs alone, from a fresh reset): the program's own way round for the type. W1 PUT the
//           record as read with contributorType "person" (the affiliations go); W2 PUT it again with
//           "PERSON" and the affiliations as read but without their `id`; W3 "Edit".
//   neighbour (runs alone; what a fix must leave alone): the form's own "Save" (two rows, one with no
//           degree, given name "<given> h29fn"), then a PUT of the record as read with type PERSON,
//           Conceptualization SUPPORTING, Data Curation null, given name "<given> h29fc".
// On a line without CRediT roles (stable-3_5_0) it records the form's fields and stops.
// A server error's answer body and the database's error text are not recorded (their kind only).
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=h29f node bin/probe.js <app|all> shared/playwright/checks/issues/contributor-unknown-credit-degree-server-error/walk.js [steps|neighbour]
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (neighbour), with fix.diff applied or not.
const {
  forEachApp,
  launch,
  signIn,
  screen,
  shot,
  record,
  idle,
  sql,
  serverLog,
} = require("../../../probe");
const K = require("./lib.js");

const mode = process.argv[2] || "steps";

forEachApp(async (app) => {
  if (!app.dataset)
    throw new Error("walk.js runs on a dataset fleet (fleet-prep --dataset)");
  const { WorkflowPage } = require("../../../pages/WorkflowPage.js");
  const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : "";
  const facts = {
    app: app.name,
    line: app.line || "main",
    mode,
    run: process.env.PROBE_RUN || null,
  };
  const fact = (k, v) => {
    facts[k] = v;
    console.log(`[fact] ${app.name} ${k}: ${K.flat(JSON.stringify(v), 1600)}`);
  };
  const log = serverLog(app);
  const from = log.mark();
  const { page, close } = await launch(app);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(K.flat(e.message, 300)));
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      pageErrors.push(`console: ${K.flat(m.text(), 300)}`),
  );
  const part = async (key, fn) => {
    try {
      await fn();
    } catch (e) {
      fact(`${key} error`, K.flat(e.message, 500));
      await shot(page, `a29-${key}-error${run}`).catch(() => {});
    }
  };
  const wf = new WorkflowPage(page, app.contextPath, {
    labels: {
      publicationGroup: app.name === "ops" ? "Preprint" : "Publication",
    },
  });
  const c = K.CASES[app.name];
  const given = c.given;
  const id = K.authorId(app, c.id, given);
  fact("contributor", { submission: c.id, name: c.contributor, authorId: id });
  const after = (key) =>
    fact(`${key} stored`, {
      ...K.stored(app, id),
      ...K.storedPerson(app, id),
      affiliations: K.storedAffiliations(app, id),
    });
  after("start");

  /** "Contributors", "Edit", two CRediT rows, optionally a new given name, "Save". */
  const formSave = async (key, newGiven) => {
    if (!(await K.openPage(wf, page, c.id, "Contributors")))
      return fact(`${key} Contributors page`, "absent");
    const dlg = await K.openContributorEdit(page, wf, c.family);
    const f = K.creditField(dlg);
    if (!(await f.count())) {
      fact(`${key} CRediT field`, "absent");
      fact(
        `${key} contributor type radio`,
        await dlg.locator('input[name="contributorType"]').count(),
      );
      fact(
        `${key} form labels`,
        K.flat(
          await dlg
            .locator(".pkpFormField label, legend")
            .allInnerTexts()
            .then((a) => a.join(" | ")),
          1200,
        ),
      );
      await shot(page, `a29-${key}-form${run}`);
      await dlg
        .getByRole("button", { name: "Close", exact: true })
        .first()
        .click()
        .catch(() => {});
      return;
    }
    await f.scrollIntoViewIfNeeded().catch(() => {});
    const add = f.getByRole("button", {
      name: "Add Another Role",
      exact: true,
    });
    await add.click();
    await K.sleep(500);
    const rows = K.creditRows(dlg);
    fact(`${key} new row`, await K.rowValues(dlg));
    fact(
      `${key} "Degree" options`,
      await K.optionTexts(rows.nth(0).locator("select").nth(1)),
    );
    await K.pick(rows.nth(0).locator("select").nth(1), "Lead");
    await add.click();
    await K.sleep(500);
    await K.pick(rows.nth(1).locator("select").nth(0), "Data Curation");
    if (newGiven)
      await dlg.locator('input[name="givenName-en"]').fill(newGiven);
    fact(`${key} rows before Save`, await K.rowValues(dlg));
    record(`a29-${key}-before-save${run}`, await screen(page));
    const answer = page
      .waitForResponse(
        (r) =>
          /\/contributors\/\d+/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: K.T },
      )
      .catch(() => null);
    await dlg.getByRole("button", { name: "Save", exact: true }).click();
    const r = await answer;
    fact(`${key} save`, { status: r ? r.status() : null });
    await dlg.waitFor({ state: "hidden", timeout: K.T }).catch(() => {});
    await idle(page);
    await K.sleep(800);
    after(key);
    record(`a29-${key}-list${run}`, await screen(page));
  };

  /** "Edit" on the contributor after a fresh load: CRediT rows, given name, affiliation rows; closed unsaved. */
  const readForm = async (key) => {
    await K.openPage(wf, page, c.id, "Contributors");
    record(`a29-${key}-list${run}`, await screen(page));
    const dlg = await K.openContributorEdit(page, wf, c.family);
    await K.creditField(dlg)
      .waitFor({ timeout: K.T })
      .catch(() => {});
    fact(`${key} "Edit"`, {
      creditRows: await K.rowValues(dlg),
      givenName: await dlg
        .locator('input[name="givenName-en"]')
        .inputValue()
        .catch(() => null),
      affiliationRows: await K.affiliationsShown(dlg),
    });
    record(`a29-${key}-edit${run}`, await screen(page));
    await shot(page, `a29-${key}-edit${run}`);
    await dlg
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await K.sleep(800);
  };

  /** P: api_key_secret in the config, then dbarnes's key from the Profile page. */
  const apiKey = async () => {
    fact("P api_key_secret", K.setApiKeySecret(app));
    let token = null;
    await part("P", async () => {
      const { ProfilePage } = require("../../../pages/ProfilePage.js");
      const prof = new ProfilePage(page, app.contextPath);
      await prof.goto("apiKey");
      if (
        !(
          await prof
            .apiKeyBox()
            .inputValue()
            .catch(() => "")
        ).includes(".")
      )
        await prof.createApiKey();
      token = await prof.apiKeyBox().inputValue();
      fact("P API key", token ? `${token.length} characters` : null);
      await shot(page, `a29-P-apikey${run}`);
    });
    return token;
  };

  const answer = (r) => ({
    status: r.status,
    body: r.json ? K.flat(JSON.stringify(r.json), 500) : r.text,
  });
  const roles = (deg2) => [
    { role: K.role("conceptualization"), degree: "EQUAL" },
    { role: K.role("software"), degree: deg2 },
  ];

  /** GET the contributor; the record as the edit takes it back (contributorRoles as ids, no nulls). */
  const readBack = (key, api, token) => {
    const got = K.curl("GET", api, token);
    const rec = got.json;
    fact(`${key} GET`, {
      status: got.status,
      contributorType: rec && rec.contributorType,
      givenName: rec && rec.givenName,
      creditRoles: rec && rec.creditRoles,
      affiliations:
        rec &&
        (rec.affiliations || []).map((a) => ({
          id: a.id,
          name: (a.name && a.name.en) || a.ror,
        })),
    });
    if (!rec) return null;
    const ids = (rec.contributorRoles || []).map((r) => r.id);
    const body = Object.fromEntries(
      Object.entries(rec).filter(([, v]) => v !== null),
    );
    body.contributorRoles = ids;
    fact(`${key} body keys sent back`, Object.keys(body));
    return body;
  };

  try {
    await signIn(page, "dbarnes");
    const pub = sql(
      app,
      `select publication_id from authors where author_id = ${id}`,
    );
    const api = app.url(
      `/index.php/${app.contextPath}/api/v1/submissions/${c.id}/publications/${pub}/contributors/${id}`,
    );
    fact("API address", api.replace(/^https?:\/\/[^/]+/, ""));
    if (mode === "steps") {
      await part("S1-S2", () => formSave("S2"));
      if (facts["S2 CRediT field"] === "absent") return;
      const token = await apiKey();
      if (!token) return;
      const original = readBack("S3", api, token);
      if (!original) return;
      const s4 = {
        ...original,
        givenName: { ...original.givenName, en: `${given} h29f` },
        creditRoles: roles("lead"),
      };
      await part("S4", async () => {
        fact("S4 PUT body (changed keys)", {
          givenName: s4.givenName,
          contributorType: s4.contributorType,
          contributorRoles: s4.contributorRoles,
          affiliations: s4.affiliations,
          creditRoles: s4.creditRoles,
        });
        fact("S4 PUT", answer(K.curl("PUT", api, token, s4)));
        after("S4");
      });
      await part("S5", () => readForm("S5"));
      const s6 = { ...s4, creditRoles: roles("LEAD") };
      await part("S6", async () => {
        fact("S6 PUT", answer(K.curl("PUT", api, token, s6)));
        after("S6");
      });
      const s7 = {
        ...s6,
        contributorType: "person",
        givenName: { ...s6.givenName, en: `${given} h29f2` },
      };
      await part("S7", async () => {
        fact("S7 PUT body (changed keys)", {
          givenName: s7.givenName,
          contributorType: s7.contributorType,
          affiliations: s7.affiliations,
        });
        fact("S7 PUT", answer(K.curl("PUT", api, token, s7)));
        after("S7");
      });
      await part("S8", () => readForm("S8"));
    } else if (mode === "s8") {
      // resume: step 8 alone (a read), on the state a `steps` walk left
      await part("S8", () => readForm("S8"));
    } else if (mode === "wayround") {
      const token = await apiKey();
      if (!token) return;
      const original = readBack("W0", api, token);
      if (!original) return;
      await part("W1", async () => {
        const body = { ...original, contributorType: "person" };
        fact("W1 PUT", answer(K.curl("PUT", api, token, body)));
        after("W1");
      });
      await part("W2", async () => {
        const affiliations = (original.affiliations || []).map((a) => {
          const { id: _drop, ...rest } = a;
          return rest;
        });
        const body = { ...original, contributorType: "PERSON", affiliations };
        fact("W2 PUT affiliations", affiliations);
        fact("W2 PUT", answer(K.curl("PUT", api, token, body)));
        after("W2");
      });
      await part("W3", () => readForm("W3"));
    } else if (mode === "neighbour") {
      await part("N1", () => formSave("N1", `${given} h29fn`));
      if (facts["N1 CRediT field"] === "absent") return;
      const token = await apiKey();
      if (!token) return;
      const original = readBack("N2", api, token);
      if (!original) return;
      await part("N2", async () => {
        const body = {
          ...original,
          contributorType: "PERSON",
          givenName: { ...original.givenName, en: `${given} h29fc` },
          creditRoles: [
            { role: K.role("conceptualization"), degree: "SUPPORTING" },
            { role: K.role("data-curation"), degree: null },
          ],
        };
        fact("N2 PUT", answer(K.curl("PUT", api, token, body)));
        after("N2");
      });
      await part("N3", () => readForm("N3"));
    }
  } finally {
    fact("page errors", pageErrors);
    fact("server log", log.since(from).slice(-12).map(K.logKind));
    record(`a29-facts${run}`, facts);
    await close();
  }
});
