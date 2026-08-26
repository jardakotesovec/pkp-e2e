// @ts-check
/**
 * @file playwright/pages/EditorialDashboardPage.js
 *
 * OPS editorial dashboard: the shared editorial POM
 * (shared/playwright/pages/EditorialDashboardPage.js) carries the whole
 * surface — the ONLY OPS divergence is the workflow panel's missing
 * "Workflow:" heading, so the same `withOpsWorkflowPanel` mixin the app's
 * MySubmissionsPage uses re-anchors the panel helpers here too.
 * Feature spec: docs/specs/U23-submissions-dashboard.md.
 */
const {EditorialDashboardPage: SharedEditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {withOpsWorkflowPanel} = require('./MySubmissionsPage.js');

exports.EditorialDashboardPage = class EditorialDashboardPage extends withOpsWorkflowPanel(
    SharedEditorialDashboardPage
) {};
