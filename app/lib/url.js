const cluster = require('cluster');
const config = require('../models/config-model').server;
const transformer = require('enketo-transformer');

const markupEntities = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
};

/**
 * Escapes HTML and XML special characters, ensuring URLs are safe to insert into
 * a Survey's HTML form and XML model. Note: this is technically incorrect (as is
 * the MDN documentation for reserved HTML entities), as it does not include
 * single-quote characters. But this matches the current behavior in enketo-transformer
 * (which is the default behavior of libxmljs). This is probably safe, as transformer
 * will not serialize attribute values to single quotes.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Glossary/Entity}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/XML/XML_introduction#entities}
 * @param {string} value
 * @return {string}
 */
const escapeMarkupEntities = (value) =>
    value.replace(/[&<>"]/g, (character) => markupEntities[character]);

const escapeMarkupURLPath = (value) =>
    escapeMarkupEntities(transformer.escapeURLPath(value));

/**
 * Converts a url to a local (proxied) url.
 *
 * @static
 * @param { string } url - The url to convert
 * @return { string } The converted url
 */
function toLocalMediaUrl(url) {
    const localUrl = `${config['base path']}/media/get/${url.replace(
        /(https?):\/\//,
        '$1/'
    )}`;

    return escapeMarkupURLPath(localUrl);
}

/**
 * @typedef ManifestItem
 * @property {string} filename
 * @property {string} hash
 * @property {string} downloadUrl
 */

/**
 * @param {ManifestItem[]} manifest
 * @return {Record<string, string>}
 */
const toMediaMap = (manifest) =>
    Object.fromEntries(
        manifest.map(({ filename, downloadUrl }) => [
            escapeMarkupURLPath(filename),
            toLocalMediaUrl(downloadUrl),
        ])
    );

/**
 * @typedef {import('../models/survey-model').SurveyObject} Survey
 */

/**
 * @param {Survey} survey
 * @return {Survey}
 */
const replaceMediaSources = (survey) => {
    const media = toMediaMap(survey.manifest);

    let { form, model } = survey;

    if (media) {
        const JR_URL = /"jr:\/\/[\w-]+\/([^"]+)"/g;
        const replacer = (match, filename) => {
            if (media[filename]) {
                return `"${media[filename]}"`;
            }

            return match;
        };

        form = form.replace(JR_URL, replacer);
        model = model.replace(JR_URL, replacer);

        if (media['form_logo.png']) {
            form = form.replace(
                /(class="form-logo"\s*>)/,
                `$1<img src="${media['form_logo.png']}" alt="form logo">`
            );
        }
    }

    const manifest = survey.manifest.map((item) => ({
        ...item,
        filename: escapeMarkupURLPath(item.filename),
        downloadUrl: escapeMarkupURLPath(item.downloadUrl),
    }));

    return {
        ...survey,
        form,
        manifest,
        model,
    };
};

/**
 * @param {string} requestProtocol
 * @param {string | URL} expected
 * @param {string | URL} actual
 */
const isSameHost = (requestProtocol, expected, actual) => {
    const expectedURL = new URL(
        /^https?:\/\//.test(expected)
            ? expected
            : `${requestProtocol}:${expected}`
    );

    const { host: expectedHost } = expectedURL;
    const { host: actualHost } = new URL(actual);

    return actualHost === expectedHost;
};

/**
 * @typedef HostMatchesOptions
 * @property {boolean} [asPattern]
 */

/**
 * @param {import('express').Request} request
 * @param {string | URL} expected
 * @param {string | URL} actual
 * @param {HostMatchesOptions} [options]
 */
const hostMatches = (request, expected, actual, options = {}) => {
    const { protocol: requestProtocol } = request;
    const ensureSSL =
        !request.app.get('linked form and data server').authentication[
            'allow insecure transport'
        ] || requestProtocol === 'https';
    const { protocol: actualProtocol, host: actualHost } = new URL(actual);

    if (ensureSSL && actualProtocol !== 'https:') {
        return false;
    }

    if (options.asPattern) {
        const expectedPattern = new RegExp(expected);

        return expectedPattern.test(actualHost);
    }

    return isSameHost(requestProtocol, expected, actual);
};

/** @type {Set<string>} */
let mediaHosts = new Set();

/**
 * @private
 * Used for test isolation
 */
const resetMediaHosts = () => {
    mediaHosts = new Set();
};

/**
 * @param {string} downloadUrl
 */
const addMediaHost = (downloadUrl) => {
    const { host } = new URL(downloadUrl);

    mediaHosts.add(host);

    if (cluster.workers != null) {
        for (const worker of Object.values(cluster.workers)) {
            worker.send({
                type: 'addMediaHost',
                data: host,
            });
        }
    }
};

if (cluster.worker != null) {
    cluster.worker.on('message', (message) => {
        if (message?.type === 'addMediaHost') {
            addMediaHost(message.data);
        }
    });
}

/**
 * @param {import('express').Request} request
 * @param {string} url
 * @return {boolean}
 */
const isMediaURL = (request, url) => {
    const { mediaHosts: configuredHosts, 'server url': serverURL } =
        request.app.get('linked form and data server');
    const allHosts = [...configuredHosts, ...mediaHosts];

    if (allHosts.length > 0) {
        return allHosts.some((origin) => hostMatches(request, origin, url));
    }

    return hostMatches(request, serverURL, url, { asPattern: true });
};

module.exports = {
    addMediaHost,
    isMediaURL,
    replaceMediaSources,
    resetMediaHosts,
    toLocalMediaUrl,
    toMediaMap,
};
