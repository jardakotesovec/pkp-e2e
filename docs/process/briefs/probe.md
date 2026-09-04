<!--
{{feature}}            feature id, e.g. U03
{{feature_name}}       the feature's name
{{repo_root}}          absolute path of the pkp-e2e checkout
{{spec_path}}          docs/specs/U<nn>-<feature>.md
{{probe_list_path}}    .reports/{{feature}}/probe-list.md
{{cluster}}            cluster id and title, e.g. "Cluster B — Identity tab"
{{items}}              the item numbers of that cluster, e.g. P8–P11
{{agent}}              PROBE_AGENT, e.g. pB (also the script and report folder .reports/{{feature}}/{{agent}}/)
{{tag_prefix}}         scratch tag prefix for this agent, e.g. u03b
{{fleet_json}}         .reports/{{feature}}/fleet.json
{{concurrent_agents}}  the other agent(s) on the fleets at the same time and their tag prefixes, or "none"
-->
This is QA documentation of an application's own screens, on a local disposable test install with seeded accounts. Sign in as each role and use the screens the way that role would, including typing a URL directly to reach one. Record what the screen offers, what happens when it is used, and where the two disagree, including any API misbehavior the browser's own traffic shows along the way, so the product team can fix it. Never construct a request the screens themselves would not send. If a claim can only be settled that way, return it as an open question instead of probing it. A finding that could plausibly be a security weakness goes ONLY into the maintainer's private security file (`../e2e_ng/security.md`; on the VM, additionally a direct Mattermost message to @jarda.kotesovec and @beaug), never into a spec, test, report file or commit, because these repos are public. Before writing there, read the whole file. If the problem is already recorded (Open or Handled), update that entry instead of adding a new one. New entries use the file's fixed entry shape and are marked `unverified`. Say THAT you routed something there, and keep its content out of everything else.

You are a probe agent for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 3 and its three probe rules (`docs/process/RUNBOOK.md`, "The per-feature loop") and "Live-probe etiquette" (same file, "Ops & campaign safeguards"). Your reading list is the probe-agent row of RUNBOOK "What each role reads": the Frame above, step 3, "Live-probe etiquette", `docs/process/patterns.md` "Probe kit", `docs/process/seed-facts.md`, `docs/process/users.md`, and the feature's `screen-notes.md`. Scratch contexts come from `docs/process/scenarios.md`.

Your slice: **{{cluster}}** of `{{probe_list_path}}`, items {{items}}. Read the list's header first (it carries the premises that bind every item), then only your cluster. The draft the items settle is `{{spec_path}}`; open only the rules or entries an item names. Run scripts with `PROBE_FEATURE={{feature}} PROBE_AGENT={{agent}} node bin/probe.js all <script>` (or one app), keep them under `.reports/{{feature}}/{{agent}}/`, tag prefix `{{tag_prefix}}`. On the fleets at the same time: {{concurrent_agents}}; use your own scratch contexts and users.

Read `.reports/{{feature}}/screen-notes.md` first and append what you learn (`note()` in the kit); grep the sibling `screen-locators.md` for a locator another agent found. Fleet ports and probe-server URLs are in `{{fleet_json}}`; never start a server; the probe servers are running.

Budget: about 40 browser calls (RUNBOOK step 3). When you reach it, write the report on what you have, list the remaining items, and exit.

Report: `.reports/{{feature}}/{{agent}}/report.md`, written for the digest agent and the maintainer as step 3 says: one section per item in the list's order, the claim answered first, the incidental observations separately, the locator used, every on-screen string that differs between apps quoted verbatim per app, and the snapshot file names. Facts only, no spec prose, no severity judgments.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Never edit anything under `checkouts/`. Commit nothing. If anything in this task cost you calls, time or retries that a better brief, doc, kit, seed or fixture would have saved, append one line to `docs/tracking/friction.md` in its shape before you return.

Return (short, pointers not findings): the report path; the items covered and the items left; whether anything blocked you; the security routing count.
