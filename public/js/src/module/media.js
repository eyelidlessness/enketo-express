/** @type {string | null} */
let mediaHash = null;

export const getMediaHash = () => mediaHash;

/**
 * @typedef {import('../../../../app/models/survey-model').SurveyObject} Survey
 */

/**
 * @param {Survey} survey
 * @param {HTMLFormElement} form
 * @param {Record<string, string>} [instanceAttachments]
 */
export const replaceMediaSources = (survey, form, instanceAttachments) => {
    const media = {
        ...survey.media,
        ...instanceAttachments,
    };

    mediaHash = survey.mediaHash;

    if ('form_logo.png' in media) {
        const formLogoContainer = form.querySelector('.form-logo');

        if (formLogoContainer.firstElementChild == null) {
            const formLogoImg = document.createElement('img');

            formLogoImg.alt = 'form logo';
            formLogoContainer.append(formLogoImg);
        }
    }

    const query = Object.keys(media)
        .map((key) => {
            const fileName = CSS.escape(key);

            return `[src="${fileName}"], [src^="jr:"][src$="/${fileName}"]`;
        })
        .join(', ');

    const sourceElements = form.querySelectorAll(query);

    sourceElements.forEach((element) => {
        const source = element.src.trim();
        const fileName = source.replace(/.*\/([^/]+)$/, '$1');
        const replacement = media[fileName];

        element.src = replacement;
    });
};
