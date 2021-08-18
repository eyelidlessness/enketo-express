/* eslint-env node */

const esbuild = require( 'esbuild' );
const path = require( 'path' );
const pkg = require( '../package' );

const cwd = process.cwd();

const entryPoints = pkg.entries.map( entry => (
    path.resolve( cwd, entry )
) );

const { NODE_ENV = 'develop' } = process.env;
const isProduction = NODE_ENV === 'production';

esbuild.buildSync( {
    bundle: true,
    define: {
        DEBUG: 'false',
        ENV: JSON.stringify( NODE_ENV ),
    },
    entryPoints,
    format: 'iife',
    minify: isProduction,
    outdir: path.resolve( cwd, './public/js/build' ),
    sourcemap: isProduction ? false : 'inline',
    target: [
        'chrome89',
        'edge89',
        'firefox90',
        'safari13',
    ],
} );
