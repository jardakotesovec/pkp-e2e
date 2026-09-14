// Profiling reporter: one JSON line per test with flattened steps (self time attributed).
const fs = require('fs');
class Prof {
  constructor() { this.out = process.env.PROFILE_OUT || 'profile.jsonl'; fs.writeFileSync(this.out, ''); this.t0 = Date.now(); }
  onTestEnd(test, result) {
    const steps = [];
    const walk = (s, depth, parentTitle) => {
      const kids = s.steps || [];
      const childSum = kids.reduce((a, k) => a + k.duration, 0);
      steps.push({d: depth, cat: s.category, title: s.title, dur: s.duration, self: s.duration - childSum, start: s.startTime ? new Date(s.startTime).getTime() - this.t0 : null, parent: parentTitle});
      kids.forEach(k => walk(k, depth + 1, s.title));
    };
    result.steps.forEach(s => walk(s, 0, null));
    const rec = {
      file: test.location.file.replace(process.cwd() + '/', ''),
      line: test.location.line,
      title: test.titlePath().slice(1).join(' › '),
      project: test.parent.project()?.name,
      status: result.status,
      duration: result.duration,
      start: new Date(result.startTime).getTime() - this.t0,
      worker: result.workerIndex,
      parallelIndex: result.parallelIndex,
      retry: result.retry,
      steps,
    };
    fs.appendFileSync(this.out, JSON.stringify(rec) + '\n');
  }
  onEnd(r) { fs.appendFileSync(this.out, JSON.stringify({end: true, status: r.status, wall: Date.now() - this.t0}) + '\n'); }
  printsToStdio() { return false; }
}
module.exports = Prof;
