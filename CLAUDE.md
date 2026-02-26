# Halftone-JS Monorepo

## Structure

```
packages/
  halftone-js/     → Canvas 2D engine (CPU-based dot physics)
  halftone-webgl/  → OGL/WebGL GPU engine (fragment shader halftone)
```

npm workspace monorepo — root `package.json` has `"workspaces": ["packages/*"]`.

## Packages

### halftone-js
- **npm**: `halftone-js` (currently v1.0.0)
- **Entry**: `index.js` → builds to `dist/halftone.min.js`, `dist/halftone.esm.js`
- **Build**: `node build.js` from `packages/halftone-js/`
- **Data attr prefix**: `data-ht-*`
- **Auto-init selector**: `[data-ht-element]`

### halftone-webgl
- **npm**: `halftone-webgl` (currently v1.0.3)
- **Entry**: `src/index.js` → builds to `dist/halftone-webgl.min.js`, `dist/halftone-webgl.esm.js`
- **Build**: `node build.js` from `packages/halftone-webgl/`
- **Dependency**: OGL (~29KB) for WebGL abstraction
- **Shaders**: `src/shader.vert`, `src/shader.frag` (loaded as text by esbuild)
- **Data attr prefix**: `data-hwgl-*`
- **Auto-init selector**: `[data-hwgl-element]`

## Build Commands

```bash
# Build all packages
npm run build

# Build individual packages
npm run build:js      # halftone-js only
npm run build:webgl   # halftone-webgl only

# Dev mode (watch) for halftone-webgl
npm run dev:webgl
```

## Publishing (npm)

Each package is published independently from its own directory:

```bash
# 1. Bump version in packages/<pkg>/package.json
# 2. Build
cd packages/halftone-webgl
node build.js

# 3. Publish
npm publish

# 4. Commit and tag
cd ../..
git add .
git commit -m "chore: publish halftone-webgl vX.Y.Z"
git push
```

## Local Development

To test with `demo.html` using a local build instead of CDN:
```html
<!-- Temporarily swap CDN for local -->
<script src="./dist/halftone-webgl.min.js"></script>

<!-- Restore before committing -->
<script src="https://unpkg.com/halftone-webgl@latest/dist/halftone-webgl.min.js"></script>
```

## Key Architecture Notes

- **halftone-webgl** uses a single fullscreen Triangle geometry (more efficient than quad)
- All halftone math runs in the fragment shader: grid, SDF shapes, tonal curve, CMYK separation
- Smart rAF: continuous loop for video/interaction, render-on-demand for static images
- `preserveDrawingBuffer: true` is required for `snapshot()` (canvas.toDataURL)
- esbuild uses `text` loader for `.vert`/`.frag` shader files
- Video sources need CORS-enabled URLs (use jsDelivr or a real CDN, not GitHub raw)

## Conventions

- Commit messages: `fix:`, `feat:`, `chore:`, `refactor:`, `docs:` prefixes
- Version bumps go in their own `chore: bump to vX.Y.Z` or `chore: publish` commits
