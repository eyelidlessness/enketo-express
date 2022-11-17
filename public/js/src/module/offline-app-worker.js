/// <reference no-default-lib="true"/>
/// <reference lib="ES2015" />
/// <reference lib="webworker" />

/** @private - exported for testing */
export const FORMS_CACHE = 'enketo-forms';

/** @private - exported for testing */
export const STATIC_CACHE = 'enketo-common';

/**
 * @param {string} url
 */
const cacheStorageKey = (url) => {
    if (
        url === '/favicon.ico' ||
        url.endsWith('/x/') ||
        /\/x\/((css|fonts|images|js|locales)\/|offline-app-worker.js)/.test(url)
    ) {
        return STATIC_CACHE;
    }

    return FORMS_CACHE;
};

/**
 * @param {Request | string} key
 * @param {Response} response
 */
const cacheResponse = async (key, response) => {
    const clone = response.clone();
    const cache = await caches.open(cacheStorageKey(key.url ?? key));

    await cache.put(key, clone);

    return response;
};

/**
 * @param {Response} response
 */
const cachePrefetchURLs = async (response) => {
    const linkHeader = response.headers.get('link') ?? '';
    const prefetchURLs = [
        ...linkHeader.matchAll(/<([^>]+)>;\s*rel="prefetch"/g),
    ].map(([, url]) => url);
    const cache = await caches.open(STATIC_CACHE);

    await Promise.allSettled(prefetchURLs.map((url) => cache.add(url)));
};

const onInstall = async () => {
    await self.skipWaiting();

    console.log('Service worker installed');
};

self.addEventListener('install', (event) => {
    event.waitUntil(onInstall());
});

const removeStaleCaches = async () => {
    const cacheStorageKeys = await caches.keys();

    cacheStorageKeys.forEach((key) => {
        if (key !== FORMS_CACHE) {
            caches.delete(key);
        }
    });
};

const onActivate = async () => {
    await removeStaleCaches();
    await self.clients.claim();

    console.log('Service worker activated');
};

self.addEventListener('activate', (event) => {
    event.waitUntil(onActivate());
});

const FETCH_OPTIONS = {
    cache: 'reload',
    credentials: 'same-origin',
};

/**
 * @param {Client} client
 * @param {string} enketoId
 * @param {string} url
 */
const checkFormHash = async (client, enketoId, url) => {
    const hashURL = url.replace('/x/', '/transform/xform/hash/');
    const transformURL = hashURL.replace('/hash/', '/');

    try {
        const [hashResponse, cachedResponse] = await Promise.all([
            fetch(hashURL, FETCH_OPTIONS),
            caches.match(transformURL),
        ]);

        if (hashResponse == null || cachedResponse == null) {
            return;
        }

        let isStale = cachedResponse == null;

        if (!isStale) {
            const [{ hash }, { hash: cached }] = await Promise.all([
                hashResponse.json(),
                cachedResponse.json(),
            ]);

            isStale = cached == null || hash == null || hash !== cached;
        }

        client.postMessage({
            type: isStale ? 'FORM_UPDATED' : 'FORM_UP_TO_DATE',
            enketoId,
        });
    } catch (error) {
        client.postMessage({
            type: 'FORM_UPDATE_UNKNOWN',
            enketoId,
        });
    }
};

self.addEventListener('message', async (event) => {
    const { data, source: client } = event;
    const { type, enketoId, url } = data;

    if (
        type === 'CHECK_FORM_HASH' &&
        typeof enketoId === 'string' &&
        typeof url === 'string'
    ) {
        checkFormHash(client, enketoId, url);
    }
});

/**
 * @param {Request} request
 */
const onFetch = async (request) => {
    const { referrer, url } = request;

    const { pathname } = new URL(url);
    const isFormPageRequest =
        /\/x\/[^/]+\/?$/.test(pathname) &&
        (referrer === '' || referrer === url);

    /**
     * A response for the form page initial HTML is always cached with the
     * same key: `https://example.com/basePath/x/`. This ensures that forms
     * previously cached before a future service worker update will still
     * be available after that update.
     *
     * @see {@link https://github.com/enketo/enketo-express/issues/470}
     */
    const cacheKey = isFormPageRequest
        ? url.replace(/\/x\/.*/, '/x/')
        : request;

    const cached = await caches.match(cacheKey);

    let response = cached;

    if (response == null || ENV === 'development') {
        try {
            response = await fetch(request, FETCH_OPTIONS);
        } catch {
            // Probably offline
        }
    }

    const { type: responseType } = response ?? {};

    if (
        response == null ||
        response?.status !== 200 ||
        (responseType !== 'basic' && responseType !== 'default')
    ) {
        return response;
    }

    /**
     * In addition to storing the form page initial HTML with a single
     * cache key, we store a sentinel 204 response for each individual
     * cached form page URL. This ensures we don't load forms cached
     * prior to introducing this caching strategy, as their attachments
     * will not yet have been cached.
     *
     * @see {cacheKey}
     */
    if (isFormPageRequest) {
        const { status } = response.clone();

        if (status === 204) {
            return caches.match(cacheKey);
        }

        await cacheResponse(
            url,
            new Response(null, { status: 204, statusText: 'No Content' })
        );
    }

    const isServiceWorkerScript = url === self.serviceWorker.scriptURL;

    if (isServiceWorkerScript) {
        cachePrefetchURLs(response);
    }

    await cacheResponse(cacheKey, response.clone());

    return response;
};

const { origin } = self.location;

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const { method } = request;
    const { origin: requestOrigin } = new URL(request.url);

    if (method === 'GET' && requestOrigin === origin) {
        event.respondWith(onFetch(request));
    }
});
