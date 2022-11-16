/**
 * Deals with storing the app using service workers.
 */

import events from './event';
import settings from './settings';

/**
 * @private
 *
 * Used only for mocking `window.reload` in tests.
 */
const location = {
    get protocol() {
        return window.location.protocol;
    },

    reload() {
        window.location.reload();
    },
};

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
 * @typedef {import('../../../../app/models/survey-model').SurveyObject} Survey
 */

/**
 * @param {Survey} survey
 */
const init = async (survey) => {
    const { serviceWorker } = navigator;

    try {
        if (serviceWorker != null) {
            const workerPath = `${settings.basePath}/x/offline-app-worker.js`;
            const workerURL = new URL(workerPath, window.location.href);

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
                serviceWorker.addEventListener('controllerchange', () => {
                    if (reloadOnUpdate) {
                        console.log('Service worker updated, reloading...');
                        location.reload();
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
                location.reload();
            } else {
                _reportOfflineLaunchCapable(true);
            }
        } else {
            if (location.protocol.startsWith('http:')) {
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

    return survey;
};

function _reportOfflineLaunchCapable(capable = true) {
    document.dispatchEvent(events.OfflineLaunchCapable({ capable }));
}

export default {
    init,
    location,
    RELOAD_ON_UPDATE_TIMEOUT,
    UPDATE_REGISTRATION_INTERVAL,
    get serviceWorkerScriptUrl() {
        const { serviceWorker } = navigator;

        if (serviceWorker?.controller != null) {
            return serviceWorker.controller.scriptURL;
        }

        return null;
    },
};
