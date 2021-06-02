import connection from '../../public/js/src/module/connection';
import store from '../../public/js/src/module/store';
import lastSaved from '../../public/js/src/module/records/last-saved';
import records from '../../public/js/src/module/records/queue';
import settings from '../../public/js/src/module/settings';

/**
 * @typedef Record { import('./store').Record }
 */

/**
 * @typedef SinonSandbox { import('sinon').SinonSandbox }
 */

/**
 * @typedef StubbedRequest
 * @property { string } url
 * @property { window.RequestInit } init
 */

describe( 'Uploading records', () => {
    const enketoId = 'surveyA';
    const instanceId = 'recordA';

    /** @type { SinonSandbox } */
    let sandbox;

    /** @type { Record } */
    let record;

    /** @type { StubbedRequest[] } */
    let requests;

    /** @type { window.Response } */
    let response = {
        status: 500,
        text() {
            return Promise.resolve( '<error>No stub response designated by test</error>' );
        },
    };

    const stubSuccessRespopnse = () => {
        response = {
            status: 201,
            text() {
                return Promise.resolve( `
                    <OpenRosaResponse xmlns="http://openrosa.org/http/response">
                        <message nature="submit_success">Success</message>
                    </OpenRosaResponse>
                ` );
            },
        };
    };

    beforeEach( () => {
        requests = [];

        record = {
            enketoId,
            instanceId,
            name: 'name A',
            xml: '<model><something>a</something></model>',
            files: [],
        };

        sandbox = sinon.createSandbox();
        sandbox.stub( settings, 'enketoId' ).get( () => enketoId );

        sandbox.stub( window, 'fetch' ).callsFake( ( url, init ) => {
            requests.push( { url, init } );

            return Promise.resolve( response );
        } );
    } );

    afterEach( () => {
        sandbox.restore();
    } );

    it( 'uploads a record', done => {
        stubSuccessRespopnse();

        connection.uploadRecord( record )
            .then( result => {
                expect( result.status ).to.equal( 201 );
                expect( requests.length ).to.equal( 1 );

                const request = requests[0];
                const body = Object.fromEntries( request.init.body.entries() );
                const instanceId = request.init.headers['X-OpenRosa-Instance-Id'];
                const submission = body.xml_submission_file;

                expect( instanceId ).to.equal( record.instanceId );
                expect( submission instanceof File ).to.equal( true );

                return submission.text();
            } )
            .then( submission => {
                expect( submission ).to.equal( record.xml );
            } )
            .then( done, done );
    } );

    describe( 'last-saved records', () => {
        beforeEach( done => {
            const autoSavedKey = records.getAutoSavedKey();

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

        it( 'creates a last-saved record on upload when specified in options', done => {
            const originalRecord = Object.assign( {}, record );

            stubSuccessRespopnse();

            connection.uploadRecord( record, { isLastSaved: true } )
                .then( () => {
                    return lastSaved.getLastSavedRecord( enketoId );
                } )
                .then( ( record ) => {
                    Object.entries( originalRecord ).forEach( ( [ key, value ] ) => {
                        if ( key === 'instanceId' ) {
                            expect( record[key] ).to.equal( lastSaved.getLastSavedInstanceId( enketoId ) );
                        } else if ( key === 'name' ) {
                            expect( record[key] ).to.match( /^__lastSaved_\d+$/ );
                        } else if ( key === 'files' ) {
                            expect( Array.isArray(record[key]) ).to.equal( true );
                            expect( record[key].length ).to.equal( 0 );
                        } else {
                            expect( record[key] ).to.equal( value );
                        }
                    } );
                } )
                .then( done, done );
        } );

        it( 'does not create a last-saved record on upload by default', done => {
            stubSuccessRespopnse();

            connection.uploadRecord( record )
                .then( () => {
                    return lastSaved.getLastSavedRecord( enketoId );
                } )
                .then( ( record ) => {
                    expect( record ).to.equal( undefined );
                } )
                .then( done, done );
        } );
    } );
} );
