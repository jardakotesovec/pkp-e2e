// @ts-check
/**
 * @file playwright/pages/ReviewSettingsPages.js
 *
 * The press's Settings › Workflow › "Review" screen: the shared page object
 * (`shared/playwright/pages/ReviewSettingsPages.js`) with the press-only
 * parts on top (spec docs/specs/U29-review-setup-and-review-forms.md,
 * register OMP1 and OMP2). A press has three side tabs (no "Reviewer
 * Recommendations"), its library tab reads "Press Library", and "Reviewer
 * Guidance" carries two guideline boxes, "Internal Review Guidelines"
 * (setting `internalReviewGuidelines`, read by Internal Reviewers) above
 * "External Review Guidelines" (setting `reviewGuidelines`, the journal's
 * one box, read by External Reviewers). Everything else is the shared DOM.
 */
const shared = require('../../../../shared/playwright/pages/ReviewSettingsPages.js');

/** The press's side tabs, in screen order. */
const PRESS_SIDE_TABS = ['Setup', 'Reviewer Guidance', 'Review Forms'];
exports.PRESS_SIDE_TABS = PRESS_SIDE_TABS;

/** The press's wording of the library tab. */
const LIBRARY_TAB = 'Press Library';
exports.LIBRARY_TAB = LIBRARY_TAB;

/** The two guideline boxes' headings, in screen order, and their settings. */
const GUIDELINE_BOXES = {
    internal: {heading: 'Internal Review Guidelines', setting: 'internalReviewGuidelines'},
    external: {heading: 'External Review Guidelines', setting: 'reviewGuidelines'},
};
exports.GUIDELINE_BOXES = GUIDELINE_BOXES;

/**
 * "Reviewer Guidance" on a press: the shared form plus the two guideline
 * boxes by their press name.
 */
class PressReviewerGuidanceForm extends shared.ReviewerGuidanceForm {
    /** The "Internal Review Guidelines" box's editable body. */
    get internalBody() {
        return this.richBody(GUIDELINE_BOXES.internal.setting);
    }

    /** The "External Review Guidelines" box's editable body. */
    get externalBody() {
        return this.richBody(GUIDELINE_BOXES.external.setting);
    }

    async typeInternal(text) {
        await this.typeInto(GUIDELINE_BOXES.internal.setting, text);
    }

    async typeExternal(text) {
        await this.typeInto(GUIDELINE_BOXES.external.setting, text);
    }
}
exports.PressReviewerGuidanceForm = PressReviewerGuidanceForm;

/**
 * The press's "Review" settings page: the shared page with the press's
 * guidance form.
 */
class PressReviewSettingsPage extends shared.ReviewSettingsPage {
    constructor(page, contextPath) {
        super(page, contextPath);
        this.guidance = new PressReviewerGuidanceForm(page);
    }

    /** The top tabs' names, in order ("Submission", "Review", "Press Library", …). */
    async topTabNames() {
        const names = await this.topTabs.allInnerTexts();
        return names.map((s) => s.trim());
    }
}
exports.PressReviewSettingsPage = PressReviewSettingsPage;
