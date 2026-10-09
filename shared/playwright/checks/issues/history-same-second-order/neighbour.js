// U37 A33 neighbour check (issue report docs/issues/U37-A33-history-same-second-order.md): the submission's own
// "Activity Log", which reads the event log through the same query as a discussion's "History". Run with the fix
// in and out on the same data (no reset between the two), it shows what the fix changes there: the same lines,
// the same dates top to bottom, and which lines of one second changed places.
//   log      dbarnes at Production of the submission (OJS 5, OMP 4, OPS 1): the header's "Activity Log"; every
//            line of "History" (date, user, event), top to bottom
// The submission's rows of event_log are read too (evidence): how many there are and which share a second.
//   PROBE_RUN=nb-out PROBE_FEATURE=<dataset fleet> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/history-same-second-order/neighbour.js
//   (PROBE_RUN=nb-in for the run with the fix applied.)
const {forEachApp, launch, signIn, record, screen, idle, sql} = require('../../../probe');
const L = require('./lib.js');

const ASSOC_TYPE_SUBMISSION = 0x0100009;

forEachApp(async (app) => {
    const {A29} = L;
    const id = A29.WORDS[app.name].id;
    const facts = {app: app.name, line: app.line || 'main', submission: id};
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        await A29.openPanel(page, app);
        try {
            await page.getByRole('button', {name: 'Activity Log', exact: true}).first().click();
            const log = page.getByRole('dialog', {name: 'Activity Log & Notes', exact: true});
            const rows = log.locator('tbody tr.gridRow');
            await rows.first().waitFor({state: 'visible', timeout: 30_000});
            await idle(page);
            const lines = await rows.evaluateAll((trs) =>
                trs.map((tr) => {
                    const text = (td) => {
                        if (!td) return '';
                        const copy = td.cloneNode(true);
                        copy.querySelectorAll('script, a.show_extras, a.hide_extras').forEach((e) => e.remove());
                        return (copy.textContent || '').replace(/\s+/g, ' ').trim();
                    };
                    const tds = [...tr.querySelectorAll(':scope > td')];
                    return {date: text(tds[0]), user: text(tds[1]), event: text(tds[2])};
                })
            );
            record('neighbour-log', await screen(page));
            const dates = lines.map((l) => l.date);
            facts.log = {
                lines,
                count: lines.length,
                // the log's other sources: one line per email sent; whatever is left over would be the review lines
                emailLines: lines.filter((l) => l.event.startsWith('An email has been sent')).length,
                datesNewestFirst: dates.every((d, i) => i === 0 || d <= dates[i - 1]),
            };
        } catch (e) {
            facts.log = {failed: String(e.stack || e).split('\n').slice(0, 4).join(' | ')};
        }
        const saved = sql(app, `select log_id, date_logged, message from event_log where assoc_type = ${ASSOC_TYPE_SUBMISSION} and assoc_id = ${id} order by date_logged desc, log_id desc`)
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                const [logId, at, message] = line.split('|');
                return {id: Number(logId), at, message};
            });
        const seconds = {};
        for (const row of saved) (seconds[row.at] = seconds[row.at] || []).push(`${row.id} ${row.message}`);
        // the entries the Activity Log adds for edited reviews (comments, form responses, recommendations, competing interests)
        const reviewRows = Number(sql(app, 'select count(*) from event_log where assoc_type in (517, 1048595)'));
        facts.eventLog = {rows: saved.length, reviewChangeRowsOnInstall: reviewRows, sharedSeconds: Object.entries(seconds).filter(([, g]) => g.length > 1).map(([at, g]) => ({at, latestSavedFirst: g}))};
        console.log(`[${app.name}] log`, JSON.stringify({count: facts.log.count, datesNewestFirst: facts.log.datesNewestFirst, failed: facts.log.failed, eventLog: facts.eventLog}).slice(0, 3000));
    } finally {
        record('neighbour-facts', facts);
        await close();
    }
});
