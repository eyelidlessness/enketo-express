/**
 * Using `data:` URLs to transfer form and instance attachments from
 * the server, at the time a manifest or submission is requested, to
 * simplify the media request flow, and minimize differences between
 * online and offline flows. A minor downside is that browsers limit
 * the size of URLs when requested.
 *
 * The solution is to convert `data:` URLs back to files, `Blob`s to
 * be specific. These can then be requested as `blob:` (object) URLs
 * instead of requesting the `data:` URLs directly. The method which
 * produces `blob:` URLs retains a reference to its `Blob` in memory
 * for the duration of the page's lifetime, unless revoked. Also, it
 * creates a new reference each time it's invoked.
 *
 * In order to reduce the memory impact of all of this, we cache the
 * URLs on first creation, then revoke them as necessary.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL#memory_management}
 */
let mediaURLCache = new Map();

export const resetMediaURLCache = () => {
    [...mediaURLCache.values()].forEach((blobURL) => {
        URL.revokeObjectURL(blobURL);
    });

    mediaURLCache = new Map();

    return mediaURLCache;
};

/**
 * @typedef {import('../../../../app/models/survey-model').SurveyObject} Survey
 */

/**
 * @see {@link mediaURLCache}
 * @param {string} mediaMapKey
 * @param {string} dataURL
 */
const dataURLToBlobURL = (mediaMapKey, dataURL) => {
    const cached = mediaURLCache.get(dataURL);

    if (cached != null) {
        return cached;
    }

    const bytes = window.atob(dataURL.split(',')[1]);
    const type = dataURL.split(',')[0].split(':')[1].split(';')[0];
    const data = new Uint8Array(bytes.length);

    for (let i = 0; i < bytes.length; i += 1) {
        data[i] = bytes.charCodeAt(i);
    }

    const blob = new Blob([data.buffer], { type });
    const blobURL = URL.createObjectURL(blob);

    mediaURLCache.set(mediaMapKey, blobURL);
    mediaURLCache.set(dataURL, blobURL);

    return blobURL;
};

/**
 * @see {@link mediaURLCache}
 * @param {Record<string, string>} mediaMap
 */
const cacheMediaMap = (mediaMap) => {
    Object.entries(mediaMap).forEach(([key, url]) => {
        if (!url.startsWith('data:')) {
            mediaURLCache.set(key, url);
        } else {
            dataURLToBlobURL(key, url);
        }
    });

    return mediaURLCache;
};

/**
 * @see {@link mediaURLCache}
 * @param {Survey} survey
 */
export const setMediaURLCache = (survey) => {
    const { instanceAttachments, media } = survey;

    resetMediaURLCache();

    cacheMediaMap({
        ...media,
        ...instanceAttachments,
    });

    return mediaURLCache;
};

/**
 * @see {@link mediaURLCache}
 * @param {string} url
 */
export const getMediaURL = (url) => {
    if (url.startsWith('blob:')) {
        return url;
    }

    let result = mediaURLCache.get(url);

    if (result == null) {
        if (url.startsWith('data:')) {
            return dataURLToBlobURL(url, url);
        }

        const fileName = url.replace(/^jr:.*\/([^/]+)$/, '$1');

        result = mediaURLCache.get(fileName);
    }

    return result;
};

/**
 * @param {Element} rootElement
 */
export const replaceMediaSources = (rootElement) => {
    const sourceElements = rootElement.querySelectorAll('[src^="jr:"]');
    const isHTML = rootElement instanceof HTMLElement;

    sourceElements.forEach((element) => {
        const source = isHTML ? element.src : element.getAttribute('src');
        const replacement = getMediaURL(source);

        if (replacement != null) {
            if (isHTML) {
                element.src = replacement;
            } else {
                element.setAttribute('src', replacement);
            }
        }
    });

    if (isHTML) {
        const formLogoURL = getMediaURL('form_logo.png');

        if (formLogoURL != null) {
            const formLogoContainer = rootElement.querySelector('.form-logo');

            if (formLogoContainer.firstElementChild == null) {
                const formLogoImg = document.createElement('img');

                formLogoImg.src = formLogoURL;
                formLogoImg.alt = 'form logo';

                formLogoContainer.append(formLogoImg);
            }
        }
    }
};
