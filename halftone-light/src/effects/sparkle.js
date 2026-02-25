import { Texture } from 'ogl';

const TRAIL_SIZE = 128;
const BRUSH_RADIUS = 12;

export default {
  name: 'sparkle',

  setup(gl, config) {
    const canvas = document.createElement('canvas');
    canvas.width = TRAIL_SIZE;
    canvas.height = TRAIL_SIZE;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);

    const texture = new Texture(gl, {
      image: canvas,
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });

    this._canvas = canvas;
    this._ctx = ctx;
    this._texture = texture;
    this._gl = gl;
    this._fadeAlpha = (config && config.trailFade) || 0.03;

    return { trailTexture: texture };
  },

  setFade(fadeAlpha) {
    this._fadeAlpha = fadeAlpha;
  },

  update(state) {
    const { mouse, mouseActive } = state;
    const ctx = this._ctx;

    // 1. Fade the trail canvas
    ctx.fillStyle = `rgba(0,0,0,${this._fadeAlpha})`;
    ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);

    // 2. Draw soft glow at cursor position
    if (mouseActive > 0.1) {
      const x = mouse[0] * TRAIL_SIZE;
      const y = (1.0 - mouse[1]) * TRAIL_SIZE;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, BRUSH_RADIUS);
      gradient.addColorStop(0, `rgba(255,255,255,${mouseActive * 0.8})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Upload to GPU
    this._texture.image = this._canvas;
    this._texture.needsUpdate = true;
  },

  teardown() {
    if (this._ctx) {
      this._ctx.fillStyle = '#000';
      this._ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);
      this._texture.image = this._canvas;
      this._texture.needsUpdate = true;
    }
    this._canvas = null;
    this._ctx = null;
    this._texture = null;
    this._gl = null;
  },
};
