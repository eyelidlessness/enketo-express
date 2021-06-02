import encryptor from '../../../public/js/src/module/encryptor';
import lastSaved from '../../../public/js/src/module/records/last-saved';
import records from '../../../public/js/src/module/records/queue';
import store from '../../../public/js/src/module/store';

/**
 * @typedef {import('../../../public/js/src/module/store').Record} Record
 */

describe( 'Last-saved records', () => {
    const enketoId = 'surveyA';
    const instanceId = 'recordA';

    /** @type {Record} */
    let record;

    /** @type {string} */
    let autoSavedKey;

    beforeEach( done => {
        autoSavedKey = records.getAutoSavedKey();

        record = {
            draft: false,
            enketoId,
            instanceId: instanceId,
            name: 'name A',
            xml: '<model><something>a</something></model>'
        };

        store.init().then( records.init ).then( () => {
            return store.record.set( {
                draft: true,
                instanceId: autoSavedKey,
                enketoId,
                name: `__autoSave_${Date.now()}`,
                xml: '<model><autosaved/></model>',
                files: [],
            } );
        } ).then( () => done(), done );
    } );

    afterEach( done => {
        store.property.removeAll()
            .then( () => {
                return store.record.removeAll();
            } )
            .then( done, done );
    } );

    it( 'returns the original record when creating a last-saved record', done => {
        const originalRecord = Object.assign( {}, record );

        lastSaved.setLastSavedRecord( record )
            .then( ( { record: result } ) => {
                // Apparently `expect( ... ).to.be` is not available in this
                // test environment.
                expect( result === record ).to.equal( true );

                Object.entries( originalRecord ).forEach( ( [ key, value ] ) => {
                    expect( result[key] ).to.equal( value );
                } );
            } )
            .then( done, done );
    } );

    it( 'does not create a last-saved record when the record was encrypted', done => {
        const form = { id: 'abc', version: '2', encryptionKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5s9p+VdyX1ikG8nnoXLCC9hKfivAp/e1sHr3O15UQ+a8CjR/QV29+cO8zjS/KKgXZiOWvX+gDs2+5k9Kn4eQm5KhoZVw5Xla2PZtJESAd7dM9O5QrqVJ5Ukrq+kG/uV0nf6X8dxyIluNeCK1jE55J5trQMWT2SjDcj+OVoTdNGJ1H6FL+Horz2UqkIObW5/elItYF8zUZcO1meCtGwaPHxAxlvODe8JdKs3eMiIo9eTT4WbH1X+7nJ21E/FBd8EmnK/91UGOx2AayNxM0RN7pAcj47a434LzeM+XCnBztd+mtt1PSflF2CFE116ikEgLcXCj4aklfoON9TwDIQSp0wIDAQAB' };

        encryptor.encryptRecord( form, record )
            .then( encryptedRecord => {
                return lastSaved.setLastSavedRecord( encryptedRecord );
            } )
            .then( () => {
                return lastSaved.getLastSavedRecord( enketoId );
            } )
            .then( ( record ) => {
                expect( record ).to.equal( undefined );
            } )
            .then( done, done );
    } );
} );
