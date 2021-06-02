import store from '../store';

/**
 * @typedef { import('../store').Record } Record
 */

/**
 * Obtains last-saved record key
 *
 * @param {string} enketoId
 */
function getLastSavedInstanceId( enketoId ) {
    return `__lastSaved_${enketoId}`;
}

/**
 * @param {string} enketoId
 * @return {Promise<Record | undefined>} a Promise that resolves with a record object or undefined
 */
function getLastSavedRecord( enketoId ) {
    return store.record.get( getLastSavedInstanceId( enketoId ) );
}

/**
 * Sets the last-saved record.
 *
 * @param { Record } record - the record which was last saved
 * @return { Promise<{ lastSaved: Record; record: Record }> } - the last-saved record
 */
function setLastSavedRecord( record ) {
    const instanceId = getLastSavedInstanceId( record.enketoId );

    const lastSavedData = {
        // give an internal name
        name: `__lastSaved_${Date.now()}`,
        // use the pre-defined key
        instanceId,
    };

    const payload = Object.assign( {}, record, lastSavedData );

    return store.record.remove( instanceId )
        .then( () => {
            return store.record.set( payload );
        } )
        .then( lastSaved => {
            return { lastSaved, record };
        } );
}

export default {
    getLastSavedInstanceId,
    getLastSavedRecord,
    setLastSavedRecord,
};
