/**
 * Payments and APCs through the API (docs/specs/U52-payments-and-apcs.md
 * "Through the API"). Who may call the payments routes is the spec's
 * payments-setup and apc-record grids, checked by the matrix
 * (docs/process/api.md), never here. Nothing here reaches a payment
 * service: the manual method only.
 */
const {test, expect} = require('../../support/base-test.js');

const PAYMENTS = {enabled: true, currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Pay by bank transfer.'};

test.describe('payments and APCs through the API', () => {
    test('API1: A currency not on the list is refused', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasPayments, 'a preprint server has no payments (U52 scenario 7)');
        const j = await scratch({payments: PAYMENTS});
        const api = await j.as('mg');
        const currency = async () => (await api.get(`contexts/${j.seeded.contextId}`)).body.currency;

        for (const code of ['XYZ', 'usd', 'US Dollar']) {
            const refused = await api.put('_payments', {currency: code});
            expect(refused.status, code).toBe(400);
            expect(refused.body, code).toHaveProperty('currency');
        }
        expect(await currency()).toBe('USD');

        // Control: a currency of the list is stored.
        const saved = await api.put('_payments', {currency: 'EUR'});
        expect(saved.status).toBe(200);
        expect(await currency()).toBe('EUR');
    });

    test('API2: A fee record the menu does not offer is refused', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal charges an APC (U52 Rule 4)');
        const j = await scratch({users: {mg: 'manager', au: 'author'}, payments: {...PAYMENTS, publicationFee: 50}});
        const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
        const api = await j.as('mg');
        const route = `_submissions/${submissionId}/payment`;
        const status = async () => {
            const form = await api.get(`submissions/${submissionId}/publications/${publicationId}/_components/submissionPayment`);
            expect(form.status).toBe(200);
            return form.body.fields.find((f) => f.name === 'publicationFeeStatus').value;
        };
        expect(await status()).toBe('unpaid');

        for (const body of [{publicationFeeStatus: 'refunded'}, {publicationFeeStatus: ''}, {}]) {
            const refused = await api.put(route, body);
            expect(refused.status, JSON.stringify(body)).toBe(400);
            expect(refused.body, JSON.stringify(body)).toHaveProperty('publicationFeeStatus');
        }
        expect(await status()).toBe('unpaid');

        // Control: "Waived" is recorded.
        const saved = await api.put(route, {publicationFeeStatus: 'waived'});
        expect(saved.status).toBe(200);
        expect(await status()).toBe('waived');
    });
});
