/**
 * DOIs through the API (docs/specs/U45-dois.md "Through the API"). Who may
 * call the DOI routes is the spec's DOIs and registration grids, checked by
 * the matrix (docs/process/api.md), never here. No scratch journal here
 * has a registration agency, so nothing is ever sent to one.
 */
const {test, expect} = require('../../support/base-test.js');
const {DOI_STATUS, REVIEW_ASSIGNMENT} = require('../../support/pkp-ids.js');

const uniqueDoi = (prefix) => `${prefix}/api.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The DOI record of a submission's version, or null. */
async function doiOf(api, {submissionId, publicationId}) {
    const res = await api.get(`submissions/${submissionId}/publications/${publicationId}`);
    expect(res.status).toBe(200);
    return res.body.doiObject || null;
}

test.describe('DOIs through the API', () => {
    test('API1: A DOI record added naming another journal lands in this one', async ({scratch}) => {
        const own = await scratch({doiPrefix: '10.1234'});
        const other = await scratch({doiPrefix: '10.1234'});
        const ours = await own.as('mg');
        const doi = uniqueDoi('10.1234');

        const added = await ours.post('dois', {doi, contextId: other.seeded.contextId});
        expect(added.status).toBe(200);
        expect(added.body).toMatchObject({doi, contextId: own.seeded.contextId});
        const one = await ours.get(`dois/${added.body.id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({doi, contextId: own.seeded.contextId, status: DOI_STATUS.UNREGISTERED});
        expect((await ours.get('dois')).body.items.map((d) => d.doi)).toEqual([doi]);
        expect((await (await other.as('mg')).get('dois')).body.itemsMax).toBe(0);
    });

    test('API2: Without a registration agency, export and deposit are refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}, doiPrefix: '10.1234'});
        const work = await j.submission('w', {submitter: 'au', published: true});
        const api = await j.as('mg');
        expect((await api.post('dois/submissions/assignDois', {ids: [work.submissionId]})).status).toBe(200);
        const before = await doiOf(api, work);
        expect(before).toMatchObject({status: DOI_STATUS.UNREGISTERED});

        for (const action of ['export', 'deposit']) {
            const refused = await api.put(`dois/submissions/${action}`, {ids: [work.submissionId]});
            expect(refused.status, action).toBe(400);
            expect(refused.body, action).toHaveProperty('error');
        }
        const all = await api.put('dois/depositAll', {});
        expect(all.status).toBe(200);
        expect(await doiOf(api, work)).toMatchObject({id: before.id, doi: before.doi, status: DOI_STATUS.UNREGISTERED});
    });

    test('API3: A registration agency no agency plugin offers is refused', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const route = `contexts/${j.seeded.contextId}/registrationAgency`;

        const refused = await api.put(route, {registrationAgency: 'nosuchagencyplugin'});
        expect(refused.status).toBe(400);
        expect(refused.body.error).toMatch(/registration agency plugin/i);

        // Control: "None" is saved.
        const none = await api.put(route, {registrationAgency: null});
        expect(none.status).toBe(200);
        expect(none.body).toEqual({registrationAgency: null});
    });

    test('API4: A chapter without its own page takes no DOI', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasCatalog, 'only a press has chapters (Rule 47)');
        const j = await scratch({users: {mg: 'manager', au: 'author'}, doiPrefix: '10.1234', enabledDoiTypes: ['publication', 'chapter'], doiCreationTime: 'never'});
        const book = await j.submission('b', {
            submitter: 'au',
            chapters: [{title: 'Without a page'}, {title: 'With a page', page: true}],
        });
        const api = await j.as('mg');
        const [bare, paged] = book.chapters;
        const chapterDoi = async (chapter) => {
            const version = await api.get(`submissions/${book.submissionId}/publications/${book.publicationId}`);
            expect(version.status).toBe(200);
            return version.body.chapters.find((c) => c.id === chapter.id).doiId ?? null;
        };

        // "Chapter Page" unticked: the DOIs page greys the row out.
        const doi = await api.post('dois', {doi: uniqueDoi('10.1234')});
        expect(doi.status).toBe(200);
        const refused = await api.put(`_dois/chapters/${bare.id}`, {doiId: doi.body.id});
        expect(refused.status).toBe(403);
        expect(refused.body.error).toBe('A DOI cannot be assigned to this item.');
        expect(await chapterDoi(bare)).toBeNull();

        // Control: the chapter with its own page takes it.
        expect((await api.put(`_dois/chapters/${paged.id}`, {doiId: doi.body.id})).status).toBe(200);
        expect(await chapterDoi(paged)).toBe(doi.body.id);
    });

    test('API5: A review not shown publicly takes no DOI', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has peer-review DOIs (Rule 7)');
        const j = await scratch({
            users: {mg: 'manager', au: 'author', rv: 'externalReviewer'},
            doiPrefix: '10.1234',
            enabledDoiTypes: ['publication', 'peerReview'],
            doiCreationTime: 'never',
        });
        const api = await j.as('mg');
        // A review submitted and read ("Mark as Complete"), its "Public
        // Visibility" as the journal's default gives it at the assignment.
        const review = async (suffix, visible) => {
            const saved = await api.put(`contexts/${j.seeded.contextId}`, {defaultReviewPublicVisibility: visible});
            expect(saved.status).toBe(200);
            const work = await j.submission(suffix, {
                submitter: 'au',
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'completed'}]}],
            });
            const id = work.reviewAssignments[0].id;
            const read = await api.put(`submissions/${work.submissionId}/reviewAssignments/${id}/consider`, {considered: REVIEW_ASSIGNMENT.CONSIDERED});
            expect(read.status).toBe(200);
            return {work, id};
        };
        const reviewDoi = async ({work, id}) => {
            const res = await api.get(`submissions/${work.submissionId}/reviewAssignments/${id}`);
            expect(res.status).toBe(200);
            // Read either way: the review's DOI comes back as the server's
            // own object, its fields under `_data` (OJS14).
            const doi = res.body.doiObject;
            return doi ? (doi.id ?? doi._data?.id) : null;
        };
        const hidden = await review('h', false);
        const shown = await review('s', true);
        const doi = await api.post('dois', {doi: uniqueDoi('10.1234')});
        expect(doi.status).toBe(200);

        // Not shown publicly: the DOIs page lists no row for it.
        const refused = await api.put(`_dois/peerReviews/${hidden.id}`, {doiId: doi.body.id});
        expect(refused.status).toBe(422);
        expect(refused.body).toHaveProperty('error');
        expect(await reviewDoi(hidden)).toBeNull();

        // Control: the review shown publicly takes it.
        expect((await api.put(`_dois/peerReviews/${shown.id}`, {doiId: doi.body.id})).status).toBe(200);
        expect(await reviewDoi(shown)).toBe(doi.body.id);
    });
});
