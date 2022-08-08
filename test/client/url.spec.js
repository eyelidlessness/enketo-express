import {
    getMediaURL,
    replaceMediaSources,
    resetMediaURLCache,
    setMediaURLCache,
} from '../../public/js/src/module/url';

describe('Media URLs', () => {
    const textContent = 'hello, data blobs!';
    const textURL = `data:text/plain;base64,${window.btoa(textContent)}`;
    const differentTextContent = "We've changed";
    const differentURL = `data:text/plain;base64,${window.btoa(
        differentTextContent
    )}`;

    it('gets a blob: URL for a data: URL', async () => {
        const url = getMediaURL(textURL);

        expect(url.startsWith('blob:')).to.equal(true);

        const response = await fetch(url);
        const body = await response.text();

        expect(body).to.equal(textContent);
    });

    it('caches blob: URLs for the same media URL', () => {
        const first = getMediaURL(textURL);
        const second = getMediaURL(textURL);

        expect(first).to.equal(second);
    });

    it('resets the cache of blob URLs and their corresponding Blob data', async () => {
        const first = getMediaURL(textURL);

        resetMediaURLCache();

        /** @type {Error | null} */
        let caught = null;

        try {
            await fetch(first, {});
        } catch (error) {
            caught = error;
        }

        // One might expect a 404 error on a `Response` object, but evidently
        // trying to request a revoked blob: URL throws a `TypeError`!
        expect(caught instanceof TypeError).to.equal(true);
        expect(caught.message).to.equal('Failed to fetch');

        const second = getMediaURL(textURL);

        expect(first).not.to.equal(second);
    });

    it("caches blob: URLs for a survey's media", async () => {
        const survey = {
            media: {
                'media.txt': textURL,
            },
        };

        const cache = setMediaURLCache(survey);
        const first = cache.get('media.txt');
        const second = getMediaURL(textURL);

        expect(first.startsWith('blob:')).to.equal(true);
        expect(first).to.equal(second);

        const response = await fetch(first);
        const body = await response.text();

        expect(body).to.equal(textContent);
    });

    it("caches blob: URLs for an instance's attachments", async () => {
        const survey = {
            instanceAttachments: {
                'media.txt': textURL,
            },
        };

        const cache = setMediaURLCache(survey);
        const first = cache.get('media.txt');
        const second = getMediaURL(textURL);

        expect(first.startsWith('blob:')).to.equal(true);
        expect(first).to.equal(second);

        const response = await fetch(first);
        const body = await response.text();

        expect(body).to.equal(textContent);
    });

    it('clears the existing cache when loading a new survey', async () => {
        const firstSurvey = {
            media: {
                'media.txt': textURL,
            },
        };

        setMediaURLCache(firstSurvey);

        const first = getMediaURL('media.txt');

        const secondSurvey = {
            media: {
                'media.txt': differentURL,
            },
        };

        setMediaURLCache(secondSurvey);

        const second = getMediaURL('media.txt');

        expect(second).not.to.equal(first);

        /** @type {Error | null} */
        let caught = null;

        try {
            await fetch(first);
        } catch (error) {
            caught = error;
        }

        expect(caught instanceof Error).to.equal(true);

        const response = await fetch(second);
        const body = await response.text();

        expect(body).to.equal(differentTextContent);
    });

    it("overrides a survey's media with instance attachments for the same file", async () => {
        const survey = {
            instanceAttachments: {
                'media.txt': textURL,
            },
            media: {
                'media.txt': differentURL,
            },
        };

        setMediaURLCache(survey);
        const url = getMediaURL('media.txt');

        expect(url.startsWith('blob:')).to.equal(true);
        expect(url).to.equal(url);

        const response = await fetch(url);
        const body = await response.text();

        expect(body).to.equal(textContent);
    });

    it('replaces media sources in an `HTMLFormElement`', () => {
        const imageURL =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

        const survey = {
            media: {
                'img.png': imageURL,
            },
        };

        setMediaURLCache(survey);

        const parser = new DOMParser();
        const document = parser.parseFromString(
            `<form>
            <section>
                <img src="jr://images/img.png">
            </section>
        </form>`,
            'text/html'
        );
        const form = document.querySelector('form');
        const img = document.createElement('img');

        img.src = 'jr://images/img.png';
        form.append(img);

        replaceMediaSources(form);

        const url = getMediaURL('img.png');

        expect(img.src).to.equal(url);
    });

    it('replaces media sources in an XML `Element`', () => {
        const externalXMLContent = '<a/>';
        const externalXMLURL = `data:text/xml;base64,${window.btoa(
            externalXMLContent
        )}`;

        const survey = {
            media: {
                'external.xml': externalXMLURL,
            },
        };

        setMediaURLCache(survey);

        const parser = new DOMParser();
        const document = parser.parseFromString(
            `<root>
            <some-group>
                <foo src="jr://file/external.xml"/>
            </some-group>
        </root>`,
            'text/xml'
        );
        const foo = document.querySelector('foo');

        replaceMediaSources(document);

        const url = getMediaURL('external.xml');

        expect(foo.getAttribute('src')).to.equal(url);
    });
});
