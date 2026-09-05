/**
 * @file playwright/pages/ReviewSettingsPages.js
 *
 * OMP-local Page Objects for Settings › Workflow › "Review": the shared
 * page (shared/playwright/pages/ReviewSettingsPages.js) with the press's
 * "Reviewer Guidance" form, which carries two guideline boxes, "Internal
 * Review Guidelines" and "External Review Guidelines", above "Competing
 * Interests" (spec: docs/specs/U29-review-setup-and-review-forms.md,
 * register OMP2). A press has three side tabs (no "Reviewer
 * Recommendations", OMP1). DOM anchors live-confirmed by the U29 probes
 * (2026-09-05, `.reports/U29/screen-notes.md`, pB and ccK3).
 */
const shared = require('../../../../shared/playwright/pages/ReviewSettingsPages.js');

/** The press's "Setup" box labels where they differ from the journal's. */
const SETUP_BOX_LABELS = {
    publicComments: 'Make reviewer comments publicly visible with published content',
    restrictFileAccess: 'Reviewers will have access to the submission file only after agreeing to review it.',
    oneClickAccess: 'Include a secure link in the email invitation to reviewers.',
    reviewerSuggestions: 'Allow authors to suggest potential reviewers at submission process',
};
exports.SETUP_BOX_LABELS = SETUP_BOX_LABELS;

/** The press's "Reviewer Guidance" form: the internal box is the first field. */
class ReviewerGuidanceForm extends shared.ReviewerGuidanceForm {
    /** "Internal Review Guidelines" (Internal Reviewers' step 2). */
    get internalGuidelinesBody() {
        return this.body('internalReviewGuidelines');
    }

    /** "External Review Guidelines" (External Reviewers' step 2; the journal's "Review Guidelines"). */
    get externalGuidelinesBody() {
        return this.guidelinesBody;
    }
}
exports.ReviewerGuidanceForm = ReviewerGuidanceForm;

exports.ReviewSettingsPage = class ReviewSettingsPage extends shared.ReviewSettingsPage {
    constructor(page, contextPath) {
        super(page, contextPath);
        this.guidance = new ReviewerGuidanceForm(page);
    }
};

exports.ReviewSetupForm = shared.ReviewSetupForm;
exports.ReviewFormsGrid = shared.ReviewFormsGrid;
exports.ReviewFormWindow = shared.ReviewFormWindow;
exports.FormItemWindow = shared.FormItemWindow;
exports.ITEM_TYPE_LABELS = shared.ITEM_TYPE_LABELS;
exports.dialogWith = shared.dialogWith;
exports.confirmDialog = shared.confirmDialog;
