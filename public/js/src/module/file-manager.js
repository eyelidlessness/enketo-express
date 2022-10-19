/*
 * Replaces file-manager in enketo-core.
 */

import { getFilename } from 'enketo-core/src/js/utils';
import settings from './settings';
import connection from './connection';
import utils from './utils';
import { t } from './translator';
import { getMediaHash } from './media';

const URL_RE = /[a-zA-Z0-9+-.]+?:\/\//;

/**
 * Initialize the file manager .
 *
 * @return { object } promise boolean or rejection with Error
 */
function init() {
    return Promise.resolve(true);
}

/**
 * Whether the filemanager is waiting for user permissions
 *
 * @return { boolean } [description]
 */
function isWaitingForPermissions() {
    return false;
}

/** @type {WeakMap<object, string>} */
const objectURLCache = new WeakMap();

/**
 * @param {Blob} blob
 */
const getObjectURL = (blob) => {
    let result = objectURLCache.get(blob);

    if (result == null) {
        result = URL.createObjectURL(blob);
        objectURLCache.set(blob, result);
    }

    return result;
};

/**
 * Obtains a url that can be used to show a preview of the file when used
 * as a src attribute.
 *
 * @param  {string | Blob} [subject] - File or filename
 * @return {Promise<string>}         promise url string or rejection with Error
 */
const getFileUrl = async (subject) => {
    if (subject == null) {
        return 'data:,';
    }

    if (typeof subject === 'object') {
        if (isTooLarge(subject)) {
            throw getMaxSizeError();
        }

        return getObjectURL(subject);
    }

    const isFormAttachment = subject.includes('jr:');
    const isInstanceAttachment = !subject.includes('/');
    const isAttachment = isFormAttachment || isInstanceAttachment;

    if (isAttachment) {
        const { location } = window;
        const { searchParams } = new URL(location);
        const editInstanceId = searchParams.get('instance_id');
        const instanceId = editInstanceId ?? getInstanceId();
        const resourdeId = instanceId ?? settings.enketoId;
        const mediaType =
            instanceId == null ? 0 : instanceId === editInstanceId ? 1 : 2;
        const mediaHash = isFormAttachment ? getMediaHash() : '';
        const fileName = subject.replace(/.*\/([^/]+$)/, '$1');

        if (mediaType === 2) {
            return `${window.location.origin}/idb/files/${instanceId}:${fileName}`;
        }

        const { href } = new URL(
            `./media/get/${mediaType}/${resourdeId}/${mediaHash}/${fileName}`.replace(
                '//',
                '/'
            ),
            location.href.replace(/\/x\/.*/, '/')
        );

        return href;
    }

    // Very likely a fully qualified URL
    return subject;
};

/**
 * Similar to getFileURL, except that this one is guaranteed to return an objectURL
 *
 * It is meant for loading images into a canvas.
 *
 * @param  {?string|object} subject - File or filename in local storage
 * @return { object }         promise url string or rejection with Error
 */
function getObjectUrl(subject) {
    return getFileUrl(subject).then((url) => {
        if (/https?:\/\//.test(url)) {
            return connection
                .getMediaFile(url)
                .then((obj) => URL.createObjectURL(obj.item));
        }

        return url;
    });
}

/**
 * Obtain files currently stored in file input elements of open record
 *
 * @return { Promise } A promise that resolves with an array of files
 */
function getCurrentFiles() {
    const fileInputs = [
        ...document.querySelectorAll(
            'form.or input[type="file"], form.or input[type="text"][data-drawing="true"]'
        ),
    ];
    const fileTasks = [];

    const _processNameAndSize = function (input, file) {
        if (file && file.name) {
            // Correct file names by adding a unique-ish postfix
            // First create a clone, because the name property is immutable
            // TODO: in the future, when browser support increase we can invoke
            // the File constructor to do this.
            const newFilename = getFilename(
                file,
                input.dataset.filenamePostfix
            );
            // If file is resized, get Blob representation of data URI
            if (input.dataset.resized && input.dataset.resizedDataURI) {
                file = utils.dataUriToBlobSync(input.dataset.resizedDataURI);
            }
            file = new Blob([file], {
                type: file.type,
            });
            file.name = newFilename;
        }

        return file;
    };

    fileInputs.forEach((input) => {
        if (input.type === 'file') {
            // first get any files inside file input elements
            if (input.files[0]) {
                fileTasks.push(
                    Promise.resolve(_processNameAndSize(input, input.files[0]))
                );
            }
        } else if (input.value) {
            // then from canvases
            const canvas = input
                .closest('.question')
                .querySelector('.draw-widget canvas');
            if (canvas && !URL_RE.test(input.value)) {
                fileTasks.push(
                    new Promise((resolve) =>
                        canvas.toBlob((blob) => {
                            blob.name = input.value;
                            resolve(_processNameAndSize(input, blob));
                        })
                    )
                );
            }
        }
    });

    return Promise.all(fileTasks).then((files) => {
        // get any file names of files that were loaded as DataURI and have remained unchanged (i.e. loaded from Storage)
        fileInputs
            .filter((input) => input.matches('[data-loaded-file-name]'))
            .forEach((input) =>
                files.push(input.getAttribute('data-loaded-file-name'))
            );

        return files;
    });
}

/**
 * Traverses files currently stored in file input elements of open record to find a specific file.
 *
 * @param { string } filename - filename
 * @return { Promise } array of files
 */
function getCurrentFile(filename) {
    // relies on all file names to be unique (which they are)
    return getCurrentFiles().then((files) =>
        files.find((file) => file.name === filename)
    );
}

/**
 * Obtains the instanceId of the current record.
 *
 * @return {?string} [description]
 */
function getInstanceId() {
    return settings.recordId;
}

/**
 * Whether the file is too large too handle and should be rejected
 *
 * @param  {Blob}  file - the File
 * @return {boolean} whether file is too large
 */
function isTooLarge(file) {
    return file && file.size > _getMaxSize();
}

function getMaxSizeError() {
    return new Error(
        t('filepicker.toolargeerror', {
            maxSize: getMaxSizeReadable(),
        })
    );
}

/**
 * Returns the maximum size of a file
 *
 * @return {number} the maximum size of a file in bytes
 */
function _getMaxSize() {
    return settings.maxSize;
}

function getMaxSizeReadable() {
    return `${Math.round((_getMaxSize() * 100) / (1000 * 1000 * 100))}MB`;
}

export default {
    isWaitingForPermissions,
    init,
    getFileUrl,
    getObjectUrl,
    getCurrentFiles,
    getCurrentFile,
    isTooLarge,
    getMaxSizeReadable,
};
