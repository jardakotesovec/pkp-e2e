<?php
/**
 * U52 claim check I27C, evidence not a step: run the code PaypalPaymentPlugin::handle() runs once PayPal
 * has confirmed a payment, OJSPaymentManager::fulfillQueuedPayment(), on one queued payment, catching any
 * Throwable so the state afterwards is still reported (the kept script
 * shared/playwright/checks/issues/paid-member-refused-restricted-galleys/paypal-return.php stops at the
 * first error). The gateway itself is not called. Called by i27c.js (part "fulfil").
 *
 * Usage, in the OJS root, with PKP_CONFIG_FILE naming the install's config:
 *   php <path>/fulfil.php <queuedPaymentId>
 */
define('APP_ROOT', getcwd());
require_once APP_ROOT . '/tools/bootstrap.php';

use APP\core\Application;
use APP\facades\Repo;
use PKP\db\DAORegistry;

class I27cFulfil extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $id = (int) ($this->argv[0] ?? 0);
        $out = ['queuedPaymentId' => $id];
        $queuedPayment = DAORegistry::getDAO('QueuedPaymentDAO')->getById($id);
        if (!$queuedPayment) {
            $out['error'] = 'no such queued payment';
            echo json_encode($out) . "\n";
            return;
        }
        $out += [
            'type' => $queuedPayment->getType(),
            'userId' => $queuedPayment->getUserId(),
            'amount' => $queuedPayment->getAmount(),
            'currency' => $queuedPayment->getCurrencyCode(),
            'requestUrl' => $queuedPayment->getRequestUrl(),
        ];
        $journal = Application::getContextDAO()->getById($queuedPayment->getContextId());
        $paymentManager = Application::get()->getPaymentManager($journal);
        try {
            $out['fulfilled'] = $paymentManager->fulfillQueuedPayment(Application::get()->getRequest(), $queuedPayment, 'PaypalPayment');
        } catch (\Throwable $e) {
            $out['threw'] = get_class($e) . ': ' . $e->getMessage() . ' at ' . str_replace(APP_ROOT . '/', '', $e->getFile()) . ':' . $e->getLine();
        }
        $user = Repo::user()->get($queuedPayment->getUserId(), true);
        $out['dateEndMembership after a fresh load'] = $user ? $user->getData('dateEndMembership') : 'no user';
        $out['queued payment still there'] = (bool) DAORegistry::getDAO('QueuedPaymentDAO')->getById($id);
        echo json_encode($out) . "\n";
    }
}

(new I27cFulfil($argv ?? []))->execute();
