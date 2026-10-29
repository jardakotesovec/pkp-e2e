/**
 * Announcements through the API (docs/specs/U12-announcements.md "Through
 * the API"). Who may call the announcements routes is the spec's
 * announcements grid, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

const titles = (res) => res.body.items.map((a) => a.title.en).sort();

test.describe('announcements through the API', () => {
    test('API1: One announcement read back at the journal\'s own address', async ({scratch}) => {
        const j = await scratch({
            announcements: [{title: 'Call for papers', descriptionShort: '<p>Deadline 1 June.</p>', dateExpire: '2099-06-01'}],
        });
        const api = await j.as('mg');
        const id = j.seeded.announcements[0].id;

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

    test('API2: The list filtered by type', async ({scratch}) => {
        const j = await scratch({
            announcementTypes: [{name: {en: 'Conference'}}, {name: {en: 'Event'}}],
            announcements: [{title: 'Workshop', type: 'Event'}, {title: 'Summit', type: 'Conference'}, {title: 'Notice'}],
        });
        const api = await j.as('mg');
        const typeId = (name) => j.seeded.announcementTypes.find((t) => t.name === name).id;

        const events = await api.get('announcements', {typeIds: typeId('Event')});
        expect(events.status).toBe(200);
        expect(titles(events)).toEqual(['Workshop']);
        expect(events.body.itemsMax).toBe(1);

        const both = await api.get('announcements', {typeIds: `${typeId('Event')},${typeId('Conference')}`});
        expect(titles(both)).toEqual(['Summit', 'Workshop']);

        // Control: unfiltered, the untyped one is listed too.
        expect(titles(await api.get('announcements'))).toEqual(['Notice', 'Summit', 'Workshop']);
    });

    test('API3: An add naming another journal lands in this one', async ({scratch}) => {
        const own = await scratch({announcements: [{title: 'Our notice'}]});
        const other = await scratch({announcements: [{title: 'Their notice'}]});
        const ours = await own.as('mg');

        const added = await ours.post('announcements', {title: {en: 'Placed here'}, assocId: other.seeded.contextId, sendEmail: false});
        expect(added.status).toBe(200);
        expect(titles(await ours.get('announcements'))).toEqual(['Our notice', 'Placed here']);
        expect(titles(await (await other.as('mg')).get('announcements'))).toEqual(['Their notice']);
    });

    test('API4: A text in a language the journal\'s forms do not offer is refused', async ({scratch}) => {
        const api = await (await scratch()).as('mg');

        const refused = await api.post('announcements', {title: {en: 'Call for papers', fr_CA: 'Appel à contributions'}, sendEmail: false});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(['title', 'fr_CA']);
        expect((await api.get('announcements')).body.itemsMax).toBe(0);

        // Control: the same request in English alone is stored.
        expect((await api.post('announcements', {title: {en: 'Call for papers'}, sendEmail: false})).status).toBe(200);
        expect(titles(await api.get('announcements'))).toEqual(['Call for papers']);
    });
});
