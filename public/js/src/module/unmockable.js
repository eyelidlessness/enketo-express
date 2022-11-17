/* eslint-disable import/prefer-default-export */

/// <reference lib="dom" />

/**
 * @template T
 * @param {T} object
 * @return {Proxy<T>}
 */
const wrapUnmockable = (object) => {
    const result = {};

    Object.keys(object).forEach((key) => {
        const value = object[key];

        if (typeof value === 'function') {
            result[key] = (...args) => value.apply(object, args);
        } else {
            Object.defineProperty(result, key, {
                configurable: true,
                enumerable: true,

                get() {
                    const value = object[key];

                    if (typeof value === 'function') {
                        return (...args) => value.apply(object, args);
                    }

                    return value;
                },

                set(value) {
                    Object.assign(object, { [key]: value });
                    // object[key] = value;
                },
            });
        }
    });

    return result;
};

/**
 * @private
 *
 * @type {Proxy<Location>}
 */
export const location = wrapUnmockable(window.location);
