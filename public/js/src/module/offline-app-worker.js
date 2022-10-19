/**
 * @template T
 * @param {IDBRequest<T>} request
 * @return {Promise<T>}
 */
const dbPromise = (request) =>
    new Promise((resolve, reject) => {
        const once = (type, handler) => () => {
            handler(request.result);

            request.removeEventListener('error', onError);
            request.removeEventListener('success', onSuccess);
        };
        const onError = once('error', reject);
        const onSuccess = once('success', resolve);

        request.addEventListener('error', onError);
        request.addEventListener('success', onSuccess);
    });

// TODO: this might be possible/trivial actually??
// /**
//  * @param {string} storeName
//  */
// const migrateCachedResources = async (storeName) => {
//     const items =
// };

const STATIC_CACHE = 'enketo-common';
const FORMS_CACHE = 'enketo-forms';

/**
 * @param {string} url
 */
const cacheName = (url) => {
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
    const cache = await caches.open(cacheName(key.url ?? key));

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

self.addEventListener('install', () => {
    self.skipWaiting();
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
    await self.clients.claim();
    await removeStaleCaches();
};

self.addEventListener('activate', (event) => {
    event.waitUntil(onActivate());
});

/**
 * @param {string} storeName
 * @param {string} key
 * @param {string[]} [path]
 */
const fetchIndexedDBResource = async (storeName, key, path = []) => {
    const database = await dbPromise(indexedDB.open('enketo'));
    const transaction = database.transaction(storeName, 'readonly');
    const objectStore = transaction.objectStore(storeName);
    const value = await dbPromise(objectStore.get(key));
    const resource = path.reduce((acc, key) => acc[key], value);

    if (resource == null) {
        return;
    }

    const body = resource instanceof Blob ? resource : JSON.stringify(resource);
    const headers =
        resource === body ? {} : { 'content-type': 'application/json' };

    return new Response(body, { headers });
};

const FETCH_OPTIONS = {
    cache: 'reload',
    credentials: 'same-origin',
};

const isCachedFormPageStale = async (url) => {
    const hashURL = url.replace('/x/', '/transform/xform/hash/');
    const [{ value: hashResponse }, { value: cachedHashResponse }] =
        await Promise.allSettled([
            fetch(hashURL, FETCH_OPTIONS),
            caches.match(hashURL),
        ]);

    if (hashResponse == null) {
        return false;
    }

    await cacheResponse(hashURL, hashResponse.clone());

    if (cachedHashResponse == null) {
        return true;
    }

    const [
        {
            value: { hash },
        },
        {
            value: { hash: cachedHash },
        },
    ] = await Promise.allSettled([
        hashResponse.json(),
        cachedHashResponse.json(),
    ]);

    return hash == null || hash !== cachedHash;
};

/**
 * @param {Request} request
 */
const onFetch = async (request) => {
    const { method, referrer, url } = request;

    if (method !== 'GET') {
        return fetch(request, FETCH_OPTIONS);
    }

    const isFormPageRequest =
        url.includes('/x/') && (referrer === '' || referrer === url);
    const cacheKey = isFormPageRequest ? url.replace(/\/x\/.*/, '/x/') : url;
    const cached = await caches.match(cacheKey);

    let response = cached;

    if (isFormPageRequest) {
        try {
            const isStale = await isCachedFormPageStale(url);

            if (isStale) {
                response = await fetch(url, FETCH_OPTIONS);
            }
        } catch (error) {
            response = cached;
        }
    }

    if (response == null) {
        const indexedDBURLMatches = url.match(
            /https?:\/\/.*?\/idb\/(.*?)\/([^/?]+)(\?(\w+)(,\w+)*)?/
        );
        const mediaURLMatches = url.match(
            /\/media\/get\/0\/(.*)\/.*?\/([^/]*$)/
        );

        if (indexedDBURLMatches != null) {
            const [, storeName, key, pathStr] = indexedDBURLMatches;
            const path = pathStr == null ? [] : pathStr.split(',');

            response = await fetchIndexedDBResource(storeName, key, path);
        } else if (mediaURLMatches != null) {
            const [, enketoId, fileName] = mediaURLMatches;
            const key = `${enketoId}:${fileName}`;

            response = await fetchIndexedDBResource('resources', key);
        }
    }

    if (response == null || ENV === 'development') {
        try {
            response = await fetch(request, FETCH_OPTIONS);
        } catch {
            // Probably offline
        }
    }

    if (
        response == null ||
        response.status !== 200 ||
        response.type !== 'basic'
    ) {
        return response;
    }

    if (isFormPageRequest) {
        const { status } = response.clone();

        if (status === 204) {
            return caches.match(cacheKey);
        }

        await cacheResponse(url, new Response(null, { status: 204 }));
    }

    const isServiceWorkerScript = url === self.location.href;

    if (isServiceWorkerScript) {
        cachePrefetchURLs(response);
    }

    await cacheResponse(cacheKey, response.clone());

    return response;
};

const { origin } = self.location;

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestURL = new URL(request.url);

    if (requestURL.origin === origin) {
        event.respondWith(onFetch(request));
    }
});
