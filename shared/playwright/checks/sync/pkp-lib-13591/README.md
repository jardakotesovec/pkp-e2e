# PR review pkp/pkp-lib#13591 (U45 A18): a deposit that gets no answer

Kept for the review of crossref-ojs#117/#118, crossref-ops#74/#75,
ojs#5977/#5978 (DataCite and the crossref pointer) and ops#1481/#1482.
The walk is the A18 issue's own
`checks/issues/deposit-unreachable-agency-stays-submitted/walk.js`, run on
three dataset fleets freshly loaded per round:

- ds1: Crossref (OJS, OPS) behind the dead-port proxy (`cURL error 7`, a
  `ConnectException`);
- ds2: DataCite (OJS), the same proxy;
- ds3: Crossref with `[proxy]` at `http://proxy.invalid:9`, a name that does
  not resolve (`cURL error 5`): Guzzle throws a `RequestException` with no
  response, the case the report read in the code only.

`switch.sh <line> head|tip` puts OJS and OPS on the line tip merged with the
app PR (crossref submodule at the plugin PR head) and back; the PR refs are
fetched first as `pr-<n>` in each app and its crossref submodule.
`round.sh <line> <label>` runs the three walks; `table.js` prints one row
per walk from the recorded facts. `ore-round.sh` does the same in the
slot's ore worktree (OJS), applying ojs#5977's DataCite diff and checking
out crossref-ojs#117. The paths inside are the review's (slot s0,
`.reports/pr-13591/`).
