// PR review of pkp/pkp-lib#13646: one line per walk and run, from the facts side.sh left in
// .reports/pr13646-<main|35>-<base|head|merged>[-up|-patch]/.   node shared/playwright/checks/sync/pkp-lib-13646/summary.js
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '../../../../../.reports');
const j = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const find = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => j(path.join(dir, f))) : []);
for (const line of ['main', '35']) {
    for (const side of ['base', 'head', 'merged']) {
        const d = path.join(R, `pr13646-${line}-${side}`);
        const out = [];
        const tg = find(path.join(d, 'series-toggle-asks-about-section'), /^facts-walk/)[0];
        out.push(`toggle: ${tg ? `${tg.steps['3 "History": press "Inactive"']?.question} / ${tg.steps['5 "History": press the ticked "Inactive" box']?.question}` : '-'}`);
        const is = find(path.join(d, 'series-issn-help-which-identifying'), /^facts-walk/)[0];
        out.push(`issn: ${is ? (is.steps['5 the paragraph under "ISSN" (Add Series)']?.paragraph || '').match(/number which \w+/)?.[0] : '-'}`);
        const dy = find(path.join(d, 'press-days-to-decision-text-your-journal'), /^facts-/)[0];
        out.push(`days: ${dy ? dy.daysEnding || dy.error : '-'}`);
        const ds = find(path.join(d, 'press-disable-submissions-help-says-articles'), /^disable-facts/)[0];
        out.push(`disable: ${ds ? (ds.disable?.help || ds.help || '').slice(0, 60) : '-'}`);
        const cr = find(path.join(d, 'press-copyright-notice-label-lowercase'), /^copyright-facts/)[0];
        out.push(`copyright: ${cr ? JSON.stringify((cr.guidance?.labels || []).filter((l) => /^copyright/i.test(l))) + ' about page ' + JSON.stringify((cr.submissionsHeadings || []).filter((l) => /copyright/i.test(l)).map((l) => l.replace(' Edit Open a new page to edit this information', ''))) : '-'}`);
        const st = find(path.join(d + '-up', 'stored'), /^stored/)[0];
        if (st) {
            out.push(`upgrade: ${st.versions.map((v) => v.split('|')[0]).join(' -> ')}`);
            for (const t of st.texts.filter((x) => x.locale === 'en')) out.push(`stored ${t.key}: ${t.subject} (recommendation ${t.recommendation}, journalName ${t.journalName}, contextName ${t.contextName})`);
        }
        const pt = find(path.join(d + '-patch', 'stored'), /^stored/)[0];
        if (pt) {
            out.push(`upgrade (3.5.0.x block): ${pt.versions.map((v) => v.split('|')[0]).join(' -> ')}`);
            for (const t of pt.texts.filter((x) => x.locale === 'en' && x.key === 'REVIEW_COMPLETE')) out.push(`stored ${t.key}: ${t.subject} (recommendation ${t.recommendation})`);
        }
        const o2 = find(path.join(d + '-up', 'omp2'), /facts/)[0];
        out.push(`review-complete mail: ${o2 ? JSON.stringify(o2.letter?.subject || o2.mail?.subject || o2.error || Object.keys(o2)) : '-'}`);
        console.log(`== ${line} ${side}\n  ${out.join('\n  ')}`);
    }
}
