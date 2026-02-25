const esbuild = require('esbuild');

const shared = {
  entryPoints: ['index.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
};

Promise.all([
  // ESM — for `import Halftone from 'halftone-js'`
  esbuild.build({
    ...shared,
    format: 'esm',
    outfile: 'dist/halftone.esm.js',
  }),

  // CJS — for `const Halftone = require('halftone-js')`
  esbuild.build({
    ...shared,
    format: 'cjs',
    outfile: 'dist/halftone.cjs.js',
  }),

  // IIFE — for `<script src="halftone.min.js">`
  esbuild.build({
    ...shared,
    format: 'iife',
    globalName: 'HalftoneModule',
    outfile: 'dist/halftone.min.js',
    footer: {
      js: '// Auto-init handled inside module via window.Halftone',
    },
  }),
]).then(() => {
  console.log('Build complete: dist/halftone.esm.js, dist/halftone.cjs.js, dist/halftone.min.js');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
