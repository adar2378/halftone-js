# 🌌 halftone.js (v1.0.0)
**The high-performance, physics-driven interaction layer for the modern web.**

halftone.js transforms static grids and media into tactile, living surfaces. Built for **Webflow Designers** and **Elite Creative Developers**, it combines the retro aesthetic of halftone print with 2026-grade spring-mass physics.

---

## 🎨 What is Halftone?
Traditionally, **Halftone** is a reprographic technique that simulates continuous-tone imagery using dots of varying sizes. It’s the "optical illusion" that allowed 20th-century newspapers to print photos using only black ink.

**The Twist:**
We don't just draw dots; we give them **physical weight**. halftone.js samples your images, videos, or webcam in real-time, maps the brightness to dot size, and then subjects every dot to a spring-mass physics simulation that reacts to your cursor.

---

## 🚀 Quick Start (Webflow / No-Code)
Just drop the `index.js` script into your project and use **Custom Attributes** to control the engine.

1.  **Target your Container**: Add a Div and give it the attribute `data-ht-element`.
2.  **Configure**: Add any of the following attributes to tune the feel:

### Core Configuration
| Attribute | Value | Description |
| :--- | :--- | :--- |
| `data-ht-grid` | `8` to `30` | Density of the grid. Lower = more detail. |
| `data-ht-shape` | `circle`, `square`, `diamond`, `triangle` | The geometric primitive used. |
| `data-ht-source` | `webcam`, `#elementID`, `URL` | The visual data driving the dot sizes. |
| `data-ht-fit` | `cover`, `contain`, `fill` | How the source media fits the container. |
| `data-ht-color` | `#00f2ff` | The primary dot color. |
| `data-ht-bg` | `#050510` | The canvas background color. |

### Physics Configuration
| Attribute | Value | Description |
| :--- | :--- | :--- |
| `data-ht-interaction` | See Modes below | The physical behavior on hover. |
| `data-ht-radius` | `50` to `500` | The reach of the mouse interaction (px). |
| `data-ht-strength` | `0.5` to `5.0` | Power of the interaction force. |
| `data-ht-spring` | `0.01` to `0.3` | Tension: How fast dots snap back home. |
| `data-ht-friction` | `0.7` to `0.99` | Drag: How long dots vibrate/move. |
| `data-ht-stretch` | `0` to `1.0` | Anisotropic elongation factor. |

---

## 🌊 Built-in Interaction Modes
*   **`repulse`**: (Default) Pushes dots away from the cursor.
*   **`attract`**: Liquid gravity. Dots cluster toward the mouse.
*   **`vortex`**: Swirling energy. Dots orbit the cursor.
*   **`magnetic`**: The "Watcher" effect. Dots rotate to face the cursor.
*   **`gravity`**: Dots "fall" towards the bottom of the radius.
*   **`drift`**: Dots lazily orbit the mouse center.
*   **`twist`**: Mechanical axis-spinning around the mouse.
*   **`float`**: Anti-gravity effect. Dots drift upward when touched.
*   **`frenzy`**: High-frequency electric jitter.
*   **`warp`**: Elastic stretching along the mouse path.
*   **`bounce`**: Interaction-triggered vertical oscillation.
*   **`shatter`**: High-energy burst on fast contact.
*   **`ripple`**: Sci-fi wave pulses.
*   **`swell`**: Localized magnification/inflation.
*   **`glitch`**: Digital position noise.
*   **`wind`**: Pushes dots in the direction of mouse movement.
*   **`pulse`**: Rhythmic distance-based breathing.

---

## 🛠 Advanced API (Pro-Code)

### Initialization
```javascript
import Halftone from './halftone.js';

const fx = new Halftone({
  container: '#hero-canvas',
  grid: 12,
  interaction: 'vortex',
  strength: 2.5
});
```

### 🔌 Registry & Plugin System
You can register custom interactions globally so they can be used via `data-ht-interaction`.

```javascript
import Halftone from './halftone.js';

// 1. Register a new behavior
Halftone.register('my-cool-effect', (dot, props) => {
    const { angle, force, strength, dpr } = props;
    dot.vx += Math.cos(angle) * force * strength * dpr;
});

// 2. Use it via JS or Data Attributes
const fx = new Halftone({
  container: '#hero',
  interaction: 'my-cool-effect'
});
```

---

## ⚡ Performance & Lifecycle
*   **Self-Cleaning**: The engine automatically detects when its container is removed from the DOM and shuts down its loops and listeners to prevent memory leaks.
*   **O(1) Sampling**: Optimized for 2026 browsers using pre-computed pixel mapping and `willReadFrequently` canvas optimization.

---

**Built with "Tactile Crunch" by saifulislam (2026).**
