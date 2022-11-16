/**
 * @param {Record<string, string>} [media]
 * @param {string | object} [url]
 */
export const getMediaURL = (media, url) => {
    if (media == null || typeof url !== 'string') {
        return url;
    }

    const fileName = url.replace(/.*\/([^/]+)$/, '$1');

    return media[fileName] ?? media[encodeURIComponent(fileName)] ?? url;
};

/**
 * @param {HTMLElement} rootElement
 * @param {Record<string, string>} [media]
 */
export const replaceMediaSources = (rootElement, media = {}) => {
    const sourceElements = rootElement.querySelectorAll(
        '[href^="jr:"], [src^="jr:"], [data-offline-src]'
    );

    sourceElements.forEach((element) => {
        const property = element.hasAttribute('href') ? 'href' : 'src';
        const url = element.dataset.offlineSrc ?? element[property];

        element[property] = getMediaURL(media, url);
    });

    const formLogoURL = media['form_logo.png'];

    if (formLogoURL != null) {
        const formLogoContainer = rootElement.querySelector('.form-logo');

        if (formLogoContainer.firstElementChild == null) {
            const formLogoImg = document.createElement('img');

            formLogoImg.src = formLogoURL;
            formLogoImg.alt = 'form logo';

            formLogoContainer.append(formLogoImg);
        }
    }
};
