const redis = require('redis');
const { promisify } = require('util');
const config = require('../models/config-model').server;

const stores = {
};

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

    await client.connect();

    // in test environment, switch to different db
    if (process.env.NODE_ENV === 'test') {
        await new Promise((resolve, reject) => client.select(15, (err, res) => err ? reject(err) : resolve(res)));
    }

    stores[storeName] = {
        client,
        get,
        set,
        expire,
        flush,
    };
}

function initStores() {
    return Promise.all([
        initStore('main'),
        initStore('cache'),
    ]);
}

function getStore(storeName) {
    const store = stores[storeName];
    if(!store) throw new Error(`Redis store '${storeName}' not initialised!`);
}

module.exports = {
    initStores,
    getStore,
};
