/**
 * Citations & references through the API
 * (docs/specs/U42-citations-and-references.md "Through the API"). Who may
 * call the references and data citations routes is the edit gate's and
 * the publication pages' grids, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const routes = ({submissionId, publicationId}) => {
    const base = `submissions/${submissionId}/publications/${publicationId}`;
    return {citations: `${base}/citations`, dataCitations: `${base}/dataCitations`};
};

test.describe('citations and references through the API', () => {
    test('API1: A data citation\'s relationship or identifier type outside its list is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {dataCitations} = routes(await j.submission('s', {submitter: 'au'}));
        const api = await j.as('mg');

        const relationship = await api.post(dataCitations, {title: 'Unknown relation set', relationshipType: 'cited'});
        expect(relationship.status).toBe(400);
        expect(relationship.body).toHaveProperty('relationshipType');
        const identifier = await api.post(dataCitations, {
            title: 'Unknown identifier set',
            relationshipType: 'supporting',
            identifierType: 'FOO',
            identifier: '10.1234/abcd',
        });
        expect(identifier.status).toBe(400);
        expect(identifier.body).toHaveProperty('identifierType');
        expect((await api.get(dataCitations)).body.itemsMax).toBe(0);

        // Control: a relationship type from the list is stored.
        const added = await api.post(dataCitations, {title: 'Known relation set', relationshipType: 'supporting'});
        expect(added.status).toBe(200);
        expect((await api.get(dataCitations)).body.items.map((d) => d.title)).toEqual(['Known relation set']);
    });

    test('API2: A reference or a data citation naming another publication is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const first = await j.submission('a', {submitter: 'au'});
        const second = await j.submission('b', {submitter: 'au'});
        const own = routes(first);
        const other = routes(second);
        const api = await j.as('mg');
        const elsewhere = {publicationId: second.publicationId};

        expect((await api.post(`${own.citations}/importAdditionalCitations`, {rawCitations: 'Alpha study 2020'})).status).toBe(200);
        const [reference] = (await api.get(own.citations)).body.items;
        const dataCitation = await api.post(own.dataCitations, {title: 'Ocean temperature records', relationshipType: 'supporting'});
        expect(dataCitation.status).toBe(200);

        const add = await api.post(own.dataCitations, {title: 'Moved dataset', relationshipType: 'supporting', ...elsewhere});
        expect(add.status).toBe(400);
        expect(add.body).toHaveProperty('publicationId');
        for (const path of [`${own.citations}/${reference.id}`, `${own.dataCitations}/${dataCitation.body.id}`]) {
            const edit = await api.put(path, elsewhere);
            expect(edit.status, path).toBe(400);
            expect(edit.body, path).toHaveProperty('publicationId');
        }

        // Control: nothing reached the other publication, and the first's stay its own.
        expect((await api.get(other.citations)).body.itemsMax).toBe(0);
        expect((await api.get(other.dataCitations)).body.itemsMax).toBe(0);
        expect((await api.get(`${own.citations}/${reference.id}`)).body).toMatchObject({publicationId: first.publicationId, rawCitation: 'Alpha study 2020'});
        expect((await api.get(own.dataCitations)).body.items.map((d) => d.title)).toEqual(['Ocean temperature records']);
    });

    test('API3: The reference list reads in pages, in the order the references were added', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {citations} = routes(await j.submission('s', {submitter: 'au'}));
        const api = await j.as('mg');
        const texts = ['Alpha study 2020', 'Beta trial 2021', 'Gamma report 2022'];
        expect((await api.post(`${citations}/importAdditionalCitations`, {rawCitations: texts.join('\n')})).status).toBe(200);
        const textOf = async (item) => (await api.get(`${citations}/${item.id}`)).body.rawCitation;

        const first = await api.get(citations, {count: 2});
        expect(first.status).toBe(200);
        expect(first.body.itemsMax).toBe(3);
        expect(await Promise.all(first.body.items.map(textOf))).toEqual(texts.slice(0, 2));

        const second = await api.get(citations, {count: 2, offset: 2});
        expect(second.body.itemsMax).toBe(3);
        expect(await Promise.all(second.body.items.map(textOf))).toEqual(['Gamma report 2022']);

        const one = await api.get(`${citations}/${first.body.items[0].id}`);
        expect(one.status).toBe(200);
        expect(one.body.rawCitation).toBe('Alpha study 2020');
    });
});
