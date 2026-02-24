const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const shared = {
  entryPoints: ['src/index.js'],
  bundle: true,
  minify: !isWatch,
  sourcemap: true,
  target: ['es2020'],
  loader: {
    '.vert': 'text',
    '.frag': 'text',
  },
};

async function build() {
  const configs = [
    // ESM
    {
      ...shared,
      format: 'esm',
      outfile: 'dist/halftone-light.esm.js',
    },
    // IIFE for CDN / Webflow
    {
      ...shared,
      format: 'iife',
      globalName: 'HalftoneLightModule',
      outfile: 'dist/halftone-light.min.js',
      footer: {
        js: '// HalftoneLight auto-inits via data-hl-element attributes',
      },
    },
  ];

  if (isWatch) {
    for (const config of configs) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
    }
    console.log('Watching for changes...');
  } else {
    await Promise.all(configs.map(c => esbuild.build(c)));
    console.log('Build complete: dist/halftone-light.esm.js, dist/halftone-light.min.js');
  }
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
