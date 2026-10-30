/**
 * @file shared/playwright/support/pkp-ids.js
 *
 * The numbers the REST API speaks in, as lib/pkp names them: each group is
 * one family of PHP constants and each key the constant's name without its
 * prefix, so `ROLE.AUTHOR` is `Role::ROLE_ID_AUTHOR` and a grep for the
 * PHP name finds its source. Only the numbers the API checks use:
 *
 *   const {ROLE, FILE_STAGE} = require('../../support/pkp-ids.js');
 *   groups.find((g) => g.roleId === ROLE.AUTHOR)
 *
 * The same in all three apps unless a key says otherwise. A number a check
 * sends because no constant has it (`{decision: 999}`) stays a literal.
 */

/** `Role::ROLE_ID_*` */
const ROLE = {MANAGER: 16, SUB_EDITOR: 17, REVIEWER: 4096, ASSISTANT: 4097, AUTHOR: 65536, READER: 1048576};

/** `WORKFLOW_STAGE_ID_*` (PKPApplication.php); INTERNAL_REVIEW is a press's alone. */
const STAGE = {SUBMISSION: 1, INTERNAL_REVIEW: 2, EXTERNAL_REVIEW: 3, EDITING: 4, PRODUCTION: 5, DONE: 6};

/** `SubmissionFile::SUBMISSION_FILE_*`; FINAL is the "Draft Files" list. */
const FILE_STAGE = {SUBMISSION: 2, NOTE: 3, REVIEW_FILE: 4, REVIEW_ATTACHMENT: 5, FINAL: 6, COPYEDIT: 9, PRODUCTION_READY: 11, QUERY: 18};

/** `Decision::*` */
const DECISION = {ACCEPT: 2, SEND_TO_PRODUCTION: 7, INITIAL_DECLINE: 8, RETURN_TO_WORKFLOW: 34, RETURN_TO_DONE: 35};

/** `SubmissionEmailLogEventType::*`, an email log entry's `eventType`. */
const EMAIL_EVENT = {EDITOR_NOTIFY_AUTHOR: 0x30000001, REVIEW_NOTIFY_REVIEWER: 0x40000001};

/** `PKPSubmission::STATUS_*`, the same numbers as `PKPPublication::STATUS_*`. */
const STATUS = {PUBLISHED: 3, SCHEDULED: 5};

/** `EditorialTaskType`, a task or discussion's `type`. */
const TASK_TYPE = {DISCUSSION: 1, TASK: 2};

/** `Doi::STATUS_*` */
const DOI_STATUS = {UNREGISTERED: 1, REGISTERED: 3};

/** `ReviewAssignment::REVIEW_ASSIGNMENT_*`, a review's `considered`. */
const REVIEW_ASSIGNMENT = {RECONSIDERED: 2, CONSIDERED: 3};

/** `ReviewerRecommendationType`, a reviewer recommendation's `type`. */
const RECOMMENDATION_TYPE = {APPROVED: 1, REVISIONS_REQUESTED: 3};

/** `PKPApplication::ASSOC_TYPE_*` (PRESS is OMP's `Application`'s). */
const ASSOC_TYPE = {PRESS: 0x0000200, REPRESENTATION: 0x0000209, REVIEW_ROUND: 0x000020b};

/** OPS's `Publication::PUBLICATION_RELATION_*`, a preprint's `relationStatus`. */
const PUBLICATION_RELATION = {PUBLISHED: 3};

module.exports = {ROLE, STAGE, FILE_STAGE, DECISION, EMAIL_EVENT, STATUS, TASK_TYPE, DOI_STATUS, REVIEW_ASSIGNMENT, RECOMMENDATION_TYPE, ASSOC_TYPE, PUBLICATION_RELATION};
