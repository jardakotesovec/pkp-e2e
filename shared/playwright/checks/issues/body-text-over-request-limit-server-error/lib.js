// Helpers for walk.js (body-text-over-request-limit-server-error). Requiring this file runs nothing.
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A plain text of `lines` lines of `width` characters (about lines × width bytes). */
function bigText(lines, width = 10_000) {
    return `u48n13a paragraph `.padEnd(width - 1, 'x').concat('\n').repeat(lines);
}

/** Write `text` to the clipboard and paste it into the focused editor, replacing what it holds. */
async function pasteInto(page, editor, text) {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.evaluate(async (t) => navigator.clipboard.writeText(t), text);
    await page.keyboard.press('ControlOrMeta+v');
}

/** The open "Error" window's text, then its "OK" pressed; null when none is open. */
async function takeErrorWindow(page) {
    const w = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
    if (!(await w.isVisible().catch(() => false))) return null;
    const text = flat(await w.innerText(), 300);
    await w.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
    await sleep(400);
    return text;
}

/** Wait for the next POST whose address matches `re`, after `action`; its status and body (≤300 chars). */
async function answerOf(page, re, action, timeout = 120_000) {
    const resp = page.waitForResponse((r) => re.test(r.url()) && r.request().method() === 'POST', {timeout}).catch(() => null);
    await action();
    const r = await resp;
    if (!r) return {status: null};
    const req = r.request();
    const body = await r.text().catch(() => null);
    return {status: r.status(), override: req.headers()['x-http-method-override'] || null,
        sentBytes: (req.postDataBuffer() || Buffer.alloc(0)).length, body: flat(body, 300)};
}

module.exports = {flat, sleep, bigText, pasteInto, takeErrorWindow, answerOf};
