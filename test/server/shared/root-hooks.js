const { initStores, getStore } = require('../../../app/lib/redis-stores');

module.exports = {
    mochaHooks: {
        async beforeAll() {
            return initStores();
        },

        async afterEach() {
            const main = await getStore('main');
            await main.flush();

            const cache = await getStore('cache');
            await cache.flush();
        },

        async afterAll() {
            const main = await getStore('main');
            main.client.end(true);

            const cache = await getStore('cache');
            cache.client.end(true);
        },
    },
};
