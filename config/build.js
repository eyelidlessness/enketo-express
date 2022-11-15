const alias = require('esbuild-plugin-alias');
const path = require('path');
const pkg = require('../package.json');

const cwd = process.cwd();

const entryPoints = pkg.entries.map((entry) => path.resolve(cwd, entry));
const { NODE_ENV } = process.env;
const isProduction = NODE_ENV === 'production';

module.exports = {
    bundle: true,
    define: {
        ENV: JSON.stringify(NODE_ENV ?? 'production'),
    },
    entryPoints,
    format: 'iife',
    minify: isProduction,
    outdir: path.resolve(cwd, './public/js/build'),
    plugins: [
        alias(
            Object.fromEntries(
                Object.entries(pkg.browser).map(([key, value]) => [
                    key,
                    path.resolve(cwd, `${value}.js`),
                ])
            )
        ),
    ],
    sourcemap: isProduction ? false : 'inline',
    target: ['chrome89', 'edge89', 'firefox90', 'safari13'],
};
