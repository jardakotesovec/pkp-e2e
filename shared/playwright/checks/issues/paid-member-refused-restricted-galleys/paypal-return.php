<?php
/**
 * Evidence for issue report U51 A33, not a step: run the code PaypalPaymentPlugin::handle() runs
 * once PayPal has confirmed a payment, OJSPaymentManager::fulfillQueuedPayment(), on one queued
 * payment (the one a reader's "user/payMembership" page queued), and say what the account holds
 * afterwards. The gateway itself is not called.
 *
 * Usage, in the OJS root, with PKP_CONFIG_FILE naming the install's config:
 *   php <path>/paypal-return.php <queuedPaymentId>
 */
define('APP_ROOT', getcwd());
require_once APP_ROOT . '/tools/bootstrap.php';

use APP\core\Application;
use APP\facades\Repo;
use PKP\db\DAORegistry;

class PaypalReturn extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $id = (int) ($this->argv[0] ?? 0);
        $queuedPayment = DAORegistry::getDAO('QueuedPaymentDAO')->getById($id);
        if (!$queuedPayment) {
            echo json_encode(['queuedPaymentId' => $id, 'error' => 'no such queued payment']) . "\n";
            return;
        }
        $journal = Application::getContextDAO()->getById($queuedPayment->getContextId());
        $paymentManager = Application::get()->getPaymentManager($journal);
        $fulfilled = $paymentManager->fulfillQueuedPayment(Application::get()->getRequest(), $queuedPayment, 'PaypalPayment');
        $user = Repo::user()->get($queuedPayment->getUserId(), true);
        echo json_encode([
            'queuedPaymentId' => $id,
            'type' => $queuedPayment->getType(),
            'userId' => $queuedPayment->getUserId(),
            'amount' => $queuedPayment->getAmount(),
            'fulfilled' => $fulfilled,
            'dateEndMembership after a fresh load' => $user->getData('dateEndMembership'),
        ]) . "\n";
    }
}

(new PaypalReturn($argv ?? []))->execute();
