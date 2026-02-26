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
import createCometEffect from './effects/comet.js';
import createSparkleEffect from './effects/sparkle.js';

class HalftoneWebGL extends EventEmitter {
  constructor(options = {}) {
    super();

    // Resolve container
    const container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;

    if (!container) throw new Error('[HalftoneWebGL] Container not found');

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
    this._fadeTarget = 0;
    this._fadeCurrent = 0;
    this._destroyed = false;
    this._prevMouse = [0, 0];
    this._velocity = [0, 0];
    this._activeEffect = null;

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
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._loop = this._loop.bind(this);

    // Set up events
    this._setupEvents();

    // Set up trail-based effects if initial interaction requires one
    if (this._config.interaction === 'comet') {
      this._setupEffect('comet');
    } else if (this._config.interaction === 'sparkle') {
      this._setupEffect('sparkle');
    }

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
    container.__halftoneWebGL = this;
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

  async loadSource(src, { type } = {}) {
    const gl = this._gl;
    let texture;

    // Clean up previous video/webcam source
    if (this._currentTexture && this._currentTexture._video) {
      const video = this._currentTexture._video;
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    const isVideoUrl = typeof src === 'string' &&
      (/\.(mp4|webm|ogg)(\?|$)/i.test(src) || type === 'video');

    try {
      if (src === 'webcam') {
        texture = await loadWebcamTexture(gl);
        this._hasVideo = true;
      } else if (isVideoUrl) {
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
      this._fadeTarget = 1;
      this._updatePlayState();
      this.emit('sourceload');

      // Kick a temporary fade loop if not already animating
      if (!this._isPlaying) {
        this._runFade();
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
    this._teardownEffect();
    this.pause();

    // Remove event listeners
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
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

    delete this.container.__halftoneWebGL;
    super.destroy();
  }

  // ─── Internal ───

  _setupEffect(name) {
    this._teardownEffect();
    let effect;
    if (name === 'comet') {
      effect = createCometEffect();
      const { trailTexture } = effect.setup(this._gl);
      this._uniforms.uTrail.value = trailTexture;
      this._uniforms.uHasTrail.value = 1;
      this._activeEffect = effect;
    } else if (name === 'sparkle') {
      effect = createSparkleEffect();
      const { trailTexture } = effect.setup(this._gl, this._config);
      this._uniforms.uTrail.value = trailTexture;
      this._uniforms.uHasTrail.value = 1;
      this._activeEffect = effect;
    }
  }

  _teardownEffect() {
    if (this._activeEffect) {
      this._activeEffect.teardown();
      this._uniforms.uTrail.value = this._defaultTexture;
      this._uniforms.uHasTrail.value = 0;
      this._uniforms.uVelocity.value = [0, 0];
      this._activeEffect = null;
    }
  }

  _updateConfig(key, value) {
    this._config[key] = value;
    updateUniform(this._uniforms, key, value, this._config);

    if (key === 'interaction') {
      this._hasInteraction = value !== 'none';
      if (value === 'comet') {
        this._setupEffect('comet');
      } else if (value === 'sparkle') {
        this._setupEffect('sparkle');
      } else {
        this._teardownEffect();
      }
      this._updatePlayState();
    }
    if (key === 'trailFade' && this._activeEffect && this._activeEffect.setFade) {
      this._activeEffect.setFade(value);
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

    // Mouse — single window listener handles position + active state
    window.addEventListener('mousemove', this._onMouseMove);

    // Touch
    this.container.addEventListener('touchmove', this._onTouchMove, { passive: true });
    this.container.addEventListener('touchend', this._onTouchEnd);
  }

  _onResize() {
    this.resize();
  }

  _onMouseMove(e) {
    const rect = this.container.getBoundingClientRect();

    // Update cursor position
    this._mouseTarget[0] = (e.clientX - rect.left) / rect.width;
    this._mouseTarget[1] = 1.0 - (e.clientY - rect.top) / rect.height;

    // Compute inside from bounding rect (replaces mouseenter/mouseleave)
    const inside = e.clientX >= rect.left && e.clientX <= rect.right
                && e.clientY >= rect.top  && e.clientY <= rect.bottom;

    if (!inside) {
      this._mouseActiveTarget = 0;
      return;
    }

    // Check if hovering a "pause" element (button, link, [data-hwgl-pause])
    const sel = this._config.pauseSelector;
    if (sel && e.target.closest(sel)) {
      this._mouseActiveTarget = 0;
    } else {
      this._mouseActiveTarget = 1;
    }

    // Start loop if interaction is enabled
    if (this._hasInteraction && !this._isPlaying) {
      this.resume();
    }
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

    // Compute mouse velocity (delta per frame)
    this._velocity[0] = this._mouseCurrent[0] - this._prevMouse[0];
    this._velocity[1] = this._mouseCurrent[1] - this._prevMouse[1];
    this._prevMouse[0] = this._mouseCurrent[0];
    this._prevMouse[1] = this._mouseCurrent[1];

    // Smooth mouse active
    this._mouseActiveCurrent = lerp(this._mouseActiveCurrent, this._mouseActiveTarget, 0.08);
    this._uniforms.uMouseActive.value = this._mouseActiveCurrent;

    // Update active effect (e.g. comet trail)
    if (this._activeEffect) {
      this._uniforms.uVelocity.value = this._velocity;
      this._activeEffect.update({
        mouse: this._mouseCurrent,
        mouseActive: this._mouseActiveCurrent,
        velocity: this._velocity,
        time: this._time,
      });
    }

    // Fade-in
    if (this._fadeCurrent < this._fadeTarget) {
      this._fadeCurrent = Math.min(this._fadeCurrent + 0.02, 1);
      this._uniforms.uFadeIn.value = this._fadeCurrent;
    }

    // Update video texture
    if (this._hasVideo && this._currentTexture) {
      updateVideoTexture(this._currentTexture);
    }

    this._render();

    const fading = this._fadeCurrent < this._fadeTarget;

    // Smart rAF: stop if static + no interaction active + fade done
    if (!this._hasVideo && !this._hasInteraction && this._mouseActiveCurrent < 0.01 && !fading) {
      this._isPlaying = false;
      this._raf = null;
      return;
    }

    // Also stop if interaction is fading and mouse is out + fade done
    if (!this._hasVideo && this._mouseActiveTarget === 0 && this._mouseActiveCurrent < 0.005 && !fading) {
      this._isPlaying = false;
      this._raf = null;
      return;
    }

    this._raf = requestAnimationFrame(this._loop);
  }

  _runFade() {
    if (this._destroyed || this._isPlaying) return;
    this._fadeCurrent = Math.min(this._fadeCurrent + 0.02, 1);
    this._uniforms.uFadeIn.value = this._fadeCurrent;
    this._render();
    if (this._fadeCurrent < 1) {
      requestAnimationFrame(() => this._runFade());
    }
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
  document.querySelectorAll('[data-hwgl-element]').forEach(el => {
    if (el.__halftoneWebGL) return;
    try {
      new HalftoneWebGL({ container: el });
    } catch (e) {
      console.warn('[HalftoneWebGL] Auto-init failed:', e.message);
    }
  });
}

if (typeof window !== 'undefined') {
  window.HalftoneWebGL = HalftoneWebGL;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

export default HalftoneWebGL;
