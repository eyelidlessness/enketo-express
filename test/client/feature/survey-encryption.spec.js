/**
 * @module survey-encryption.spec.js
 * @description Tests functionality around encryption-enabled surveys
 * @see {ConnectionSpec}
 * @see {EncryptorSpec}
 * @see {LastSavedFeatureSpec}
 */

import encryptor from '../../../public/js/src/module/encryptor';
import settings from '../../../public/js/src/module/settings';
import store from '../../../public/js/src/module/store';

/**
 * @typedef {import('../connection.spec.js')} ConnectionSpec
 */

/**
 * @typedef {import('../encryptor.spec.js')} EncryptorSpec
 */

/**
 * @typedef {import('./last-saved.spec.js')} LastSavedFeatureSpec
 */

/**
 * @typedef {import('../../../app/models/survey-model').SurveyObject} Survey
 */

describe('Encryption-enabled surveys', () => {
    const enketoId = 'surveyA';

    /** @type { SinonSandbox } */
    let sandbox;

    /** @type {Survey} */
    let survey;

    beforeEach((done) => {
        sandbox = sinon.createSandbox();
        sandbox.stub(settings, 'enketoId').get(() => enketoId);

        survey = {
            openRosaId: 'formA',
            openRosaServer: 'http://localhost:3000',
            enketoId,
            theme: '',
            form: `<form class="or"><img src="/path/to/${enketoId}.jpg"/></form>`,
            model: '<model><foo/></model>',
            hash: '12345',
        };

        store.init().then(() => done(), done);
    });

    afterEach(async () => {
        sandbox.restore();

        await store.record.removeAll();
    });

    describe('runtime state', () => {
        it('is not enabled by default', () => {
            expect(encryptor.isEncryptionEnabled(survey)).to.equal(false);
        });

        it('is enabled when set', () => {
            const result = encryptor.setEncryptionEnabled(survey);

            expect(encryptor.isEncryptionEnabled(result)).to.equal(true);
        });
    });
});
