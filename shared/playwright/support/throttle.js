/**
 * @file lib/pkp/playwright/support/throttle.js
 *
 * Opt-in race amplifier for flake hunting: `PLAYWRIGHT_CPU_THROTTLE=<rate>`
 * slows every page's main thread by that factor through the DevTools
 * protocol (Chromium only), so the timing windows a slow CI runner or the
 * 4-core VM opens reproduce on a fast machine. Off unless the variable is
 * set to a number above 1; never set in CI or a final.
 */

const rate = Number(process.env.PLAYWRIGHT_CPU_THROTTLE || 0);

/**
 * Throttle the CPU of every page (and popup) a BrowserContext opens.
 * Call once per context, right after creating it.
 *
 * @param {import('@playwright/test').BrowserContext} context
 */
async function throttleCpu(context) {
    if (!(rate > 1)) {
        return;
    }
    context.on('page', async (page) => {
        try {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Emulation.setCPUThrottlingRate', {rate});
        } catch {
            // A page closed before the session attached, or a non-Chromium
            // browser: throttling is best-effort.
        }
    });
}

module.exports = {throttleCpu, cpuThrottleRate: rate};
