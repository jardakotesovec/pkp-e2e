/**
 * @file shared/playwright/checks/sync/pkp-lib-13711/walk.js
 *
 * PR review of pkp/pkp-lib#13711 (pkp/ojs#6021 stable-3_3_0, #6022
 * stable-3_4_0, #6023 stable-3_5_0, #6024 main): IssueHandler::download()
 * with no galley segment (`issue/download/<issueId>`) leaves the galley
 * null and dies on `$galley->getFileId()` (HTTP 500, "Call to a member
 * function getFileId() on null" in the server log); after the fix, a 404.
 *
 * OJS only. The dataset has no issue galley, so the walk adds one to the
 * published issue (an issue_files row, an issue_galleys row and a small PDF
 * under `<files_dir>/journals/<id>/issues/<issueId>/public/`) to show that
 * a real download is unchanged. Then, signed out and as `admin`:
 *   none      issue/download/<published>              -> 404 at the head (500 before)
 *   zero      issue/download/<published>/0            -> 404 at the head (500 before)
 *   unknown   issue/download/<published>/<no galley>  -> 302 to issue/view (unchanged)
 *   galley    issue/download/<published>/<galleyId>   -> 200, the PDF (unchanged)
 *   view      issue/view/<published>                  -> 200 (unchanged)
 *   unpub     issue/download/<unpublished> (admin only; signed out the
 *             policy refuses it before the handler)    -> 404 at the head (500 before)
 * and the server log lines each request wrote.
 *
 *   PKP_E2E_LINE=<line> npm run fleet-prep -- --feature sync-13711 --dataset --reset --apps ojs
 *   PKP_E2E_LINE=<line> PROBE_FEATURE=sync-13711 PROBE_AGENT=w13711 \
 *     node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13711/walk.js
 */
const fs = require("fs");
const path = require("path");
const {
  forEachApp,
  launch,
  signIn,
  record,
  sql,
  serverLog,
} = require("../../../probe");

// A one-page PDF, small enough to keep inline.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

forEachApp(async (app) => {
  if (app.name !== "ojs") return;
  const journal = sql(
    app,
    "SELECT journal_id FROM journals WHERE path = 'publicknowledge'",
  );
  const published = sql(
    app,
    `SELECT issue_id FROM issues WHERE journal_id = ${journal} AND published = 1 ORDER BY issue_id LIMIT 1`,
  );
  const unpublished = sql(
    app,
    `SELECT issue_id FROM issues WHERE journal_id = ${journal} AND published = 0 ORDER BY issue_id LIMIT 1`,
  );

  // The issue galley the dataset lacks.
  const fileName = `${published}-1-PB.pdf`;
  const fileId = sql(
    app,
    `INSERT INTO issue_files (issue_id, file_name, file_type, file_size, content_type, original_file_name, date_uploaded, date_modified) VALUES (${published}, '${fileName}', 'application/pdf', ${PDF.length}, 1, 'issue.pdf', NOW(), NOW()) RETURNING file_id`,
  ).split("\n")[0];
  const galleyId = sql(
    app,
    `INSERT INTO issue_galleys (locale, issue_id, file_id, label, seq) VALUES ('en', ${published}, ${fileId}, 'PDF', 0) RETURNING galley_id`,
  ).split("\n")[0];
  const config = fs.readFileSync(
    path.isAbsolute(app.configFile)
      ? app.configFile
      : path.join(app.root, app.configFile),
    "utf8",
  );
  const filesDir = config.match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m)[1];
  const dir = path.join(
    path.isAbsolute(filesDir) ? filesDir : path.join(app.root, filesDir),
    "journals",
    journal,
    "issues",
    published,
    "public",
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), PDF);
  const unknown = Number(galleyId) + 1000;

  const { page, close } = await launch(app);
  const log = serverLog(app);
  const results = [];
  const run = async (who, cases) => {
    for (const [name, url, want] of cases) {
      const from = log.mark();
      // main and 3.5 first redirect to the URL with the locale segment.
      let res = await page.request.get(
        app.url(`/index.php/publicknowledge/issue/${url}`),
        { maxRedirects: 0 },
      );
      const loc = res.headers().location || "";
      if (
        res.status() === 302 &&
        loc.endsWith(`/publicknowledge/en/issue/${url}`)
      ) {
        res = await page.request.get(loc, { maxRedirects: 0 });
      }
      const body = await res.body();
      await new Promise((r) => setTimeout(r, 300));
      const lines = log.since(from).map((l) => l.slice(0, 220));
      const r = {
        who,
        case: name,
        url,
        status: res.status(),
        want,
        ok: res.status() === want,
        type: res.headers()["content-type"] || "",
        location: res.headers().location || "",
        bytes: body.length,
        head: body.toString("utf8", 0, 160).replace(/\s+/g, " "),
        log: lines,
      };
      results.push(r);
      console.log(
        `[13711] ${app.line} ${who} ${name} ${url}: ${r.status} (want ${want}) ${r.ok ? "OK" : "MISMATCH"}` +
          `${r.location ? " -> " + r.location : ""} ${r.type} ${r.bytes}b${lines.length ? " | log: " + lines.join(" / ") : ""}`,
      );
    }
  };
  const common = [
    ["none", `download/${published}`, 404],
    ["zero", `download/${published}/0`, 404],
    ["unknown", `download/${published}/${unknown}`, 302],
    ["galley", `download/${published}/${galleyId}`, 200],
    ["view", `view/${published}`, 200],
  ];
  try {
    await run("anon", common);
    await signIn(page, "admin");
    await run("admin", [...common, ["unpub", `download/${unpublished}`, 404]]);
    record("cases", {
      line: app.line,
      journal,
      published,
      unpublished,
      fileId,
      galleyId,
      unknown,
      results,
    });
  } finally {
    await close();
  }
});
