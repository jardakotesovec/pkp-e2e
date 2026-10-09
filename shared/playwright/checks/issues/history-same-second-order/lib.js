// Helpers of walk.js and neighbour.js here (issue report docs/issues/U37-A33-history-same-second-order.md).
// Requiring this file runs nothing. The panel, "Add", the reply with a file and the "History" read are the U37 A29
// walk's (../add-window-file-missing-from-history/lib.js), which drives the same screens on PKP's default test
// dataset; what this walk adds is the "Edit" that changes two things, and the read of the log's rows.
const {idle, screen, record, sql} = require('../../../probe');
const A29 = require('../add-window-file-missing-from-history/lib.js');

/** Per app: the second person of the stage, ticked by the "Edit" (docs/process/dataset.md, `main`). */
const SECOND = {ojs: 'sberardo', omp: 'bbeaty', ops: 'sberardo'};
const ASSOC_TYPE_QUERY = 0x010000a;
/** The event types of a task's or discussion's log (PKPSubmissionEventLogEntry), by the word the History uses. */
const EVENT = {
    1342177281: 'created',
    1342177282: 'initiated',
    1342177283: 'closed',
    1342177285: 'posted a response',
    1342177286: 'reopened',
    1342177287: 'uploaded',
    1342177288: 'due date changed',
    1342177289: 'reassigned',
    1342177290: 'assigned',
    1342177291: 'removed',
    1342177292: 'added',
    1342177293: 'removed (participants)',
};

/** Row menu › "Edit": tick `person`, attach `file` under the message through "Attach Files" › "Upload File", "Save". */
async function editAddPersonAndFile(page, app, panel, name, {person, file, label}) {
    await panel.reland();
    const win = await panel.openEdit(name, 'Edit');
    await win.tick(person);
    const attach = await win.openAttachFiles();
    await attach.upload(A29.fixturePath(app, file));
    const listed = await win.attachedFile(file).count();
    record(`${label}-window`, await screen(page));
    const answer = await win.saveAndAnswer();
    const status = answer.status();
    await win.root.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await idle(page);
    return {status, fileListedUnderMessage: listed};
}

/**
 * Evidence, not a step: the item's rows of `event_log` in the order they were saved, as
 * `{id, at, event}`, and the same rows in the order the History is meant to give (newest first, of one second the
 * latest saved first).
 */
function logRows(app, name) {
    const out = sql(
        app,
        `select l.log_id, l.date_logged, l.event_type from event_log l join edit_tasks t on t.edit_task_id = l.assoc_id ` +
            `where l.assoc_type = ${ASSOC_TYPE_QUERY} and t.title = '${name.replace(/'/g, "''")}' order by l.log_id`
    );
    const saved = out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [id, at, type] = line.split('|');
            return {id: Number(id), at, event: EVENT[type] || type};
        });
    const meant = [...saved].sort((a, b) => (a.at === b.at ? b.id - a.id : a.at < b.at ? 1 : -1));
    const seconds = {};
    for (const row of saved) (seconds[row.at] = seconds[row.at] || []).push(row.event);
    return {saved, meant: meant.map((r) => r.event), sharedSeconds: Object.values(seconds).filter((g) => g.length > 1)};
}

/** The History's lines reduced to the word each event type has in EVENT, top to bottom, to set beside logRows().meant. */
function words(entries) {
    return entries.map((line) => {
        const text = line.replace(/ \[Download\]$/, '');
        if (/ created by /.test(text)) return 'created';
        if (/ posted a response on /.test(text)) return 'posted a response';
        if (/ uploaded by /.test(text)) return 'uploaded';
        if (/ added by /.test(text)) return 'added';
        if (/ removed by /.test(text)) return 'removed';
        return text;
    });
}

/** "History", then the log's rows: what the screen lists, what it is meant to list, and whether the two agree. */
async function historyAndLog(page, app, panel, name, label) {
    const history = await A29.readHistory(page, panel, name, label);
    // the row's "Activity" column, which takes its lines from the top of the same list
    const activity = (await panel.activityCell(name).innerText({timeout: 10_000}).catch(() => null) || '').split('\n').map((t) => t.trim()).filter(Boolean);
    const log = logRows(app, name);
    const shown = words(history.entries);
    return {...history, activity, shown, meant: log.meant, inMeantOrder: JSON.stringify(shown) === JSON.stringify(log.meant), sharedSeconds: log.sharedSeconds, saved: log.saved};
}

module.exports = {A29, SECOND, EVENT, editAddPersonAndFile, logRows, words, historyAndLog};
