<!--
{{feature}}            feature id, e.g. U03
{{feature_name}}       the feature's name
{{repo_root}}          absolute path of the pkp-e2e checkout
{{spec_path}}          docs/specs/U<nn>-<feature>.md
{{chunk}}              chunk id, e.g. K2
{{chunk_scope}}        the chunk plan file and this chunk's body lines, register entries and Coverage rows
{{checklist_path}}     .reports/{{feature}}/claims.txt, from `node docs/process/lint/lint-spec.mjs --claims {{spec_path}}`
{{agent}}              PROBE_AGENT, e.g. ccK2 (outputs land in .reports/{{feature}}/{{agent}}/)
{{tag_prefix}}         scratch tag prefix, e.g. u03k2
{{fleet_json}}         .reports/{{feature}}/fleet.json
{{concurrent_agents}}  the other checker(s) on the fleets at the same time and their chunks, or "none"
{{report_path}}        .reports/{{feature}}/cc-{{chunk}}.md
-->
This is QA documentation of an application's own screens, on a local disposable test install with seeded accounts. Sign in as each role and use the screens the way that role would, including typing a URL directly to reach one. Record what the screen offers, what happens when it is used, and where the two disagree, including any API misbehavior the browser's own traffic shows along the way, so the product team can fix it. Never construct a request the screens themselves would not send. If a claim can only be settled that way, return it as an open question instead of probing it. A finding that could plausibly be a security weakness goes ONLY into the maintainer's private security file (`../e2e_ng/security.md`; on the VM, additionally a direct Mattermost message to @jarda.kotesovec and @beaug), never into a spec, test, report file or commit, because these repos are public. Before writing there, read the whole file. If the problem is already recorded (Open or Handled), update that entry instead of adding a new one. New entries use the file's fixed entry shape and are marked `unverified`. Say THAT you routed something there, and keep its content out of everything else.

You are a claim checker for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 6 and its bullets, the four checker rules included (`docs/process/RUNBOOK.md`, "The per-feature loop"), plus "Live-probe etiquette". Your reading list is the claim-checker row of RUNBOOK "What each role reads": the Frame above, step 6, "Live-probe etiquette", `docs/process/patterns.md` "Probe kit", `docs/process/seed-facts.md`, `docs/process/users.md`, `docs/process/scenarios.md` (scratch contexts and seeded states), the feature's `screen-notes.md`, and your chunk of the spec.

The target is our own text: `{{spec_path}}`. Read its body and only the footnotes your lines cite, not the whole file. Your chunk: **{{chunk}}**, {{chunk_scope}}. The checklist is `{{checklist_path}}`; you own every line whose spec line number falls in your chunk, plus the footnotes those lines and your register entries cite. A `to-drive` line carries the author's open question in its footnote: settle it, at both ends when it names an axis. On every screen you drive, at every permission level you sign in as, also record what the screen offers that the spec does not mention and what each control does when pressed (the sweep); what you find is a `new` block. If your chunk owns the Coverage section, report every row that still reads `planned` with no why-not and no state you could reach.

Write your scripts under `shared/playwright/checks/{{feature}}/{{chunk}}/`, importing the kit as `require('../../../probe')`: one entry script for the chunk that seeds its own scratch context, so a maintenance session can run it again later. Run it with `PROBE_FEATURE={{feature}} PROBE_AGENT={{agent}} node bin/probe.js all <script>` (or one app); outputs land in `.reports/{{feature}}/{{agent}}/`. Tag prefix `{{tag_prefix}}`. On the fleets at the same time: {{concurrent_agents}}.

Read `.reports/{{feature}}/screen-notes.md` first and append what you learn (`note()` in the kit); grep the sibling `screen-locators.md` for a locator another agent found, and `shared/playwright/checks/` for an earlier feature's script on the same screen. Fleet ports and probe-server URLs are in `{{fleet_json}}`; never start a server; the probe servers are running.

Size: the chunk is cut for about 40 browser calls (RUNBOOK step 6). Drive every checklist line even if it takes more; do not stop at a count.

Report: `{{report_path}}`, in spec-section order (the fold needs that). Header: chunk, apps driven, the declared no-screen lines by spec line number, calls used. Then one entry per checklist line or tight group: spec line number(s), verdict (holds / wrong / imprecise / undetermined), the screen evidence (snapshot file name, locator), and for anything not "holds", and for everything the sweep found, a digest block as step 6 defines it (`### {{chunk}}-<n> — one line, product voice` / Affects / Status: corrects | new | undetermined / Apps / Proposed / Evidence pointer). Facts only, no spec prose beyond the proposed line. End with the `seed-facts.md` correction for any premise that proved wrong.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Never edit the spec. Never edit anything under `checkouts/`. Commit nothing. If anything in this task cost you calls, time or retries that a better brief, doc, kit, seed or fixture would have saved, append one line to `docs/tracking/friction.md` in its shape before you return.

Return (short, pointers not findings): the report path; lines driven / declared / left (counts); verdict counts (holds / wrong / imprecise / undetermined) and the count of `new` blocks; whether anything blocked you; the security routing count.
