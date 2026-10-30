/**
 * Usage statistics through the API (docs/specs/U64-usage-statistics.md
 * "Through the API"). Who may call the statistics routes is the grids'
 * (U64#statistics, U64#statistics-work, U64#sushi), checked by the matrix
 * (docs/process/api.md), never here. The figures are seeded the way the
 * spec's scenarios seed them: `usage[]` on the scenarios' works and
 * issues (scenarios.md).
 */
const {test, expect} = require('../../support/base-test.js');

/** The server's day `n` days back, `YYYY-MM-DD` (the fleets run in UTC). */
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/** A published work with visits on the given days (a date before every visit day). */
const work = (j, suffix, usage) => j.submission(suffix, {submitter: 'au', published: true, datePublished: '2024-01-15', usage});

test.describe('usage statistics through the API', () => {
    test('API1: One work\'s figures read on their own', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId} = await work(j, 'w', [{daysAgo: 2, abstractViews: 4}, {daysAgo: 40, abstractViews: 3}]);
        const api = await j.as('mg');

        const lastMonth = await api.get(`stats/publications/${submissionId}`, {dateStart: day(31), dateEnd: day(1)});
        expect(lastMonth.status).toBe(200);
        expect(lastMonth.body).toMatchObject({abstractViews: 4, galleyViews: 0, publication: {id: submissionId}});
        expect((await api.get(`stats/publications/${submissionId}`)).body.abstractViews).toBe(7);

        const timeline = await api.get(`stats/publications/${submissionId}/timeline`, {timelineInterval: 'day', dateStart: day(2), dateEnd: day(2)});
        expect(timeline.status).toBe(200);
        expect(timeline.body).toEqual([expect.objectContaining({date: day(2), value: 4})]);

        // Unknown: a number no work has.
        expect((await api.get('stats/publications/99999999')).status).toBe(404);
    });

    test('API2: The figures narrowed to chosen works', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const a = await work(j, 'a', [{daysAgo: 2, abstractViews: 4}]);
        const b = await work(j, 'b', [{daysAgo: 2, abstractViews: 2}]);
        const other = await scratch({users: {mg: 'manager', au: 'author'}});
        const c = await work(other, 'c', [{daysAgo: 2, abstractViews: 9}]);
        const api = await j.as('mg');
        const range = {dateStart: day(31), dateEnd: day(1)};

        const one = await api.get('stats/publications', {...range, submissionIds: String(a.submissionId)});
        expect(one.status).toBe(200);
        expect(one.body.itemsMax).toBe(1);
        expect(one.body.items.map((i) => [i.publication.id, i.abstractViews])).toEqual([[a.submissionId, 4]]);

        const timeline = await api.get('stats/publications/timeline', {timelineInterval: 'day', dateStart: day(2), dateEnd: day(2), submissionIds: String(b.submissionId)});
        expect(timeline.body).toEqual([expect.objectContaining({date: day(2), value: 2})]);

        // Another journal's work: not listed, and its visits not counted.
        const foreign = await api.get('stats/publications', {...range, submissionIds: String(c.submissionId)});
        expect(foreign.body).toEqual({items: [], itemsMax: 0});
        const foreignTimeline = await api.get('stats/publications/timeline', {timelineInterval: 'day', dateStart: day(2), dateEnd: day(2), submissionIds: String(c.submissionId)});
        expect(foreignTimeline.body).toEqual([expect.objectContaining({date: day(2), value: 0})]);

        // Control: unfiltered, both works.
        expect((await api.get('stats/publications', range)).body.itemsMax).toBe(2);
    });

    test('API3: One issue\'s figures read on their own', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has issues');
        const j = await scratch({issues: [{volume: 3, number: 1, year: 2024, published: true, usage: [{daysAgo: 2, views: 5}]}]});
        const issueId = j.seeded.issues[0].id;
        const api = await j.as('mg');

        const res = await api.get(`stats/issues/${issueId}`, {dateStart: day(31), dateEnd: day(1)});
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({tocViews: 5, issueGalleyViews: 0, issue: {id: issueId, identification: 'Vol. 3 No. 1 (2024)'}});

        // Unknown: a number no issue has is refused.
        expect((await api.get('stats/issues/99999999')).status).toBe(401);
    });

    test('API4: Ranges, intervals and orders no page sends are refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        await work(j, 'w', [{daysAgo: 2, abstractViews: 4}]);
        const api = await j.as('mg');

        const refusals = [
            ['stats/publications', {dateStart: day(31), dateEnd: day(0)}],
            ['stats/publications', {dateStart: '2000-12-31', dateEnd: day(1)}],
            ['stats/publications', {dateStart: day(1), dateEnd: day(31)}],
            ['stats/publications', {orderDirection: 'sideways'}],
            ['stats/publications/timeline', {timelineInterval: 'week'}],
            ['stats/contexts', {dateStart: day(31), dateEnd: day(0)}],
        ];
        for (const [route, query] of refusals) {
            const res = await api.get(route, query);
            expect(res.status, `${route} ${JSON.stringify(query)}`).toBe(400);
            expect(res.body, `${route} ${JSON.stringify(query)}`).toHaveProperty('error');
        }

        // Control: the range the page opens on is answered.
        const control = await api.get('stats/publications', {dateStart: day(31), dateEnd: day(1)});
        expect(control.status).toBe(200);
        expect(control.body.itemsMax).toBe(1);
    });

    test('API5: The SUSHI customer lookup', async ({scratch}) => {
        const j = await scratch();
        const other = await scratch();
        const api = await j.as('mg');
        const institution = async (client, name) => {
            const res = await client.post('institutions', {name: {en: name}, ror: 'https://ror.org/03yrm5c26'});
            expect(res.status).toBe(200);
            return res.body.id;
        };
        const own = await institution(api, 'Okapi Institute');
        const theirs = await institution(await other.as('mg'), 'Wombat Institute');

        const world = await api.get('stats/sushi/members', {customer_id: 0});
        expect(world.status).toBe(200);
        expect(world.body).toEqual([{Customer_ID: 0, Name: 'The World'}]);

        const member = await api.get('stats/sushi/members', {customer_id: own});
        expect(member.body).toEqual([{
            Customer_ID: own,
            Name: 'Okapi Institute',
            Institution_ID: [{Type: 'ROR', Value: 'https://ror.org/03yrm5c26'}, {Type: 'Proprietary', Value: `${j.path}:${own}`}],
        }]);

        // Another journal's institution, and no customer: COUNTER's exception 1030.
        for (const query of [{customer_id: theirs}, {}]) {
            const res = await api.get('stats/sushi/members', query);
            expect(res.status, JSON.stringify(query)).toBe(400);
            expect(res.body, JSON.stringify(query)).toMatchObject({Code: 1030, Severity: 'Fatal'});
        }
    });
});
