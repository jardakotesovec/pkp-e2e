// PR review of pkp/pkp-lib#13472 (pkp/pkp-lib#13473 with pkp/ui-library#1012; pkp/ojs#5910 moves the
// pointers): the reviewer popovers of the editorial dashboard's "Editorial Activity" column, walked
// the same way before (the PRs' bases) and after (their heads). As `dbarnes` on PKP's default
// dataset for `main` (a dataset fleet, harness.md "Dataset fleets"), journal or press
// `publicknowledge`: OJS submission 12 (Julie Janssen, Paul Hudson), OMP submission 2 (Al Zacharia,
// Gonzalo Favio), neither reviewer answered. A preprint server has no review: not walked.
//
// MODE=walk (default):
//   days     reviewer A unanswered, "Edit" with the Response Due Date 10, 1 and 0 days ahead, then 1
//            and 3 days ago: the indicator's number, the popover's headline and sentence each time;
//            the 10 and 1 day reads repeated by browsers set to UTC+14 and UTC-11.
//   review   "Log Response" accepted for A, then the Review Due Date 7, 1 and 0 days ahead, 1 and 7
//            days ago (the overdue sentence among them).
//   cancel   "Log Response" accepted for B, "Cancel Reviewer": B's popover, its texts and buttons;
//            B's and A's (overdue) popovers again in French (Canada), whose texts are marked fuzzy.
//   action   the cancelled popover's own action. "Reinstate Reviewer" when offered: its window sent,
//            then B's popover, B's row in the Reviewers panel and B's own review page. Otherwise
//            (before the change) "View details", then "Resend Review Request" sent, and the same reads.
// MODE=nb, the neighbours, on a freshly loaded dataset: A's unanswered popover and its three buttons
//   pressed (each window read, none sent); B logged as declined, the declined popover, its "Resend
//   Review Request" sent, the popover after it. None of this may change with the PRs, the day
//   count on B's resent request aside.
// MODE=tz, the day count alone, for a fleet whose config `time_zone` is not the machine's: the
//   Response Due Date 2, 1 and 0 machine days ahead, then, A accepted, the Review Due Date 2 and 1.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset --apps ojs,omp
// Run:          MODE=<mode> PROBE_FEATURE=<feature> PROBE_AGENT=pr13473 PROBE_RUN=<base|head> node bin/probe.js <ojs|omp> shared/playwright/checks/sync/pkp-lib-13473/popovers.js
// Facts: .reports/<feature>/pr13473/popovers-facts-<mode>-<run>-<app>.json
const {forEachApp, launch, signIn, screen, shot, record, idle} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.env.MODE || 'walk';
const ACCEPTED = 'Reviewer has accepted the invitation to review';
const DECLINED = 'Reviewer has declined the invitation to review';
const ZONES = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'];

/** The window a popover's button opened: its heading and the start of its text. */
async function readWindow(page) {
    const dialogs = page.getByRole('dialog');
    await dialogs.last().waitFor({timeout: H.T});
    await idle(page);
    await H.sleep(800);
    const d = dialogs.last();
    return {
        heading: H.flat(await d.getByRole('heading').first().innerText().catch(() => null), 200),
        forms: await d.locator('form').evaluateAll((fs) => fs.map((f) => f.id)).catch(() => []),
        buttons: (await d.getByRole('button').allInnerTexts().catch(() => [])).map((t) => H.flat(t, 60)).filter(Boolean),
        text: H.flat(await d.innerText().catch(() => null), 400),
    };
}

forEachApp(async (app) => {
    const c = H.CASES[app.name];
    if (!c) { console.log(`[pr13473 ${app.name}] no review: not walked`); return; }
    if (!app.dataset) throw new Error('popovers.js runs on a dataset fleet (fleet-prep --dataset)');
    const o = {app: app.name, mode: MODE, run: process.env.PROBE_RUN || null, machineNow: new Date().toString()};
    const {browser, page, close} = await launch(app);
    let modal = null;
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {threw: H.flat(e.message, 400)}; }
        console.log(`[pr13473 ${app.name} ${MODE}] ${key}`, JSON.stringify(o[key]).slice(0, 2500));
        record(`popovers-${MODE}-${key}`, await screen(page).catch(() => ({url: page.url()})));
        await shot(page, `popovers-${MODE}-${key}`).catch(() => {});
        return o[key];
    };
    const workflow = async () => { modal = await H.openWorkflow(page, app, c.id); };
    /** Set the two due dates of `who`, then read the popover (and, when asked, in the other zones). */
    const dated = (key, who, response, review, {zones = false} = {}) => step(key, async () => {
        await workflow();
        const edit = await H.editDates(page, modal, who.name, H.day(response), H.day(review));
        const out = {...edit, popover: await H.readPopover(page, app, c.id, who.name)};
        if (zones) {
            out.zones = [];
            for (const z of ZONES) out.zones.push(await H.readPopoverIn(browser, page, app, c.id, who.name, z));
        }
        return out;
    });
    const reviewerPage = (who, label) => step(label, async () => {
        const context = await browser.newContext({baseURL: app.baseURL, viewport: {width: 1280, height: 900}});
        try {
            const p = await context.newPage();
            await signIn(p, who.user, {contextPath: app.contextPath});
            const read = await H.W.readReviewPage(p, app, c.id, `popovers-${MODE}-${label}`, {openWindows: false});
            return {...read, text: H.flat(await p.locator('main, body').first().innerText().catch(() => null), 300)};
        } finally {
            await context.close();
        }
    });
    try {
        await step('signin', async () => {
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            await workflow();
            return {
                siteTimeZone: await page.evaluate(() => window.pkp && window.pkp.context && window.pkp.context.timeZone),
                a: await H.panelRow(modal, c.a.name), b: await H.panelRow(modal, c.b.name),
            };
        });
        if (MODE === 'tz') {
            for (const n of [2, 1, 0]) await dated(`response${n}`, c.a, n, 30);
            await step('acceptA', async () => { await workflow(); return H.logResponse(page, modal, c.a.name, ACCEPTED); });
            for (const n of [2, 1]) await dated(`review${n}`, c.a, -14, n);
        } else if (MODE === 'nb') {
            await step('awaiting', () => H.readPopover(page, app, c.id, c.a.name));
            for (const label of ['View details', 'Edit Due Date', 'Unassign']) {
                await step(`awaiting-${label.replace(/\s+/g, '')}`, async () => {
                    await H.pressPopoverButton(page, app, c.id, c.a.name, label);
                    return readWindow(page);
                });
            }
            await step('declineB', async () => { await workflow(); return H.logResponse(page, modal, c.b.name, DECLINED); });
            await step('declined', () => H.readPopover(page, app, c.id, c.b.name));
            await step('declined-resend', async () => {
                await H.pressPopoverButton(page, app, c.id, c.b.name, 'Resend Review Request');
                const win = await readWindow(page);
                const notices = await H.U.submitWindow(page, 'resendRequestReviewerForm', 'Resend Review Request');
                return {window: win, notices};
            });
            await step('resent', () => H.readPopover(page, app, c.id, c.b.name));
            await step('resentRow', async () => { await workflow(); return H.panelRow(modal, c.b.name); });
        } else {
            for (const n of [10, 1, 0]) await dated(`response${n}`, c.a, n, 30, {zones: n > 0});
            for (const n of [-1, -3]) await dated(`response${n}`, c.a, n, 30);
            await step('acceptA', async () => { await workflow(); return H.logResponse(page, modal, c.a.name, ACCEPTED); });
            for (const n of [7, 1, 0, -1, -7]) await dated(`review${n}`, c.a, -14, n);
            await step('acceptB', async () => { await workflow(); return H.logResponse(page, modal, c.b.name, ACCEPTED); });
            await step('cancelB', () => H.cancelReviewer(page, modal, c.b.name));
            const cancelled = await step('cancelled', () => H.readPopover(page, app, c.id, c.b.name));
            await step('cancelledFr', () => H.readPopover(page, app, c.id, c.b.name, 'fr_CA'));
            await step('overdueFr', () => H.readPopover(page, app, c.id, c.a.name, 'fr_CA'));
            const offered = (cancelled && cancelled.buttons) || [];
            if (offered.includes('Reinstate Reviewer')) {
                await step('reinstate', async () => {
                    await H.pressPopoverButton(page, app, c.id, c.b.name, 'Reinstate Reviewer');
                    const win = await readWindow(page);
                    const notices = await H.U.submitWindow(page, 'reinstateReviewerForm', 'Reinstate Reviewer');
                    return {window: win, notices};
                });
            } else {
                if (offered.includes('View details')) {
                    await step('cancelled-ViewDetails', async () => {
                        await H.pressPopoverButton(page, app, c.id, c.b.name, 'View details');
                        return readWindow(page);
                    });
                }
                if (offered.includes('Resend Review Request')) {
                    await step('cancelled-resend', async () => {
                        await H.pressPopoverButton(page, app, c.id, c.b.name, 'Resend Review Request');
                        const win = await readWindow(page);
                        const notices = await H.U.submitWindow(page, 'resendRequestReviewerForm', 'Resend Review Request');
                        return {window: win, notices};
                    });
                }
            }
            await step('afterAction', () => H.readPopover(page, app, c.id, c.b.name));
            await step('afterActionRow', async () => { await workflow(); return {b: await H.panelRow(modal, c.b.name), a: await H.panelRow(modal, c.a.name)}; });
            await step('afterActionA', () => H.readPopover(page, app, c.id, c.a.name));
            await reviewerPage(c.b, 'reviewerB');
        }
    } finally {
        record(`popovers-facts-${MODE}`, o);
        await idle(page).catch(() => {});
        await close();
    }
});
