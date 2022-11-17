import applicationCache from '../../public/js/src/module/application-cache';
import events from '../../public/js/src/module/event';
import settings from '../../public/js/src/module/settings';
import * as unmockable from '../../public/js/src/module/unmockable';

class TestServiceWorker {
    constructor() {
        /** @type {(message: any) => void} */
        this.postMessage = () => {};
    }
}

describe('Application cache initialization (offline service worker registration)', () => {
    const basePath = '-';
    const enketoId = '3a673';
    const version = `1.2.3-BADB3D`;
    const applicationUpdatedEvent = events.ApplicationUpdated();
    const applicationUpdatedType = applicationUpdatedEvent.type;
    const offlineLaunchCapableType = events.OfflineLaunchCapable().type;

    /** @type {ServiceWorker | null} */
    let activeServiceWorker;

    /** @type {sinon.SinonSandbox} */
    let sandbox;

    /** @type {sinon.SinonFakeTimers} */
    let timers;

    /** @type {sinon.SinonFake} */
    let offlineLaunchCapableListener;

    /** @type {sinon.SinonStub} */
    let reloadStub;

    /** @type {sinon.SinonStub} */
    let registrationStub;

    /** @type {sinon.SinonFake} */
    let registrationUpdateFake;

    /** @type {Record<string, Function[]>} */
    let serviceWorkerListeners = {};

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        timers = sandbox.useFakeTimers(Date.now());

        offlineLaunchCapableListener = sinon.fake();

        document.addEventListener(
            offlineLaunchCapableType,
            offlineLaunchCapableListener
        );

        activeServiceWorker = null;

        registrationUpdateFake = sandbox.fake(() => Promise.resolve());

        registrationStub = sandbox
            .stub(navigator.serviceWorker, 'register')
            .callsFake(() =>
                Promise.resolve({
                    addEventListener() {},
                    active: activeServiceWorker,
                    update: registrationUpdateFake,
                })
            );
        reloadStub = sandbox
            .stub(unmockable.location, 'reload')
            .callsFake(() => {});

        settings.basePath ??= undefined;
        settings.version ??= undefined;
        sandbox.stub(settings, 'basePath').value(basePath);
        sandbox.stub(settings, 'version').value(version);

        const addServiceWorkerListener =
            navigator.serviceWorker.addEventListener;

        serviceWorkerListeners = {};

        sandbox
            .stub(navigator.serviceWorker, 'addEventListener')
            .callsFake((type, listener) => {
                const listeners = serviceWorkerListeners[type] ?? [];

                serviceWorkerListeners[type] = listeners;
                listeners.push(listener);

                addServiceWorkerListener.call(
                    navigator.serviceWorker,
                    type,
                    listener
                );
            });
    });

    afterEach(() => {
        document.removeEventListener(
            offlineLaunchCapableType,
            offlineLaunchCapableListener
        );

        Object.entries(serviceWorkerListeners).forEach(([type, listeners]) => {
            listeners.forEach((listener) => {
                navigator.serviceWorker.removeEventListener(type, listener);
            });
        });

        timers.reset();
        timers.restore();
        sandbox.restore();
    });

    it('registers the service worker script', async () => {
        await applicationCache.init(enketoId);

        expect(registrationStub).to.have.been.calledWith(
            new URL(
                `${basePath}/x/offline-app-worker.js?version=${version}`,
                window.location.href
            )
        );
    });

    it('reloads immediately after registering the service worker for the first time', async () => {
        await applicationCache.init(enketoId);

        expect(reloadStub).to.have.been.called;
    });

    it('does not reload immediately after registering the service worker for subsequent times', async () => {
        activeServiceWorker = new TestServiceWorker();

        await applicationCache.init(enketoId);

        expect(reloadStub).not.to.have.been.called;
    });

    it('reports offline capability after registering the service worker for subsequent times', async () => {
        activeServiceWorker = new TestServiceWorker();

        await applicationCache.init(enketoId);

        expect(offlineLaunchCapableListener).to.have.been.calledWith(
            events.OfflineLaunchCapable({ capable: true })
        );
    });

    it('reports offline capability is not available when service workers are not available', async () => {
        activeServiceWorker = new TestServiceWorker();

        sandbox.stub(navigator, 'serviceWorker').value(null);

        await applicationCache.init(enketoId);

        expect(offlineLaunchCapableListener).to.have.been.calledWith(
            events.OfflineLaunchCapable({ capable: false })
        );
    });

    it('reports offline capability is not available when registration throws an error', async () => {
        activeServiceWorker = new TestServiceWorker();

        const error = new Error('Something bad');

        registrationStub.callsFake(() => Promise.reject(error));

        /** @type {Error} */
        let caught;

        try {
            await applicationCache.init(enketoId);
        } catch (error) {
            caught = error;
        }

        expect(offlineLaunchCapableListener).to.have.been.calledWith(
            events.OfflineLaunchCapable({ capable: false })
        );
        expect(caught instanceof Error).to.equal(true);
        expect(caught.message).to.include(error.message);
        expect(caught.stack).to.equal(error.stack);
    });

    it('reloads when an updated service worker becomes active on load', async () => {
        activeServiceWorker = new TestServiceWorker();
        await applicationCache.init(enketoId);

        expect(unmockable.location.reload).not.to.have.been.called;

        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));

        expect(unmockable.location.reload).to.have.been.called;
    });

    it('checks for application updates immediately after registration', async () => {
        await applicationCache.init(enketoId);

        expect(registrationUpdateFake).to.have.been.calledOnce;
    });

    it('checks for application updates periodically', async () => {
        await applicationCache.init(enketoId);

        expect(registrationUpdateFake).to.have.been.calledOnce;

        timers.tick(applicationCache.UPDATE_REGISTRATION_INTERVAL);

        expect(registrationUpdateFake).to.have.been.calledTwice;

        timers.tick(applicationCache.UPDATE_REGISTRATION_INTERVAL);

        expect(registrationUpdateFake).to.have.been.calledThrice;
    });

    it('notifies the user, rather than reloading, when a service worker update is detected some time after the page is loaded', async () => {
        activeServiceWorker = new TestServiceWorker();
        await applicationCache.init(enketoId);

        timers.tick(applicationCache.RELOAD_ON_UPDATE_TIMEOUT);

        const listener = sandbox.fake();

        document.addEventListener(applicationUpdatedType, listener);
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
        document.removeEventListener(applicationUpdatedType, listener);

        expect(reloadStub).not.to.have.been.called;
        expect(listener).to.have.been.calledOnceWith(applicationUpdatedEvent);
    });

    it('messages the active service worker to check for form updates immediately after registration', async () => {
        activeServiceWorker = new TestServiceWorker();

        const postMessageStub = sandbox.stub(
            activeServiceWorker,
            'postMessage'
        );

        await applicationCache.init(enketoId);

        expect(postMessageStub).to.have.been.calledOnceWith({
            type: 'CHECK_FORM_HASH',
            enketoId,
            url: unmockable.location.href,
        });
    });

    it('checks for form updates periodically', async () => {
        activeServiceWorker = new TestServiceWorker();

        const postMessageStub = sandbox.stub(
            activeServiceWorker,
            'postMessage'
        );

        await applicationCache.init(enketoId);

        expect(postMessageStub).to.have.been.calledOnce;

        timers.tick(applicationCache.UPDATE_FORM_INTERVAL);

        expect(postMessageStub).to.have.been.calledTwice;

        timers.tick(applicationCache.UPDATE_FORM_INTERVAL);

        expect(postMessageStub).to.have.been.calledThrice;

        const calls = postMessageStub.getCalls();

        calls.forEach((call) => {
            const { args } = call;

            expect(args).to.deep.equal([
                {
                    type: 'CHECK_FORM_HASH',
                    enketoId,
                    url: unmockable.location.href,
                },
            ]);
        });
    });

    it('notifies users when the service worker detects a form update', async () => {
        /** @type {Event | null} */
        let formUpdated = null;

        const formUpdatedListener = (event) => {
            formUpdated = event;
        };

        const formUpdatedEventType = events.FormUpdated().type;

        document.addEventListener(formUpdatedEventType, formUpdatedListener);

        activeServiceWorker = new TestServiceWorker();
        await applicationCache.init(enketoId);

        navigator.serviceWorker.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'FORM_UPDATED',
                    enketoId,
                },
            })
        );

        document.removeEventListener('message', formUpdated);

        expect(formUpdated.type).to.equal(formUpdatedEventType);
    });
});
