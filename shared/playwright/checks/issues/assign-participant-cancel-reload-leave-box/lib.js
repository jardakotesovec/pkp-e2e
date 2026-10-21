// Helpers of walk.js (issue report docs/issues/U35-A18-assign-participant-cancel-reload-leave-box.md).
// Requiring this file runs nothing. Every helper drives the workflow's "Participants" panel and its
// "Assign Participant" window as a person does; the one page read (unsavedForms) only reads what the
// page's own leave-page handler counts.
const {idle, sql} = require('../../../probe');

/** Per app, on PKP's default test dataset (docs/process/dataset.md): a submission Minoti Inoue is not assigned to. */
const CASES = {
    ojs: {id: 4, role: 'Section editor', person: 'Minoti Inoue', otherRole: 'Author'},
    omp: {id: 3, role: 'Series editor', person: 'Minoti Inoue', otherRole: 'Author'},
    ops: {id: 1, role: 'Moderator', person: 'Minoti Inoue', otherRole: 'Author'},
};

/** Open the submission's workflow from the editorial dashboard's address; returns the Participants panel. */
async function openWorkflow(page, app, id) {
    const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
    const panel = new ParticipantsPanel(page, app.contextPath);
    // Leave the page first: a goto that changes only the query of the page already open reloads nothing.
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    await panel.heading().waitFor({timeout: 60_000});
    await idle(page);
    return panel;
}

/**
 * Collect the page's browser dialogs: a page-leave box is answered "leave" (so the reload goes on), any
 * other dialog by `answer.value` ('dismiss' unless a step sets it). Returns {log, since(t0), answer}.
 */
function dialogLog(page) {
    const log = [];
    const answer = {value: 'dismiss'};
    page.on('dialog', (d) => {
        const how = d.type() === 'beforeunload' ? 'accept' : answer.value;
        log.push({at: Date.now(), type: d.type(), message: d.message(), answered: how});
        (how === 'accept' ? d.accept() : d.dismiss()).catch(() => {});
    });
    return {log, answer, since: (t0) => log.filter((d) => d.at >= t0).map(({type, message, answered}) => ({type, message, answered}))};
}

/**
 * What the page's leave-page handler (SiteHandler.pageUnloadHandler_) counts as unsaved now: every key of
 * SiteHandler.unsavedFormElements_ it iterates, with the form id stored there ("undefined" when the form was
 * registered under no id). The box comes when this list is not empty.
 */
async function unsavedForms(page) {
    return page.evaluate(() => {
        const h = window.$ && $.pkp && $.pkp.classes.Handler.hasHandler($('body')) ? $.pkp.classes.Handler.getHandler($('body')) : null;
        if (!h || !h.unsavedFormElements_) return null;
        const out = [];
        for (const k in h.unsavedFormElements_) if (k) out.push(String(h.unsavedFormElements_[k]));
        return out;
    });
}

/** Reload the page (F5) and report the dialogs it raised and the panel's rows after it. */
async function reload(page, panel, dialogs) {
    const t0 = Date.now();
    await page.reload();
    await panel.heading().waitFor({timeout: 60_000});
    await idle(page);
    return {dialogs: dialogs.since(t0), rowsAfter: await panel.rowLines()};
}

/** The submission's assignments as stored: username|user_group_id. */
function stored(app, id) {
    return sql(
        app,
        `select u.username, sa.user_group_id from stage_assignments sa join users u on u.user_id = sa.user_id where sa.submission_id = ${Number(id)} order by sa.stage_assignment_id`
    )
        .split('\n')
        .filter(Boolean);
}

module.exports = {CASES, openWorkflow, dialogLog, unsavedForms, reload, stored};
