/**
 * Announcements through the API (docs/specs/U12-announcements.md "Through
 * the API"). Who may call the announcements routes is the spec's
 * announcements grid, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

/** A unique tag for this test's scratch journal(s). */
function makeTag(check, testInfo) {
    return `u12${check}w${testInfo.workerIndex}${Date.now().toString(36)}`;
}

/** A scratch journal with a manager, seeded with `extra`; its manager's client. */
async function journal(apiAs, pkpApi, tag, extra = {}) {
    const seeded = await pkpApi.createContext({tag, users: [{username: `${tag}mg`, roles: ['manager']}], ...extra});
    const api = await apiAs(`${tag}mg`, {context: tag});
    return {seeded, api};
}

const titles = (res) => res.body.items.map((a) => a.title.en).sort();

test.describe('announcements through the API', () => {
    test('API1: one announcement read back at the journal\'s own address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a1', testInfo);
        const {seeded, api} = await journal(apiAs, pkpApi, tag, {
            announcements: [{title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>', dateExpire: '2099-06-01'}],
        });
        const id = seeded.announcements[0].id;

        const one = await api.get(`announcements/${id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({
            id,
            title: {en: 'Call for papers'},
            descriptionShort: {en: '<p>Deadline 1 June.</p>'},
        });
        expect(one.body.dateExpire).toMatch(/^2099-06-01/);
        expect(one.body.datePosted).toBeTruthy();

        const unknown = await api.get('announcements/999999999');
        expect(unknown.status).toBe(404);
    });

    test('API2: the list filtered by type', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a2', testInfo);
        const {seeded, api} = await journal(apiAs, pkpApi, tag, {
            announcementTypes: [{name: {en: 'Conference'}}, {name: {en: 'Event'}}],
            announcements: [{title: 'Workshop', type: 'Event'}, {title: 'Summit', type: 'Conference'}, {title: 'Notice'}],
        });
        const typeId = (name) => seeded.announcementTypes.find((t) => t.name === name).id;

        const events = await api.get('announcements', {typeIds: typeId('Event')});
        expect(events.status).toBe(200);
        expect(titles(events)).toEqual(['Workshop']);
        expect(events.body.itemsMax).toBe(1);

        const both = await api.get('announcements', {typeIds: `${typeId('Event')},${typeId('Conference')}`});
        expect(titles(both)).toEqual(['Summit', 'Workshop']);

        // Control: unfiltered, the untyped one is listed too.
        expect(titles(await api.get('announcements'))).toEqual(['Notice', 'Summit', 'Workshop']);
    });

    test('API3: another journal\'s announcement is out of reach from this journal\'s address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a3', testInfo);
        const own = await journal(apiAs, pkpApi, tag, {announcements: [{title: 'Our notice'}]});
        const other = await journal(apiAs, pkpApi, `${tag}b`, {announcements: [{title: 'Their notice'}]});
        const theirs = other.seeded.announcements[0].id;

        expect((await own.api.get(`announcements/${theirs}`)).status).toBe(400);
        const edited = await own.api.put(`announcements/${theirs}`, {title: {en: 'Changed from elsewhere'}});
        expect(edited.status).toBe(403);
        expect((await own.api.delete(`announcements/${theirs}`)).status).toBe(403);
        expect(titles(await other.api.get('announcements'))).toEqual(['Their notice']);

        // An add naming the other journal still lands in this one.
        const added = await own.api.post('announcements', {title: {en: 'Placed here'}, assocId: other.seeded.contextId, sendEmail: false});
        expect(added.status).toBe(200);
        expect(titles(await own.api.get('announcements'))).toEqual(['Our notice', 'Placed here']);
        expect(titles(await other.api.get('announcements'))).toEqual(['Their notice']);
    });

    test('API4: a text in a language the journal\'s forms do not offer is refused', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a4', testInfo);
        const {api} = await journal(apiAs, pkpApi, tag);

        const refused = await api.post('announcements', {title: {en: 'Call for papers', fr_CA: 'Appel à contributions'}, sendEmail: false});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(['title', 'fr_CA']);
        expect((await api.get('announcements')).body.itemsMax).toBe(0);

        // Control: the same request in English alone is stored.
        expect((await api.post('announcements', {title: {en: 'Call for papers'}, sendEmail: false})).status).toBe(200);
        expect(titles(await api.get('announcements'))).toEqual(['Call for papers']);
    });
});
