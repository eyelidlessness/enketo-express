import { replaceMediaSources } from '../../public/js/src/module/media';

describe('Media replacement', () => {
    const parser = new DOMParser();
    const media = {
        'an%20image.jpg':
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/an%20image.jpg',
        'a%20song.mp3':
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/a%20song.mp3',
        'a%20spreadsheet.csv':
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/a%20spreadsheet.csv',
        'form_logo.png':
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/form_logo.png',
    };

    /** @type {import('sinon').SinonSandbox} */
    let sandbox;

    /** @type {HTMLFormElement} */
    let formRoot;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        const formDocument = parser.parseFromString(
            /* html */ `
                <form>
                    <section class="form-logo"></section>
                    <label class="question non-select">
                        <span lang="default" class="question-label active" data-itext-id="/data/an-image:label">
                            an image
                        </span>
                        <img lang="default" class="active" src="jr://images/an%20image.jpg" data-itext-id="/data/an-image:label" alt="image">
                        <input type="text" name="/data/an-image" data-type-xml="string" maxlength="2000">
                    </label>
                    <label class="question non-select ">
                        <span lang="default" class="question-label active" data-itext-id="/data/a-song:label">a song</span>
                        <audio controls="controls" lang="default" class="active" src="jr://audio/a%20song.mp3"
                            data-itext-id="/data/a-song:label">
                            Your browser does not support HTML5 audio.
                        </audio>
                        <input type="text" name="/data/a-song" data-type-xml="string" maxlength="2000">
                    </label>
                </label>
                </form>
            `,
            'text/html'
        );

        formRoot = formDocument.querySelector('form');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('replaces jr: URLs in a form from a media mapping', () => {
        replaceMediaSources(formRoot, media);

        const img = formRoot.querySelector('label img');
        const audio = formRoot.querySelector('audio');

        expect(img.src).to.equal(
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/an%20image.jpg'
        );
        expect(audio.src).to.equal(
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/a%20song.mp3'
        );
    });

    it('replaces jr: URLs in a form with sources previously swapped for offline-capable mode', () => {
        const sourceElements = formRoot.querySelectorAll('[src]');

        sourceElements.forEach((element) => {
            element.dataset.offlineSrc = element.src;
        });

        replaceMediaSources(formRoot, media);

        const img = formRoot.querySelector('label img');
        const audio = formRoot.querySelector('audio');

        expect(img.src).to.equal(
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/an%20image.jpg'
        );
        expect(audio.src).to.equal(
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/a%20song.mp3'
        );
    });

    it('appends a form logo if present in the media mapping', () => {
        replaceMediaSources(formRoot, media);

        const formLogo = formRoot.querySelector('.form-logo img');

        expect(formLogo.src).to.equal(
            'https://example.com/-/media/get/0/WXMDbc0H/c0f15ee04dacb1db7cc60797285ff1c8/form_logo.png'
        );
    });
});
