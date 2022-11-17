/**
 * Deals with storing the app and cached form resources using service workers.
 */

import events from './event';
import settings from './settings';
import * as unmockable from './unmockable';

/**
 * @private
 *
 * Exported only for testing.
 */
const RELOAD_ON_UPDATE_TIMEOUT = 500;

/**
 * @private
 *
 * Exported only for testing.
 */
const UPDATE_REGISTRATION_INTERVAL = 60 * 60 * 1000;

/**
 * @private
 *
 * Exported only for testing.
 */
const UPDATE_FORM_INTERVAL = 20 * 60 * 1000;

/**
 * @param {ServiceWorker} worker
 * @param {string} enketoId
 */
const checkFormHash = (worker, enketoId) => {
    worker.postMessage({
        type: 'CHECK_FORM_HASH',
        enketoId,
        url: unmockable.location.href,
    });
};

/**
 * @typedef {import('../../../../app/models/survey-model').SurveyObject} Survey
 */

/**
 * @param {string} enketoId
 */
const init = async (enketoId) => {
    const { serviceWorker } = navigator;

    try {
        if (serviceWorker != null) {
            const workerPath = `${settings.basePath}/x/offline-app-worker.js`;
            const workerURL = new URL(workerPath, unmockable.location.href);

            workerURL.searchParams.set('version', settings.version);

            const registration = await serviceWorker.register(workerURL);

            let reloadOnUpdate = true;

            setTimeout(() => {
                reloadOnUpdate = false;
            }, RELOAD_ON_UPDATE_TIMEOUT);

            // Registration was successful
            console.log(
                'Offline application service worker registration successful with scope: ',
                registration.scope
            );
            setInterval(() => {
                console.log(
                    'Checking for offline application cache service worker update'
                );
                registration.update();
            }, UPDATE_REGISTRATION_INTERVAL);

            const currentActive = registration.active;

            if (currentActive != null) {
                serviceWorker.addEventListener('message', (event) => {
                    const { type, enketoId: updatedEnketoId } = event.data;

                    if (
                        type === 'FORM_UPDATED' &&
                        updatedEnketoId === enketoId
                    ) {
                        console.log('Form updated, notifying user...');
                        document.dispatchEvent(events.FormUpdated());
                    }
                });

                checkFormHash(currentActive, enketoId);
                setInterval(() => {
                    checkFormHash(currentActive, enketoId);
                }, UPDATE_FORM_INTERVAL);

                serviceWorker.addEventListener('controllerchange', () => {
                    if (reloadOnUpdate) {
                        console.log('Service worker updated, reloading...');
                        unmockable.location.reload();
                    } else {
                        console.log(
                            'Service worker updated, notifying user...'
                        );

                        document.dispatchEvent(events.ApplicationUpdated());
                    }
                });
            }

            registration.update();

            if (currentActive == null) {
                unmockable.location.reload();
            } else {
                _reportOfflineLaunchCapable(true);
            }
        } else {
            if (unmockable.location.protocol.startsWith('http:')) {
                console.error(
                    'Service workers not supported on this http URL (insecure)'
                );
            } else {
                console.error(
                    'Service workers not supported on this browser. This form cannot launch online'
                );
            }

            _reportOfflineLaunchCapable(false);
        }
    } catch (error) {
        // registration failed :(
        const registrationError = Error(
            `Offline application service worker registration failed: ${error.message}`
        );

        registrationError.stack = error.stack;

        _reportOfflineLaunchCapable(false);

        throw registrationError;
    }
};

function _reportOfflineLaunchCapable(capable = true) {
    document.dispatchEvent(events.OfflineLaunchCapable({ capable }));
}

export default {
    init,
    RELOAD_ON_UPDATE_TIMEOUT,
    UPDATE_REGISTRATION_INTERVAL,
    UPDATE_FORM_INTERVAL,
    get serviceWorkerScriptUrl() {
        const { serviceWorker } = navigator;

        if (serviceWorker?.controller != null) {
            return serviceWorker.controller.scriptURL;
        }

        return null;
    },
};
