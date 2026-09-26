// @ts-check
/**
 * @file playwright/pages/DecisionSettingsPages.js
 *
 * The settings screens the decision-recording scenarios (feature U34, spec
 * docs/specs/U34-editorial-decision-recording.md, "Settings that modify
 * behavior") set on a scratch press before their first step, since no
 * scenario key covers them yet (scenarios.md "Field shapes not built yet":
 * `notifyAllAuthors`, the email templates). OMP-owned (PRINCIPLES M1),
 * copied from the OJS tree's file of the same name; a press has no fee
 * page, so the journal's payments set-up has no counterpart here.
 *
 * - `ManageEmailsPage`, `WorkflowEmailsSettingsPage` — Settings › Workflow ›
 *   "Emails" and "Manage Emails", now in the shared
 *   `shared/playwright/pages/EmailsPages.js` (U56) and re-exported here.
 */
// Moved to the shared tree for U56 (Emails management); re-exported here
// so the U34 suite's imports stay as they were.
const {ManageEmailsPage, WorkflowEmailsSettingsPage} = require('../../../../shared/playwright/pages/EmailsPages.js');

exports.ManageEmailsPage = ManageEmailsPage;
exports.WorkflowEmailsSettingsPage = WorkflowEmailsSettingsPage;
