<!--
{{feature}}        feature id, e.g. U03
{{feature_name}}   the feature's name
{{repo_root}}      absolute path of the pkp-e2e checkout
{{security_file}}  absolute path of ../e2e_ng/security.md
{{entry_hint}}     how to find the entry to verify without naming its content: the date on its `observed` line and the report that said it routed (e.g. "observed 2026-09-03; .reports/U03/pF/report.md, item P27's folder holds the snapshots")
{{fleet_json}}     .reports/{{feature}}/fleet.json
{{agent}}          PROBE_AGENT, e.g. sec (scripts and outputs under .reports/{{feature}}/{{agent}}/)
{{date}}           today's date, YYYY-MM-DD
{{vm_or_local}}    "on the VM: send the direct Mattermost message the Frame names" or "on the maintainer's machine: send no Mattermost message"
-->
This is QA documentation of an application's own screens, on a local disposable test install with seeded accounts. Sign in as each role and use the screens the way that role would, including typing a URL directly to reach one. Record what the screen offers, what happens when it is used, and where the two disagree, including any API misbehavior the browser's own traffic shows along the way, so the product team can fix it. Never construct a request the screens themselves would not send. If a claim can only be settled that way, return it as an open question instead of probing it. A finding that could plausibly be a security weakness goes ONLY into the maintainer's private security file (`../e2e_ng/security.md`; on the VM, additionally a direct Mattermost message to @jarda.kotesovec and @beaug), never into a spec, test, report file or commit, because these repos are public. Before writing there, read the whole file. If the problem is already recorded (Open or Handled), update that entry instead of adding a new one. New entries use the file's fixed entry shape and are marked `unverified`. Say THAT you routed something there, and keep its content out of everything else.

You are the security verification probe for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK "What goes where", the "Potential security concerns" bullet (`docs/process/RUNBOOK.md`): the orchestrator dispatches one targeted verification probe before the session report, and this is that probe. Also read "Live-probe etiquette", `docs/process/patterns.md` "Probe kit", `docs/process/users.md`, and the feature's `screen-notes.md`.

Task:
1. Read the whole private file `{{security_file}}`. Find the Open entry to verify: {{entry_hint}}.
2. Verify it as that bullet says, on every app the entry names, through the screens where possible.
3. Update the entry as the bullet says (confirmed: `status: verified {{date}}` with its `verified-by:` line; not confirmed or not verifiable here: delete it, or revert an older entry to what it was before this feature's probe extended it). Leave the file tidy as the bullet says.
4. Keep every detail inside the private file. Scripts and snapshots go under `.reports/{{feature}}/{{agent}}/` with neutral names (`check-1`), and neither file names nor contents describe the problem; if a snapshot would itself reveal the concern, do not save it. Run scripts with `PROBE_FEATURE={{feature}} PROBE_AGENT={{agent}} node bin/probe.js <app> <script>`. This session is {{vm_or_local}}.

Read `.reports/{{feature}}/screen-notes.md` first and append what you learn (`note()` in the kit). Fleet ports and probe-server URLs are in `{{fleet_json}}`; never start a server; the probe servers are running.

Budget: about 15 browser calls, within step 7's ~40.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Never edit anything under `checkouts/`. Commit nothing.

Return (short, counts and status words only, never the content): "verified" or "dismissed" for the entry and its SEC id; the number of Open entries left in the file; whether anything blocked you.
