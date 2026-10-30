/**
 * Editorial statistics through the API (docs/specs/U65-editorial-statistics.md
 * "Through the API"). Who may call the editorial figures, the users'
 * figures and the users export is the statistics grid's (U64#statistics),
 * checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** The server's day `n` days back, `YYYY-MM-DD` (the fleets run in UTC). */
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/** A figure of a figures list, by its key (editorial) or id (users). */
const figure = (body, key) => body.find((row) => row.key === key || row.id === key)?.value;

/**
 * A scratch context whose one section (a press: series) holds a received
 * submission, and that section's id with the query key the routes read.
 */
async function journalWithSubmission(scratch, appContext, suffix) {
    const sections = appContext.capabilities.hasSections;
    const j = await scratch({users: {mg: 'manager', au: 'author'}, ...(sections ? {} : {series: [{path: 'mx', title: 'Matrix series'}]})});
    const {submissionId, publicationId} = await j.submission(suffix, {submitter: 'au', ...(sections ? {} : {series: 'mx'})});
    const api = await j.as('mg');
    const version = (await api.get(`submissions/${submissionId}/publications/${publicationId}`)).body;
    return {j, api, key: sections ? 'sectionIds' : 'seriesIds', sectionId: sections ? version.sectionId : version.seriesId};
}

test.describe('editorial statistics through the API', () => {
    test('API1: A range the date picker refuses is refused', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');

        for (const [label, range] of [
            ['ending today', {dateStart: day(30), dateEnd: day(0)}],
            ['starting before 2001-01-01', {dateStart: '2000-12-31', dateEnd: day(1)}],
            ['first date after the second', {dateStart: day(1), dateEnd: day(30)}],
            ['not YYYY-MM-DD', {dateStart: '2026-9-1', dateEnd: day(1)}],
        ]) {
            const refused = await api.get('stats/editorial', range);
            expect(refused.status, label).toBe(400);
            expect(refused.body, label).toHaveProperty('error');
        }

        // Control: the range the page opens on, "Last 90 days".
        const answered = await api.get('stats/editorial', {dateStart: day(91), dateEnd: day(1)});
        expect(answered.status).toBe(200);
        expect(figure(answered.body, 'submissionsReceived')).toBe(0);
    });

    test('API2: A filter naming another journal\'s section counts nothing', async ({scratch, appContext}) => {
        const home = await journalWithSubmission(scratch, appContext, 'h');
        const other = await journalWithSubmission(scratch, appContext, 'o');

        const foreign = {[home.key]: String(other.sectionId)};
        const counted = await home.api.get('stats/editorial', foreign);
        expect(counted.status).toBe(200);
        expect(figure(counted.body, 'submissionsReceived')).toBe(0);

        // Control: the journal's own section counts its submission.
        const own = await home.api.get('stats/editorial', {[home.key]: String(home.sectionId)});
        expect(own.status).toBe(200);
        expect(figure(own.body, 'submissionsReceived')).toBe(1);
    });

    test('API3: The users\' figures read through the API', async ({pkpApi, apiAs}) => {
        const tag = `ap65u${Date.now().toString(36)}`;
        await pkpApi.createContext({
            tag,
            users: [
                {username: `${tag}mg`, roles: ['manager']},
                {username: `${tag}au`, roles: ['author']},
                {username: `${tag}du`, roles: ['author'], disabled: true},
            ],
        });
        const api = await apiAs(`${tag}mg`, {context: tag});

        // Unfiltered: the active accounts, the site administrator's
        // manager role in the new journal among them (Rule 14).
        const active = await api.get('stats/users');
        expect(active.status).toBe(200);
        expect(figure(active.body, 'total')).toBe(3);
        expect(figure(active.body, 65536)).toBe(1);

        const disabled = await api.get('stats/users', {status: 'disabled'});
        expect([figure(disabled.body, 'total'), figure(disabled.body, 65536)]).toEqual([1, 1]);
        const all = await api.get('stats/users', {status: 'all'});
        expect([figure(all.body, 'total'), figure(all.body, 65536)]).toEqual([4, 2]);

        // Registered before yesterday: no author, both made today.
        const earlier = await api.get('stats/users', {registeredBefore: day(1)});
        expect(earlier.status).toBe(200);
        expect(figure(earlier.body, 65536)).toBe(0);
    });

    test('API4: The users export narrowed to another journal\'s role lists no account', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const other = await scratch({users: {mg: 'manager', au: 'author'}});
        const api = await j.as('mg');
        const authorRole = async (client) => (await client.get('userGroups')).body.items.find((g) => g.roleId === 65536).id;
        const lines = (res) => res.body.replace(/^﻿/, '').trim().split('\n');

        const foreign = await api.get('users/report', {userGroupIds: String(await authorRole(await other.as('mg')))});
        expect(foreign.status).toBe(200);
        expect(lines(foreign)).toHaveLength(1);

        // Control: the journal's own author role lists its author.
        const own = await api.get('users/report', {userGroupIds: String(await authorRole(api))});
        expect(lines(own)).toHaveLength(2);
        expect(lines(own)[1]).toContain(j.user('au'));
    });
});
