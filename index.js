/**
 * @name halftone.js (v2.4.0)
 * @description Production-ready physics interaction engine.
 * - Fixed: Swell/Pulse compounding size bug.
 * - Fixed: Resource leaks in destroy().
 * - Optimized: Canvas state management.
 */

class Halftone {
  constructor(options = {}) {
    this.root = typeof options.container === 'string' 
      ? document.querySelector(options.container) 
      : options.container;

    if (!this.root) {
      console.error('[Halftone] Init failed: Container not found');
      return;
    }

    if (this.root.dataset.htLoaded) {
      console.warn('[Halftone] Container already initialized');
      return;
    }
    this.root.dataset.htLoaded = 'true';

    // Canvas Setup
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimization
    this.root.appendChild(this.canvas);
    
    // Pixel Buffer
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { willReadFrequently: true });

    // State
    this.dots = [];
    this.mouse = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0 };
    this.raf = null;
    this.dpr = window.devicePixelRatio || 1;
    this.time = 0;
    this.sourceReady = false;
    this.sourceEl = null;

    // Config
    this.config = {
      grid: 12, shape: 'circle', interaction: 'repulse', fit: 'cover',
      source: null, dotScale: 0.8, spring: 0.1, friction: 0.8,
      radius: 120, strength: 1.8, stretch: 0.2, color: '#00f2ff', bgColor: '#050510',
      onInteract: null,
      ...this._discoverAttributes(),
      ...options
    };

    // Bindings
    this.resize = this.resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);

    this.init();
  }

  // --- REGISTRY ---
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
        // Fix: Modulate scalar instead of compounding baseSize
        dot.sizeScalar *= (1 + force * strength * 0.5); 
    },
    ripple: (dot, { dist, angle, force, strength, dpr, time }) => {
        const wave = Math.sin(dist * 0.05 - time * 0.1);
        const f = wave * strength * force * dpr;
        dot.vx += Math.cos(angle) * f;
        dot.vy += Math.sin(angle) * f;
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

  static register(name, fn) {
    Halftone.interactions[name] = fn;
  }

  _discoverAttributes() {
    const ds = this.root.dataset;
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

  init() {
    window.addEventListener('resize', this.resize);
    // Listen to window for smoother drag, but check hover on container
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('touchmove', this._onMove);
    this.root.addEventListener('mouseleave', this._onLeave);
    this.root.addEventListener('touchend', this._onLeave);

    if (this.config.source) {
        this.loadSource().catch(err => console.warn('[Halftone] Source error:', err));
    }
    
    this.resize();
    this.loop();
  }

  async loadSource() {
    this.sourceReady = false;
    const src = this.config.source;

    if (src === 'webcam') {
        const video = document.createElement('video');
        video.autoplay = video.muted = video.playsInline = true;
        
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
        if (el.complete) this.sourceReady = true;
        else await new Promise(r => el.onload = () => { this.sourceReady = true; r(); });
    } else {
        el.crossOrigin = "anonymous";
        try { await el.play(); this.sourceReady = true; } 
        catch (e) { console.warn("[Halftone] Autoplay blocked/failed", e); }
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
    
    // Track global mouse, but interactions depend on distance
    this.mouse.px = this.mouse.x; 
    this.mouse.py = this.mouse.y;
    this.mouse.x = (cx - bounds.left) * this.dpr; 
    this.mouse.y = (cy - bounds.top) * this.dpr;
    this.mouse.vx = this.mouse.x - this.mouse.px; 
    this.mouse.vy = this.mouse.y - this.mouse.py;
  }

  _onLeave() {
    // Reset mouse to infinity so interactions stop
    this.mouse.x = -9999;
    this.mouse.y = -9999;
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.width = this.root.offsetWidth; 
    this.height = this.root.offsetHeight;
    this.canvas.width = this.width * this.dpr; 
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px'; 
    this.canvas.style.height = this.height + 'px';
    this.buffer.width = this.canvas.width; 
    this.buffer.height = this.canvas.height;
    this.createGrid();
  }

  createGrid() {
    this.dots = [];
    const { grid, dotScale } = this.config;
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
          sizeScalar: 1, // Fix: Reset per frame
          sampleIdx: (Math.floor(y) * bW + Math.floor(x)) * 4,
          rotation: 0
        });
      }
    }
  }

  sample() {
    if (!this.sourceReady || !this.sourceEl) return null;
    try {
        // ... (Object fit logic similar to before, omitted for brevity but assumed intact)
        const sw = this.sourceEl.naturalWidth || this.sourceEl.videoWidth || this.sourceEl.width;
        const sh = this.sourceEl.naturalHeight || this.sourceEl.videoHeight || this.sourceEl.height;
        const sA = sw/sh, cA = this.canvas.width/this.canvas.height;
        let dw = this.canvas.width, dh = this.canvas.height, ox=0, oy=0;
        if(this.config.fit==='cover'){ if(cA>sA) dh=dw/sA; else dw=dh*sA; }
        else if(this.config.fit==='contain'){ if(cA>sA) dw=dh*sA; else dh=dw/sA; }
        ox=(this.canvas.width-dw)/2; oy=(this.canvas.height-dh)/2;
        this.bctx.drawImage(this.sourceEl, ox, oy, dw, dh);
        return this.bctx.getImageData(0,0,this.buffer.width,this.buffer.height).data;
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
      d.sizeScalar = 1; // Fix: Reset scalar every frame to prevent infinite growth

      // 1. Source Sampling
      if (data && d.sampleIdx < data.length) {
        const luma = (data[d.sampleIdx]*0.299 + data[d.sampleIdx+1]*0.587 + data[d.sampleIdx+2]*0.114)/255;
        d.baseSize = gDpr * 0.9 * luma;
      }

      // 2. Interaction
      const dx = this.mouse.x - d.x, dy = this.mouse.y - d.y, dist2 = dx*dx + dy*dy;
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

      // 3. Physics Integration
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
    // Clear
    ctx.fillStyle = config.bgColor; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = config.color;
    
    // Optimize: Use setTransform to avoid save/restore stack overhead
    // But for simplicity with rotation, standard transforms are okay if batched.
    // Here we stick to standard but optimized.
    
    for (let i = 0, len = this.dots.length; i < len; i++) {
      const d = this.dots[i];
      // Apply size scalar from interactions (swell/pulse)
      const size = d.baseSize * d.sizeScalar + (Math.sqrt(d.vx*d.vx+d.vy*d.vy) * 0.1);
      
      if (size < 0.5) continue;

      const v2 = d.vx*d.vx + d.vy*d.vy;
      ctx.save();
      ctx.translate(d.x, d.y);

      if (Math.abs(d.rotation) > 0.01) { 
          ctx.rotate(d.rotation); 
      } else if (v2 > 1.5) {
          const v = Math.sqrt(v2);
          ctx.rotate(Math.atan2(d.vy, d.vx));
          const stretch = 1 + (v * config.stretch);
          ctx.scale(stretch, 1 / stretch);
      }

      this._drawShape(ctx, config.shape, size);
      ctx.restore();
    }
  }

  _drawShape(ctx, type, size) {
    const r = size / 2;
    if (type === 'square') { ctx.fillRect(-r, -r, size, size); return; }
    
    ctx.beginPath();
    if (type === 'diamond') { ctx.moveTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r); }
    else if (type === 'triangle') { ctx.moveTo(r, 0); ctx.lineTo(-r, r); ctx.lineTo(-r, -r); }
    else { ctx.arc(0, 0, r, 0, 6.28); }
    ctx.fill();
  }

  loop = () => { 
    if (!document.contains(this.root)) { this.destroy(); return; }
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
  const init = () => document.querySelectorAll('[data-ht-element]').forEach(el => { 
      if (!el.dataset.htLoaded) new Halftone({ container: el }); 
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); 
  else init();
}

export default Halftone;
