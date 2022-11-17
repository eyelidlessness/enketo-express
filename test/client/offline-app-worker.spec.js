/* eslint-disable max-classes-per-file */
import {
    FORMS_CACHE,
    STATIC_CACHE,
} from '../../public/js/src/module/offline-app-worker';

/**
 * @param {any} key
 */
const cacheKey = (key) => {
    if (key instanceof Headers) {
        const entries = [];

        key.forEach((headerValue, headerKey) =>
            entries.push([headerKey, headerValue])
        );

        return cacheKey(entries);
    }

    if (typeof key === 'object' && key != null) {
        return JSON.stringify(
            Object.fromEntries(
                Object.entries(key)
                    .sort(([a], [b]) => (a > b ? 1 : -1))
                    .map(([key, value]) => [key, cacheKey(value)])
            )
        );
    }

    return key;
};

/**
 * @implements {Map<string, Response>}
 */
class PendingResponseMap extends Map {
    /**
     * @param {Request | string} request
     * @param {Response} response
     */
    set(request, response) {
        const key = cacheKey(request);

        return super.set(key, response);
    }
}

/** @type {PendingResponseMap} */
let pendingResponses;

describe.only('Offline app (service) worker', () => {
    const basePath = '/-';
    const enketoId = '3a673';
    const serviceWorkerURL = `${window.location.origin}/public/js/build/offline-app-worker.js`;

    /**
     * @typedef WaitableEvent
     * @property {Array<Promise<any>>} promises
     */

    /**
     * @implements {WaitableEvent}
     */
    class ExtendableEvent extends Event {
        /**
         * @param {string} type
         */
        constructor(type) {
            super(type);

            /** @type {Array<Promise<any>>} */
            this.promises = [];
        }

        /**
         * @param {Promise<any>} promise
         */
        waitUntil(promise) {
            this.promises.push(promise);
        }
    }

    /**
     * @param {WaitableEvent} event
     */
    const waitForEvent = async (event) => {
        self.dispatchEvent(event);

        await Promise.all(event.promises);
    };

    /** @type {sinon.SinonSandbox} */
    let sandbox;

    /** @type {sinon.SinonFakeTimers} */
    let timers;

    /** @type {sinon.SinonStub} */
    let skipWaitingStub;

    /** @type {sinon.SinonStub} */
    let clientsClaimStub;

    /** @type {sinon.SinonStub} */
    let fetchStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        timers = sandbox.useFakeTimers({
            now: Date.now(),
            shouldAdvanceTime: true,
        });

        if (!Object.prototype.hasOwnProperty.call(self, 'serviceWorker')) {
            self.serviceWorker = {
                scriptURL: undefined,
            };
        }

        sandbox.stub(self, 'serviceWorker').value({
            scriptURL: serviceWorkerURL,
        });

        if (!Object.prototype.hasOwnProperty.call(self, 'skipWaiting')) {
            self.skipWaiting = undefined;
        }

        skipWaitingStub = sandbox.fake();

        sandbox.stub(self, 'skipWaiting').get(() => skipWaitingStub);

        if (!Object.prototype.hasOwnProperty.call(self, 'clients')) {
            self.clients = undefined;
        }

        clientsClaimStub = sandbox.fake();

        sandbox.stub(self, 'clients').get(() => ({
            claim: clientsClaimStub,
        }));

        pendingResponses = new PendingResponseMap();

        fetchStub = sandbox.stub(window, 'fetch').callsFake((request) => {
            const key = cacheKey(request);
            if (!pendingResponses.has(key)) {
                throw new Error(
                    `Unexpected request: ${request.url ?? request}`
                );
            }

            const response = pendingResponses.get(key);

            pendingResponses.delete(key);

            return response;
        });
    });

    afterEach(async () => {
        await timers.runAllAsync();
        sandbox.restore();

        const keys = await caches.keys();

        await Promise.all(keys.map((key) => caches.delete(key)));
    });

    describe('service worker lifecycle', () => {
        it('skips waiting when a worker update is installed', async () => {
            await waitForEvent(new ExtendableEvent('install'));

            expect(skipWaitingStub).to.have.been.calledOnce;
        });

        it('removes stale caches of non-form resources on activation', async () => {
            await Promise.all(
                [STATIC_CACHE, FORMS_CACHE, 'anything-else'].map((key) =>
                    caches.open(key)
                )
            );

            const event = new ExtendableEvent('activate');

            await waitForEvent(event);

            const cacheKeys = await caches.keys();

            expect(cacheKeys).to.deep.equal([FORMS_CACHE]);
        });

        it('claims clients on activation', async () => {
            const event = new ExtendableEvent('activate');

            await waitForEvent(event);

            expect(clientsClaimStub).to.have.been.calledOnce;
        });

        it('caches app resources', async () => {
            await Promise.all(['foo', 'bar', 'quux']);
        });
    });

    describe('requests', () => {
        /**
         * @implements {WaitableEvent}
         */
        class FetchEvent extends Event {
            /**
             * @param {Request} request
             */
            constructor(request) {
                super('fetch');

                this.request =
                    typeof request === 'string'
                        ? new Request(request)
                        : request;

                /** @type {Array<Promise<any>>} */
                this.promises = [];
            }

            /**
             * @param {Promise<Response | void>} promise
             */
            // eslint-disable-next-line class-methods-use-this
            respondWith(promise) {
                this.promises.push(promise);
            }
        }

        /**
         * @param {Request | string} request
         * @param {Response | undefined} response
         */
        const expectResponse = async (request, response) => {
            const event = new FetchEvent(request);
            const respondWithStub = sandbox.stub(event, 'respondWith');

            pendingResponses.set(request, response);

            await waitForEvent(event);

            expect(respondWithStub).to.have.been.calledOnce;

            const [call] = respondWithStub.getCalls();
            const [promise] = call.args;

            expect(promise instanceof Promise).to.equal(true);

            const arg = await promise;

            expect(arg).to.deep.equal(response);

            return arg;
        };

        ['POST', 'PUT', 'DELETE'].forEach((method) => {
            it(`does not handle ${method} requests`, async () => {
                const request = new Request('https://example.org/', {
                    method,
                });
                const event = new FetchEvent(request);
                const respondWithStub = sandbox.stub(event, 'respondWith');

                await waitForEvent(event);

                expect(respondWithStub).not.to.have.been.called;
            });
        });

        it('does not handle requests across origins', async () => {
            const request = new Request('https://example.org/');
            const event = new FetchEvent(request);
            const respondWithStub = sandbox.stub(event, 'respondWith');

            await waitForEvent(event);

            expect(respondWithStub).not.to.have.been.called;
        });

        it('responds with a fetched response for an uncached media URL', async () => {
            const request = new Request(
                `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
            );
            const response = new Response('<foo/>', {
                headers: {
                    'content-type': 'text/xml',
                },
            });

            await expectResponse(request, response);
        });

        it('caches a fetched media URL', async () => {
            const request = new Request(
                `${window.location.origin}/media/get/1/uuid:c477ai758f45/external-instance.xml`
            );
            const response = new Response('<foo/>', {
                headers: {
                    'content-type': 'text/xml',
                },
            });
            const event = new FetchEvent(request);

            pendingResponses.set(request, response);

            await waitForEvent(event);

            const cache = await caches.open(FORMS_CACHE);
            const cachedResponse = await cache.match(request);

            expect(cachedResponse).to.deep.equal(response);
        });

        it('returns a cached media response', async () => {
            const request = new Request(
                `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
            );
            const cachedResponse = new Response('<cached/>', {
                headers: {
                    'content-type': 'text/xml',
                },
            });
            const fetchResponse = new Response('uncached');
            const formCache = await caches.open(FORMS_CACHE);

            await formCache.put(request, cachedResponse.clone());

            const expectedResponse = await expectResponse(
                request,
                cachedResponse
            );

            expect(expectedResponse).not.to.equal(fetchResponse);
        });

        it('does not request media which is already cached', async () => {
            const request = new Request(
                `${window.location.origin}/media/get/1/uuid:c477ai758f45/external-instance.xml`
            );
            const cachedResponse = new Response('<cached/>', {
                headers: {
                    'content-type': 'text/xml',
                },
            });
            const formCache = await caches.open(FORMS_CACHE);

            await formCache.put(request, cachedResponse.clone());

            const event = new FetchEvent(request);

            await waitForEvent(event);

            expect(fetchStub).not.to.have.been.called;
        });

        it('ignores fetch failures', async () => {
            const request = new Request(
                `${window.location.origin}/media/get/1/uuid:c477ai758f45/external-instance.xml`
            );
            const event = new FetchEvent(request);

            fetchStub.callsFake(() =>
                Promise.reject(new Error('Failed to fetch'))
            );

            /** @type {Error | null} */
            let caught = null;

            try {
                await waitForEvent(event);
            } catch (error) {
                caught = error;
            }

            expect(caught).to.equal(null);
        });

        [
            {
                status: 400,
                statusText: 'Bad Request',
            },
            {
                status: 401,
                statusText: 'Unauthorized',
            },
            {
                status: 403,
                statusText: 'Forbidden',
            },
            {
                status: 404,
                statusText: 'Not Found',
            },
        ].forEach(({ status, statusText }) => {
            it(`responds with ${statusText} (${status})`, async () => {
                const request = new Request(
                    `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
                );
                const response = new Response(statusText, {
                    status,
                    statusText,
                });

                await expectResponse(request, response);
            });

            it(`does not cache fetch response ${statusText} (${status})`, async () => {
                const request = new Request(
                    `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
                );
                const response = new Response(statusText, {
                    status,
                    statusText,
                });

                pendingResponses.set(response);

                const event = new FetchEvent(request);

                await waitForEvent(event);

                const cached = await caches.match(request);

                expect(cached).to.equal(undefined);
            });
        });

        [
            { type: 'cors' },
            { type: 'error' },
            { type: 'opaque' },
            { type: 'opaqueredirect' },
        ].forEach(({ type }) => {
            it(`responds with ${type} response types`, async () => {
                const request = new Request(
                    `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
                );
                const response = new Response(type);

                sandbox.stub(response, 'type').value(type);
                await expectResponse(request, response);
            });

            it(`does not cache fetch ${type} response types`, async () => {
                const request = new Request(
                    `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
                );
                const response = new Response(type);

                sandbox.stub(response, 'type').value(type);
                pendingResponses.set(response);

                const event = new FetchEvent(request);

                await waitForEvent(event);

                const cached = await caches.match(request);

                expect(cached).to.equal(undefined);
            });
        });

        it('does not clear cached media when activating a service worker update', async () => {
            const request = new Request(
                `${window.location.origin}/media/get/0/c477ai75/8f45/external-instance.xml`
            );
            const response = new Response('<foo/>', {
                headers: {
                    'content-type': 'text/xml',
                },
            });

            const cache = await caches.open(FORMS_CACHE);

            await cache.put(request, response.clone());

            const event = new ExtendableEvent('activate');

            await waitForEvent(event);

            const cachedResponse = await cache.match(request);

            expect(cachedResponse).to.deep.equal(response);
        });

        it('updates cached HTML for all previously cached forms when activating a service worker update', async () => {
            const requestA = new Request(
                `${window.location.origin}/x/b4df00dr3dd1e`
            );
            const requestB = new Request(
                `${window.location.origin}/x/e47a730e5`
            );
            const responseA = new Response(
                '<!doctype html><html><body>initial</body></html>'
            );
            const responseB = new Response(
                '<!doctype html><html><body>updated</body></html>'
            );

            pendingResponses.set(requestA, responseA);
            pendingResponses.set(requestB, responseA);

            const initialEvents = [
                new FetchEvent(requestA),
                new FetchEvent(requestB),
            ];

            await Promise.all(initialEvents.map(waitForEvent));

            const activateEvent = new ExtendableEvent('activate');

            await waitForEvent(activateEvent);

            pendingResponses.set(requestA, responseB);

            const updateEvent = new FetchEvent(requestA);

            await waitForEvent(updateEvent);

            await expectResponse(requestB, responseB);
        });

        it('does not respond with cached HTML when a request for an uncached form fails', async () => {
            const requestA = new Request(
                `${window.location.origin}/x/b4df00dr3dd1e`
            );
            const requestB = new Request(
                `${window.location.origin}/x/e47a730e5`
            );
            const responseA = new Response(
                '<!doctype html><html><body>initial</body></html>'
            );

            pendingResponses.set(requestA, responseA);

            const initialEvent = new FetchEvent(requestA);

            await waitForEvent(initialEvent);
            await expectResponse(requestB, undefined);
        });

        it('does not respond with HTML updated in the cache when a request for an uncached form fails', async () => {
            const requestA = new Request(
                `${window.location.origin}/x/b4df00dr3dd1e`
            );
            const requestB = new Request(
                `${window.location.origin}/x/e47a730e5`
            );
            const responseA = new Response(
                '<!doctype html><html><body>initial</body></html>'
            );
            const responseB = new Response(
                '<!doctype html><html><body>updated</body></html>'
            );

            pendingResponses.set(requestA, responseA);

            const initialEvent = new FetchEvent(requestA);

            await waitForEvent(initialEvent);

            const activateEvent = new ExtendableEvent('activate');

            await waitForEvent(activateEvent);

            pendingResponses.set(requestA, responseB);

            const updateEvent = new FetchEvent(requestA);

            await waitForEvent(updateEvent);

            await expectResponse(requestB, undefined);
        });

        it('caches prefetch URLs specified in requests for the service worker script', async () => {
            const request = new Request(serviceWorkerURL);
            const prefetchResources = [
                {
                    url: `${window.location.origin}/public/css/foo-theme.css`,
                    response: new Response('.foo { font-weight: bold }', {
                        headers: {
                            'content-type': 'text/css',
                        },
                    }),
                },
                {
                    url: `${window.location.origin}/public/css/bar-theme.css`,
                    response: new Response('.bar { font-style: italic }', {
                        headers: {
                            'content-type': 'text/css',
                        },
                    }),
                },
            ];
            const nonPrefetchURL = 'https://example.com/welp';
            const response = new Response(
                'alert("Offline worker ready for duty")',
                {
                    headers: {
                        'content-type': 'text/javascript',
                        link: `<${prefetchResources[0].url}>; rel="prefetch", <${prefetchResources[1].url}>; rel="prefetch", <https://example.com/welp>, rel="preconnect"`,
                    },
                }
            );

            pendingResponses.set(request, response);
            prefetchResources.forEach(({ url, response }) => {
                pendingResponses.set(url, response);
            });

            const event = new FetchEvent(request);
            const staticCache = await caches.open(STATIC_CACHE);
            const openCache = caches.open.bind(caches);

            sandbox.stub(caches, 'open').callsFake(async (key) => {
                if (key === STATIC_CACHE) {
                    return staticCache;
                }

                return openCache(key);
            });

            const addStub = sandbox.stub(staticCache, 'add');

            try {
                await waitForEvent(event);
                await timers.nextAsync();

                prefetchResources.forEach(({ url }) => {
                    expect(addStub).to.have.been.calledWith(url);
                });

                expect(addStub).not.to.have.been.calledWith(nonPrefetchURL);
            } finally {
                await timers.runAllAsync();
                timers.restore();
            }
        });

        it('notifies a client when a cached form has been updated', async () => {
            const formURL = new URL(
                `${basePath}/x/${enketoId}`,
                window.location.href
            ).href;
            const hashURL = new URL(
                `${basePath}/transform/xform/hash/${enketoId}`,
                window.location.href
            ).href;
            const transformURL = new URL(
                `${basePath}/transform/xform/${enketoId}`,
                window.location.href
            ).href;

            const cache = await caches.open(FORMS_CACHE);

            await cache.put(
                transformURL,
                new Response('{"hash": "8675e"}', {
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            );
            pendingResponses.set(
                hashURL,
                new Response('{"hash": "123a5"}', {
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            );

            const source = new MessageChannel().port1;
            const postMessageStub = sandbox.stub(source, 'postMessage');

            const messageEvent = new MessageEvent('message', {
                data: {
                    type: 'CHECK_FORM_HASH',
                    enketoId,
                    url: formURL,
                },
                source,
            });

            self.dispatchEvent(messageEvent);

            const timeout = setTimeout(() => {
                throw new Error('Timed out');
            }, 2000);

            while (!postMessageStub.called) {
                const now = Date.now();

                // eslint-disable-next-line no-await-in-loop
                await Promise.resolve();

                // eslint-disable-next-line no-await-in-loop
                await timers.tickAsync(Date.now() - now);
            }

            clearTimeout(timeout);

            source.removeEventListener('message', postMessageStub);

            expect(postMessageStub).to.have.been.calledOnceWith({
                type: 'FORM_UPDATED',
                enketoId,
            });
        });

        it('notifies a client when a cached form is up to date', async () => {
            const formURL = new URL(
                `${basePath}/x/${enketoId}`,
                window.location.href
            ).href;
            const hashURL = new URL(
                `${basePath}/transform/xform/hash/${enketoId}`,
                window.location.href
            ).href;
            const transformURL = new URL(
                `${basePath}/transform/xform/${enketoId}`,
                window.location.href
            ).href;

            const cache = await caches.open(FORMS_CACHE);

            await cache.put(
                transformURL,
                new Response('{"hash": "8675e"}', {
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            );
            pendingResponses.set(
                hashURL,
                new Response('{"hash": "8675e"}', {
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            );

            const source = new MessageChannel().port1;
            const postMessageStub = sandbox.stub(source, 'postMessage');

            const messageEvent = new MessageEvent('message', {
                data: {
                    type: 'CHECK_FORM_HASH',
                    enketoId,
                    url: formURL,
                },
                source,
            });

            self.dispatchEvent(messageEvent);

            const timeout = setTimeout(() => {
                throw new Error('Timed out');
            }, 2000);

            while (!postMessageStub.called) {
                const now = Date.now();

                // eslint-disable-next-line no-await-in-loop
                await Promise.resolve();

                // eslint-disable-next-line no-await-in-loop
                await timers.tickAsync(Date.now() - now);
            }

            clearTimeout(timeout);

            source.removeEventListener('message', postMessageStub);

            expect(postMessageStub).to.have.been.calledOnceWith({
                type: 'FORM_UP_TO_DATE',
                enketoId,
            });
        });

        it('notifies a client when a form update check fails (e.g. when offline)', async () => {
            const formURL = new URL(
                `${basePath}/x/${enketoId}`,
                window.location.href
            ).href;
            const transformURL = new URL(
                `${basePath}/transform/xform/${enketoId}`,
                window.location.href
            ).href;

            const cache = await caches.open(FORMS_CACHE);

            await cache.put(
                transformURL,
                new Response('{"hash": "8675e"}', {
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            );

            const source = new MessageChannel().port1;
            const postMessageStub = sandbox.stub(source, 'postMessage');

            const messageEvent = new MessageEvent('message', {
                data: {
                    type: 'CHECK_FORM_HASH',
                    enketoId,
                    url: formURL,
                },
                source,
            });

            self.dispatchEvent(messageEvent);

            const timeout = setTimeout(() => {
                throw new Error('Timed out');
            }, 2000);

            while (!postMessageStub.called) {
                const now = Date.now();

                // eslint-disable-next-line no-await-in-loop
                await Promise.resolve();

                // eslint-disable-next-line no-await-in-loop
                await timers.tickAsync(Date.now() - now);
            }

            clearTimeout(timeout);

            source.removeEventListener('message', postMessageStub);

            expect(postMessageStub).to.have.been.calledOnceWith({
                type: 'FORM_UPDATE_UNKNOWN',
                enketoId,
            });
        });
    });
});
