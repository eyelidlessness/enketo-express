const { expect } = require('chai');
const nock = require('nock');
const requestLib = require('request');
const sinon = require('sinon');
const request = require('supertest');
const http = require('http');
const app = require('../../config/express');
const { getManifest } = require('../../app/lib/communicator');
const { resetMediaHosts } = require('../../app/lib/url');

/**
 * Tests the request-filtering-agent to block SSRF attacks
 * change testHTMLBody to the body of an html file that
 * you are testing on. For the default, it says <im in.>
 * and is hosted in testHTMLHost.
 */

const testHTMLBody = 'im in.';
const portHTML = 1234;

const testHTMLHost = `localhost:${portHTML}`;
const testHTMLBaseURL = `http://${testHTMLHost}`;
const testHTMLMetaHost = `0.0.0.0:${portHTML}`;
const testHTMLMetaBaseURL = `http://${testHTMLMetaHost}`;
const testHTMLValidHTTPSHost = 'www.w3.org';
const testHTMLValidHTTPSBaseURL = `https://${testHTMLValidHTTPSHost}`;

const localhost = '127.0.0.1';

const requestURL = `/media/get/${testHTMLBaseURL.replace('://', '/')}`;
const requestMetaURL = `/media/get/${testHTMLMetaBaseURL.replace('://', '/')}`;
const requestValidHTTPSURL = `/media/get/${testHTMLValidHTTPSBaseURL.replace(
    '://',
    '/'
)}/People/mimasa/test/imgformat/img/w3c_home_2.jpg`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(testHTMLBody);
});

describe('Media controller', () => {
    // Default everything disabled
    const allowPrivateIPAddress = false;
    const allowMetaIPAddress = false;
    const allowIPAddressList = [];
    const denyIPAddressList = [];

    before(() => {
        server.listen(portHTML);
    });

    /** @type {import('sinon').SinonSandbox} */
    let sandbox;

    /** @type {boolean} */
    let wasRequestAttempted;

    /** @type {string} */
    let serverURLConfig;

    /** @type {string[]} */
    let mediaHostsConfig;

    /**
     * @typedef IPFilteringConfig
     * @property {boolean} allowPrivateIPAddress
     * @property {boolean} allowMetaIPAddress
     * @property {string[]} allowIPAddressList
     * @property {string[]} denyIPAddressList
     */

    /** @type {IPFilteringConfig} */
    let ipFilteringConfig;

    beforeEach(() => {
        resetMediaHosts();

        sandbox = sinon.createSandbox();

        wasRequestAttempted = false;

        const requestLibGet = requestLib.get;

        sandbox.stub(requestLib, 'get').callsFake((...args) => {
            wasRequestAttempted = true;

            return requestLibGet.apply(requestLib, args);
        });

        const baseAppGet = app.get.bind(app);

        mediaHostsConfig = [
            testHTMLHost,
            testHTMLMetaHost,
            testHTMLValidHTTPSHost,
        ];

        sandbox.stub(app, 'get').callsFake((key) => {
            if (key === 'linked form and data server') {
                return {
                    ...(baseAppGet(key) ?? {}),
                    mediaHosts: mediaHostsConfig,
                    'server url': serverURLConfig,
                };
            }

            if (key === 'ip filtering') {
                return ipFilteringConfig;
            }

            return baseAppGet(key);
        });
    });

    afterEach(() => {
        resetMediaHosts();
        sandbox.restore();
    });

    after((done) => {
        server.close(done);
    });

    // Tests WITH Referers

    // Tests with allowPrivateIPAddress FALSE
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=false', (done) => {
        // Don't change any default IP filtering setting
        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(
                500,
                /DNS lookup .* is not allowed. Because, It is private IP address/
            )
            .end(done);
    });
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=false and allowMetaIPAddress=true', (done) => {
        // Only change one setting
        const allowMetaIPAddress = true;

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestMetaURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(
                500,
                /DNS lookup .* is not allowed. Because, It is private IP address/
            )
            .end(done);
    });
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=false but allowIPAddressList=[`127.0.0.1`]', (done) => {
        // Only change one setting
        const allowIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(200, testHTMLBody)
            .end(done);
    });
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=false and denyIPAddressList=[`127.0.0.1`]', (done) => {
        // Only change one setting
        const denyIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(
                500,
                /DNS lookup .* is not allowed. Because, It is private IP address/
            )
            .end(done);
    });

    // Tests with allowPrivateIPAddress TRUE
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=true', (done) => {
        // Only change one setting
        const allowPrivateIPAddress = true;

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(200, testHTMLBody)
            .end(done);
    });
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=true and allowMetaIPAddress=true', (done) => {
        // Change two settings
        const allowPrivateIPAddress = true;
        const allowMetaIPAddress = true;

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestMetaURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(200, testHTMLBody)
            .end(done);
    });
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=true and allowIPAddressList=[`127.0.0.1`]', (done) => {
        // Change two settings
        const allowPrivateIPAddress = true;
        const allowIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(200, testHTMLBody)
            .end(done);
    });
    it('for a private IP address WITH a Referer with allowPrivateIPAddress=true and denyIPAddressList=[`127.0.0.1`]', (done) => {
        // Change two settings
        const allowPrivateIPAddress = true;
        const denyIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .set('Referer', 'https://google.com?print=true')
            .expect(
                500,
                /DNS lookup .* is not allowed. Because It is defined in denyIPAddressList./
            )
            .end(done);
    });

    // Tests WITHOUT Referers

    // Tests with allowPrivateIPAddress FALSE
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=false', (done) => {
        // Don't change any default IP filtering setting
        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .expect(
                500,
                /DNS lookup .* is not allowed. Because, It is private IP address./
            )
            .end(done);
    });
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=false and allowMetaIPAddress=true', (done) => {
        // Only change one setting
        const allowMetaIPAddress = true;

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestMetaURL)
            .expect(
                500,
                /DNS lookup .* is not allowed. Because, It is private IP address/
            )
            .end(done);
    });
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=false but allowIPAddressList=[`127.0.0.1`]', (done) => {
        // Only change one setting
        const allowIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app).get(requestURL).expect(200, testHTMLBody).end(done);
    });
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=false and denyIPAddressList=[`127.0.0.1`]', (done) => {
        // Only change one setting
        const denyIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .expect(
                500,
                /DNS lookup .* is not allowed. Because, It is private IP address/
            )
            .end(done);
    });

    // Tests with allowPrivateIPAddress TRUE
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=true', (done) => {
        // Only change one setting
        const allowPrivateIPAddress = true;

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app).get(requestURL).expect(200, testHTMLBody).end(done);
    });
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=true and allowMetaIPAddress=true', (done) => {
        // Change two settings
        const allowPrivateIPAddress = true;
        const allowMetaIPAddress = true;

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app).get(requestMetaURL).expect(200, testHTMLBody).end(done);
    });
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=true and allowIPAddressList=[`127.0.0.1`]', (done) => {
        // Change two settings
        const allowPrivateIPAddress = true;
        const allowIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app).get(requestURL).expect(200, testHTMLBody).end(done);
    });
    it('for a private IP address WITHOUT a Referer with allowPrivateIPAddress=true and denyIPAddressList=[`127.0.0.1`]', (done) => {
        // Change two settings
        const allowPrivateIPAddress = true;
        const denyIPAddressList = [localhost];

        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app)
            .get(requestURL)
            .expect(
                500,
                /DNS lookup .* is not allowed. Because It is defined in denyIPAddressList./
            )
            .end(done);
    });

    // Testing valid https resource
    it('for a valid https resouce: https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home_2.jpg', (done) => {
        // Default Settings
        ipFilteringConfig = {
            allowPrivateIPAddress,
            allowMetaIPAddress,
            allowIPAddressList,
            denyIPAddressList,
        };

        request(app).get(requestValidHTTPSURL).expect(200).end(done);
    });

    it('requests media from the configured media hosts', async () => {
        mediaHostsConfig = [testHTMLValidHTTPSHost];

        await request(app).get(requestValidHTTPSURL).expect(200);
        expect(wasRequestAttempted).to.equal(true);
    });

    it('does not request media from hosts not in the configured media hosts', async () => {
        mediaHostsConfig = [testHTMLHost];

        await request(app).get(requestValidHTTPSURL).expect(404);
        expect(wasRequestAttempted).to.equal(false);
    });

    it('requests media from the linked server host', async () => {
        mediaHostsConfig = [];
        serverURLConfig = testHTMLValidHTTPSHost;

        await request(app).get(requestValidHTTPSURL).expect(200);
        expect(wasRequestAttempted).to.equal(true);
    });

    it('requests media from the linked server host as a regular expression', async () => {
        mediaHostsConfig = [];
        serverURLConfig = '.*';

        await request(app).get(requestValidHTTPSURL).expect(200);
        expect(wasRequestAttempted).to.equal(true);
    });

    it('does not request media not matching from the linked server host as a regular expression', async () => {
        mediaHostsConfig = [];
        serverURLConfig = '^wrong.host';

        await request(app).get(requestValidHTTPSURL).expect(404);
        expect(wasRequestAttempted).to.equal(false);
    });

    it('requests media from any host if the configured server host is an empty string', async () => {
        mediaHostsConfig = [];
        serverURLConfig = '';

        await request(app).get(requestValidHTTPSURL).expect(200);
        expect(wasRequestAttempted).to.equal(true);
    });

    it('does not request media from an HTTP host, in the context of an HTTPS request, if the configured server host is an empty string', async () => {
        mediaHostsConfig = [];
        serverURLConfig = '';

        const httpURL = requestValidHTTPSURL.replace('https/', 'http/');

        sandbox.stub(app.request, 'protocol').get(() => 'https');
        sandbox.stub(app.request, 'secure').get(() => true);

        await request(app).get(httpURL).expect(404);
        expect(wasRequestAttempted).to.equal(false);
    });

    it('does not request media from an HTTP host, in the context of an HTTPS request', async () => {
        mediaHostsConfig = [testHTMLValidHTTPSHost];

        const httpURL = requestValidHTTPSURL.replace('https/', 'http/');

        sandbox.stub(app.request, 'protocol').get(() => 'https');
        sandbox.stub(app.request, 'secure').get(() => true);

        await request(app).get(httpURL).expect(404);
        expect(wasRequestAttempted).to.equal(false);
    });

    it('requests media with an HTTP URL from an HTTP request', async () => {
        mediaHostsConfig = [testHTMLValidHTTPSHost];

        const requestValidHTTPURL = requestValidHTTPSURL.replace(
            'https/',
            'http/'
        );

        sandbox.stub(app.request, 'secure').get(() => false);

        await request(app).get(requestValidHTTPURL).expect(200);
        expect(wasRequestAttempted).to.equal(true);
    });

    it('requests media with an HTTPS URL from an HTTP request', async () => {
        mediaHostsConfig = [testHTMLValidHTTPSHost];

        sandbox.stub(app.request, 'secure').get(() => false);

        await request(app).get(requestValidHTTPSURL).expect(200);
        expect(wasRequestAttempted).to.equal(true);
    });

    it('requests media from hosts appearing in manifests, in case config is restrictive by mistake', async () => {
        mediaHostsConfig = [];

        const downloadOrigin = 'https://my.media.host';
        const downloadPath = '/johndoe/formmedia/dyn.xml';
        const downloadURL = `${downloadOrigin}${downloadPath}`;
        const mediaURL = `/media/get/${downloadURL.replace('://', '/')}`;

        await request(app).get(mediaURL).expect(404);

        const survey = {
            openRosaServer: 'https://testserver.com/bob',
            openRosaId: 'widgets',
            info: {
                manifestUrl: 'https://my.openrosa.server/manifest1',
            },
            form: '<form>some form</form>',
            model: '<data>some model</data>',
        };
        const manifestXML = `
            <manifest xmlns="http://openrosa.org/xforms/xformsManifest">
                <mediaFile>
                    <filename>dyn.xml</filename>
                    <hash>md5:3c13dacb1b36c210b996ae307030c684</hash>
                    <downloadUrl>${downloadURL}</downloadUrl>
                </mediaFile>
            </manifest>
        `;
        nock('https://my.openrosa.server')
            .get('/manifest1')
            .reply(200, manifestXML);
        nock(downloadOrigin).get(downloadPath).reply(200, '<any-xml/>');

        await getManifest(survey);
        await request(app).get(mediaURL).expect(200);
    });

    const nonHostURLs = [
        {
            reason: 'host in auth user position',
            url: `/media/get/http/${localhost}:any-password@wrong.host/some-path`,
            allowedByPattern: false,
        },
        {
            reason: 'host in auth user position (no password)',
            url: `/media/get/http/${localhost}@wrong.host/some-path`,
            allowedByPattern: false,
        },
        {
            reason: 'host in password position',
            url: `/media/get/http/any-user:${localhost}@wrong.host/some-path`,
            allowedByPattern: false,
        },
        {
            reason: 'host in path position',
            url: `/media/get/http/wrong.host/${localhost}/some-path`,
            allowedByPattern: false,
        },
        {
            reason: 'host in param key position',
            url: `/media/get/http/wrong.host/some-path?${localhost}=some-param`,
            allowedByPattern: false,
        },
        {
            reason: 'host in param value position',
            url: `/media/get/http/wrong.host/some-path?some-param=${localhost}`,
            allowedByPattern: false,
        },
        {
            reason: 'host in hash position',
            url: `/media/get/http/wrong.host/some-path#${localhost}`,
            allowedByPattern: false,
        },
        {
            reason: 'subdomain of host',
            url: `/media/get/http/wrong.${localhost}/some-path`,
            allowedByPattern: true,
        },
        {
            reason: 'host is subdomain',
            url: `/media/get/http/${localhost}.wrong/some-path`,
            allowedByPattern: true,
        },
        {
            reason: 'same domain, different port',
            url: `/media/get/http/${localhost}:5678/wrong-port`,
            allowedByPattern: true,
        },
    ];

    nonHostURLs.forEach(({ reason, url, allowedByPattern }) => {
        it(`does not request media where a configured domain appears in other parts of the URL (mediaHosts config, ${reason}, ${url})`, async () => {
            mediaHostsConfig = [localhost];

            await request(app).get(url).expect(404);
            expect(wasRequestAttempted).to.equal(false);
        });

        if (!allowedByPattern) {
            it(`does not request media where a configured domain appears in other parts of the URL (server url config, ${reason}, ${url})`, async () => {
                mediaHostsConfig = [];
                serverURLConfig = localhost;

                await request(app).get(url).expect(404);
                expect(wasRequestAttempted).to.equal(false);
            });
        }
    });
});
