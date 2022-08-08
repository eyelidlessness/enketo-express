const transformer = require('enketo-transformer');

const escapeMediaURL = (value) => transformer.escapeURLPath(value);

const EMPTY_TEXT_DATA_URL = 'data:text/plain,';

/**
 * @param {string} contentType
 * @param {Buffer | string} value
 */
const toDataURL = (contentType, value) => {
    const data = Buffer.from(value).toString('base64');

    if (data === '') {
        return EMPTY_TEXT_DATA_URL;
    }

    return `data:${contentType};base64,${data}`;
};

module.exports = {
    escapeMediaURL,
    toDataURL,
};
