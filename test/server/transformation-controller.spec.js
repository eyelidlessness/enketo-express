const { expect } = require('chai');
const transformer = require('enketo-transformer');
const nock = require('nock');
const request = require('supertest');
const sinon = require('sinon');
const communicator = require('../../app/lib/communicator');
const accountModel = require('../../app/models/account-model');
const config = require('../../app/models/config-model').server;
const cacheModel = require('../../app/models/cache-model');
const surveyModel = require('../../app/models/survey-model');
const userModel = require('../../app/models/user-model');
const { escapeMediaURL, toDataURL } = require('../../app/lib/url');

/**
 * @typedef {import('../../app/models/survey-model').SurveyObject} Survey
 */

describe('Transformation Controller', () => {
    const basePath = '';
    const bearer = 'fozzie';
    const enketoId = 'surveyZ';
    const openRosaServer = 'https://example.com';
    const openRosaId = 'formZ';
    const manifestPath = '/manifest';
    const manifestUrl = `${openRosaServer}${manifestPath}`;

    /** @type {import('sinon').SinonSandbox} */
    let sandbox;

    /** @type {import('express').Application} */
    let app;

    /** @type {import('http').Server} */
    let server;

    /** @type {import('../../app/models/account-model').AccountObj */
    let account;

    /** @type {Survey} */
    let survey;

    /** @type {string} */
    let hash;

    beforeEach(async () => {
        await cacheModel.flushAll();

        sandbox = sinon.createSandbox();

        sandbox.stub(config, 'base path').get(() => basePath);

        // Stub `_getSurveyParams`
        survey = {
            openRosaServer,
            openRosaId,
        };

        hash = 'md5:b4dd34d';

        sandbox
            .stub(surveyModel, 'get')
            .callsFake(() => Promise.resolve({ ...survey }));

        account = {};

        sandbox.stub(accountModel, 'check').callsFake((survey) =>
            Promise.resolve({
                ...survey,
                account,
            })
        );

        // No-op `_checkQuota`
        sandbox.stub(config, 'account lib').get(() => null);

        sandbox.stub(userModel, 'getCredentials').callsFake(() => ({ bearer }));

        app = require('../../config/express');

        await new Promise((resolve) => {
            server = app.listen(() => resolve());
        });
    });

    afterEach(async () => {
        sandbox.restore();

        await Promise.all([
            cacheModel.flushAll(),
            new Promise((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve()))
            ),
        ]);

        nock.cleanAll();
    });

    /**
     * @typedef {import('../../app/lib/url').ManifestItem} ManifestItem
     */

    /** @type {ManifestItem[]} */
    let manifest;

    /** @type {Record<string, string>} */
    let expectedMediaMap;

    /**
     * @param {string} url
     * @param {object} [payload]
     * @return {import('enketo-transformer/src/transformer').TransformedSurvey}
     */
    const getTransormResult = async (url, payload = {}) => {
        expectedMediaMap = {};

        manifest.forEach(({ downloadUrl, filename }) => {
            const { origin, pathname } = new URL(downloadUrl);
            const key = escapeMediaURL(filename);
            const extension = downloadUrl.replace(/^.*\.([^.]+)$/, '$1');
            const contentType = `fake/${extension}`;
            const response = `mock response to ${downloadUrl}`;
            const value = toDataURL(contentType, response);

            expectedMediaMap[key] = value;

            nock(origin).get(pathname).reply(200, response, {
                'content-type': contentType,
            });
        });

        const manifestXML = `
            <?xml version='1.0' encoding='UTF-8' ?>
            <manifest xmlns="http://openrosa.org/xforms/xformsManifest">
                ${manifest.map(
                    ({ filename, hash, downloadUrl }) => `
                    <mediaFile>
                        <filename>${filename}</filename>
                        <hash>${hash}</hash>
                        <downloadUrl>${downloadUrl}</downloadUrl>
                    </mediaFile>
                `
                )}
            </manifest>
        `.trim();

        nock(openRosaServer).get(manifestPath).reply(200, manifestXML, {
            'content-type': 'text/xml',
        });

        const { body } = await request(app).post(url).send(payload).expect(200);

        return body;
    };

    describe('manifest media', () => {
        beforeEach(async () => {
            manifest = [];

            sandbox
                .stub(communicator, 'authenticate')
                .callsFake((survey) => Promise.resolve(survey));

            sandbox.stub(communicator, 'getXFormInfo').callsFake((survey) =>
                Promise.resolve({
                    ...survey,
                    info: {
                        hash,
                        manifestUrl,
                    },
                })
            );

            // Stub getXForm
            const xform = `
                <?xml version="1.0"?>
                <h:html xmlns="http://www.w3.org/2002/xforms"
                    xmlns:ev="http://www.w3.org/2001/xml-events"
                    xmlns:h="http://www.w3.org/1999/xhtml"
                    xmlns:jr="http://openrosa.org/javarosa"
                    xmlns:odk="http://www.opendatakit.org/xforms"
                    xmlns:orx="http://openrosa.org/xforms"
                    xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                    <h:head>
                        <h:title>jr-url-space</h:title>
                        <model>
                            <itext>
                                <translation default="true()" lang="English">
                                    <text id="/outside/l1:label">
                                        <value form="image">jr://images/first image.jpg</value>
                                    </text>
                                    <text id="/outside/l2:label">
                                        <value form="audio">jr://audio/a song.mp3</value>
                                    </text>
                                    <text id="/outside/l3:label">
                                        <value form="video">jr://video/some video.mp4</value>
                                    </text>
                                </translation>
                            </itext>
                            <instance>
                                <outside>
                                    <a/>
                                    <b/>
                                    <c>jr://images/another image.png</c>
                                    <d/>
                                    <l1/>
                                    <l2/>
                                    <l2/>
                                    <meta>
                                        <instanceID/>
                                    </meta>
                                </outside>
                            </instance>
                            <instance id="file" src="jr://file/an instance.xml" />
                            <instance id="file-csv" src="jr://file-csv/a spreadsheet.csv" />
                            <bind nodeset="/outside/a" type="string"/>
                            <bind nodeset="/outside/b" type="string"/>
                            <bind nodeset="/outside/c" type="binary"/>
                            <bind nodeset="/outside/d" type="string"/>
                        </model>
                    </h:head>
                    <h:body>
                        <input ref="/a">
                            <label ref="jr:itext('/outside/l1:label')"/>
                        </input>
                        <input ref="/b">
                            <label ref="jr:itext('/outside/l2:label')"/>
                        </input>
                        <upload appearance="annotate" mediatype="image/*" ref="/outside/c">
                            <label ref="jr:itext('/outside/l3:label')"/>
                        </upload>
                        <input> ref="/d">
                            <label>
                                [markdown](jr://file/a link.xml)
                            </label>
                        </input>
                    </h:body>
                </h:html>
            `.trim();

            sandbox.stub(communicator, 'getXForm').callsFake((survey) =>
                Promise.resolve({
                    ...survey,
                    xform,
                })
            );

            // Stub getManifest
            manifest = [
                {
                    filename: 'first image.jpg',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/spiders from mars.jpg',
                },
                {
                    filename: 'a song.mp3',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/space oddity.mp3',
                },
                {
                    filename: 'some video.mp4',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/a small plot of land.mp4',
                },
                {
                    filename: 'another image.png',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/under pressure.png',
                },
                {
                    filename: 'an instance.xml',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/golden years.xml',
                },
                {
                    filename: 'a spreadsheet.csv',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/little wonder.csv',
                },
                {
                    filename: 'a link.xml',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/wishful beginnings.xml',
                },
            ];
        });

        const url = `/transform/xform/${enketoId}`;

        it('escapes media in labels', async () => {
            const result = await getTransormResult(url);

            return Promise.all([
                expect(result)
                    .to.have.property('form')
                    .and.to.not.contain('jr://images/first image.jpg'),
                expect(result)
                    .to.have.property('form')
                    .and.to.not.contain('jr://audio/a song.mp3'),
                expect(result)
                    .to.have.property('form')
                    .and.to.not.contain('jr://video/some video.mp4'),

                expect(result)
                    .to.have.property('form')
                    .and.to.contain('jr://images/first%20image.jpg'),
                expect(result)
                    .to.have.property('form')
                    .and.to.contain('jr://audio/a%20song.mp3'),
                expect(result)
                    .to.have.property('form')
                    .and.to.contain('jr://video/some%20video.mp4'),
            ]);
        });

        it('escapes binary defaults', async () => {
            const result = await getTransormResult(url);

            return Promise.all([
                expect(result)
                    .to.have.property('model')
                    .and.to.not.contain('jr://images/another image.png'),

                expect(result)
                    .to.have.property('model')
                    .and.to.contain('jr://images/another%20image.png'),
            ]);
        });

        it('escapes external instance URLs', async () => {
            const result = await getTransormResult(url);

            return Promise.all([
                expect(result)
                    .to.have.property('model')
                    .and.to.not.contain('jr://file/an instance.xml'),
                expect(result)
                    .to.have.property('model')
                    .and.to.not.contain('jr://file-csv/a spreadsheet.csv'),

                expect(result)
                    .to.have.property('model')
                    .and.to.contain('jr://file/an%20instance.xml'),
                expect(result)
                    .to.have.property('model')
                    .and.to.contain('jr://file-csv/a%20spreadsheet.csv'),
            ]);
        });

        it('escapes media URLs in markdown links', async () => {
            const result = await getTransormResult(url);

            return Promise.all([
                expect(result)
                    .to.have.property('form')
                    .and.to.not.contain('jr://file/a link.xml'),

                expect(result)
                    .to.have.property('form')
                    .and.to.contain('jr://file/a%20link.xml'),
            ]);
        });

        it('maps media with a new manifest without re-transforming the cached survey', async () => {
            const initialCache = await cacheModel.get({
                openRosaServer,
                openRosaId,
            });

            expect(initialCache).to.be.null;

            const transformSpy = sandbox.spy(transformer, 'transform');
            const cacheSetSpy = sandbox.spy(cacheModel, 'set');

            await getTransormResult(url);

            expect(transformSpy.calledOnce).to.be.true;
            expect(cacheSetSpy.calledOnce).to.be.true;

            const firstCache = await cacheModel.get({
                openRosaServer,
                openRosaId,
            });

            expect(firstCache.model).to.contain('another%20image.png');

            // Stub getManifest
            manifest = [
                {
                    filename: 'another image.png',
                    hash: 'irrelevant',
                    downloadUrl:
                        'https://example.com/hallo spaceboy/the jean genie.png',
                },
            ];

            await getTransormResult(url);

            const finalCache = await cacheModel.get({
                openRosaServer,
                openRosaId,
            });

            expect(finalCache).to.deep.equal(firstCache);

            expect(transformSpy.calledOnce).to.be.true;
            expect(cacheSetSpy.calledOnce).to.be.true;
        });

        it("includes a media mapping between a manifest's `filename` and a data: URL of the response body of the manifests `downloadUrl`", async () => {
            const { media } = await getTransormResult(url);

            expect(media).to.deep.equal(expectedMediaMap);
        });
    });
});
