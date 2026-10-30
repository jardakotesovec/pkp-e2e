/**
 * Submission and publisher libraries through the API
 * (docs/specs/U39-submission-and-publisher-libraries.md "Through the API").
 * Who may call the library route is the decision-recording grid of
 * docs/specs/U34-editorial-decision-recording.md, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const names = (res) => res.body.items.map((f) => f.name.en).sort();

test.describe('libraries through the API', () => {
    test('API1: The library list names the Publisher Library and the one submission asked for', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}, libraryFiles: [{name: 'Journal guide', type: 'Other'}]});
        const asked = await j.submission('a', {submitter: 'au', libraryFiles: [{name: 'Asked contract', type: 'Permissions'}]});
        await j.submission('b', {submitter: 'au', libraryFiles: [{name: 'Other contract', type: 'Permissions'}]});
        const api = await j.as('mg');

        const none = await api.get('_library');
        expect(none.status).toBe(200);
        expect(names(none)).toEqual(['Journal guide']);

        const one = await api.get('_library', {includeSubmissionId: asked.submissionId});
        expect(one.status).toBe(200);
        expect(names(one)).toEqual(['Asked contract', 'Journal guide']);
        expect(one.body.itemsMax).toBe(2);
    });
});
