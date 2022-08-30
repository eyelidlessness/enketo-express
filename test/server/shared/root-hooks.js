const { promisify } = require('util');
const { flush, client } = require('../../../app/lib/redis-stores');

module.exports = {
    mochaHooks: {
        beforeAll() {
            return initStores();
        },

        async afterEach() {
            await redisStores.getStore('main').flush();
            await redisStores.getStore('cache').flush();
        },

        afterAll() {
            redisStores.getStore('main').end(true);
            redisStores.getStore('cache').end(true);
        },
    },
};
