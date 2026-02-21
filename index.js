/**
 * @name halftone.js (v2.3.1)
 * @description The high-performance, physics-driven interaction layer for the modern web.
 * - Architecture: Fully dynamic attribute mapping.
 * - Architecture: Interaction Registry for global plugins.
 */

class Halftone {
  constructor(options = {}) {
    this.container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
    if (!this.container || this.container.hasAttribute('data-ht-loaded')) return;
    this.container.setAttribute('data-ht-loaded', 'true');

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.container.appendChild(this.canvas);
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { willReadFrequently: true });

    this.dots = [];
    this.mouse = { x: -1000, y: -1000, px: -1000, py: -1000, vx: 0, vy: 0 };
    this.raf = null;
    this.dpr = window.devicePixelRatio || 1;
    this.time = 0;
    this.sourceReady = false;

    // --- Core Config ---
    this.config = {
      grid: 12, shape: 'circle', interaction: 'repulse', fit: 'cover',
      source: null, dotScale: 0.8, spring: 0.1, friction: 0.8,
      radius: 120, strength: 1.8, stretch: 0.2, color: '#00f2ff', bgColor: '#050510',
      onInteract: null,
      ...this._discoverAttributes(),
      ...options
    };

    this.resize = this.resize.bind(this);
    this._onMove = this._onMove.bind(this);

    this.init();
  }

  // --- THE PLUGIN REGISTRY ---
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
        dot.vx += Math.cos(angle + 1.57) * f;
        dot.vy += Math.sin(angle + 1.57) * f;
    },
    magnetic: (dot, { angle, force }) => {
        let diff = angle - dot.rotation;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        dot.rotation += diff * force;
    },
    shatter: (dot, { mouse, force, strength, dpr }) => {
        if (Math.abs(mouse.vx) > 5 || Math.abs(mouse.vy) > 5) {
            dot.vx += (Math.random() - 0.5) * strength * 10 * dpr;
            dot.vy += (Math.random() - 0.5) * strength * 10 * dpr;
        }
    },
    swell: (dot, { force, strength }) => {
        dot.baseSize *= (1 + force * strength * 0.5); 
    },
    ripple: (dot, { dist, angle, force, strength, dpr, time }) => {
        const wave = Math.sin(dist * 0.05 - time * 0.1);
        dot.vx += Math.cos(angle) * wave * strength * force * dpr;
        dot.vy += Math.sin(angle) * wave * strength * force * dpr;
    },
    glitch: (dot, { force, strength, dpr }) => {
        if (Math.random() > 0.95) {
            dot.vx += (Math.random() - 0.5) * force * strength * 20 * dpr;
            dot.x += (Math.random() - 0.5) * 10; 
        }
    },
    wind: (dot, { mouse, force, strength, dpr }) => {
        dot.vx += mouse.vx * force * strength * 0.2;
        dot.vy += mouse.vy * force * strength * 0.2;
    },
    pulse: (dot, { dist, time, force }) => {
        const p = Math.sin(time * 0.2 - dist * 0.02) * 0.5 + 0.5;
        dot.baseSize *= (1 + p * force);
    },
    twist: (dot, { force, time }) => {
        dot.rotation += force * 0.5 + Math.sin(time * 0.1) * 0.1;
    },
    float: (dot, { force, strength, dpr }) => {
        dot.vy -= force * strength * dpr * 0.5;
    },
    frenzy: (dot, { force, strength, dpr }) => {
        dot.vx += (Math.random() - 0.5) * force * strength * 15 * dpr;
        dot.vy += (Math.random() - 0.5) * force * strength * 15 * dpr;
    },
    warp: (dot, { angle, force, strength, dpr }) => {
        dot.vx += Math.cos(angle) * force * strength * dpr;
        dot.vy += Math.sin(angle) * force * strength * dpr;
        dot.rotation = angle;
    },
    bounce: (dot, { force, time, strength, dpr }) => {
        dot.vy += Math.sin(time * 0.3) * force * strength * dpr * 2;
    },
    gravity: (dot, { force, strength, dpr }) => {
        dot.vy += force * strength * dpr * 0.8;
    },
    drift: (dot, { dist, angle, time, force, dpr }) => {
        dot.vx += Math.cos(angle + time * 0.02) * force * dpr * 0.5;
        dot.vy += Math.sin(angle + time * 0.02) * force * dpr * 0.5;
    }
  };

  static register(name, fn) {
    Halftone.interactions[name] = fn;
  }

  _discoverAttributes() {
    const ds = this.container.dataset;
    const attrs = {};
    for (const key in ds) {
        if (key.startsWith('ht')) {
            const prop = key.slice(2).charAt(0).toLowerCase() + key.slice(3);
            const val = ds[key];
            attrs[prop] = (val === 'true') ? true : (val === 'false' ? false : (isNaN(val) ? val : parseFloat(val)));
        }
    }
    return attrs;
  }

  async init() {
    window.addEventListener('resize', this.resize);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('touchmove', this._onMove);
    if (this.config.source) await this.loadSource();
    this.resize();
    this.loop();
  }

  async loadSource() {
    this.sourceReady = false;
    const src = this.config.source;
    if (src === 'webcam') {
        const video = document.createElement('video'); video.autoplay = video.muted = video.playsInline = true;
        try { video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); await video.play(); this.sourceEl = video; this.sourceReady = true; } 
        catch (e) { console.warn("[Halftone] Webcam failed.", e); }
        return;
    }
    let el = (typeof src === 'string') ? (src.includes('.') || src.includes('/') ? this._createSourceEl(src) : document.querySelector(src)) : src;
    if (!el) return;
    this.sourceEl = el;
    if (el.tagName === 'IMG') {
        if (el.complete) this.sourceReady = true;
        else await new Promise(r => el.onload = () => { this.sourceReady = true; r(); });
    } else {
        try { el.crossOrigin = "anonymous"; await el.play(); this.sourceReady = true; } 
        catch (e) { console.warn("[Halftone] Media failed.", e); }
    }
  }

  _createSourceEl(url) {
    const isVid = url.match(/\.(mp4|webm|ogg)$/i);
    const el = document.createElement(isVid ? 'video' : 'img');
    el.src = url; el.crossOrigin = "anonymous";
    if (isVid) { el.loop = el.muted = el.playsInline = true; }
    return el;
  }

  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX), cy = (e.touches ? e.touches[0].clientY : e.clientY);
    this.mouse.px = this.mouse.x; this.mouse.py = this.mouse.y;
    this.mouse.x = (cx - rect.left) * this.dpr; this.mouse.y = (cy - rect.top) * this.dpr;
    this.mouse.vx = this.mouse.x - this.mouse.px; this.mouse.vy = this.mouse.y - this.mouse.py;
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.width = this.container.offsetWidth; this.height = this.container.offsetHeight;
    this.canvas.width = this.width * this.dpr; this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px'; this.canvas.style.height = this.height + 'px';
    this.buffer.width = this.canvas.width; this.buffer.height = this.canvas.height;
    this.createGrid();
  }

  createGrid() {
    this.dots = [];
    const spacing = this.config.grid * this.dpr;
    const cols = Math.ceil(this.canvas.width / spacing) + 1;
    const rows = Math.ceil(this.canvas.height / spacing) + 1;
    const bW = this.buffer.width;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * spacing, y = r * spacing;
        this.dots.push({ homeX: x, homeY: y, x: x, y: y, vx: 0, vy: 0, baseSize: (spacing / 2) * this.config.dotScale, size: 0, sampleIdx: (Math.floor(y) * bW + Math.floor(x)) * 4, rotation: 0 });
      }
    }
  }

  sample() {
    if (!this.sourceReady || !this.sourceEl) return null;
    try {
        const sw = this.sourceEl.naturalWidth || this.sourceEl.videoWidth || this.sourceEl.width;
        const sh = this.sourceEl.naturalHeight || this.sourceEl.videoHeight || this.sourceEl.height;
        const sA = sw / sh, cA = this.canvas.width / this.canvas.height;
        let dw = this.canvas.width, dh = this.canvas.height, ox = 0, oy = 0;
        if (this.config.fit === 'cover') { if (cA > sA) dh = dw / sA; else dw = dh * sA; }
        ox = (this.canvas.width - dw) / 2; oy = (this.canvas.height - dh) / 2;
        this.bctx.drawImage(this.sourceEl, ox, oy, dw, dh);
        return this.bctx.getImageData(0, 0, this.buffer.width, this.buffer.height).data;
    } catch(e) { return null; }
  }

  update() {
    this.time++;
    const data = this.sample();
    const { spring, friction, radius, strength, interaction, grid, onInteract } = this.config;
    const radDpr = radius * this.dpr;
    const gDpr = grid * this.dpr;
    
    const interactFn = onInteract || Halftone.interactions[interaction] || Halftone.interactions['repulse'];

    for (let i = 0, len = this.dots.length; i < len; i++) {
      const d = this.dots[i];
      if (data && d.sampleIdx < data.length) {
        const luma = (data[d.sampleIdx]*0.299 + data[d.sampleIdx+1]*0.587 + data[d.sampleIdx+2]*0.114)/255;
        d.baseSize = gDpr * 0.9 * luma;
      } else if (!data) { d.baseSize = (gDpr / 2) * this.config.dotScale; }

      const dx = this.mouse.x - d.x, dy = this.mouse.y - d.y, dist2 = dx*dx + dy*dy;
      if (dist2 < radDpr * radDpr) {
        const dist = Math.sqrt(dist2);
        const interactProps = { dist, angle: Math.atan2(dy, dx), force: (radDpr - dist) / radDpr, strength, dpr: this.dpr, mouse: this.mouse, time: this.time };
        interactFn(d, interactProps);
      } else { d.rotation *= 0.9; }

      d.vx += (d.homeX - d.x) * spring; d.vy += (d.homeY - d.y) * spring;
      d.vx *= friction; d.vy *= friction;
      d.x += d.vx; d.y += d.vy;
      d.size = d.baseSize + (Math.sqrt(d.vx*d.vx + d.vy*d.vy) * 0.1);
    }
  }

  draw() {
    const { ctx, config, canvas } = this;
    ctx.fillStyle = config.bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = config.color;
    for (let i = 0, len = this.dots.length; i < len; i++) {
      const d = this.dots[i]; if (d.size < 0.5) continue;
      const v2 = d.vx*d.vx + d.vy*d.vy;
      ctx.save(); ctx.translate(d.x, d.y);
      if (Math.abs(d.rotation) > 0.01) { ctx.rotate(d.rotation); } 
      else if (v2 > 1.5) { ctx.rotate(Math.atan2(d.vy, d.vx)); ctx.scale(1 + (Math.sqrt(v2) * config.stretch), 1 / (1 + (Math.sqrt(v2) * config.stretch))); }
      this.drawShape(ctx, config.shape, d.size);
      ctx.restore();
    }
  }

  drawShape(ctx, type, size) {
    const r = size / 2;
    switch(type) {
      case 'square': ctx.fillRect(-r, -r, size, size); break;
      case 'diamond': ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r); ctx.fill(); break;
      case 'triangle': ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r, r); ctx.lineTo(-r, -r); ctx.fill(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill();
    }
  }

  loop = () => { 
    if (!document.contains(this.container)) { this.destroy(); return; }
    this.update(); this.draw(); this.raf = requestAnimationFrame(this.loop); 
  }

  destroy() {
    console.log('[Halftone] Container removed. Cleaning up.');
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('touchmove', this._onMove);
    this.canvas.remove();
    this.container.removeAttribute('data-ht-loaded');
  }
}

if (typeof window !== 'undefined') {
  window.Halftone = Halftone;
  const init = () => document.querySelectorAll('[data-ht-element]').forEach(el => { if (!el.hasAttribute('data-ht-loaded')) new Halftone({ container: el }); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}

export default Halftone;
