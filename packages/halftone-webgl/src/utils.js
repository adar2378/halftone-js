export function hexToRGB(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const SHAPE_IDS = { circle: 0, square: 1, diamond: 2, line: 3, cross: 4, ellipse: 5 };
export const COLOR_MODE_IDS = { mono: 0, auto: 1, cmyk: 2, duotone: 3 };
export const INTERACTION_IDS = { none: 0, reveal: 1, magnify: 2, warp: 3, ripple: 4, vortex: 5, colorShift: 6, focus: 7, comet: 8, sparkle: 9 };
export const FIT_IDS = { cover: 0, contain: 1, fill: 2 };

export const DEFAULTS = {
  // Screen
  frequency: 40,
  angle: 0,
  // Dot
  shape: 'circle',
  scale: 1.0,
  softness: 0.5,
  gap: 0,
  // Tone
  contrast: 1.8,
  brightness: 1.0,
  invert: false,
  minDot: 0.0,
  // Color
  colorMode: 'mono',
  color: '#E85002',
  colorB: '#000000',
  bgColor: '#050510',
  cmykAngles: [15, 75, 0, 45],
  // Source
  source: null,
  fit: 'cover',
  // Interaction
  interaction: 'none',
  radius: 0.3,
  strength: 0.5,
  trailFade: 0.03,
  // Container
  dpr: 'auto',
  zIndex: 0,
  // Overlay
  pauseSelector: 'a, button, [data-hwgl-pause]',
};

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
