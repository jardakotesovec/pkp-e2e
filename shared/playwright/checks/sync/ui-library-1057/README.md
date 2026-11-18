# PR review of pkp/pkp-lib#12720 (2026-11-18)

The settings tabs for keyboard and screen-reader users: ui-library#1057 (`main`) and #1058
(`stable-3_5_0`), with the pointer bumps ojs#6068 (`main`) and ojs#6069, omp#2574, ops#1505 (3.5)
(blesildaramirez). `Tabs.vue` only: ↑/↓ move between side tabs, `aria-orientation` on the tablist,
`tabindex="0"` on the selected tab instead of `""`, no `aria-label` when the component gets no label.

- `tabs.js` drives Settings › Workflow › Submission on an OJS dataset fleet (`--feature sync-12720`,
  `sync-12720-35`) as `admin`: the tablists' markup, Chromium's accessibility tree, the keys on a
  side tab, on a top tab, in a form field, and the Tab sequence. Run once with the bundle built at
  the line's tip (`PROBE_AGENT=before`) and once with `lib/ui-library` at the PR head and
  `npm run build` (`after`); the command is in the script's header.
- Before, on both branches: ↑/↓ on a side tab do nothing but scroll; both tablists have
  `aria-label=""` and Chromium reports both as `horizontal`; the selected tab has `tabindex=""`.
- After, on both branches: ↓/↑ on a side tab select the next or previous one and move the focus to
  it, wrapping at the ends; the URL hash follows; the top tab stays as it was. Home, End, ← and →
  behave as before. ↑/↓ on a top tab and in a form field still only scroll. The side tablist reports
  `vertical`, the top one `horizontal`; the `aria-label` is gone; the selected tab has `tabindex="0"`.
  Tab still stops once in each tablist.
- Since the change is in the shared `Tabs` component and the same in all three apps, it was driven
  in OJS only. OMP and OPS ran in CI.
