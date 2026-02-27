import { Texture } from 'ogl';

const TRAIL_SIZE = 256;
const FADE_ALPHA = 0.04; // ~0.5s fade at 60fps

export default function createCometEffect() {
  let _canvas, _ctx, _texture, _gl;

  return {
    name: 'comet',

    setup(gl) {
      _canvas = document.createElement('canvas');
      _canvas.width = TRAIL_SIZE;
      _canvas.height = TRAIL_SIZE;
      _ctx = _canvas.getContext('2d');

      _ctx.fillStyle = '#000';
      _ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);

      _texture = new Texture(gl, {
        image: _canvas,
        generateMipmaps: false,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
      });

      _gl = gl;

      return { trailTexture: _texture };
    },

    update(state) {
      const { mouse, mouseActive, velocity, aspect, radius } = state;

      // 1. Fade the trail canvas
      _ctx.fillStyle = `rgba(0,0,0,${FADE_ALPHA})`;
      _ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);

      // 2. Draw soft circle at cursor position (if mouse is active)
      if (mouseActive > 0.1) {
        const x = mouse[0] * TRAIL_SIZE;
        const y = (1.0 - mouse[1]) * TRAIL_SIZE;
        const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1]);
        const rScale = (radius || 0.3) / 0.3;
        const r = (12 + speed * 3) * rScale;
        const a = aspect || 1;

        // Aspect-correct: scale X by 1/aspect so the brush appears circular on screen
        _ctx.save();
        _ctx.translate(x, y);
        _ctx.scale(1 / a, 1);

        const gradient = _ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        gradient.addColorStop(0, `rgba(255,255,255,${mouseActive})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        _ctx.fillStyle = gradient;
        _ctx.beginPath();
        _ctx.arc(0, 0, r, 0, Math.PI * 2);
        _ctx.fill();
        _ctx.restore();
      }

      // 3. Upload to GPU
      _texture.image = _canvas;
      _texture.needsUpdate = true;
    },

    teardown() {
      if (_ctx) {
        _ctx.fillStyle = '#000';
        _ctx.fillRect(0, 0, TRAIL_SIZE, TRAIL_SIZE);
        _texture.image = _canvas;
        _texture.needsUpdate = true;
      }
      _canvas = null;
      _ctx = null;
      _texture = null;
      _gl = null;
    },
  };
}
