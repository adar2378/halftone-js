import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';
import { hexToRGB, SHAPE_IDS, COLOR_MODE_IDS, INTERACTION_IDS, FIT_IDS } from './utils.js';
import vertexShader from './shader.vert';
import fragmentShader from './shader.frag';
import { createDefaultTexture } from './texture.js';

export function createRenderer(container, config) {
  const dpr = config.dpr === 'auto'
    ? Math.min(window.devicePixelRatio || 1, 2)
    : config.dpr;

  const width = container.clientWidth;
  const height = container.clientHeight;

  const renderer = new Renderer({
    dpr,
    width,
    height,
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });

  const gl = renderer.gl;
  const canvas = gl.canvas;

  // Style the canvas
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.display = 'block';
  if (config.zIndex) canvas.style.zIndex = String(config.zIndex);

  // Ensure container has positioning context
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.style.overflow = 'hidden';

  // Promote existing children above the canvas (Vanta-style)
  Array.from(container.children).forEach(child => {
    const style = getComputedStyle(child);
    if (style.position === 'static') {
      child.style.position = 'relative';
    }
    if (!child.style.zIndex) {
      child.style.zIndex = '1';
    }
  });

  container.appendChild(canvas);

  // Default texture (1x1 black)
  const defaultTexture = createDefaultTexture(gl);

  // CMYK angles: degrees → radians
  const cmykRad = config.cmykAngles.map(a => a * Math.PI / 180);

  // Build uniforms
  const color = hexToRGB(config.color);
  const colorB = hexToRGB(config.colorB);
  const bgColor = hexToRGB(config.bgColor);

  const uniforms = {
    uTexture: { value: defaultTexture },
    uHasTexture: { value: 0 },
    // Screen
    uFrequency: { value: config.frequency },
    uAngle: { value: config.angle * Math.PI / 180 },
    // Dot
    uShape: { value: SHAPE_IDS[config.shape] || 0 },
    uScale: { value: config.scale },
    uSoftness: { value: config.softness },
    uGap: { value: config.gap },
    // Tone
    uContrast: { value: config.contrast },
    uBrightness: { value: config.brightness },
    uInvert: { value: config.invert ? 1 : 0 },
    uMinDot: { value: config.minDot },
    // Color
    uColorMode: { value: COLOR_MODE_IDS[config.colorMode] || 0 },
    uColor: { value: color },
    uColorB: { value: colorB },
    uBgColor: { value: bgColor },
    uCmykAngles: { value: cmykRad },
    // Fit
    uFit: { value: FIT_IDS[config.fit] || 0 },
    uSourceAspect: { value: 1 },
    uContainerAspect: { value: width / height },
    // Interaction
    uInteraction: { value: INTERACTION_IDS[config.interaction] || 0 },
    uMouse: { value: [0, 0] },
    uMouseActive: { value: 0 },
    uRadius: { value: config.radius },
    uStrength: { value: config.strength },
    uTime: { value: 0 },
    // Fade-in
    uFadeIn: { value: 0 },
    // Trail (comet effect)
    uTrail: { value: defaultTexture },
    uVelocity: { value: [0, 0] },
    uHasTrail: { value: 0 },
  };

  // Fullscreen triangle (more efficient than quad — covers viewport with 1 triangle)
  const geometry = new Triangle(gl);

  const program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms,
  });

  const mesh = new Mesh(gl, { geometry, program });

  return { renderer, gl, canvas, mesh, program, uniforms, defaultTexture };
}

export function updateUniform(uniforms, key, value, config) {
  switch (key) {
    case 'frequency':
      uniforms.uFrequency.value = value;
      break;
    case 'angle':
      uniforms.uAngle.value = value * Math.PI / 180;
      break;
    case 'shape':
      uniforms.uShape.value = SHAPE_IDS[value] || 0;
      break;
    case 'scale':
      uniforms.uScale.value = value;
      break;
    case 'softness':
      uniforms.uSoftness.value = value;
      break;
    case 'gap':
      uniforms.uGap.value = value;
      break;
    case 'contrast':
      uniforms.uContrast.value = value;
      break;
    case 'brightness':
      uniforms.uBrightness.value = value;
      break;
    case 'invert':
      uniforms.uInvert.value = value ? 1 : 0;
      break;
    case 'minDot':
      uniforms.uMinDot.value = value;
      break;
    case 'colorMode':
      uniforms.uColorMode.value = COLOR_MODE_IDS[value] || 0;
      break;
    case 'color':
      uniforms.uColor.value = hexToRGB(value);
      break;
    case 'colorB':
      uniforms.uColorB.value = hexToRGB(value);
      break;
    case 'bgColor':
      uniforms.uBgColor.value = hexToRGB(value);
      break;
    case 'cmykAngles':
      uniforms.uCmykAngles.value = value.map(a => a * Math.PI / 180);
      break;
    case 'fit':
      uniforms.uFit.value = FIT_IDS[value] || 0;
      break;
    case 'interaction':
      uniforms.uInteraction.value = INTERACTION_IDS[value] || 0;
      break;
    case 'radius':
      uniforms.uRadius.value = value;
      break;
    case 'strength':
      uniforms.uStrength.value = value;
      break;
    case 'trailFade':
      // JS-side only — handled by the active effect, no shader uniform
      break;
  }
}
