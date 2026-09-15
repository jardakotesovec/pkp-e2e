#!/usr/bin/env python3
"""Tally CI failures/flakes from the scraped run logs. Output: ci-tally.md, ci-tally-compact.md, tally.json."""
import json, os, re, sys, collections, datetime as dt

# The work directory holding runs-<repo>.json and logs/ (run.sh passes it)
S = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
REPOS = {"pkp-e2e": "jardakotesovec/pkp-e2e", "ojs": "pkp/ojs", "omp": "pkp/omp", "ops": "pkp/ops"}
WINDOW_H = 36  # hours: another completed run of the same repo+branch with the test passing => intermittent

runs = {}
for short, repo in REPOS.items():
    for r in json.load(open(f"{S}/runs-{short}.json")):
        runs[(repo, r["databaseId"])] = dict(r, repo=repo, short=short)

TEST_RE = re.compile(r"(✘|✓)\s+\d+\s+\[(\w+)\] › (\S+?):\d+:\d+ › (.*?)(?: \(retry #(\d+)\))? \([\d.]+(?:ms|m|s)\)\s*$")
LIST_RE = re.compile(r"^\s+(\d+)\) \[(\w+)\] › (\S+?):\d+:\d+ › (.*?)\s*$")
SUM_RE = re.compile(r"^\s*(\d+) (failed|flaky|passed|skipped|did not run)")
INFRA_RE = re.compile(r"ECONNREFUSED|socket hang up|ETIMEDOUT|Timed out waiting|webServer|ENOSPC|EPIPE|net::ERR|##\[error\]")

def tid(app, path, title):
    return (app, os.path.basename(path), title)

def err_class(e):
    if not e: return "unknown (no error line captured)"
    if re.search(r"ERR_CONNECTION_REFUSED|ECONNREFUSED", e): return "server: connection refused (php -S down)"
    if re.search(r"ERR_EMPTY_RESPONSE|socket hang up|ERR_CONNECTION_RESET|EPIPE", e): return "server: empty response / socket hang up"
    if "Test timeout of" in e or "Test timeout" in e: return "test timeout"
    if re.search(r"expect\(locator\)\.toBeVisible", e): return "assertion: toBeVisible"
    if re.search(r"expect\(locator\)\.(toContainText|toHaveText)", e): return "assertion: text"
    if re.search(r"expect\(locator\)\.toHaveCount", e): return "assertion: toHaveCount"
    if re.search(r"expect\(locator\)\.toHaveAttribute", e): return "assertion: toHaveAttribute"
    if re.search(r"expect\(locator\)\.(toBeEnabled|toBeDisabled|toBeChecked|toBeHidden|toHaveValue|toHaveClass|toHaveURL)", e): return "assertion: state"
    if re.search(r"expect\((received|page|response)\)|toBe\(|toEqual|toMatch|toBeGreaterThan|toBeTruthy|expect\(\w+\)\.", e): return "assertion: value"
    if re.search(r"locator\.(click|check|fill|selectOption|setInputFiles|hover|press|uncheck)", e): return "action timeout (click/fill/check)"
    if re.search(r"page\.(goto|waitFor|reload)", e): return "navigation/wait"
    if re.search(r"apiRequestContext|request\.", e): return "API request"
    if "strict mode violation" in e: return "strict mode violation"
    return "other: " + e[:60]

per_run = []
jobs_index = []  # completed jobs: (repo, branch, app, datetime, failed set, run id)

for (repo, rid), meta in sorted(runs.items(), key=lambda kv: kv[1]["createdAt"]):
    tag = repo.replace("/", "_")
    f = f"{S}/logs/{tag}-{rid}.txt"
    when = dt.datetime.fromisoformat(meta["createdAt"].replace("Z", "+00:00"))
    rec = dict(repo=repo, id=rid, date=meta["createdAt"][:16].replace("T", " "), when=when, sha=meta["headSha"][:9],
               conclusion=meta["conclusion"], branch=meta["headBranch"], event=meta["event"],
               title=meta["displayTitle"][:60], jobs={}, note="")
    if meta["conclusion"] in ("cancelled", "action_required") or not meta["conclusion"] or not os.path.exists(f) or os.path.getsize(f) == 0:
        rec["note"] = "not inspected (" + (meta["conclusion"] or "in progress") + (", log unavailable" if meta["conclusion"] == "failure" else "") + ")"
        per_run.append(rec)
        continue
    lines = open(f, encoding="utf-8", errors="replace").read().splitlines()
    jobs = {}
    attempts = collections.defaultdict(lambda: collections.defaultdict(dict))
    errors = collections.defaultdict(dict)
    summary = collections.defaultdict(dict)
    infra = collections.defaultdict(list)
    cur_list = {}
    for ln in lines:
        if ln.startswith("JOB\t"):
            _, name, concl, st, en, steps = (ln.split("\t") + [""] * 6)[:6]
            app = re.search(r"\((\w+)\)", name)
            app = app.group(1) if app else name
            jobs[app] = dict(conclusion=concl, failed_steps=steps)
            continue
        parts = ln.split("\t", 2)
        if len(parts) < 3:
            continue
        jobname, _, body = parts
        app = re.search(r"\((\w+)\)", jobname)
        app = app.group(1) if app else jobname
        body = re.sub(r"^\S+Z ", "", body)
        m = TEST_RE.search(body)
        if m:
            mark, tapp, path, title, retry = m.groups()
            attempts[app][tid(tapp, path, title)][int(retry or 0)] = mark
            continue
        m = LIST_RE.match(body)
        if m:
            cur_list[app] = tid(m.group(2), m.group(3), m.group(4))
            continue
        if (body.strip().startswith("Error:") or body.strip().startswith("Test timeout of")) and app in cur_list:
            t = cur_list.pop(app)
            errors[app].setdefault(t, body.strip()[:140])
            continue
        m = SUM_RE.match(body)
        if m:
            summary[app][m.group(2)] = int(m.group(1))
            continue
        if INFRA_RE.search(body):
            infra[app].append(body.strip()[:160])
    for app, j in jobs.items():
        j["summary"] = summary.get(app, {})
        j["completed"] = "passed" in j["summary"] or "failed" in j["summary"]
        j["infra"] = infra.get(app, [])
        j["failed"] = {}
        j["flaky"] = {}
        for t, att in attempts.get(app, {}).items():
            e = errors[app].get(t, "")
            if att.get(0) == "✘" and att.get(1) == "✓":
                j["flaky"][t] = e
            elif "✘" in att.values():
                j["failed"][t] = (e, 1 in att)
        if j["completed"] and j["summary"].get("passed", 0) >= 100 and not j["summary"].get("did not run"):
            jobs_index.append((repo, rec["branch"], app, when, set(j["failed"]) | set(j["flaky"]), rid))
    rec["jobs"] = jobs
    per_run.append(rec)

sha_outcomes = collections.defaultdict(list)
for r in per_run:
    sha_outcomes[(r["repo"], r["sha"])].append((r["when"], r["conclusion"]))
def later_green(repo, sha, when):
    return any(d > when and c == "success" for d, c in sha_outcomes[(repo, sha)])
def passed_nearby(repo, branch, app, when, t, rid):
    """passes of t on the same repo+branch+app both before and after the failure within the window (else [])"""
    before, after = [], []
    for (r2, b2, a2, w2, bad, rid2) in jobs_index:
        if r2 == repo and b2 == branch and a2 == app and rid2 != rid and abs((w2 - when).total_seconds()) <= WINDOW_H * 3600 and t not in bad:
            (before if w2 < when else after).append(rid2)
    return before + after if before and after else []

per_test = collections.defaultdict(lambda: {"failed": [], "flaky": []})
for r in per_run:
    exp = r["repo"].endswith("pkp-e2e") and r["branch"] != "main"
    for app, j in r["jobs"].items():
        for t, e in j["flaky"].items():
            per_test[t]["flaky"].append(dict(repo=r["repo"], id=r["id"], date=r["date"][:10], sha=r["sha"], branch=r["branch"], err=e, exp=exp))
        for t, (e, retried) in j["failed"].items():
            nfail = len(j["failed"])
            nb = passed_nearby(r["repo"], r["branch"], app, r["when"], t, r["id"]) if nfail <= 3 else []
            per_test[t]["failed"].append(dict(repo=r["repo"], id=r["id"], date=r["date"][:10], sha=r["sha"], branch=r["branch"], err=e, exp=exp, nfail=nfail,
                                              retried=retried, green_sha=later_green(r["repo"], r["sha"], r["when"]) and nfail <= 3, nearby=nb))

def short(repo): return repo.split("/")[1]
def fmt(i, failed=False):
    s = f"{short(i['repo'])}:{i['id']} {i['date']} {i['branch'][:16]}@{i['sha'][:7]}"
    if i["exp"]: s += " (exp)"
    if failed:
        tags = []
        if i["green_sha"]: tags.append("green rerun same sha")
        if i["nearby"]: tags.append(f"passed nearby {len(i['nearby'])}x")
        if not i["retried"]: tags.append("no retry seen")
        tags.append(f"{i['nfail']} failed in job")
        if tags: s += " [" + ", ".join(tags) + "]"
    return s

def interm_of(d): return [x for x in d["failed"] if x["nearby"] or x["green_sha"]]
def score(d): return len(d["flaky"]) + len(interm_of(d))

out = []
dates = sorted(r["date"][:10] for r in per_run) or [dt.date.today().isoformat()]
out.append(f"# CI flake tally: runs created {dates[0]} .. {dates[-1]} (fetched {dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%MZ')})\n")
out.append("Sources: `gh run list` + `gh run view --log` on jardakotesovec/pkp-e2e (workflow `e2e`, 3 jobs ojs/omp/ops per run, apps at pkp/<app> main tip) and pkp/ojs, pkp/omp, pkp/ops (workflow `e2e`, the thin hook calling run-app.yml; 1 job per run). Cancelled runs (superseded pushes) were not inspected. CI runs `npx playwright test --retries=1` with the list reporter.\n")
out.append("Definitions:\n- **flaky** = failed the first attempt, passed the retry (job stays green). Direct evidence of non-determinism.\n- **failed** = both attempts failed (job red). Sub-signals: *green rerun same sha* = a later run of the same repo at the same head SHA succeeded; *passed nearby Nx* = the same test passed in N other completed jobs of the same repo + branch + app within ±36 h, both before and after the failure, and the job had at most 3 failed tests (larger clusters are regressions). Either marks the failure as **intermittent**. A failed incident with neither is most likely a real regression at that ref (every push is a new SHA, so consecutive failures across SHAs are consistent with a regression).\n- **(exp)** = pkp-e2e run on a non-main branch (perf-* experiments with patched pkp-lib, or a companion branch); count with care.\n- flake score = flaky + intermittent failed.\n")

out.append("## Runs inspected per repo\n")
out.append("| repo | listed | inspected (logs read) | success | failure | skipped (cancelled / in progress / log gone) |")
out.append("|---|---|---|---|---|---|")
tot_jobs = 0
for short_, repo in REPOS.items():
    rs = [r for r in per_run if r["repo"] == repo]
    insp = [r for r in rs if not r["note"]]
    tot_jobs += sum(len(r["jobs"]) for r in insp)
    out.append(f"| {repo} | {len(rs)} | {len(insp)} | {sum(1 for r in insp if r['conclusion']=='success')} | {sum(1 for r in insp if r['conclusion']=='failure')} | {len(rs)-len(insp)} |")
out.append(f"\nJobs (app suites) inspected: {tot_jobs}. Jobs by app that completed a full suite (≥100 passed; the reference set for the intermittent check): " + ", ".join(f"{a}={n}" for a, n in sorted(collections.Counter(a for _, _, a, _, _, _ in jobs_index).items())) + ".\n")

out.append("## Jobs that went red without a test failure (infrastructure / setup)\n")
out.append("| date | repo | run | app | failed step(s) | evidence |")
out.append("|---|---|---|---|---|---|")
for r in per_run:
    for app, j in sorted(r["jobs"].items()):
        if j["conclusion"] == "failure" and not j["failed"]:
            ev = " / ".join(x.replace("|", "\\|") for x in j["infra"][:2]) or ("summary: " + json.dumps(j["summary"]) if j["summary"] else "no Playwright output captured")
            out.append(f"| {r['date']} | {short(r['repo'])} | {r['id']} | {app} | {j['failed_steps'] or '-'} | {ev[:200]} |")
out.append("")

out.append("## Base rate: completed jobs carrying at least one flaky test\n")
week0 = dt.date.fromisoformat(dates[0])
def wk(d): return 1 + (dt.date.fromisoformat(d[:10]) - week0).days // 7
out.append(f"A completed job = the Playwright summary printed (any conclusion). Weeks count from the first run's date ({dates[0]}), seven days each.\n")
out.append("| app | completed jobs | jobs with ≥1 flaky | share | flaky incidents | red jobs (≥1 failed) | red jobs, isolated (≤3 failed) | red jobs, cluster (4+) |")
out.append("|---|---|---|---|---|---|---|---|")
bywk = collections.defaultdict(lambda: [0, 0, 0])
for app in ("ojs", "omp", "ops"):
    cj = [(r, j) for r in per_run for a, j in r["jobs"].items() if a == app and j["completed"]]
    fl = [1 for r, j in cj if j["flaky"]]
    red = [(r, j) for r, j in cj if j["failed"]]
    out.append(f"| {app} | {len(cj)} | {len(fl)} | {100*len(fl)//max(1,len(cj))}% | {sum(len(j['flaky']) for r, j in cj)} | {len(red)} | {sum(1 for r, j in red if len(j['failed']) <= 3)} | {sum(1 for r, j in red if len(j['failed']) > 3)} |")
    for r, j in cj:
        w = bywk[(app, wk(r["date"]))]; w[0] += 1; w[1] += 1 if j["flaky"] else 0; w[2] += len(j["flaky"])
out.append("")
out.append("| app | week | completed jobs | jobs with ≥1 flaky | share | flaky incidents |")
out.append("|---|---|---|---|---|---|")
for (app, w), (n, f, fi) in sorted(bywk.items()):
    out.append(f"| {app} | {w} | {n} | {f} | {100*f//max(1,n)}% | {fi} |")
out.append("")

ranked = sorted(per_test.items(), key=lambda kv: (-score(kv[1]), -len(kv[1]["flaky"]), -len(kv[1]["failed"]), kv[0]))
out.append("## Ranked: tests by flake score (flaky + intermittent failed)\n")
out.append("| # | app | spec | scenario | flake score | flaky (non-exp) | failed (of which intermittent) | error classes (flaky+intermittent) | flaky incidents | intermittent failed incidents |")
out.append("|---|---|---|---|---|---|---|---|---|---|")
for i, (t, d) in enumerate(ranked, 1):
    if score(d) == 0: break
    app, spec, title = t
    interm = interm_of(d)
    ec = collections.Counter(err_class(x["err"]) for x in d["flaky"] + interm)
    nonexp = sum(1 for x in d['flaky'] if not x['exp'])
    out.append(f"| {i} | {app} | {spec} | {title.replace('|', '\\|')} | {score(d)} | {len(d['flaky'])} ({nonexp}) | {len(d['failed'])} ({len(interm)}) | {'; '.join(f'{k} ×{v}' for k, v in ec.most_common())} | {'; '.join(fmt(x) for x in d['flaky']) or '-'} | {'; '.join(fmt(x, True) for x in interm) or '-'} |")
out.append("")

out.append("## Flake classes by error signature (flaky + intermittent failed incidents)\n")
cls = collections.Counter(); cls_tests = collections.defaultdict(set)
for t, d in per_test.items():
    for x in d["flaky"] + interm_of(d):
        c = err_class(x["err"]); cls[c] += 1; cls_tests[c].add(f"{t[0]}/{t[1].split('-')[0]} {t[2][:35]}")
out.append("| error class | incidents | distinct tests | examples |")
out.append("|---|---|---|---|")
for c, n in cls.most_common():
    out.append(f"| {c.replace('|', '\\|')} | {n} | {len(cls_tests[c])} | {'; '.join(sorted(cls_tests[c])[:4]).replace('|', '\\|')} |")
out.append("")

out.append("## Failed with no flake signal (probable regressions at that ref), grouped by spec\n")
out.append("| app | spec | tests | failed incidents | date range | branches |")
out.append("|---|---|---|---|---|---|")
grp = collections.defaultdict(lambda: [set(), 0, [], set()])
for (app, spec, title), d in per_test.items():
    det = [x for x in d["failed"] if not (x["nearby"] or x["green_sha"])]
    if det:
        g = grp[(app, spec)]; g[0].add(title); g[1] += len(det); g[2] += [x["date"] for x in det]; g[3] |= {x["branch"][:14] for x in det}
for (app, spec), (titles, n, dates, br) in sorted(grp.items(), key=lambda kv: -kv[1][1]):
    out.append(f"| {app} | {spec} | {len(titles)} | {n} | {min(dates)}..{max(dates)} | {', '.join(sorted(br))[:80]} |")
out.append("")

out.append("## Reference: all tests with incidents, by raw total (failed + flaky)\n")
out.append("| app | spec | scenario | failed | flaky | intermittent failed | first | last |")
out.append("|---|---|---|---|---|---|---|---|")
for t, d in sorted(per_test.items(), key=lambda kv: -(len(kv[1]["failed"]) + len(kv[1]["flaky"]))):
    dates = [x["date"] for x in d["failed"] + d["flaky"]]
    out.append(f"| {t[0]} | {t[1]} | {t[2].replace('|', '\\|')[:90]} | {len(d['failed'])} | {len(d['flaky'])} | {len(interm_of(d))} | {min(dates)} | {max(dates)} |")
out.append("")

def run_reason(r, maxlen=None):
    if r["note"]:
        return r["note"]
    bits = []
    for app, j in sorted(r["jobs"].items()):
        sm = j["summary"]
        s = f"{app}: {j['conclusion'] or 'in progress'}"
        if sm:
            s += " (" + ", ".join(f"{v} {k}" for k, v in sm.items()) + ")"
        if j["failed"]:
            s += " FAILED: " + "; ".join(f"{spec.split('-')[0]} {title[:40]}" for _, spec, title in sorted(j["failed"]))
        if j["flaky"]:
            s += " flaky: " + "; ".join(f"{spec.split('-')[0]} {title[:40]}" for _, spec, title in sorted(j["flaky"]))
        if j["conclusion"] == "failure" and not j["failed"]:
            s += f" INFRA/other: step=[{j['failed_steps']}] " + " / ".join(j["infra"][:2])
        bits.append(s)
    s = " ‖ ".join(bits) if bits else "no job data"
    return s if not maxlen or len(s) <= maxlen else s[:maxlen] + "…"

out.append("## Per-run list (newest first; all listed runs)\n")
out.append("| date (UTC) | repo | run id | event/branch | sha | conclusion | reason |")
out.append("|---|---|---|---|---|---|---|")
for r in sorted(per_run, key=lambda r: r["date"], reverse=True):
    out.append(f"| {r['date']} | {short(r['repo'])} | {r['id']} | {r['event']}/{r['branch'][:24]} | {r['sha']} | {r['conclusion'] or 'in_progress'} | {run_reason(r).replace('|', '\\|')} |")
out.append("")
open(f"{S}/ci-tally.md", "w").write("\n".join(out))

cp = ["## Per-run list, compact (failure runs and green runs with a flaky test; cancelled/skipped omitted; newest first)\n",
      "| date | repo | run | branch | sha | concl | reason |", "|---|---|---|---|---|---|---|"]
for r in sorted(per_run, key=lambda r: r["date"], reverse=True):
    if r["note"]: continue
    if r["conclusion"] == "failure" or any(j["flaky"] for j in r["jobs"].values()):
        cp.append(f"| {r['date']} | {short(r['repo'])} | {r['id']} | {r['branch'][:16]} | {r['sha'][:7]} | {r['conclusion'][:4]} | {run_reason(r, 230).replace('|', '\\|')} |")
open(f"{S}/ci-tally-compact.md", "w").write("\n".join(cp))
json.dump({" › ".join(k): v for k, v in per_test.items()}, open(f"{S}/tally.json", "w"), indent=1, default=str)
print(f"tests with incidents: {len(per_test)}; with flake signal: {sum(1 for d in per_test.values() if score(d))}; runs: {len(per_run)}; compact rows: {len(cp)-3}")
