<?php
/**
 * Evidence for issue report U52 A13, not a step: run what PaypalPaymentPlugin::handle() runs once
 * PayPal has confirmed a payment and sends the payer back, on one queued payment (the one a
 * payment page queued), and say how far it got. The gateway itself is not called: these lines
 * are the two that follow it in handle(),
 *
 *     $paymentManager->fulfillQueuedPayment($request, $queuedPayment, $this->getName());
 *     $request->redirectUrl($queuedPayment->getRequestUrl());
 *
 * with the redirect captured by a 'Request::redirect' hook (it runs after redirectUrl()'s own
 * argument check) instead of sending a header. Works in OJS and OMP.
 *
 * Usage, in the app root, with PKP_CONFIG_FILE naming the install's config:
 *   php <path>/paypal-return.php <queuedPaymentId>
 */
define('APP_ROOT', getcwd());
require_once APP_ROOT . '/tools/bootstrap.php';

use APP\core\Application;
use PKP\db\DAORegistry;
use PKP\plugins\Hook;

class PaypalReturn extends \PKP\cliTool\CommandLineTool
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
        $out['type'] = $queuedPayment->getType();
        $out['assocId (property)'] = $queuedPayment->assocId;
        $out['requestUrl'] = $queuedPayment->getRequestUrl();
        $context = Application::getContextDAO()->getById($queuedPayment->getContextId());
        $request = Application::get()->getRequest();
        $paymentManager = Application::get()->getPaymentManager($context);
        $redirectedTo = null;
        Hook::add('Request::redirect', function ($hookName, $args) use (&$redirectedTo) {
            $redirectedTo = $args[0];
            return Hook::ABORT;
        });
        $out['step'] = 'fulfillQueuedPayment';
        try {
            $out['fulfilled'] = $paymentManager->fulfillQueuedPayment($request, $queuedPayment, 'PaypalPayment');
            $out['step'] = 'redirectUrl';
            $request->redirectUrl($queuedPayment->getRequestUrl());
            $out['step'] = 'done';
            $out['redirectedTo'] = $redirectedTo;
        } catch (\Throwable $e) {
            $out['thrown'] = get_class($e) . ': ' . $e->getMessage() . ' in ' . str_replace(APP_ROOT . '/', '', $e->getFile()) . ':' . $e->getLine();
            $out['caughtByHandle'] = $e instanceof \Exception;
            foreach ($e->getTrace() as $frame) {
                if (isset($frame['function'])) {
                    $out['trace'][] = ($frame['class'] ?? '') . ($frame['type'] ?? '') . $frame['function'] . (isset($frame['line']) ? ':' . $frame['line'] : '');
                }
                if (count($out['trace'] ?? []) >= 4) {
                    break;
                }
            }
        }
        $out['queuedPaymentStillThere'] = (bool) DAORegistry::getDAO('QueuedPaymentDAO')->getById($id);
        echo json_encode($out) . "\n";
    }
}

(new PaypalReturn($argv ?? []))->execute();
