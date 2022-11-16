import fileManager from '../../public/js/src/module/file-manager';
import settings from '../../public/js/src/module/settings';
import store from '../../public/js/src/module/store';

describe('File manager', () => {
    /** @type {import('sinon').SinonSandbox} */
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getting file URLs', () => {
        it('gets an absolute path', async () => {
            const result = await fileManager.getFileUrl('/absolute.png');

            expect(result).to.equal('/absolute.png');
        });

        describe('instance attachments', () => {
            afterEach(() => {
                fileManager.setMediaMap(null);
            });

            it('gets a URL from instance attachments by filename', async () => {
                fileManager.setMediaMap({
                    'relative.png': 'https://example.com/path/to/relative.png',
                });

                const result = await fileManager.getFileUrl('relative.png');

                expect(result).to.equal(
                    'https://example.com/path/to/relative.png'
                );
            });

            it('gets a URL from instance attachments by filename with a space', async () => {
                fileManager.setMediaMap({
                    'space madness.png':
                        'https://example.com/path/to/space%20madness.png',
                });

                const result = await fileManager.getFileUrl(
                    'space madness.png'
                );

                expect(result).to.equal(
                    'https://example.com/path/to/space%20madness.png'
                );
            });

            it('gets a URL from instance attachments by filename with an escaped space', async () => {
                fileManager.setMediaMap({
                    'space%20madness.png':
                        'https://example.com/path/to/space%20madness.png',
                });

                const result = await fileManager.getFileUrl(
                    'space madness.png'
                );

                expect(result).to.equal(
                    'https://example.com/path/to/space%20madness.png'
                );
            });

            it('gets a URL from instance attachments by escaped filename with an escaped space', async () => {
                fileManager.setMediaMap({
                    'space%20madness.png':
                        'https://example.com/path/to/space%20madness.png',
                });

                const result = await fileManager.getFileUrl(
                    'space%20madness.png'
                );

                expect(result).to.equal(
                    'https://example.com/path/to/space%20madness.png'
                );
            });
        });

        describe('cached files', () => {
            const enketoId = 'survey a';
            const recordId = 'record 1';

            /** @type {boolean} */
            let isOffline;

            /** @type {boolean} */
            let isStoreAvailable;

            /** @type {number} */
            let maxSize;

            beforeEach(async () => {
                isOffline = true;

                sandbox.stub(settings, 'offline').get(() => isOffline);

                sandbox.stub(settings, 'enketoId').get(() => enketoId);

                if (
                    !Object.prototype.hasOwnProperty.call(settings, 'recordId')
                ) {
                    settings.recordId = undefined;
                }

                sandbox.stub(settings, 'recordId').get(() => recordId);

                isStoreAvailable = true;

                sandbox.stub(store, 'available').get(() => isStoreAvailable);

                maxSize = Number.MAX_SAFE_INTEGER;

                sandbox.stub(settings, 'maxSize').get(() => maxSize);

                await store.init();
            });

            it('fails if the cache store is not available', async () => {
                const fileGetStub = sandbox.stub(store.record.file, 'get');

                /** @type {Error} */
                let caught;

                isStoreAvailable = false;

                try {
                    await fileManager.getFileUrl('anything.png');
                } catch (error) {
                    caught = error;
                }

                expect(caught).to.be.an.instanceof(Error);
                expect(fileGetStub).not.to.have.been.called;
            });

            it('gets a blob URL from a cached file upload', async () => {
                const fileContents = 'file contents';
                const name = 'the blob.png';
                const file = {
                    item: new Blob([fileContents]),
                    name,
                };

                await store.record.file.update(recordId, file);

                const blobURL = await fileManager.getFileUrl(name);

                expect(blobURL).to.match(/^blob:/);

                const response = await fetch(blobURL);
                const blobResult = await response.blob();

                expect(blobResult).to.be.an.instanceof(Blob);

                const data = await blobResult.text();

                expect(data).to.equal(fileContents);
            });

            it('fails if not in offline-capable mode, if the store is available and the file is cached', async () => {
                const fileContents = 'file contents';
                const name = 'the blob.png';
                const file = {
                    item: new Blob([fileContents]),
                    name,
                };

                await store.record.file.update(recordId, file);

                const fileGetStub = sandbox.stub(store.record.file, 'get');

                /** @type {Error} */
                let caught;

                isOffline = false;

                try {
                    await fileManager.getFileUrl(name);
                } catch (error) {
                    caught = error;
                }

                expect(caught).to.be.an.instanceof(Error);
                expect(fileGetStub).not.to.have.been.called;
            });

            it('fails if the file is not cached', async () => {
                const fileName = 'anything.png';

                /** @type {Error} */
                let caught;

                try {
                    await fileManager.getFileUrl(fileName);
                } catch (error) {
                    caught = error;
                }

                expect(caught).to.be.an.instanceof(Error);
            });

            it('fails if the cached file is too large', async () => {
                /** @type {Error} */
                let caught;

                const fileContents = 'file contents';
                const name = 'the blob.png';
                const file = {
                    item: new Blob([fileContents]),
                    name,
                };

                maxSize = file.item.size - 1;

                await store.record.file.update(recordId, file);

                try {
                    await fileManager.getFileUrl(name);
                } catch (error) {
                    caught = error;
                }

                expect(caught).to.be.an.instanceof(Error);
            });

            it('gets a blob URL from a Blob object', async () => {
                const fileContents = 'file contents';
                const blob = new Blob([fileContents]);

                const blobURL = await fileManager.getFileUrl(blob);

                expect(blobURL).to.match(/^blob:/);

                const response = await fetch(blobURL);
                const blobResult = await response.blob();

                expect(blobResult).to.be.an.instanceof(Blob);

                const data = await blobResult.text();

                expect(data).to.equal(fileContents);
            });

            it('fails if a Blob object is too large', async () => {
                /** @type {Error} */
                let caught;

                const fileContents = 'file contents';
                const blob = new Blob([fileContents]);

                maxSize = blob.size - 1;

                try {
                    await fileManager.getFileUrl(blob);
                } catch (error) {
                    caught = error;
                }

                expect(caught).to.be.an.instanceof(Error);
            });
        });
    });
});
