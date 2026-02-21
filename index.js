/**
 * @name halftone.js (v2.6.1)
 * @description The high-performance, physics-driven interaction layer for the modern web.
 * @author saifulislam (2026)
 * @license MIT
 */

// --- Constants ---
const PI = Math.PI;
const PI2 = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

class Halftone {
  /**
   * @param {Object} options 
   * @param {HTMLElement|string} options.container - Target element or selector
   * @param {number} [options.grid=12] - Grid spacing
   * @param {string} [options.shape='circle'] - circle|square|diamond|triangle
   * @param {string} [options.interaction='repulse'] - repulse|attract|vortex|shatter|swell|etc.
   * @param {string|HTMLElement} [options.source=null] - Image/Video source
   * @param {string} [options.color='#00f2ff'] - Hex color or 'auto' for sampled colors
   * @param {string} [options.bgColor='#050510'] - Background color (supports rgba/transparent)
   */
  constructor(options = {}) {
    const container = typeof options.container === 'string' 
      ? document.querySelector(options.container) 
      : options.container;

    if (!container) {
      throw new Error('[Halftone] Initialization failed: Container not found.');
    }

    if (container.dataset.htLoaded) {
      return;
    }
    container.dataset.htLoaded = 'true';

    // 1. Initial State & Elements
    this.root = container;
    this.dots = [];
    this.mouse = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0 };
    this.dpr = window.devicePixelRatio || 1;
    this.time = 0;
    this.sourceReady = false;
    this.sourceEl = null;
    this.raf = null;
    this._sampleWarnShown = false;

    // 2. Build Config (Attributes -> Options -> Defaults)
    this.config = {
      grid: 12,
      shape: 'circle',
      interaction: 'repulse',
      fit: 'cover',
      source: null,
      dotScale: 0.8,
      spring: 0.1,
      friction: 0.8,
      radius: 120,
      strength: 1.8,
      stretch: 0.2,
      color: '#00f2ff',
      bgColor: '#050510',
      onInteract: null,
      ...this._discoverAttributes(),
      ...options
    };

    // 3. Optimized Canvas Context
    const bg = this.config.bgColor.toLowerCase();
    const needsAlpha = bg === 'transparent' || bg.includes('rgba') || bg.includes('hsla');
    
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: needsAlpha });
    this.root.appendChild(this.canvas);
    
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { willReadFrequently: true });

    // Bindings
    this.resize = this.resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this.loop = this.loop.bind(this);

    this.init();
  }

  // --- Interaction Plugins ---
  static interactions = {
    repulse: (dot, { angle, force, strength, dpr }) => {
      const f = force * strength * dpr;
      dot.vx -= Math.cos(angle) * f;
      dot.vy -= Math.sin(angle) * f;
    },
    attract: (dot, { angle, force, strength, dpr }) => {
      const f = force * strength * dpr;
      dot.vx += Math.cos(angle) * f;
      dot.vy += Math.sin(angle) * f;
    },
    vortex: (dot, { angle, force, strength, dpr }) => {
      const f = force * strength * dpr;
      dot.vx += Math.cos(angle + HALF_PI) * f;
      dot.vy += Math.sin(angle + HALF_PI) * f;
    },
    magnetic: (dot, { angle, force }) => {
      let diff = angle - dot.rotation;
      while (diff < -PI) diff += PI2;
      while (diff > PI) diff -= PI2;
      dot.rotation += diff * force;
    },
    shatter: (dot, { mouse, force, strength, dpr }) => {
      if (Math.abs(mouse.vx) > 5 || Math.abs(mouse.vy) > 5) {
        dot.vx += (Math.random() - 0.5) * strength * 10 * dpr;
        dot.vy += (Math.random() - 0.5) * strength * 10 * dpr;
      }
    },
    swell: (dot, { force, strength }) => {
      dot.sizeScalar *= (1 + force * strength * 0.5); 
    },
    ripple: (dot, { dist, angle, force, strength, dpr, time }) => {
      const wave = Math.sin(dist * 0.05 - time * 0.1);
      const f = wave * strength * force * dpr;
      dot.vx += Math.cos(angle) * f;
      dot.vy += Math.sin(angle) * f;
    },
    glitch: (dot, { force, strength, dpr }) => {
      if (Math.random() > 0.98) {
        dot.vx += (Math.random() - 0.5) * strength * 20 * dpr;
        dot.x += (Math.random() - 0.5) * 10; 
      }
    },
    wind: (dot, { mouse, force, strength, dpr }) => {
      dot.vx += mouse.vx * force * strength * 0.2;
      dot.vy += mouse.vy * force * strength * 0.2;
    },
    pulse: (dot, { dist, time, force }) => {
      const p = Math.sin(time * 0.2 - dist * 0.02) * 0.5 + 0.5;
      dot.sizeScalar *= (1 + p * force);
    },
    twist: (dot, { force, time }) => {
      dot.rotation += force * 0.5 + Math.sin(time * 0.1) * 0.1;
    },
    float: (dot, { force, strength, dpr }) => {
      dot.vy -= force * strength * dpr * 0.5;
    },
    frenzy: (dot, { force, strength, dpr }) => {
      const f = force * strength * 15 * dpr;
      dot.vx += (Math.random() - 0.5) * f;
      dot.vy += (Math.random() - 0.5) * f;
    },
    warp: (dot, { angle, force, strength, dpr }) => {
      const f = force * strength * dpr;
      dot.vx += Math.cos(angle) * f;
      dot.vy += Math.sin(angle) * f;
      dot.rotation = angle;
    },
    bounce: (dot, { force, time, strength, dpr }) => {
      dot.vy += Math.sin(time * 0.3) * force * strength * dpr * 2;
    },
    gravity: (dot, { force, strength, dpr }) => {
      dot.vy += force * strength * dpr * 0.8;
    },
    drift: (dot, { dist, angle, time, force, dpr }) => {
      const f = force * dpr * 0.5;
      dot.vx += Math.cos(angle + time * 0.02) * f;
      dot.vy += Math.sin(angle + time * 0.02) * f;
    }
  };

  /** Register a custom interaction effect globally */
  static register(name, fn) {
    Halftone.interactions[name] = fn;
  }

  _discoverAttributes() {
    const ds = this.root.dataset;
    const attrs = {};
    const validKeys = new Set(['grid', 'shape', 'interaction', 'fit', 'source', 'dotScale', 'spring', 'friction', 'radius', 'strength', 'stretch', 'color', 'bgColor']);
    
    for (const key in ds) {
      if (key.startsWith('ht')) {
        const prop = key.slice(2).charAt(0).toLowerCase() + key.slice(3);
        if (!validKeys.has(prop)) {
            console.warn(`[Halftone] Unknown attribute: data-ht-${prop}`);
            continue;
        }
        const val = ds[key];
        attrs[prop] = (val === 'true') ? true : (val === 'false' ? false : (isNaN(val) ? val : parseFloat(val)));
      }
    }
    return attrs;
  }

  init() {
    window.addEventListener('resize', this.resize);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('touchmove', this._onMove);
    this.root.addEventListener('mouseleave', this._onLeave);
    this.root.addEventListener('touchend', this._onLeave);

    this._dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this._dprMedia.addEventListener('change', this.resize);

    if (this.config.source) {
      this.loadSource().catch(err => console.warn('[Halftone] Source load error:', err));
    }
    
    this.resize();
    this.loop();
  }

  async loadSource() {
    this.sourceReady = false;
    const src = this.config.source;

    if (src === 'webcam') {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.autoplay = video.muted = video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      this.sourceEl = video;
      this.sourceReady = true;
      return;
    }

    let el = (typeof src === 'string') 
      ? (src.includes('.') || src.includes('/') ? this._createSourceEl(src) : document.querySelector(src)) 
      : src;

    if (!el) return;
    this.sourceEl = el;

    if (el.tagName === 'IMG') {
      if (el.complete) {
        this.sourceReady = true;
      } else {
        await new Promise(r => el.onload = () => { this.sourceReady = true; r(); });
      }
    } else {
      el.crossOrigin = "anonymous";
      try {
        await el.play(); 
        this.sourceReady = true;
      } catch (e) {
        console.warn("[Halftone] Media autoplay failed:", e);
      }
    }
  }

  _createSourceEl(url) {
    const isVid = url.match(/\.(mp4|webm|ogg)$/i);
    const el = document.createElement(isVid ? 'video' : 'img');
    el.src = url; 
    el.crossOrigin = "anonymous";
    if (isVid) { el.loop = el.muted = el.playsInline = true; }
    return el;
  }

  _onMove(e) {
    const bounds = this.canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    
    this.mouse.px = this.mouse.x; 
    this.mouse.py = this.mouse.y;
    this.mouse.x = (cx - bounds.left) * this.dpr; 
    this.mouse.y = (cy - bounds.top) * this.dpr;
    this.mouse.vx = this.mouse.x - this.mouse.px; 
    this.mouse.vy = this.mouse.y - this.mouse.py;
  }

  _onLeave() {
    this.mouse.x = -9999;
    this.mouse.y = -9999;
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.width = this.root.offsetWidth; 
    this.height = this.root.offsetHeight;
    
    this.canvas.width = this.width * this.dpr; 
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`; 
    this.canvas.style.height = `${this.height}px`;
    
    this.buffer.width = this.canvas.width; 
    this.buffer.height = this.canvas.height;
    
    this.createGrid();
  }

  createGrid() {
    this.dots = [];
    const { grid, dotScale, color } = this.config;
    const spacing = grid * this.dpr;
    const cols = Math.ceil(this.canvas.width / spacing) + 1;
    const rows = Math.ceil(this.canvas.height / spacing) + 1;
    const bW = this.buffer.width;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * spacing;
        const y = r * spacing;
        this.dots.push({
          homeX: x, homeY: y, 
          x: x, y: y, 
          vx: 0, vy: 0, 
          baseSize: (spacing / 2) * dotScale,
          sizeScalar: 1, 
          sampleIdx: (Math.floor(y) * bW + Math.floor(x)) * 4,
          rotation: 0,
          color: color === 'auto' ? null : color
        });
      }
    }
  }

  sample() {
    if (!this.sourceReady || !this.sourceEl) return null;
    try {
      const sw = this.sourceEl.naturalWidth || this.sourceEl.videoWidth || this.sourceEl.width;
      const sh = this.sourceEl.naturalHeight || this.sourceEl.videoHeight || this.sourceEl.height;
      if (!sw || !sh) return null;

      const sA = sw/sh, cA = this.canvas.width/this.canvas.height;
      let dw = this.canvas.width, dh = this.canvas.height, ox=0, oy=0;
      
      if (this.config.fit === 'cover') { if (cA > sA) dh = dw / sA; else dw = dh * sA; }
      else if (this.config.fit === 'contain') { if (cA > sA) dw = dh * sA; else dh = dw / sA; }
      
      ox = (this.canvas.width - dw) / 2; 
      oy = (this.canvas.height - dh) / 2;
      
      this.bctx.drawImage(this.sourceEl, ox, oy, dw, dh);
      return this.bctx.getImageData(0, 0, this.buffer.width, this.buffer.height).data;
    } catch(e) { 
        if (!this._sampleWarnShown) {
            console.warn('[Halftone] Source sampling failed:', e.message);
            this._sampleWarnShown = true;
        }
        return null; 
    }
  }

  update() {
    this.time++;
    const data = this.sample();
    const { spring, friction, radius, strength, interaction, grid, onInteract, color } = this.config;
    const radDpr = radius * this.dpr;
    const gDpr = grid * this.dpr;
    const useAutoColor = color === 'auto';
    
    const interactFn = onInteract || Halftone.interactions[interaction] || Halftone.interactions.repulse;

    for (let i = 0, len = this.dots.length; i < len; i++) {
      const d = this.dots[i];
      d.sizeScalar = 1; 

      if (data && d.sampleIdx < data.length) {
        const r = data[d.sampleIdx];
        const g = data[d.sampleIdx + 1];
        const b = data[d.sampleIdx + 2];
        const luma = (r * LUMA_R + g * LUMA_G + b * LUMA_B) / 255;
        d.baseSize = gDpr * 0.9 * luma;
        if (useAutoColor) d.color = `rgb(${r},${g},${b})`;
      }

      const dx = this.mouse.x - d.x;
      const dy = this.mouse.y - d.y;
      const dist2 = dx * dx + dy * dy;
      
      if (dist2 < radDpr * radDpr) {
        const dist = Math.sqrt(dist2);
        interactFn(d, { 
          dist, angle: Math.atan2(dy, dx), 
          force: (radDpr - dist) / radDpr, 
          strength, dpr: this.dpr, mouse: this.mouse, time: this.time 
        });
      } else {
        d.rotation *= 0.9;
      }

      d.vx += (d.homeX - d.x) * spring; 
      d.vy += (d.homeY - d.y) * spring;
      d.vx *= friction; 
      d.vy *= friction;
      d.x += d.vx; 
      d.y += d.vy;
    }
  }

  draw() {
    const { ctx, config, canvas } = this;
    ctx.fillStyle = config.bgColor; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const defaultColor = config.color;
    const useAutoColor = defaultColor === 'auto';
    if (!useAutoColor) ctx.fillStyle = defaultColor;

    for (let i = 0, len = this.dots.length; i < len; i++) {
      const d = this.dots[i];
      const size = d.baseSize * d.sizeScalar + (Math.sqrt(d.vx * d.vx + d.vy * d.vy) * 0.1);
      
      if (size < 0.5) continue;
      ctx.fillStyle = d.color || defaultColor;

      const v2 = d.vx * d.vx + d.vy * d.vy;
      const hasRotation = Math.abs(d.rotation) > 0.01;
      const hasStretch = v2 > 1.5;

      if (hasRotation || hasStretch) {
        ctx.save();
        ctx.translate(d.x, d.y);
        if (hasRotation) {
          ctx.rotate(d.rotation);
        } else {
          const v = Math.sqrt(v2);
          ctx.rotate(Math.atan2(d.vy, d.vx));
          const stretch = 1 + (v * config.stretch);
          ctx.scale(stretch, 1 / stretch);
        }
        this._drawShape(ctx, config.shape, size);
        ctx.restore();
      } else {
        // High-performance direct draw path
        this._drawShapeDirect(ctx, config.shape, d.x, d.y, size);
      }
    }
  }

  _drawShape(ctx, type, size) {
    const r = size / 2;
    if (type === 'square') { ctx.fillRect(-r, -r, size, size); return; }
    ctx.beginPath();
    if (type === 'diamond') { ctx.moveTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r); }
    else if (type === 'triangle') { ctx.moveTo(r, 0); ctx.lineTo(-r, r); ctx.lineTo(-r, -r); }
    else { ctx.arc(0, 0, r, 0, PI2); }
    ctx.fill();
  }

  _drawShapeDirect(ctx, type, x, y, size) {
    const r = size / 2;
    if (type === 'square') { ctx.fillRect(x - r, y - r, size, size); return; }
    ctx.beginPath();
    if (type === 'diamond') { ctx.moveTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.lineTo(x, y - r); }
    else if (type === 'triangle') { ctx.moveTo(x + r, y); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r, y - r); }
    else { ctx.arc(x, y, r, 0, PI2); }
    ctx.fill();
  }

  loop() {
    if (!document.contains(this.root)) {
      this.destroy();
      return;
    }
    this.update(); 
    this.draw(); 
    this.raf = requestAnimationFrame(this.loop); 
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('touchmove', this._onMove);
    this.root.removeEventListener('mouseleave', this._onLeave);
    this.root.removeEventListener('touchend', this._onLeave);
    
    if (this._dprMedia) {
        this._dprMedia.removeEventListener('change', this.resize);
    }

    if (this.sourceEl && this.sourceEl.srcObject) {
      this.sourceEl.srcObject.getTracks().forEach(t => t.stop());
    }
    
    this.canvas.remove();
    this.dots = [];
    delete this.root.dataset.htLoaded;
  }
}

if (typeof window !== 'undefined') {
  window.Halftone = Halftone;
  const init = () => {
    document.querySelectorAll('[data-ht-element]').forEach(el => {
      if (!el.dataset.htLoaded) new Halftone({ container: el });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

export default Halftone;
