<?php

/**
 * @file classes/notification/Notification.php
 *
 * pkp-e2e overlay (docs/tracking/app-changes.md row 12). OPS ships no
 * APP\notification\Notification, but lib/pkp's
 * api/v1/submissions/tasks/EditorialTaskController.php imports it, so saving
 * a discussion or task on OPS fails with 'Class "APP\notification\Notification"
 * not found'. This mirrors OJS's empty-subclass pattern with no app-specific
 * types. Remove once the apps carry the class upstream.
 *
 * @class Notification
 *
 * @brief OPS subclass for Notifications (no OPS-specific types).
 */

namespace APP\notification;

class Notification extends \PKP\notification\Notification
{
}
