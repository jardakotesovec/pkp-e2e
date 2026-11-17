// Helpers of the walk for issue report U50 A23 (an issue published after "Back Issues" was ordered
// goes to the top on MySQL and MariaDB). Requiring this file runs nothing.
const {IssuesAdmin, IssueReader} = require('../../../pages/IssuesPages.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (list) => list.map((s) => s.replace(/\s+/g, ' ').trim());

/** Issues › "Back Issues": the issues' names as listed. */
async function backIssues(page, contextPath) {
    const admin = new IssuesAdmin(page, contextPath);
    await admin.goto('Back Issues');
    await sleep(500);
    return clean(await admin.names('Back Issues').allInnerTexts());
}

/** The journal's home, then "Archives" in its header: the issues' titles as listed. */
async function archive(page, contextPath) {
    const reader = new IssueReader(page, contextPath);
    await reader.gotoHome();
    await reader.pressHeader('Archives');
    return clean(await reader.summaryTitles().allInnerTexts());
}

/** "Back Issues" › "Order", drag `name` above `target`, "Done". Returns the save's status. */
async function orderAbove(page, contextPath, name, target) {
    const admin = new IssuesAdmin(page, contextPath);
    await admin.goto('Back Issues');
    const ordering = admin.backOrdering();
    await ordering.start();
    await admin.dragBackIssueAbove(name, target);
    const response = await ordering.done();
    return response ? response.status() : null;
}

/**
 * "Back Issues" › "Order", drag `name` below `target`, "Done". Returns the save's status.
 * (The mouse moves of dragRowBelow in shared/playwright/pages/IssuesPages.js, which does not export it.)
 */
async function orderBelow(page, contextPath, name, target) {
    const admin = new IssuesAdmin(page, contextPath);
    await admin.goto('Back Issues');
    const ordering = admin.backOrdering();
    await ordering.start();
    const moving = admin.issueRow('Back Issues', name);
    await moving.scrollIntoViewIfNeeded();
    const from = await moving.boundingBox();
    const to = await admin.issueRow('Back Issues', target).boundingBox();
    const x = from.x + 40;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, from.y + from.height / 2 + 6, {steps: 4});
    await page.mouse.move(x, to.y + to.height - 4, {steps: 20});
    await page.mouse.move(x, to.y + to.height + 8, {steps: 6});
    await page.mouse.up();
    const response = await ordering.done();
    return response ? response.status() : null;
}

/** "Future Issues" › the row's "Publish Issue", untick the email box, "OK". */
async function publishIssue(page, contextPath, name) {
    const admin = new IssuesAdmin(page, contextPath);
    await admin.goto('Future Issues');
    const publish = await admin.openPublish(name);
    await publish.mailBox().uncheck();
    await publish.ok();
}

/**
 * Issues › "Back Issues" › the issue's "Edit" › "Issue Data" › "Save", changing nothing (IssueForm
 * saves through Repo::issue()->edit(), so the journal's order is renumbered).
 * (After shared/playwright/checks/issues/oai-datestamp-no-issue-mysql/lib.js.)
 */
async function saveIssueData(page, contextPath, issueName) {
    const admin = new IssuesAdmin(page, contextPath);
    await admin.goto('Back Issues');
    const win = await admin.openManagement('Back Issues', issueName);
    const form = await win.openData();
    const response = await form.save();
    return response ? response.status() : null;
}

module.exports = {sleep, clean, backIssues, archive, orderAbove, orderBelow, publishIssue, saveIssueData};
