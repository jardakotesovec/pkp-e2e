// U50 "Issues", claim check I08 (housekeeping 2026-10-08): the table of contents' "Order" after
// pkp/pkp-lib#13453 (merged 2026-10-07 as 3a5a039743). Bears on Rules 10a and 10b, register entries
// A9 and A20, footnotes f-a9, f-a20 and td7. OJS alone has issues.
//
// The script seeds its own scratch journal (three sections: "Articles" with three articles per issue,
// "Reviews" with two, "Essays" with one; six published issues and one future issue), signs in as the
// journal's own manager (one round as its editor) and records every screen with screen().
//
// Phases (PHASES=a,b narrows; the seed runs once per state file, .reports/U50/<agent>/state-<run>-ojs.json):
//   seed     the journal, its users, issues and articles
//   base     Settings › Journal › "Sections", every issue's "Table of Contents" tab and page as seeded; the
//            tab's "Order" mode swept (controls, row classes)
//   gap      i7, while the journal's sections are stored as the seed leaves them (places 0, 2, 3, where the
//            screen's own "Create Section" gives 0, 1, 2): "Order" and "Done" with nothing dragged
//   norm     Settings › Journal › "Sections" reordered on screen and put back, so the stored places are the
//            screen's own (0, 1, 2) for every phase after it
//   secup    i1: a section heading dragged above another section, "Done"; then a heading dragged below
//            the last section, "Done"; then "Order" and "Done" with nothing dragged (Rule 10a, A9)
//   headown  i2: a section heading dragged onto its own articles (first section, middle, last), "Done" (A20)
//   artout   i3: an article of a section of three dragged down into the next section; one of a section of
//            two dragged up into the section above; the one article of a section dragged up; an article to
//            the top of its own section; an article above its own heading (Rule 10b)
//   future   i5 (a future issue): a section dragged, "Done", the issue's "Preview"
//   leave    i4: a section dragged and then "Cancel ordering"; another tab pressed; the window closed;
//            another address opened (what is asked, what is lost)
//   editor   i4 as the journal's Editor: a section dragged between two others, "Done"
//   journal  Settings › Journal › "Sections" reordered afterwards (to "Reviews", "Essays", "Articles"): which
//            issues follow it (i6 was never ordered), which keep their own order, which show a third one
//   setsec   an article's "Section" changed on its Publication Settings (the last sentence of Rule 10b): a
//            scheduled article of the future issue, then a published one of a published issue
//
// Run (twice, each under its own PROBE_RUN):
//   PROBE_RUN=r1 PROBE_FEATURE=U50 PROBE_AGENT=ccI08 node bin/probe.js ojs shared/playwright/checks/U50/I08/i08.js
const fs = require("fs");
const path = require("path");
const {
  forEachApp,
  launch,
  signIn,
  signOut,
  screen,
  shot,
  record,
  loc,
  note,
  idle,
  tag,
  sql,
  outFile,
} = require("../../../probe");

const ALL = [
  "seed",
  "base",
  "gap",
  "norm",
  "secup",
  "headown",
  "artout",
  "future",
  "leave",
  "editor",
  "journal",
  "setsec",
];
const PHASES = (process.env.PHASES || ALL.join(",")).split(",");
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) =>
  s == null ? s : String(s).replace(/\s+/g, " ").trim().slice(0, n);
const log = (...a) => console.log("[i08]", ...a);

const SECTIONS = [
  { abbrev: "ART", title: "Articles", n: 3, key: "a" },
  { abbrev: "REV", title: "Reviews", n: 2, key: "r" },
  { abbrev: "ESS", title: "Essays", n: 1, key: "e" },
];
const ISSUES = {
  i1: {
    volume: 1,
    number: 1,
    year: 2026,
    datePublished: "2026-01-10",
    published: true,
  },
  i2: {
    volume: 1,
    number: 2,
    year: 2026,
    datePublished: "2026-02-10",
    published: true,
  },
  i3: {
    volume: 1,
    number: 3,
    year: 2026,
    datePublished: "2026-03-10",
    published: true,
  },
  i4: {
    volume: 1,
    number: 4,
    year: 2026,
    datePublished: "2026-04-10",
    published: true,
  },
  i6: {
    volume: 1,
    number: 6,
    year: 2026,
    datePublished: "2026-06-10",
    published: true,
  },
  i7: {
    volume: 1,
    number: 7,
    year: 2026,
    datePublished: "2026-07-10",
    published: true,
  },
  i5: { volume: 2, number: 1, year: 2027 },
};
const issueName = (k) =>
  `Vol. ${ISSUES[k].volume} No. ${ISSUES[k].number} (${ISSUES[k].year})`;
const issueTab = (k) => (ISSUES[k].published ? "Back Issues" : "Future Issues");

forEachApp(async (app) => {
  if (app.name !== "ojs") return; // issues are a journal's
  const { IssuesAdmin, IssueReader } = require("../../../pages/IssuesPages.js");
  const { SectionsTab } = require("../../../pages/SectionsPages.js");
  const { PublicationScreen } = require(
    path.join(app.suiteDir, "pages", "PublicationMetadataPages.js"),
  );

  const stateFile = outFile("state.json");
  const S = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : {};
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(S, null, 2));
  const fact = (k, v) => {
    record("facts", { [k]: v }, { merge: true });
    log(`[${k}]`, JSON.stringify(v).slice(0, 2500));
  };
  const rows = (q) => {
    try {
      return sql(app, q).split("\n").filter(Boolean);
    } catch (e) {
      return [`sql error: ${flat(e.message, 200)}`];
    }
  };

  const { page, close } = await launch(app);
  const dialogs = [];
  let answer = "accept";
  page.on("dialog", async (d) => {
    dialogs.push({
      type: d.type(),
      message: d.message(),
      url: page.url().replace(/^https?:\/\/[^/]+/, ""),
    });
    if (d.type() === "beforeunload" || answer === "accept")
      await d.accept().catch(() => {});
    else await d.dismiss().catch(() => {});
  });
  const posts = [];
  page.on("request", (req) => {
    if (/save-sequence/.test(req.url()) && req.method() === "POST") {
      const body = req.postData() || "";
      const data = new URLSearchParams(body).get("data");
      let parsed = body;
      try {
        parsed = data ? JSON.parse(data) : body;
      } catch (e) {
        /* kept raw */
      }
      posts.push(parsed);
    }
  });

  async function snap(name, extra = {}) {
    let s;
    try {
      s = await screen(page);
    } catch (e) {
      s = { url: page.url(), screenError: flat(e.message, 300) };
    }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
  }
  async function sect(name, fn) {
    log(`--- ${name}`);
    try {
      await fn();
    } catch (e) {
      fact(`${name}-error`, flat(e.stack || e.message, 1500));
      await snap(`err-${name}`).catch(() => {});
      await page.mouse.up().catch(() => {});
    }
  }
  let who = null;
  async function as(user) {
    if (who === user) return;
    await signIn(page, user, { contextPath: S.J.path });
    await idle(page);
    who = user;
  }

  try {
    // ================================================================ seed
    if (on("seed") && !S.seeded) {
      await sect("seed", async () => {
        const t = tag("u50i08");
        S.t = t;
        const J = await app.api.createContext({
          tag: t,
          context: { name: `U50 I08 ${t}` },
          sections: SECTIONS.map(({ abbrev, title }) => ({ abbrev, title })),
          users: [
            { username: `${t}mg`, roles: ["manager"] },
            { username: `${t}ed`, roles: ["editor"] },
            { username: `${t}au`, roles: ["author"] },
          ],
          issues: Object.values(ISSUES),
        });
        S.J = {
          path: J.path,
          id: J.contextId,
          mg: `${t}mg`,
          ed: `${t}ed`,
          au: `${t}au`,
          issues: J.issues,
        };
        save();
        S.subs = {};
        for (const k of Object.keys(ISSUES)) {
          const { volume, number, year } = ISSUES[k];
          for (const s of SECTIONS) {
            const n = k === "i6" || k === "i7" ? 1 : s.n;
            for (let i = 1; i <= n; i++) {
              const short = `${k} ${s.key}${i}`;
              const r = await app.api.createSubmission({
                context: S.J.path,
                submitter: S.J.au,
                tag: `${t}${k}${s.key}${i}`,
                title: `${short} ${t}`,
                section: s.abbrev,
                issue: { volume, number, year },
                published: true,
              });
              S.subs[short] = {
                id: r.submissionId,
                publicationId: r.publicationId,
              };
            }
          }
        }
        S.seeded = true;
        save();
      });
    }
    if (!S.seeded) {
      fact("no-state", "the seed did not finish; nothing driven");
      return;
    }
    const t = S.t;
    const J = S.J;
    const issueId = (k) => {
      const { volume, number, year } = ISSUES[k];
      const hit = (J.issues || []).find(
        (i) =>
          String(i.volume) === String(volume) &&
          String(i.number) === String(number) &&
          String(i.year) === String(year),
      );
      if (hit) return hit.id;
      return rows(
        `select issue_id from issues where journal_id=${J.id} and volume='${volume}' and number='${number}' and year=${year}`,
      )[0];
    };
    const short = (s) => String(s).replace(` ${t}`, "");
    const subById = Object.fromEntries(
      Object.entries(S.subs).map(([k, v]) => [String(v.id), k]),
    );

    // ---------------------------------------------------------------- database reads (beside the screens)
    const dbSections = () =>
      rows(
        `select s.section_id, s.seq, coalesce((select ss.setting_value from section_settings ss where ss.section_id=s.section_id and ss.setting_name='title' and ss.locale='en'),'?') from sections s where s.journal_id=${J.id} order by s.seq, s.section_id`,
      ).map((l) => {
        const [id, seq, title] = l.split("|");
        return { id, seq, title };
      });
    const secTitle = () =>
      Object.fromEntries(dbSections().map((s) => [s.id, s.title]));
    const dbCustom = (k) => {
      const names = secTitle();
      return rows(
        `select section_id, seq from custom_section_orders where issue_id=${issueId(k)} order by seq, section_id`,
      ).map((l) => {
        const [id, seq] = l.split("|");
        return `${names[id] || id}: ${seq}`;
      });
    };
    const dbPubs = (k) => {
      const names = secTitle();
      return rows(
        `select p.section_id, coalesce(p.seq::text,'NULL'), p.submission_id, p.status from publications p join submissions s on s.current_publication_id=p.publication_id where p.issue_id=${issueId(k)} order by p.section_id, p.seq, p.submission_id`,
      ).map((l) => {
        const [sec, seq, sub, status] = l.split("|");
        return `${names[sec] || sec}: ${subById[sub] || sub} seq ${seq} status ${status}`;
      });
    };
    const readable = (posted) =>
      posted.map((p) => {
        if (!Array.isArray(p)) return p;
        const names = secTitle();
        return p.map((c) =>
          c && typeof c === "object" && "categoryId" in c
            ? {
                section: names[String(c.categoryId)] || c.categoryId,
                rowsId: (c.rowsId || []).map((id, i) =>
                  i === 0 && names[String(id)]
                    ? `(${names[String(id)]})`
                    : subById[String(id)] || id,
                ),
              }
            : c,
        );
      });

    // ---------------------------------------------------------------- screen reads
    const admin = new IssuesAdmin(page, J.path);
    const reader = new IssueReader(page, J.path);

    /** Issues › the issue's tab › "Edit" › "Table of Contents" (a fresh page load). */
    async function openToc(k) {
      await admin.goto(issueTab(k));
      const win = await admin.openManagement(issueTab(k), issueName(k));
      await win.openTab("Table of Contents");
      await idle(page);
      await sleep(400);
      return win;
    }
    /** The tab's list as the DOM holds it: each block (tbody) with its shown rows in order. */
    async function tocDom(win) {
      return win.tocGrid().evaluate((root) =>
        [...root.querySelectorAll("tbody")]
          .filter((tb) => tb.getClientRects().length)
          .map((tb) => ({
            id: tb.id.replace(/^.*-category-/, "category-"),
            cls: tb.className,
            rows: [...tb.querySelectorAll("tr")]
              .filter(
                (tr) =>
                  tr.getClientRects().length &&
                  (tr.classList.contains("gridRow") ||
                    tr.classList.contains("ui-sortable-placeholder")),
              )
              .map((tr) => ({
                text: (
                  (tr.querySelector("td .gridCellContainer") || tr)
                    .textContent || ""
                )
                  .replace(/\s+/g, " ")
                  .trim(),
                heading: !tr.classList.contains("has_extras"),
                cls: tr.className,
              })),
          })),
      );
    }
    const blocks = (dom) =>
      dom
        .filter((b) => b.rows.length)
        .map((b) =>
          b.rows
            .map((r) => (r.heading ? `# ${short(r.text)}` : short(r.text)))
            .join(" | "),
        );
    const outline = (dom) =>
      dom.flatMap((b) =>
        b.rows.map((r) => (r.heading ? `# ${short(r.text)}` : short(r.text))),
      );
    const sectionRows = (dom, title) => {
      const b = dom.find((x) =>
        x.rows.some((r) => r.heading && r.text.includes(title)),
      );
      return b ? b.rows.filter((r) => !r.heading).map((r) => r.text) : [];
    };
    const headingRow = (win, title) =>
      win
        .tocGrid()
        .locator("tr.gridRow:not(.has_extras)")
        .filter({ hasText: title })
        .first();
    const articleRow = (win, title) =>
      win
        .tocGrid()
        .locator("tr.gridRow.has_extras")
        .filter({ hasText: title })
        .first();

    /** The issue's page as a reader's browser shows it (a future issue: its "Preview"). */
    async function issuePage(k, name) {
      const r = await page.goto(
        app.url(`/index.php/${J.path}/issue/view/${issueId(k)}`),
      );
      await idle(page);
      const out = {
        status: r ? r.status() : null,
        outline: (
          await reader
            .tocOutline()
            .catch((e) => [`error ${flat(e.message, 120)}`])
        ).map(short),
      };
      if (name) await snap(name, { outline: out.outline });
      return out;
    }
    /** Settings › Journal › "Sections": the rows' titles in screen order. */
    async function journalSections(name) {
      const tab = new SectionsTab(page, J.path);
      await tab.goto();
      await idle(page);
      const titles = (await tab.titleCells().allInnerTexts()).map((x) =>
        flat(x, 80),
      );
      if (name) await snap(name, { titles });
      return { tab, titles };
    }

    const sortState = () =>
      page.evaluate(() => {
        const d = (e) =>
          e
            ? {
                tag: e.tagName.toLowerCase(),
                id: e.id.replace(/^.*-(category|row)-/, "$1-"),
                cls: e.className,
                parent: e.parentElement
                  ? `${e.parentElement.tagName.toLowerCase()}.${e.parentElement.className.split(/\s+/).slice(0, 2).join(".")}`
                  : null,
              }
            : null;
        return {
          helper: d(document.querySelector(".ui-sortable-helper")),
          placeholder: d(document.querySelector(".ui-sortable-placeholder")),
        };
      });

    /**
     * A mouse drag of a row: pressed on the row (40px in), moved in steps so jQuery UI's sortable
     * follows, released `where` the target row is: 'above' (its top edge and 8px over), 'below' (its
     * bottom edge and 8px under) or 'onto' (its middle). Returns what the page held while the
     * button was down (the dragged element and the placeholder).
     */
    async function drag(win, moving, target, where, name) {
      await moving.scrollIntoViewIfNeeded();
      const from = await moving.boundingBox();
      const to = await target.boundingBox();
      if (!from || !to) throw new Error(`drag ${name}: a row has no box`);
      const x = from.x + 40;
      const y0 = from.y + from.height / 2;
      const dir =
        where === "above"
          ? -1
          : where === "below"
            ? 1
            : Math.sign(to.y - from.y) || 1;
      const out = {
        where,
        fromY: Math.round(y0),
        inView: to.y >= 0 && to.y + to.height <= 900,
      };
      await page.mouse.move(x, y0);
      await page.mouse.down();
      await page.mouse.move(x, y0 + dir * 6, { steps: 4 });
      out.pressed = await sortState();
      if (where === "onto") {
        await page.mouse.move(x, to.y + to.height / 2 - dir * 2, { steps: 25 });
        await page.mouse.move(x, to.y + to.height / 2, { steps: 4 });
        out.toY = Math.round(to.y + to.height / 2);
      } else {
        const edge = where === "above" ? to.y + 4 : to.y + to.height - 4;
        await page.mouse.move(x, edge, { steps: 25 });
        await page.mouse.move(x, edge + dir * 12, { steps: 6 });
        out.toY = Math.round(edge + dir * 12);
      }
      await sleep(250);
      out.held = await sortState();
      out.heldList = blocks(await tocDom(win));
      if (name) await shot(page, `${name}-held`).catch(() => {});
      await page.mouse.up();
      await sleep(600);
      return out;
    }

    /** "Done": the save it sends (or none within 15 s) and the answer. */
    async function pressDone(win) {
      const ord = win.tocOrdering();
      const n = posts.length;
      const waiting = page
        .waitForResponse(
          (r) =>
            /save-sequence/.test(r.url()) && r.request().method() === "POST",
          { timeout: 15_000 },
        )
        .catch(() => null);
      await ord.doneLink().click();
      const r = await waiting;
      await ord
        .doneLink()
        .waitFor({ state: "hidden", timeout: 15_000 })
        .catch(() => {});
      await idle(page);
      await sleep(700);
      return {
        status: r ? r.status() : null,
        answer: r ? flat(await r.text().catch(() => null), 200) : null,
        posted: readable(posts.slice(n)),
        doneStillShown: await ord
          .doneLink()
          .isVisible()
          .catch(() => null),
      };
    }

    /**
     * One round on an issue's tab: the list before, "Order", the drags (each read after its drop),
     * "Done" (read on the same page), the page loaded afresh and the tab reopened, the issue's page,
     * and the stored order.
     *
     * @param {string} name the round's name (snapshots are `<name>-1-before` … `<name>-6-page`)
     * @param {string} k the issue's key
     * @param {(dom, win) => Array<{what: string, moving, target, where: string}>} plan
     */
    async function round(name, k, plan) {
      const out = { issue: issueName(k) };
      const d0 = dialogs.length;
      const win = await openToc(k);
      const before = await tocDom(win);
      out.before = blocks(before);
      await snap(`${name}-1-before`, { blocks: out.before });
      await win.tocOrdering().start();
      await sleep(400);
      await snap(`${name}-2-ordering`);
      out.drags = [];
      const steps = plan(before, win);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const info = await drag(
          win,
          s.moving(),
          s.target(),
          s.where,
          `${name}-3-drag${i + 1}`,
        );
        const dom = await tocDom(win);
        const entry = { what: s.what, ...info, dropped: blocks(dom) };
        out.drags.push(entry);
        await snap(`${name}-3-drag${i + 1}-dropped`, {
          blocks: entry.dropped,
          drag: s.what,
        });
      }
      out.done = await pressDone(win);
      out.afterDone = blocks(await tocDom(win));
      const s4 = await snap(`${name}-4-done`, { blocks: out.afterDone });
      out.noticesAtDone = s4.notices;
      out.reopened = blocks(await tocDom(await openToc(k)));
      await snap(`${name}-5-reopened`, { blocks: out.reopened });
      out.page = (await issuePage(k, `${name}-6-page`)).outline;
      out.storedSections = dbCustom(k);
      out.storedArticles = dbPubs(k);
      out.dialogs = dialogs.slice(d0);
      fact(name, out);
      return out;
    }

    /** The workflow's Publication Settings of a submission: the "Section" it shows. */
    async function sectionShown(key, name) {
      const pub = new PublicationScreen(page, J.path);
      const out = {};
      try {
        await pub.gotoWorkflow(S.subs[key].id);
        await idle(page);
        await pub.openEntry("Publication Settings");
        await idle(page);
        const select = page.locator('select[name="sectionId"]').last();
        await select.waitFor({ state: "attached", timeout: 20_000 });
        await sleep(800);
        out.section = flat(
          await select
            .locator("option:checked")
            .innerText({ timeout: 5000 })
            .catch(() => null),
        );
        out.disabled = await select.isDisabled().catch(() => null);
        out.status = flat(
          await pub
            .leftControls()
            .innerText()
            .catch(() => null),
          120,
        );
      } catch (e) {
        out.error = flat(e.message, 300);
      }
      await snap(name, out);
      return out;
    }

    // ================================================================ base
    if (on("base")) {
      await sect("base", async () => {
        await as(J.mg);
        const out = { sectionsStored: dbSections() };
        out.journalSections = (await journalSections("base-sections")).titles;
        out.issues = {};
        for (const k of Object.keys(ISSUES)) {
          const win = await openToc(k);
          const dom = await tocDom(win);
          await snap(`base-toc-${k}`, { blocks: blocks(dom) });
          out.issues[k] = {
            name: issueName(k),
            id: issueId(k),
            toc: blocks(dom),
            storedSections: dbCustom(k),
          };
          if (k === "i1") {
            // The sweep of the tab: what it offers out of and in "Order" mode.
            const sweep = {};
            const grid = win.tocGrid();
            sweep.headerLinks = (
              await grid
                .locator(".header a:visible, .actions a:visible")
                .allInnerTexts()
                .catch(() => [])
            ).map((x) => flat(x, 60));
            sweep.columns = (
              await win
                .tocColumns()
                .allInnerTexts()
                .catch(() => [])
            ).map((x) => flat(x, 60));
            sweep.rowClasses = dom.map((b) => ({
              block: b.cls,
              rows: b.rows.map((r) => `${r.heading ? "#" : "-"} ${r.cls}`),
            }));
            sweep.rowArrows = await grid
              .locator("a.show_extras:visible")
              .count();
            await loc(
              page,
              'Table of Contents: "Order"',
              win.tocOrdering().orderLink(),
            );
            await loc(
              page,
              'Table of Contents: a section heading row ("Reviews")',
              headingRow(win, "Reviews"),
            );
            await loc(
              page,
              "Table of Contents: an article row",
              articleRow(win, `i1 a1 ${t}`),
            );
            await win.tocOrdering().start();
            await sleep(500);
            const od = await tocDom(win);
            sweep.ordering = {
              controls: (
                await grid
                  .locator(
                    ".order_finish_controls a:visible, .order_finish_controls button:visible",
                  )
                  .allInnerTexts()
                  .catch(() => [])
              ).map((x) => flat(x, 40)),
              headerLinks: (
                await grid
                  .locator(".header a:visible, .actions a:visible")
                  .allInnerTexts()
                  .catch(() => [])
              ).map((x) => flat(x, 60)),
              rowClasses: od.map((b) => ({
                block: b.cls,
                rows: b.rows.map((r) => `${r.heading ? "#" : "-"} ${r.cls}`),
              })),
              rowArrows: await grid.locator("a.show_extras:visible").count(),
              moveHandles: await grid
                .locator(".pkp_linkaction_moveItem:visible")
                .count(),
              headingCursor: await headingRow(win, "Reviews")
                .locator("td")
                .first()
                .evaluate((td) => getComputedStyle(td).cursor)
                .catch(() => null),
              articleCursor: await articleRow(win, `i1 a1 ${t}`)
                .locator("td")
                .first()
                .evaluate((td) => getComputedStyle(td).cursor)
                .catch(() => null),
            };
            await loc(
              page,
              'Table of Contents, ordering: "Done"',
              win.tocOrdering().doneLink(),
            );
            await loc(
              page,
              'Table of Contents, ordering: "Cancel ordering"',
              win.tocOrdering().cancelLink(),
            );
            await snap("base-toc-i1-ordering", { sweep });
            await win.tocOrdering().cancel();
            out.sweep = sweep;
          }
          out.issues[k].page = (await issuePage(k, `base-page-${k}`)).outline;
        }
        fact("base", out);
      });
    }

    // ================================================================ gap (the seed's section places)
    if (on("gap")) {
      await sect("gap", async () => {
        await as(J.mg);
        fact("gap-sections-stored", dbSections());
        await round("gap-a", "i7", () => []);
      });
    }

    // ================================================================ norm (the screen's own section places)
    if (on("norm")) {
      await sect("norm", async () => {
        await as(J.mg);
        const out = { storedBefore: dbSections() };
        const { tab, titles } = await journalSections("norm-1-before");
        out.before = titles;
        const read = async () =>
          (await tab.titleCells().allInnerTexts()).map((x) => flat(x, 80));
        await tab.startOrdering();
        await sleep(400);
        await tab.drag("Essays", "Articles");
        await sleep(600);
        out.dropped1 = await read();
        out.done1 = (await tab.done()).status();
        await sleep(600);
        out.stored1 = dbSections();
        await tab.startOrdering();
        await sleep(400);
        await tab.drag("Articles", "Essays");
        await sleep(600);
        await tab.drag("Reviews", "Essays");
        await sleep(600);
        out.dropped2 = await read();
        out.done2 = (await tab.done()).status();
        await sleep(600);
        out.after = (await journalSections("norm-2-after")).titles;
        out.storedAfter = dbSections();
        fact("norm", out);
      });
    }

    // ================================================================ secup (Rule 10a, A9)
    if (on("secup")) {
      await sect("secup", async () => {
        await as(J.mg);
        // A: "Reviews" (second) dragged above "Articles" (first)
        await round("secup-a", "i1", (dom, win) => [
          {
            what: 'the "Reviews" heading dragged above the "Articles" heading',
            moving: () => headingRow(win, "Reviews"),
            target: () => headingRow(win, "Articles"),
            where: "above",
          },
        ]);
        // controls: the journal's own section order and another issue
        const ctl = {
          journalSections: (await journalSections("secup-a-ctl-sections"))
            .titles,
          sectionsStored: dbSections(),
        };
        const w4 = await openToc("i4");
        ctl.i4toc = blocks(await tocDom(w4));
        await snap("secup-a-ctl-toc-i4", { blocks: ctl.i4toc });
        ctl.i4page = (await issuePage("i4", "secup-a-ctl-page-i4")).outline;
        ctl.i4stored = dbCustom("i4");
        fact("secup-a-controls", ctl);
        // B: the section now first dragged below the last article of the last section
        await round("secup-b", "i1", (dom, win) => {
          const first = dom[0].rows.find((r) => r.heading).text;
          const lastBlock = dom[dom.length - 1];
          const lastRow = lastBlock.rows[lastBlock.rows.length - 1].text;
          return [
            {
              what: `the first heading ("${short(first)}") dragged below the last row of the list ("${short(lastRow)}")`,
              moving: () => headingRow(win, first),
              target: () => articleRow(win, lastRow),
              where: "below",
            },
          ];
        });
        // C: "Order", then "Done" with nothing dragged
        await round("secup-c", "i1", () => []);
      });
    }

    // ================================================================ headown (A20)
    if (on("headown")) {
      await sect("headown", async () => {
        await as(J.mg);
        await round("headown-a", "i2", (dom, win) => {
          const arts = sectionRows(dom, "Articles");
          return [
            {
              what: `the "Articles" heading dragged onto its own first article ("${short(arts[0])}")`,
              moving: () => headingRow(win, "Articles"),
              target: () => articleRow(win, arts[0]),
              where: "onto",
            },
            {
              what: `the "Articles" heading dragged onto its own last article ("${short(arts[arts.length - 1])}")`,
              moving: () => headingRow(win, "Articles"),
              target: () => articleRow(win, arts[arts.length - 1]),
              where: "onto",
            },
          ];
        });
        await round("headown-b", "i2", (dom, win) => {
          const revs = sectionRows(dom, "Reviews");
          return [
            {
              what: `the "Reviews" heading (middle section) dragged onto its own last article ("${short(revs[revs.length - 1])}")`,
              moving: () => headingRow(win, "Reviews"),
              target: () => articleRow(win, revs[revs.length - 1]),
              where: "onto",
            },
          ];
        });
        await round("headown-c", "i2", (dom, win) => {
          const ess = sectionRows(dom, "Essays");
          return [
            {
              what: `the "Essays" heading (last section, one article) dragged below its own article ("${short(ess[0])}")`,
              moving: () => headingRow(win, "Essays"),
              target: () => articleRow(win, ess[0]),
              where: "below",
            },
          ];
        });
      });
    }

    // ================================================================ artout (Rule 10b)
    if (on("artout")) {
      await sect("artout", async () => {
        await as(J.mg);
        const sec = {};
        // A: the last article of "Articles" (three) dragged down below the "Reviews" heading
        let moved;
        await round("artout-a", "i3", (dom, win) => {
          const arts = sectionRows(dom, "Articles");
          moved = arts[arts.length - 1];
          return [
            {
              what: `"${short(moved)}" (last of "Articles", three articles) dragged below the "Reviews" heading`,
              moving: () => articleRow(win, moved),
              target: () => headingRow(win, "Reviews"),
              where: "below",
            },
          ];
        });
        sec.a = {
          article: short(moved),
          ...(await sectionShown(short(moved), "artout-a-7-section")),
        };
        // B: the first article of "Reviews" (two) dragged up above the last article of "Articles"
        await round("artout-b", "i3", (dom, win) => {
          const arts = sectionRows(dom, "Articles");
          const revs = sectionRows(dom, "Reviews");
          moved = revs[0];
          return [
            {
              what: `"${short(moved)}" (first of "Reviews", two articles) dragged above "${short(arts[arts.length - 1])}" (last of "Articles")`,
              moving: () => articleRow(win, moved),
              target: () => articleRow(win, arts[arts.length - 1]),
              where: "above",
            },
          ];
        });
        sec.b = {
          article: short(moved),
          ...(await sectionShown(short(moved), "artout-b-7-section")),
        };
        // C: the one article of "Essays" dragged up above the last article of "Reviews"
        await round("artout-c", "i3", (dom, win) => {
          const revs = sectionRows(dom, "Reviews");
          moved = sectionRows(dom, "Essays")[0];
          return [
            {
              what: `"${short(moved)}" (the one article of "Essays") dragged above "${short(revs[revs.length - 1])}" (last of "Reviews")`,
              moving: () => articleRow(win, moved),
              target: () => articleRow(win, revs[revs.length - 1]),
              where: "above",
            },
          ];
        });
        sec.c = {
          article: short(moved),
          ...(await sectionShown(short(moved), "artout-c-7-section")),
        };
        fact("artout-sections-shown", sec);
        // D: the last article of "Articles" dragged to the top of its own section
        await round("artout-d", "i3", (dom, win) => {
          const arts = sectionRows(dom, "Articles");
          return [
            {
              what: `"${short(arts[arts.length - 1])}" (last of "Articles") dragged above "${short(arts[0])}" (first of "Articles")`,
              moving: () => articleRow(win, arts[arts.length - 1]),
              target: () => articleRow(win, arts[0]),
              where: "above",
            },
          ];
        });
        // E: the last article of "Reviews" dragged above its own heading
        await round("artout-e", "i3", (dom, win) => {
          const revs = sectionRows(dom, "Reviews");
          return [
            {
              what: `"${short(revs[revs.length - 1])}" (last of "Reviews") dragged above the "Reviews" heading`,
              moving: () => articleRow(win, revs[revs.length - 1]),
              target: () => headingRow(win, "Reviews"),
              where: "above",
            },
          ];
        });
        // F: the second article of the first section dragged above its heading, the top of the list
        await round("artout-f", "i3", (dom, win) => {
          const arts = sectionRows(dom, "Articles");
          return [
            {
              what: `"${short(arts[1])}" (second of "Articles") dragged above the "Articles" heading, the top of the list`,
              moving: () => articleRow(win, arts[1]),
              target: () => headingRow(win, "Articles"),
              where: "above",
            },
          ];
        });
      });
    }

    // ================================================================ future (a future issue)
    if (on("future")) {
      await sect("future", async () => {
        await as(J.mg);
        await round("future-a", "i5", (dom, win) => [
          {
            what: 'the "Essays" heading (last) dragged above the "Articles" heading (first), a future issue',
            moving: () => headingRow(win, "Essays"),
            target: () => headingRow(win, "Articles"),
            where: "above",
          },
        ]);
      });
    }

    // ================================================================ leave (i4): a drag not saved
    if (on("leave")) {
      await sect("leave", async () => {
        await as(J.mg);
        const out = {};
        const dragReviewsUp = async (win, name) =>
          drag(
            win,
            headingRow(win, "Reviews"),
            headingRow(win, "Articles"),
            "above",
            name,
          );
        // a) "Cancel ordering"
        let win = await openToc("i4");
        out.before = blocks(await tocDom(win));
        await win.tocOrdering().start();
        await dragReviewsUp(win, "leave-a-drag");
        out.aDropped = blocks(await tocDom(win));
        await snap("leave-a-1-dropped", { blocks: out.aDropped });
        let d0 = dialogs.length;
        await win.tocOrdering().cancel();
        await sleep(600);
        out.aAfterCancel = blocks(await tocDom(win));
        out.aDialogs = dialogs.slice(d0);
        const sa = await snap("leave-a-2-cancelled", {
          blocks: out.aAfterCancel,
        });
        out.aNotices = sa.notices;
        // b) another tab of the window pressed with the drag unsaved
        await win.tocOrdering().start();
        await dragReviewsUp(win, "leave-b-drag");
        out.bDropped = blocks(await tocDom(win));
        d0 = dialogs.length;
        await win.tab("Issue Data").click();
        await idle(page);
        await sleep(1500);
        out.bTabNow = flat(
          await win
            .selectedTab()
            .innerText()
            .catch(() => null),
          60,
        );
        const sb = await snap("leave-b-1-issue-data");
        out.bDialogs = dialogs.slice(d0);
        out.bNotices = sb.notices;
        await win.tab("Table of Contents").click();
        await idle(page);
        await sleep(1500);
        out.bBack = blocks(await tocDom(win));
        out.bOrderingStillOn = await win
          .tocOrdering()
          .doneLink()
          .isVisible()
          .catch(() => null);
        await snap("leave-b-2-back-on-toc", {
          blocks: out.bBack,
          orderingStillOn: out.bOrderingStillOn,
        });
        if (out.bOrderingStillOn)
          await win
            .tocOrdering()
            .cancel()
            .catch(() => {});
        // c) the window closed with the drag unsaved
        win = await openToc("i4");
        await win.tocOrdering().start();
        await dragReviewsUp(win, "leave-c-drag");
        out.cDropped = blocks(await tocDom(win));
        d0 = dialogs.length;
        await win.dialog
          .getByRole("button", { name: "Close", exact: true })
          .first()
          .click();
        await sleep(2500);
        out.cDialogs = dialogs.slice(d0);
        out.cWindowStillOpen =
          (await win.dialog.count()) > 0 &&
          (await win.dialog
            .first()
            .isVisible()
            .catch(() => false));
        out.cQuestion = flat(
          await page
            .locator('[role="dialog"]:visible, .pkp_modal_confirmation:visible')
            .last()
            .innerText()
            .catch(() => null),
          300,
        );
        const sc = await snap("leave-c-1-closed", {
          windowStillOpen: out.cWindowStillOpen,
        });
        out.cNotices = sc.notices;
        win = await openToc("i4");
        out.cReopened = blocks(await tocDom(win));
        await snap("leave-c-2-reopened", { blocks: out.cReopened });
        // d) another address opened with the drag unsaved
        await win.tocOrdering().start();
        await dragReviewsUp(win, "leave-d-drag");
        out.dDropped = blocks(await tocDom(win));
        d0 = dialogs.length;
        await page
          .goto(app.url(`/index.php/${J.path}/management/settings/context`))
          .catch((e) => {
            out.dGotoError = flat(e.message, 200);
          });
        await idle(page);
        out.dDialogs = dialogs.slice(d0);
        out.dLandedOn = page.url().replace(/^https?:\/\/[^/]+/, "");
        win = await openToc("i4");
        out.dReopened = blocks(await tocDom(win));
        await snap("leave-d-reopened", { blocks: out.dReopened });
        out.page = (await issuePage("i4", "leave-e-page")).outline;
        out.storedSections = dbCustom("i4");
        fact("leave", out);
      });
    }

    // ================================================================ editor (i4 as the journal's Editor)
    if (on("editor")) {
      await sect("editor", async () => {
        await as(J.ed);
        await admin.goto("Back Issues");
        await idle(page);
        const s = await snap("editor-issues-page");
        fact("editor-issues-page", {
          url: s.url,
          title: s.title,
          issuesEntry: await admin
            .sideMenu()
            .getByRole("link", { name: "Issues", exact: true })
            .count()
            .catch(() => null),
        });
        await round("editor-a", "i4", (dom, win) => [
          {
            what: 'as the Editor: the "Essays" heading (last) dragged onto the "Reviews" heading (second), between two sections',
            moving: () => headingRow(win, "Essays"),
            target: () => headingRow(win, "Reviews"),
            where: "onto",
          },
        ]);
      });
    }

    // ================================================================ journal (the journal's own order changed afterwards)
    if (on("journal")) {
      await sect("journal", async () => {
        await as(J.mg);
        const out = { before: {}, after: {} };
        const readAll = async (bucket, label) => {
          for (const k of Object.keys(ISSUES)) {
            const win = await openToc(k);
            const toc = outline(await tocDom(win)).filter((x) =>
              x.startsWith("# "),
            );
            const pg = (
              await issuePage(k, `journal-${label}-page-${k}`)
            ).outline.filter((x) => x.startsWith("# "));
            bucket[k] = {
              tabSections: toc,
              pageSections: pg,
              storedSections: dbCustom(k),
            };
          }
        };
        await readAll(out.before, "before");
        const { tab, titles } = await journalSections(
          "journal-1-sections-before",
        );
        out.sectionsBefore = titles;
        out.sectionsStoredBefore = dbSections();
        await tab.startOrdering();
        await sleep(400);
        await tab.drag("Essays", "Articles");
        await sleep(600);
        out.sectionsDropped1 = (await tab.titleCells().allInnerTexts()).map(
          (x) => flat(x, 80),
        );
        await tab.drag("Reviews", "Essays");
        await sleep(600);
        out.sectionsDropped = (await tab.titleCells().allInnerTexts()).map(
          (x) => flat(x, 80),
        );
        await snap("journal-2-sections-dropped", {
          titles: out.sectionsDropped,
        });
        const r = await tab
          .done()
          .catch((e) => ({ status: () => `error ${flat(e.message, 120)}` }));
        out.done = r.status();
        await sleep(600);
        out.sectionsAfterDone = (await tab.titleCells().allInnerTexts()).map(
          (x) => flat(x, 80),
        );
        const sj = await snap("journal-3-sections-done", {
          titles: out.sectionsAfterDone,
        });
        out.noticesAtDone = sj.notices;
        out.sectionsReloaded = (
          await journalSections("journal-4-sections-reloaded")
        ).titles;
        out.sectionsStoredAfter = dbSections();
        await readAll(out.after, "after");
        fact("journal", out);
      });
    }

    // ================================================================ setsec (Rule 10b's last sentence)
    if (on("setsec")) {
      await sect("setsec", async () => {
        await as(J.mg);
        const pub = new PublicationScreen(page, J.path);
        /** Publication Settings of an article of issue `k`: "Section" set to "Essays", "Save"; the tab and the page after. */
        const changeSection = async (key, k, name) => {
          const out = { article: key, issue: issueName(k) };
          out.tocBefore = blocks(await tocDom(await openToc(k)));
          out.shownBefore = await sectionShown(
            key,
            `${name}-1-settings-before`,
          );
          const select = page.locator('select[name="sectionId"]').last();
          out.options = (
            await select
              .locator("option")
              .allInnerTexts()
              .catch(() => [])
          ).map((x) => flat(x, 60));
          out.saveDisabledBefore = await pub
            .saveButton()
            .last()
            .isDisabled()
            .catch(() => null);
          if (out.shownBefore.disabled) {
            out.stopped = 'the "Section" box is disabled; nothing changed';
            return out;
          }
          await select.selectOption({ label: "Essays" });
          await sleep(300);
          const saved = page
            .waitForResponse(
              (r) =>
                /\/publications\/\d+$/.test(new URL(r.url()).pathname) &&
                r.request().method() !== "GET",
              { timeout: 20_000 },
            )
            .catch(() => null);
          out.saveClick = await pub
            .saveButton()
            .last()
            .click({ timeout: 10_000 })
            .then(
              () => "pressed",
              (e) => `not pressed: ${flat(e.message, 160)}`,
            );
          const sr = await saved;
          out.save = sr ? sr.status() : null;
          out.saveAnswer =
            sr && sr.status() >= 400
              ? flat(await sr.text().catch(() => null), 300)
              : undefined;
          await idle(page);
          await sleep(800);
          const s4 = await snap(`${name}-2-saved`);
          out.saveNotices = s4.notices;
          out.sectionAfterSave = flat(
            await page
              .locator('select[name="sectionId"]')
              .last()
              .locator("option:checked")
              .innerText()
              .catch(() => null),
          );
          out.statusAfterSave = flat(
            await pub
              .leftControls()
              .innerText()
              .catch(() => null),
            120,
          );
          out.tocAfter = blocks(await tocDom(await openToc(k)));
          await snap(`${name}-3-toc-after`, { blocks: out.tocAfter });
          out.pageAfter = (await issuePage(k, `${name}-4-page-after`)).outline;
          out.storedArticles = dbPubs(k);
          out.shownAfterReload = await sectionShown(
            key,
            `${name}-5-settings-reloaded`,
          );
          return out;
        };
        fact(
          "setsec-scheduled",
          await changeSection("i5 r1", "i5", "setsec-s"),
        );
        fact(
          "setsec-published",
          await changeSection("i6 r1", "i6", "setsec-p"),
        );
      });
    }

    fact("dialogs-all", dialogs);
    await signOut(page).catch(() => {});
  } finally {
    await close();
  }
});
