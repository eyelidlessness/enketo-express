const redis = require('redis');
const { promisify } = require('util');
const config = require('../models/config-model').server;

const stores = {};

function initStores() {
    stores.main = initStore('main');
    stores.cache = initStore('cache');
}

async function initStore(storeName) {
    const client = redis.createClient(
        config.redis[storeName].port,
        config.redis[storeName].host,
        {
            auth_pass: config.redis[storeName].password,
        }
    );

    const get = promisify(client.get).bind(client);
    const set = promisify(client.set).bind(client);
    const expire = promisify(client.expire).bind(client);
    const flush = promisify(client.flushdb).bind(client);

    // in test environment, switch to different db
    if (process.env.NODE_ENV === 'test') {
        await new Promise((resolve, reject) =>
            client.select(15, (err, res) => err ? reject(err) : resolve(res))
        );
    }

    return {
        client,
        get,
        set,
        expire,
        flush,
    };
}

function getStore(storeName) {
    const store = stores[storeName];
    if (!store) throw new Error(`Redis store '${storeName}' not initialised!`);
    return store;
}

module.exports = {
    initStores,
    getStore,
};
