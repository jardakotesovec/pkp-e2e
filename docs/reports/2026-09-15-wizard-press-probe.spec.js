// Probe for docs/reports/2026-09-15-flake-investigation.md section 2: is a
// wizard Continue press lost when the mouse-down/mouse-up gap straddles the
// step rail's animated scroll? Not a suite test. To run it, copy it into
// apps/ojs/playwright/tests/ and:
//
//   PLAYWRIGHT_CPU_THROTTLE=6 PROBE_GAPS=0,40,120 PROBE_TRIALS=8 \
//     npx playwright test -c configs/ojs.config.js apps/ojs/playwright/tests/<copy>.spec.js --workers 3 --reporter=list
//
// Each trial seeds a draft, presses Continue once (the step changes, the rail
// starts its 500 ms scroll), then presses again with the given gap and reports
// whether the rail moved, plus the scroll position and focused element.
const {test, expect} = require('../../../../shared/playwright/support/base-test.js');

const JOURNAL = 'publicknowledge';
const GAPS = (process.env.PROBE_GAPS || '0,40,80,150').split(',').map(Number);
const TRIALS = Number(process.env.PROBE_TRIALS || 6);

test.describe('probe: wizard press vs scroll animation', () => {
    for (const gap of GAPS) {
        test(`probe gap ${gap}ms`, async ({asUser, pkpApi}, testInfo) => {
            test.setTimeout(600_000);
            const results = [];
            const page = await (await asUser('author.alex')).newPage();
            for (let t = 0; t < TRIALS; t++) {
                const tag = `prb${gap}g${t}${Math.random().toString(36).slice(2, 6)}`;
                const {submissionId} = await pkpApi.createSubmission({
                    tag, context: JOURNAL, submitter: 'author.alex', title: `Probe ${tag}`, submitted: false,
                });
                await page.goto(`/index.php/${JOURNAL}/submission?id=${submissionId}`);
                const rail = page.locator('.pkpSteps__step__label--current');
                const cont = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
                await expect(rail).toBeVisible({timeout: 30_000});
                const first = (await rail.textContent()).trim();
                // A normal press: the step changes, the rail starts its 500 ms scroll.
                await cont.click();
                await expect(rail).not.toHaveText(first, {timeout: 15_000});
                const second = (await rail.textContent()).trim();
                // The press under test, issued the instant the step became current,
                // with a load-sized gap between mouse-down and mouse-up.
                const sample = () => page.evaluate(() => {
                    const btn = [...document.querySelectorAll('.submissionWizard__footer button')].find((b) => b.textContent.trim() === 'Continue');
                    const r = btn && btn.getBoundingClientRect();
                    const ifr = document.querySelector('.tox-edit-area__iframe');
                    const ir = ifr && ifr.getBoundingClientRect();
                    return {
                        rm: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
                        y: Math.round(window.scrollY),
                        docH: document.documentElement.scrollHeight,
                        btnDocY: r && Math.round(r.top + window.scrollY),
                        btnViewY: r && Math.round(r.top),
                        ifrDocY: ir && Math.round(ir.top + window.scrollY),
                        ifrH: ir && Math.round(ir.height),
                        active: document.activeElement && (document.activeElement.tagName + '.' + (document.activeElement.className || '').toString().slice(0, 30)),
                    };
                });
                const before = await sample();
                await cont.click({delay: gap});
                const after = await sample();
                let hit = true;
                try {
                    await expect(rail).not.toHaveText(second, {timeout: 3_000});
                } catch {
                    hit = false;
                }
                results.push({trial: t, from: second, hit, before, after});
            }
            console.log(`PROBE gap=${gap} lost=${results.filter((r) => !r.hit).length}/${TRIALS} ` + JSON.stringify(results));
            await testInfo.attach('results', {body: JSON.stringify(results, null, 1)});
        });
    }
});
