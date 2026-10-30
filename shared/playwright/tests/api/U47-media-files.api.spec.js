/**
 * Media files through the API (docs/specs/U47-media-files.md "Through the API").
 * Who may call the media files routes is the spec's grids', checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** A temporary file of the signed-in user, as the "Upload Media File" window stores each card. */
async function temporaryFile(api, name = 'figure.png') {
    const res = await api.upload('temporaryFiles', {file: {name, mimeType: 'image/png', buffer: Buffer.from('U47 figure')}});
    expect(res.status).toBe(200);
    return res.body.id;
}

/** A scratch context's manager, its "Image" media type, and a media-file helper per submission. */
async function media(scratch, users = {mg: 'manager', au: 'author'}) {
    const j = await scratch({users});
    const api = await j.as('mg');
    const image = (await api.get('genres')).body.items.find((g) => g.dependent && g.supportsFileVariants);
    const version = async (suffix) => {
        const {submissionId, publicationId} = await j.submission(suffix, {submitter: 'au'});
        const route = `submissions/${submissionId}/publications/${publicationId}/mediaFiles`;
        return {
            route,
            add: async (variantType) => {
                const res = await api.post(route, {files: [{temporaryFileId: await temporaryFile(api), genreId: image.id, variantType}]});
                expect(res.status).toBe(200);
                return res.body[0].id;
            },
            groups: async () => Object.fromEntries((await api.get(route)).body.items.map((f) => [f.id, f.variantGroupId])),
        };
    };
    return {j, api, version};
}

test.describe('media files through the API', () => {
    test('API1: A link to anything but a counterpart of the same version is refused', async ({scratch}) => {
        const {api, version} = await media(scratch);
        const own = await version('a');
        const other = await version('b');
        const web = await own.add('web');
        const web2 = await own.add('web');
        const high = await own.add('high_resolution');
        const elsewhere = await other.add('high_resolution');

        for (const [label, target] of [['itself', web], ['the same resolution', web2], ['another submission\'s file', elsewhere]]) {
            const refused = await api.put(`${own.route}/${web}/link`, {targetSubmissionFileId: target});
            expect(refused.status, label).toBe(422);
            expect(refused.body, label).toHaveProperty('targetSubmissionFileId');
        }
        const batch = await api.post(`${own.route}/link`, {links: [{primarySubmissionFileId: web, secondarySubmissionFileId: elsewhere}]});
        expect(batch.status).toBe(422);
        expect(Object.values(await own.groups()).every((group) => group === null)).toBe(true);
        expect(Object.values(await other.groups())).toEqual([null]);

        // Control: the version's own high-resolution file pairs with it.
        expect((await api.put(`${own.route}/${web}/link`, {targetSubmissionFileId: high})).status).toBe(200);
        const groups = await own.groups();
        expect(groups[web]).toBeTruthy();
        expect(groups[high]).toBe(groups[web]);
    });

    test('API2: The list narrowed by resolution and by pair', async ({scratch}) => {
        const {api, version} = await media(scratch);
        const v = await version('a');
        const web = await v.add('web');
        const high = await v.add('high_resolution');
        const loose = await v.add('web');
        const ids = async (params) => {
            const res = await api.get(v.route, params);
            expect(res.status).toBe(200);
            return res.body.items.map((f) => f.id).sort((a, b) => a - b);
        };

        expect(await ids({variantTypes: 'high_resolution'})).toEqual([high]);
        expect(await ids({variantTypes: 'web'})).toEqual([web, loose]);
        const refused = await api.get(v.route, {variantTypes: 'print'});
        expect(refused.status).toBe(400);

        expect((await api.put(`${v.route}/${web}/link`, {targetSubmissionFileId: high})).status).toBe(200);
        const group = (await v.groups())[web];
        expect(await ids({variantGroupIds: group})).toEqual([web, high]);
    });

    test('API3: A media file is made only from its adder\'s own upload', async ({scratch}) => {
        const {j, api, version} = await media(scratch, {mg: 'manager', m2: 'manager', au: 'author'});
        const v = await version('a');
        const image = (await api.get('genres')).body.items.find((g) => g.dependent && g.supportsFileVariants);
        const othersUpload = await temporaryFile(await j.as('m2'));

        const refused = await api.post(v.route, {files: [{temporaryFileId: othersUpload, genreId: image.id, variantType: 'web'}]});
        expect(refused.status).toBe(400);
        expect((await api.get(v.route)).body.itemsMax).toBe(0);

        // Control: the manager's own upload is added.
        const added = await api.post(v.route, {files: [{temporaryFileId: await temporaryFile(api), genreId: image.id, variantType: 'web'}]});
        expect(added.status).toBe(200);
        expect((await api.get(v.route)).body.items.map((f) => f.id)).toEqual([added.body[0].id]);
    });
});
