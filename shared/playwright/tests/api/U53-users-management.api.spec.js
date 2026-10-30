/**
 * Users management through the API (docs/specs/U53-users-management.md
 * "Through the API"). Who may read the journal's users is the users
 * grid's (U53#users), checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('users management through the API', () => {
    test('API1: The list ordered and narrowed as no screen asks', async ({pkpApi, apiAs}) => {
        const tag = `ap53l${Date.now().toString(36)}`;
        const people = [
            {key: 'zi', familyName: 'Zimmer'},
            {key: 'ab', familyName: 'Abbott'},
            {key: 'mi', familyName: 'Mills', disabled: true},
        ];
        await pkpApi.createContext({
            tag,
            users: [
                {username: `${tag}mg`, roles: ['manager']},
                ...people.map(({key, familyName, disabled}) => ({username: `${tag}${key}`, roles: ['author'], givenName: 'Test', familyName, ...(disabled ? {disabled} : {})})),
            ],
        });
        const api = await apiAs(`${tag}mg`, {context: tag});
        const names = async (query) => {
            const res = await api.get('users', query);
            expect(res.status).toBe(200);
            return res.body.items.map((u) => u.userName).filter((u) => people.some(({key}) => u === `${tag}${key}`));
        };

        // By family name, last first: no screen sorts the list (Rule 4).
        expect(await names({orderBy: 'familyName', orderDirection: 'DESC'})).toEqual([`${tag}zi`, `${tag}mi`, `${tag}ab`]);
        // The disabled accounts alone: the list shows both kinds (Rule 2).
        expect(await names({status: 'disabled'})).toEqual([`${tag}mi`]);
        // Control: unfiltered, oldest first, the disabled account listed.
        expect(await names({})).toEqual([`${tag}zi`, `${tag}ab`, `${tag}mi`]);
    });
});
