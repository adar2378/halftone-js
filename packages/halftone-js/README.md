# halftone.js

High-performance, physics-driven halftone interaction layer for the web.

Transforms static grids and media into tactile, living surfaces. Samples images, videos, or webcam in real-time, maps brightness to dot size, and applies spring-mass physics that reacts to your cursor.

**~3.9 KB gzipped. Zero dependencies.**

---

## Install

### npm
```bash
npm install halftone-js
```

### CDN
```html
<script src="https://unpkg.com/halftone-js/dist/halftone.min.js"></script>
```

### Direct
Download `dist/halftone.min.js` and include it with a `<script>` tag.

---

## Quick Start

### HTML (No-Code / Webflow)

Add `data-ht-element` to any container. That's it — halftone.js auto-initializes.

```html
<div data-ht-element style="width: 100%; height: 400px;"></div>
<script src="https://unpkg.com/halftone-js/dist/halftone.min.js"></script>
```

Customize with data attributes:

```html
<div
  data-ht-element
  data-ht-grid="10"
  data-ht-shape="diamond"
  data-ht-interaction="vortex"
  data-ht-color="#ff6600"
  data-ht-bg-color="#0a0a1a"
  data-ht-strength="2.5"
  style="width: 100%; height: 400px;"
></div>
```

### JavaScript

```js
import Halftone from 'halftone-js';

const fx = new Halftone({
  container: '#hero',
  grid: 10,
  interaction: 'vortex',
  color: '#ff6600',
  strength: 2.5
});
```

---

## Options

### Appearance

| Option / Attribute | Default | Description |
| :--- | :--- | :--- |
| `grid` / `data-ht-grid` | `12` | Grid spacing (px). Lower = more dots. |
| `shape` / `data-ht-shape` | `'circle'` | `circle`, `square`, `diamond`, `triangle` |
| `color` / `data-ht-color` | `'#00f2ff'` | Dot color. Use `'auto'` to sample colors from source. |
| `bgColor` / `data-ht-bg-color` | `'#050510'` | Background. Supports `rgba()`, `transparent`. |
| `dotScale` / `data-ht-dot-scale` | `0.8` | Dot size multiplier (0-1). |
| `stretch` / `data-ht-stretch` | `0.2` | Velocity-based dot stretching (0-1). |

### Media Source

| Option / Attribute | Default | Description |
| :--- | :--- | :--- |
| `source` / `data-ht-source` | `null` | `'webcam'`, image/video URL, CSS selector, or HTMLElement. |
| `fit` / `data-ht-fit` | `'cover'` | `cover` or `contain`. |

### Physics

| Option / Attribute | Default | Description |
| :--- | :--- | :--- |
| `interaction` / `data-ht-interaction` | `'repulse'` | Interaction mode. See list below. |
| `radius` / `data-ht-radius` | `120` | Mouse interaction radius (px). |
| `strength` / `data-ht-strength` | `1.8` | Interaction force multiplier. |
| `spring` / `data-ht-spring` | `0.1` | How fast dots snap back (0.01-0.3). |
| `friction` / `data-ht-friction` | `0.8` | Motion damping (0.7-0.99). |

### Callbacks

| Option | Description |
| :--- | :--- |
| `onInteract` | Custom interaction function. Overrides the named interaction. `(dot, props) => {}` |

---

## Interaction Modes

| Mode | Effect |
| :--- | :--- |
| `repulse` | (Default) Pushes dots away from cursor |
| `attract` | Dots cluster toward the mouse |
| `vortex` | Dots orbit the cursor |
| `magnetic` | Dots rotate to face the cursor |
| `swell` | Localized size inflation |
| `ripple` | Wave pulses radiating outward |
| `shatter` | Explosive burst on fast mouse movement |
| `glitch` | Random position noise |
| `wind` | Pushes dots in mouse movement direction |
| `pulse` | Rhythmic distance-based breathing |
| `twist` | Rotational spinning |
| `float` | Anti-gravity — dots drift upward |
| `frenzy` | High-frequency jitter |
| `warp` | Elastic stretching along mouse path |
| `bounce` | Vertical oscillation |
| `gravity` | Dots fall downward within radius |
| `drift` | Slow orbit around mouse center |

---

## Custom Plugins

Register your own interaction mode:

```js
import Halftone from 'halftone-js';

Halftone.register('my-effect', (dot, { angle, force, strength, dpr }) => {
  dot.vx += Math.cos(angle) * force * strength * dpr;
  dot.vy += Math.sin(angle) * force * strength * dpr;
});

// Use via JS
new Halftone({ container: '#el', interaction: 'my-effect' });

// Or via HTML
// <div data-ht-element data-ht-interaction="my-effect"></div>
```

The callback receives:

| Property | Type | Description |
| :--- | :--- | :--- |
| `dot.x`, `dot.y` | number | Current position |
| `dot.vx`, `dot.vy` | number | Velocity (write to this) |
| `dot.rotation` | number | Current rotation angle |
| `dot.sizeScalar` | number | Size multiplier (resets each frame) |
| `props.dist` | number | Distance from mouse |
| `props.angle` | number | Angle to mouse |
| `props.force` | number | 0-1 normalized force (1 = at mouse, 0 = at radius edge) |
| `props.strength` | number | Config strength value |
| `props.dpr` | number | Device pixel ratio |
| `props.mouse` | object | `{ x, y, vx, vy }` — mouse state |
| `props.time` | number | Frame counter |

---

## API

```js
const fx = new Halftone({ container: '#el' });

fx.config       // Current configuration
fx.dots         // Array of all dot objects
fx.canvas       // The canvas element
fx.root         // The container element

fx.resize()     // Recalculate dimensions and rebuild grid
fx.createGrid() // Rebuild the dot grid
fx.destroy()    // Stop animation, remove canvas, clean up all resources
```

---

## Lifecycle

- **Auto-init**: Elements with `data-ht-element` are initialized on `DOMContentLoaded`.
- **Auto-cleanup**: If the container is removed from the DOM, the engine shuts itself down — no manual `destroy()` needed.
- **Webcam cleanup**: Webcam streams are properly stopped on `destroy()`.

---

## Browser Support

Works in all modern browsers that support Canvas 2D and ES2020.

---

## License

[MIT](LICENSE)
