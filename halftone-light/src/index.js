import EventEmitter from './events.js';
import { DEFAULTS, INTERACTION_IDS, lerp } from './utils.js';
import { parseAttributes, resolveConfig } from './attributes.js';
import { createRenderer, updateUniform } from './renderer.js';
import {
  loadImageTexture,
  loadVideoTexture,
  loadWebcamTexture,
  isVideoTexture,
  updateVideoTexture,
} from './texture.js';

class HalftoneLight extends EventEmitter {
  constructor(options = {}) {
    super();

    // Resolve container
    const container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;

    if (!container) throw new Error('[HalftoneLight] Container not found');

    this.container = container;

    // Merge: defaults → data-attributes → JS options
    const attrConfig = parseAttributes(container);
    this._config = resolveConfig({ ...attrConfig, ...options });

    // Internal state
    this._mouseTarget = [0, 0];
    this._mouseCurrent = [0, 0];
    this._mouseActiveTarget = 0;
    this._mouseActiveCurrent = 0;
    this._time = 0;
    this._isPlaying = false;
    this._raf = null;
    this._needsRender = true;
    this._hasVideo = false;
    this._hasInteraction = this._config.interaction !== 'none';
    this._destroyed = false;

    // Create WebGL renderer
    try {
      const result = createRenderer(container, this._config);
      this._renderer = result.renderer;
      this._gl = result.gl;
      this._canvas = result.canvas;
      this._mesh = result.mesh;
      this._program = result.program;
      this._uniforms = result.uniforms;
      this._defaultTexture = result.defaultTexture;
    } catch (e) {
      this.emit('error', e);
      throw e;
    }

    // Bind methods
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseEnter = this._onMouseEnter.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._loop = this._loop.bind(this);

    // Set up events
    this._setupEvents();

    // Load source if provided
    if (this._config.source) {
      this.loadSource(this._config.source).catch(e => this.emit('error', e));
    } else {
      // Render once for solid pattern
      this._renderOnce();
      this.emit('ready');
    }

    // Start animation if needed
    this._updatePlayState();

    // Expose instance on element for Webflow access
    container.__halftoneLight = this;
  }

  // ─── Public Properties ───

  get canvas() { return this._canvas; }
  get config() { return { ...this._config }; }
  get isPlaying() { return this._isPlaying; }

  // ─── Public Methods ───

  set(keyOrObj, value) {
    if (typeof keyOrObj === 'object') {
      for (const k in keyOrObj) {
        this._updateConfig(k, keyOrObj[k]);
      }
    } else {
      this._updateConfig(keyOrObj, value);
    }
    this._needsRender = true;

    // If not in continuous loop, do a single render
    if (!this._isPlaying) {
      this._renderOnce();
    }
  }

  async loadSource(src) {
    const gl = this._gl;
    let texture;

    try {
      if (src === 'webcam') {
        texture = await loadWebcamTexture(gl);
        this._hasVideo = true;
      } else if (typeof src === 'string' && /\.(mp4|webm|ogg)(\?|$)/i.test(src)) {
        texture = await loadVideoTexture(gl, src);
        this._hasVideo = true;
      } else if (typeof src === 'string') {
        texture = await loadImageTexture(gl, src);
        this._hasVideo = false;
      } else if (src instanceof HTMLVideoElement) {
        const { createVideoTexture } = await import('./texture.js');
        texture = createVideoTexture(gl, src);
        this._hasVideo = true;
      } else if (src instanceof HTMLImageElement) {
        texture = await loadImageTexture(gl, src.src);
        this._hasVideo = false;
      }
    } catch (e) {
      this.emit('error', e);
      throw e;
    }

    if (texture && !this._destroyed) {
      this._currentTexture = texture;
      this._uniforms.uTexture.value = texture;
      this._uniforms.uHasTexture.value = 1;

      // Update source aspect
      if (texture.sourceWidth && texture.sourceHeight) {
        this._uniforms.uSourceAspect.value = texture.sourceWidth / texture.sourceHeight;
      }

      this._needsRender = true;
      this._updatePlayState();
      this.emit('sourceload');

      if (!this._isPlaying) {
        this._renderOnce();
      }

      // Emit ready on first load
      if (!this._ready) {
        this._ready = true;
        this.emit('ready');
      }
    }
  }

  resize() {
    if (this._destroyed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = this._config.dpr === 'auto'
      ? Math.min(window.devicePixelRatio || 1, 2)
      : this._config.dpr;

    this._renderer.setSize(w, h);
    this._renderer.dpr = dpr;
    this._uniforms.uContainerAspect.value = w / h;

    this._needsRender = true;
    this.emit('resize', { w, h });

    if (!this._isPlaying) {
      this._renderOnce();
    }
  }

  pause() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._isPlaying = false;
  }

  resume() {
    if (!this._isPlaying) {
      this._isPlaying = true;
      this._raf = requestAnimationFrame(this._loop);
    }
  }

  snapshot(type = 'image/png', quality = 0.92) {
    // Render one frame with preserveDrawingBuffer
    this._render();
    return this._canvas.toDataURL(type, quality);
  }

  destroy() {
    this._destroyed = true;
    this.pause();

    // Remove event listeners
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.container.removeEventListener('mouseenter', this._onMouseEnter);
    this.container.removeEventListener('mouseleave', this._onMouseLeave);
    this.container.removeEventListener('touchmove', this._onTouchMove);
    this.container.removeEventListener('touchend', this._onTouchEnd);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }

    // Stop video/webcam streams
    if (this._currentTexture && this._currentTexture._video) {
      const video = this._currentTexture._video;
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
      }
      video.pause();
    }

    // Remove canvas
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }

    // Clean up OGL
    this._renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();

    delete this.container.__halftoneLight;
    super.destroy();
  }

  // ─── Internal ───

  _updateConfig(key, value) {
    this._config[key] = value;
    updateUniform(this._uniforms, key, value, this._config);

    if (key === 'interaction') {
      this._hasInteraction = value !== 'none';
      this._updatePlayState();
    }
    if (key === 'source') {
      this.loadSource(value).catch(e => this.emit('error', e));
    }
  }

  _setupEvents() {
    // Resize
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.container);
    }

    // Mouse
    window.addEventListener('mousemove', this._onMouseMove);
    this.container.addEventListener('mouseenter', this._onMouseEnter);
    this.container.addEventListener('mouseleave', this._onMouseLeave);

    // Touch
    this.container.addEventListener('touchmove', this._onTouchMove, { passive: true });
    this.container.addEventListener('touchend', this._onTouchEnd);
  }

  _onResize() {
    this.resize();
  }

  _onMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    this._mouseTarget[0] = (e.clientX - rect.left) / rect.width;
    this._mouseTarget[1] = 1.0 - (e.clientY - rect.top) / rect.height;
  }

  _onMouseEnter() {
    this._mouseActiveTarget = 1;
    // Start loop if interaction is enabled
    if (this._hasInteraction && !this._isPlaying) {
      this.resume();
    }
  }

  _onMouseLeave() {
    this._mouseActiveTarget = 0;
  }

  _onTouchMove(e) {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = this.container.getBoundingClientRect();
    this._mouseTarget[0] = (touch.clientX - rect.left) / rect.width;
    this._mouseTarget[1] = 1.0 - (touch.clientY - rect.top) / rect.height;
    this._mouseActiveTarget = 1;
    if (this._hasInteraction && !this._isPlaying) {
      this.resume();
    }
  }

  _onTouchEnd() {
    this._mouseActiveTarget = 0;
  }

  _updatePlayState() {
    const needsContinuous = this._hasVideo || this._hasInteraction;
    if (needsContinuous && !this._isPlaying) {
      this.resume();
    } else if (!needsContinuous && this._isPlaying && this._mouseActiveCurrent < 0.01) {
      this.pause();
    }
  }

  _loop() {
    if (this._destroyed) return;

    this._time += 0.016; // ~60fps timestep
    this._uniforms.uTime.value = this._time;

    // Smooth mouse interpolation
    this._mouseCurrent[0] = lerp(this._mouseCurrent[0], this._mouseTarget[0], 0.1);
    this._mouseCurrent[1] = lerp(this._mouseCurrent[1], this._mouseTarget[1], 0.1);
    this._uniforms.uMouse.value = this._mouseCurrent;

    // Smooth mouse active
    this._mouseActiveCurrent = lerp(this._mouseActiveCurrent, this._mouseActiveTarget, 0.08);
    this._uniforms.uMouseActive.value = this._mouseActiveCurrent;

    // Update video texture
    if (this._hasVideo && this._currentTexture) {
      updateVideoTexture(this._currentTexture);
    }

    this._render();

    // Smart rAF: stop if static + no interaction active
    if (!this._hasVideo && !this._hasInteraction && this._mouseActiveCurrent < 0.01) {
      this._isPlaying = false;
      this._raf = null;
      return;
    }

    // Also stop if interaction is fading and mouse is out
    if (!this._hasVideo && this._mouseActiveTarget === 0 && this._mouseActiveCurrent < 0.005) {
      this._isPlaying = false;
      this._raf = null;
      return;
    }

    this._raf = requestAnimationFrame(this._loop);
  }

  _render() {
    this._renderer.render({ scene: this._mesh });
  }

  _renderOnce() {
    this._render();
  }
}

// ─── Auto-init ───

function autoInit() {
  document.querySelectorAll('[data-hl-element]').forEach(el => {
    if (el.__halftoneLight) return;
    try {
      new HalftoneLight({ container: el });
    } catch (e) {
      console.warn('[HalftoneLight] Auto-init failed:', e.message);
    }
  });
}

if (typeof window !== 'undefined') {
  window.HalftoneLight = HalftoneLight;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

export default HalftoneLight;
