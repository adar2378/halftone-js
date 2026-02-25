import { Texture } from 'ogl';

const TRAIL_SIZE = 256;
const FADE_ALPHA = 0.04; // ~0.5s fade at 60fps

export default {
  name: 'comet',

  setup(gl) {
    // Create offscreen trail canvas
    const canvas = document.createElement('canvas');
    canvas.width = TRAIL_SIZE;
    canvas.height = TRAIL_SIZE;
    const ctx = canvas.getContext('2d');

    // Start fully black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);

    // Create OGL texture from the canvas
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

    return { trailTexture: texture };
  },

  update(state) {
    const { mouse, mouseActive, velocity } = state;
    const ctx = this._ctx;

    // 1. Fade the trail canvas
    ctx.fillStyle = `rgba(0,0,0,${FADE_ALPHA})`;
    ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);

    // 2. Draw soft circle at cursor position (if mouse is active)
    if (mouseActive > 0.1) {
      const x = mouse[0] * TRAIL_SIZE;
      const y = (1.0 - mouse[1]) * TRAIL_SIZE; // flip Y: shader UV has Y-up, canvas Y-down
      const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1]);
      const radius = 12 + speed * 3;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${mouseActive})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Upload to GPU
    this._texture.image = this._canvas;
    this._texture.needsUpdate = true;
  },

  teardown() {
    // Clear the trail canvas so no artifacts remain
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
