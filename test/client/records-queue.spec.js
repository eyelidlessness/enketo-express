import connection from '../../public/js/src/module/connection';
import encryptor from '../../public/js/src/module/encryptor';
import formCache from '../../public/js/src/module/form-cache';
import records from '../../public/js/src/module/records-queue';
import settings from '../../public/js/src/module/settings';
import store from '../../public/js/src/module/store';

/**
 * @typedef {import('../../app/models/record-model').EnketoRecord} EnketoRecord
 */

/**
 * @typedef {import('../../app/models/survey-model').SurveyObject} Survey
 */

/**
 * @typedef SinonSandbox { import('sinon').SinonSandbox }
 */

/**
 * While some of this is tested in store.spec.js, this suite tests the additional
 * logic performed in records-queue.js functionality around the client store.
 */
describe( 'Records queue', () => {
    const enketoIdA = 'surveyA';
    const instanceIdA = 'recordA';
    const enketoIdB = 'surveyB';
    const instanceIdB = 'recordB';

    /** @type {string} */
    let autoSavedKey;

    /** @type { string } */
    let enketoId;

    /** @type { SinonSandbox } */
    let sandbox;

    /** @type { Survey } */
    let surveyA;

    /** @type { Survey } */
    let surveyB;

    /** @type { EnketoRecord } */
    let recordA;

    /** @type { EnketoRecord } */
    let recordB;

    /** @type { File[] } */
    let files;

    beforeEach( done => {
        enketoId = enketoIdA;

        sandbox = sinon.createSandbox();
        sandbox.stub( settings, 'enketoId' ).get( () => enketoId );

        autoSavedKey = records.getAutoSavedKey();

        surveyA = {
            openRosaId: 'formA',
            openRosaServer: 'http://localhost:3000',
            enketoId: enketoIdA,
            theme: '',
            form: `<form class="or"><img src="/path/to/${enketoIdA}.jpg"/></form>`,
            model: '<model><foo/></model>',
            hash: '12345',
        };

        surveyB = {
            openRosaId: 'formB',
            openRosaServer: 'http://localhost:3000',
            enketoId: enketoIdB,
            theme: '',
            form: `<form class="or"><img src="/path/to/${enketoIdB}.jpg"/></form>`,
            model: '<model><bar/></model>',
            hash: '67890',
        };

        recordA = {
            draft: false,
            enketoId,
            files: [],
            instanceId: instanceIdA,
            name: 'name A',
            xml: '<model><something>a</something></model>',
        };

        recordB = {
            draft: false,
            enketoId,
            files: [],
            instanceId: 'b',
            name: 'name B',
            xml: '<model><something>b</something></model>',
        };

        files = [
            {
                name: 'something1.xml',
                item: new Blob( [ '<html>something1</html>' ], {
                    type: 'text/xml'
                } )
            },
            {
                name: 'something2.xml',
                item: new Blob( [ '<html>something2</html>' ], {
                    type: 'text/xml'
                } )
            }
        ];

        store.init()
            .then( records.init )
            .then( () => store.record.set( {
                draft: true,
                instanceId: autoSavedKey,
                enketoId,
                name: `__autoSave_${Date.now()}`,
                xml: '<model><autosaved/></model>',
                files: [],
            } ) )
            .then( () => store.survey.set( surveyA ) )
            .then( () => store.survey.set( surveyB ) )
            .then( () => done(), done );
    } );

    afterEach( done => {
        sandbox.restore();

        Promise.all( [
            store.property.removeAll(),
            store.record.removeAll(),
            store.survey.removeAll(),
        ] )
            .then( () => done(), done );
    } );

    describe( 'storing records', () => {
        it( 'creates a record', done => {
            const originalRecord = Object.assign( {}, recordA );

            records.save( 'set', recordA )
                .then( () => {
                    return store.record.get( instanceIdA );
                } )
                .then( record => {
                    Object.entries( originalRecord ).forEach( ( [ key, value ] ) => {
                        expect( record[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );

        it( 'updates an autosave draft record with files', done => {
            recordA.files = files.slice();

            records.updateAutoSavedRecord( recordA )
                .then( () => {
                    return records.getAutoSavedRecord();
                } )
                .then( record => {
                    expect( record.draft ).to.equal( true );
                    expect( record.xml ).to.equal( record.xml );
                    expect( record.files.length ).to.equal( files.length );

                    for ( const [ index, file ] of files.entries() ) {
                        const updated = record.files[index];

                        expect( updated.name ).to.equal( file.name );
                        expect( updated.item ).to.to.be.an.instanceof( Blob );
                    }
                } )
                .then( done, done );
        } );

        it( 'creates a record with the current autosaved record\'s files', done => {
            const autoSavedUpdate = Object.assign( {}, recordA, {
                files: files.slice(),
            } );

            records.updateAutoSavedRecord( autoSavedUpdate )
                .then( () => {
                    return records.save( 'set', recordA );
                } )
                .then( () => {
                    return store.record.get( instanceIdA );
                } )
                .then( record => {
                    expect( record.files.length ).to.equal( files.length );

                    for ( const [ index, file ] of files.entries() ) {
                        const updated = record.files[index];

                        expect( updated.name ).to.equal( file.name );
                        expect( updated.item ).to.to.be.an.instanceof( Blob );
                    }
                } )
                .then( done, done );
        } );

        it( 'updates a record', done => {
            const update = {
                draft: false,
                enketoId,
                instanceId: instanceIdA,
                name: 'name A updated',
                xml: '<model><updated/></model>'
            };
            const payload = Object.assign( {}, update );

            records.save( 'set', recordA )
                .then( () => {
                    return records.save( 'update', payload );
                } )
                .then( () => {
                    return store.record.get( instanceIdA );
                } )
                .then( record => {
                    Object.entries( update ).forEach( ( [ key, value ] ) => {
                        expect( record[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );

        it( 'creates a last-saved record when creating a record', done => {
            const originalRecord = Object.assign( {}, recordA );

            records.save( 'set', recordA )
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                .then( record => {
                    Object.entries( originalRecord ).forEach( ( [ key, value ] ) => {
                        expect( record[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );

        it( 'replaces a last-saved record when creating a newer record', done => {
            const originalRecord = Object.assign( {}, recordA );

            records.save( 'set', recordB )
                .then( () => {
                    return records.save( 'set', recordA );
                } )
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                .then( record => {
                    Object.entries( originalRecord ).forEach( ( [ key, value ] ) => {
                        expect( record[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );

        it( 'creates a last-saved record when updating a record', done => {
            const originalSurvey = Object.assign( {}, surveyA );

            const update = {
                draft: false,
                enketoId,
                instanceId: instanceIdA,
                name: 'name A updated',
                xml: '<model><updated/></model>'
            };
            const payload = Object.assign( {}, update );

            records.save( 'set', recordA )
                .then( () => {
                    // This would be the condition in cases where a record already
                    // existed before this feature was implemented
                    return store.survey.update( originalSurvey );
                } )
                .then( () => {
                    return records.save( 'update', update );
                } )
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                .then( record => {
                    Object.entries( payload ).forEach( ( [ key, value ] ) => {
                        expect( record[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );

        it( 'replaces a last-saved record when updating a record', done => {
            const update = {
                draft: false,
                enketoId,
                instanceId: instanceIdA,
                name: 'name A updated',
                xml: '<model><updated/></model>'
            };
            const payload = Object.assign( {}, update );

            records.save( 'set', recordA )
                .then( () => {
                    return records.save( 'update', update );
                } )
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                .then( record => {
                    Object.entries( payload ).forEach( ( [ key, value ] ) => {
                        expect( record[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );

        it( 'creates separate last-saved records for different forms', done => {
            const originalRecordA = Object.assign( {}, recordA );

            /** @type { EnketoRecord } */
            const recordB = {
                draft: false,
                enketoId: enketoIdB,
                instanceId: instanceIdB,
                name: 'name B',
                xml: '<model><something>b</something></model>'
            };

            const originalRecordB = Object.assign( {}, recordB );

            // Create record/last-saved for first form id
            records.save( 'set', recordA )
                // Create autosave record for second form id
                .then( () => {
                    enketoId = enketoIdB;

                    return store.record.set( {
                        draft: true,
                        instanceId: records.getAutoSavedKey(),
                        enketoId,
                        name: `__autoSave_${Date.now()}`,
                        xml: '<model><autosaved/></model>',
                        files: [],
                    } );
                } )
                // Create record/last-saved for second form id
                .then( () => {
                    return records.save( 'set', recordB );
                } )
                // Get last-saved record for second form id
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                // Validate last-saved record for second form id
                .then( lastSavedB => {
                    Object.entries( originalRecordB ).forEach( ( [ key, value ] ) => {
                        expect( lastSavedB[key] ).to.deep.equal( value );
                    } );
                } )
                // Get last-saved record for first form id
                .then( () => {
                    enketoId = enketoIdA;

                    return formCache.getLastSavedRecord( enketoId );
                } )
                // Validate last-saved record for first form id has not changed
                .then( lastSavedA => {
                    Object.entries( originalRecordA ).forEach( ( [ key, value ] ) => {
                        expect( lastSavedA[key] ).to.deep.equal( value );
                    } );
                } )
                .then( done, done );
        } );
    } );

    describe( 'Encryption', () => {
        it( 'does not create a last-saved record when creating a record for an encrypted survey', done => {
            enketoId = 'enketoIdC';

            const form = { id: 'abc', version: '2', encryptionKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5s9p+VdyX1ikG8nnoXLCC9hKfivAp/e1sHr3O15UQ+a8CjR/QV29+cO8zjS/KKgXZiOWvX+gDs2+5k9Kn4eQm5KhoZVw5Xla2PZtJESAd7dM9O5QrqVJ5Ukrq+kG/uV0nf6X8dxyIluNeCK1jE55J5trQMWT2SjDcj+OVoTdNGJ1H6FL+Horz2UqkIObW5/elItYF8zUZcO1meCtGwaPHxAxlvODe8JdKs3eMiIo9eTT4WbH1X+7nJ21E/FBd8EmnK/91UGOx2AayNxM0RN7pAcj47a434LzeM+XCnBztd+mtt1PSflF2CFE116ikEgLcXCj4aklfoON9TwDIQSp0wIDAQAB' };

            const survey = encryptor.setEncryptionEnabled( {
                openRosaId: 'formC',
                openRosaServer: 'http://localhost:3000',
                enketoId,
                theme: '',
                form: `<form class="or"><img src="/path/to/${enketoIdA}.jpg"/></form>`,
                model: '<model><foo/></model>',
                hash: '12345',
            } );
            const recordC = Object.assign( {}, recordA, {
                enketoId,
                instanceId: 'recordC',
            } );
            const recordD = Object.assign( {}, recordB, {
                draft: true,
                enketoId,
                instanceId: 'recordD',
            } );

            store.survey.set( survey )
                .then( () => encryptor.encryptRecord( form, recordC ) )
                .then( encryptedRecordC => {
                    return records.save( 'set', encryptedRecordC );
                } )
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                .then( () => encryptor.encryptRecord( form, recordD ) )
                .then( encryptedRecordD => {
                    return records.save( 'set', encryptedRecordD );
                } )
                .then( () => {
                    return formCache.getLastSavedRecord( enketoId );
                } )
                .then( record => {
                    expect( record ).to.equal( undefined );
                } )
                .then( done, done );
        } );
    } );

    describe( 'Retrieving records', () => {
        it( 'gets the record list, excludes the auto-saved records', done => {
            const autoSavedKey = records.getAutoSavedKey();

            const expectedRecordData = [
                Object.assign( {}, recordA ),
                Object.assign( {}, recordB ),
            ];

            records.save( 'set', recordA )
                .then( () => {
                    return records.save( 'set', recordB );
                } )
                .then( () => {
                    return records.getDisplayableRecordList( enketoId );
                } )
                .then( records => {
                    expect( records.length ).to.equal( expectedRecordData.length );

                    records.forEach( record => {
                        expect( record.instanceId ).not.to.equal( autoSavedKey );
                    } );

                    expectedRecordData.forEach( ( recordData, index ) => {
                        const record = records[index];

                        Object.entries( recordData ).forEach( ( [ key, value ] ) => {
                            expect( record[key] ).to.deep.equal( value );
                        } );
                    } );
                } )
                .then( done, done );
        } );

        // This is primarily testing that an empty array is returned as the db.js
        // types indicate, rather than needing to keep using falsy checks.
        it( 'gets an empty record list', done => {
            records.getDisplayableRecordList( enketoId )
                .then( records => {
                    expect( Array.isArray( records ) ).to.equal( true );
                    expect( records.length ).to.equal( 0 );
                } )
                .then( done, done );
        } );
    } );

    describe( 'Uploading records', () => {
        it( 'uploads queued records, excluding auto-saved/last-saved and draft records', done => {
            const autoSavedKey = records.getAutoSavedKey();

            const expectedUploadedData = [
                Object.assign( {}, recordA ),
                Object.assign( {}, recordB ),
            ];

            sandbox.stub( connection, 'getOnlineStatus' ).callsFake( () => {
                return Promise.resolve( true );
            } );

            /** @type { EnketoRecord[] } */
            let uploaded = [];

            sandbox.stub( connection, 'uploadRecord' ).callsFake( record => {
                uploaded.push( record );
            } );

            records.save( 'set', recordA )
                .then( () => {
                    return records.save( 'set', recordB );
                } )
                .then( () => {
                    return store.record.set( {
                        draft: true,
                        enketoId,
                        instanceId: 'c',
                        name: 'name C',
                        xml: '<model><something>c</something></model>',
                    } );
                } )
                .then( () => {
                    return records.uploadQueue();
                } )
                .then( () => {
                    expect( uploaded.length ).to.equal( expectedUploadedData.length );

                    uploaded.forEach( record => {
                        expect( record.instanceId ).not.to.equal( autoSavedKey );
                    } );

                    expectedUploadedData.forEach( ( recordData, index ) => {
                        const record = uploaded[index];

                        Object.entries( recordData ).forEach( ( [ key, value ] ) => {
                            expect( record[key] ).to.deep.equal( value );
                        } );
                    } );
                } )
                .then( done, done );
        } );
    } );
} );
