/**
 * @module communicator
 */

const { request } = require('undici');
const TError = require('./custom-error').TranslatedError;
const config = require('../models/config-model').server;
const debug = require('debug')('openrosa-communicator');
const Xml2Js = require('xml2js');

const parser = new Xml2Js.Parser();
const { getCurrentRequest } = require('./context');
const { ResponseError } = require('./custom-error');

const TIMEOUT = config.timeout;

/**
 * Gets form info
 *
 *
 * @static
 * @param { module:survey-model~SurveyObject } survey - survey object
 * @return { Promise<module:survey-model~SurveyObject> } a Promise that resolves with a survey object with added info
 */
function getXFormInfo(survey) {
    if (!survey || !survey.openRosaServer) {
        throw new Error('No server provided.');
    }

    return openRosaRequest(
        getFormListUrl(
            survey.openRosaServer,
            survey.openRosaId,
            survey.customParam
        ),
        {
            auth: survey.credentials,
            headers: {
                cookie: survey.cookie,
            },
        }
    ).then((formListXml) => _findFormAddInfo(formListXml, survey));
}

/**
 * @typedef OpenRosaXForm
 * @property {string} descriptionText
 * @property {string} downloadUrl
 * @property {string} formID
 * @property {string} hash
 * @property {string} manifestUrl
 * @property {string} name
 * @property {string} version
 */

/**
 * Gets XForm from url
 *
 * @static
 * @param  { object } survey - survey object
 * @return { Promise<module:survey-model~SurveyObject> } a Promise that resolves with a survey object with added XForm
 */
function getXForm(survey) {
    return openRosaRequest(survey.info.downloadUrl, {
        auth: survey.credentials,
        headers: {
            cookie: survey.cookie,
        },
    }).then((xform) => {
        survey.xform = xform;

        return Promise.resolve(survey);
    });
}

/**
 * Obtains the XForm manifest
 *
 * @static
 * @param {module:survey-model~SurveyObject} survey - survey object
 * @return { Promise<module:survey-model~SurveyObject> } a Promise that resolves with a survey object with added manifest
 */
function getManifest(survey) {
    if (survey.info == null || !survey.info.manifestUrl) {
        return Promise.resolve({
            ...survey,
            manifest: [],
        });
    }
    return openRosaRequest(survey.info.manifestUrl, {
        auth: survey.credentials,
        headers: {
            cookie: survey.cookie,
        },
    })
        .then(_xmlToJson)
        .then((obj) => {
            survey.manifest =
                obj.manifest && obj.manifest.mediaFile
                    ? obj.manifest.mediaFile.map((file) =>
                          _simplifyFormObj(file)
                      )
                    : [];

            return survey;
        });
}

/**
 * Checks the maximum acceptable submission size the server accepts
 *
 * @static
 * @param { module:survey-model~SurveyObject } survey - survey object
 * @return { Promise<string> } promise resolving with max size stringified number
 */
function getMaxSize(survey) {
    // Using survey.xformUrl is non-standard but the only way for previews served from `?form=URL`.
    const submissionUrl = survey.openRosaServer
        ? getSubmissionUrl(survey.openRosaServer)
        : survey.info.downloadUrl;

    return openRosaRequest(submissionUrl, {
        auth: survey.credentials,
        headers: {
            Cookie: survey.cookie,
        },
        method: 'HEAD',
    }).then((response) => response.headers['x-openrosa-accept-content-length']);
}

/**
 * @static
 * @param { module:survey-model~SurveyObject } survey - survey object
 * @return { Promise<module:survey-model~SurveyObject> } a promise that resolves with a survey object
 */
const authenticate = async (survey) => {
    await openRosaRequest(
        getFormListUrl(
            survey.openRosaServer,
            survey.openRosaId,
            survey.customParam
        ),
        {
            auth: survey.credentials,
            headers: {
                cookie: survey.cookie,
            },
            // Formhub has a bug and cannot use the correct HEAD method.
            method: config['linked form and data server']['legacy formhub']
                ? 'GET'
                : 'HEAD',
        }
    );

    debug('successful (authenticated if it was necessary)');

    return survey;
};

/**
 * Generates an Auhorization header that can be used to inject into piped requests (e.g. submissions).
 *
 * @static
 * @param { string } url - URL to request
 * @param { {user: string, pass: string, bearer: string} } [credentials] - user credentials
 * @return { Promise<string | null | undefined> } a promise that resolves with an auth header
 */
const getAuthHeader = async (url, credentials) => {
    const options = {
        method: 'HEAD',
        headers: {
            'X-OpenRosa-Version': '1.0',
            Date: new Date().toUTCString(),
        },
        timeout: TIMEOUT,
    };

    const { bearer, user, pass } = credentials ?? {};

    // Don't bother making Head request first if token was provided.
    if (bearer) {
        return `Bearer ${bearer}`;
    }

    try {
        // Check if Basic or Digest Authorization header is required and return header if so.
        const response = await request(url, options);

        if (response.statusCode === 401 && user && pass) {
            const auth = Buffer.from(`${user}:${pass}`).toString('base64');

            return `Basic ${auth}`;
        }
    } catch (error) {
        // Ignore errors
    }

    return null;
};

/**
 * getFormListUrl
 *
 * @static
 * @param { string } server - server URL
 * @param { string } [id] - Form id.
 * @param { string } [customParam] - custom query parameter
 * @return { string } url
 */
function getFormListUrl(server, id, customParam) {
    const baseURL = server.endsWith('/') ? server : `${server}/`;

    const url = new URL('./formList', baseURL);

    if (id != null) {
        url.searchParams.set('formID', id);
    }

    if (customParam != null) {
        const customParamName = config['query parameter to pass to submission'];

        url.searchParams.set(customParamName, customParam);
    }

    return url.toString();
}

/**
 * @static
 * @param { string } server - server URL
 * @return { string } url
 */
function getSubmissionUrl(server) {
    return server.lastIndexOf('/') === server.length - 1
        ? `${server}submission`
        : `${server}/submission`;
}

/**
 * @param {string} value
 */
const sanitizeHeader = (value) =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        // See https://github.com/nodejs/node/blob/3d53ff8ff0e721f908d8aff7a3709bc6dbb07ebb/lib/_http_common.js#L232
        .replace(/[^\t\x20-\x7e\x80-\xff]+/g, (match) => encodeURI(match));

/**
 * @param {Record<string, string | string[]>} [headers]
 * @param {import('express').Request} [currentRequest]
 */
const getUpdatedRequestHeaders = (
    headers = {},
    currentRequest = getCurrentRequest()
) => {
    const clientUserAgent = currentRequest?.headers['user-agent'];
    const serverUserAgent = `Enketo/${config.version}`;
    const userAgent =
        clientUserAgent == null
            ? serverUserAgent
            : `${serverUserAgent} ${clientUserAgent}`;

    return {
        ...headers,

        // The Date header is forbidden to set programmatically client-side
        // so we set it here to comply with OpenRosa
        Date: new Date().toUTCString(),
        'User-Agent': sanitizeHeader(userAgent),
        'X-OpenRosa-Version': '1.0',
    };
};

/**
 * Updates request options.
 *
 * @static
 * @param { object } options - request options
 */
function getUpdatedRequestOptions(options) {
    options.method = options.method || 'GET';

    // set headers
    options.headers = getUpdatedRequestHeaders(options.headers);
    options.timeout = TIMEOUT;

    if (!options.headers.cookie) {
        // remove falsy cookie
        delete options.headers.cookie;
    }

    // Remove falsy Authorization header
    if (!options.auth) {
        delete options.auth;
    } else if (!options.auth.bearer) {
        // check first is DIGEST or BASIC is required
        options.auth.sendImmediately = false;
    }

    return options;
}

/**
 * @template {'GET' | 'HEAD' | 'POST'} [Method='GET']
 * @typedef OpenRosaRequestOptions
 * @property {Method} [method]
 * @property {Record<string, string>} [headers]
 * @property {unknown} [auth]
 */

/**
 * @typedef {Awaited<ReturnType<typeof request>>} Response
 */

/**
 * Sends a request to an OpenRosa server
 *
 * @template {'GET' | 'HEAD' | 'POST'} [Method='GET']
 * @param {string} url
 * @param {OpenRosaRequestOptions<Method>} options - request options object
 * @return {Promise<Method extends 'HEAD' ? Response : string>} Promise
 */
const openRosaRequest = async (url, options) => {
    try {
        const requestOptions = getUpdatedRequestOptions(options);
        const response = await request(url, requestOptions);
        const { statusCode } = response;
        const body = await response.body.text();

        if (statusCode === 401) {
            throw new ResponseError(
                statusCode,
                'Forbidden. Authorization Required.'
            );
        }

        if (statusCode < 200 || statusCode >= 300) {
            throw new ResponseError(
                statusCode,
                `Request to ${options.url} failed.`
            );
        }

        if (options.method === 'HEAD') {
            return response;
        }

        debug(
            `response of request to ${options.url} has status code: `,
            statusCode
        );

        return body;
    } catch (error) {
        debug(`Error occurred when requesting ${options.url}`, error);

        throw error;
    }
};

/**
 * transform XML to JSON for easier processing
 *
 * @param { string } xml - XML string
 * @return {Promise<string|Error>} a promise that resolves with JSON
 */
function _xmlToJson(xml) {
    return new Promise((resolve, reject) => {
        parser.parseString(xml, (error, data) => {
            if (error) {
                debug('error parsing xml and converting to JSON');
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

/**
 * Finds the relevant form in an OpenRosa XML formList
 *
 * @param { string } formListXml - OpenRosa XML formList
 * @param {module:survey-model~SurveyObject} survey - survey object
 * * @return { Promise } promise
 */
function _findFormAddInfo(formListXml, survey) {
    let found;
    let index;
    let error;

    return new Promise((resolve, reject) => {
        // first convert to JSON to make it easier to work with
        _xmlToJson(formListXml)
            .then((formListObj) => {
                if (formListObj.xforms && formListObj.xforms.xform) {
                    // find the form and stop looking when found
                    found = formListObj.xforms.xform.some((xform, i) => {
                        index = i;

                        return xform.formID.toString() === survey.openRosaId;
                    });
                }

                if (!found) {
                    error = new TError('error.notfoundinformlist', {
                        formId: survey.openRosaId,
                    });
                    error.status = 404;
                    reject(error);
                } else {
                    debug('found form');
                    survey.info = _simplifyFormObj(
                        formListObj.xforms.xform[index]
                    );
                    debug('survey.info', survey.info);
                    resolve(survey);
                }
            })
            .catch(reject);
    });
}

/**
 * Convert arrays property values to strings, knowing that each xml node only
 * occurs once in each xform node in /formList
 *
 * @param { object } formObj - a form object
 * @return { object } a simplified form object
 */
function _simplifyFormObj(formObj) {
    for (const prop in formObj) {
        if (
            Object.prototype.hasOwnProperty.call(formObj, prop) &&
            Object.prototype.toString.call(formObj[prop]) === '[object Array]'
        ) {
            formObj[prop] = formObj[prop][0].toString();
        }
    }

    return formObj;
}

module.exports = {
    getXFormInfo,
    getXForm,
    getManifest,
    getMaxSize,
    authenticate,
    getAuthHeader,
    getFormListUrl,
    getSubmissionUrl,
    getUpdatedRequestOptions,
    getUpdatedRequestHeaders,
};
