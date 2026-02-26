precision highp float;

varying vec2 vUv;

// Source texture
uniform sampler2D uTexture;
uniform float uHasTexture;

// Screen (Grid)
uniform float uFrequency;
uniform float uAngle;

// Dot
uniform int uShape;        // 0=circle, 1=square, 2=diamond, 3=line, 4=cross, 5=ellipse
uniform float uScale;
uniform float uSoftness;
uniform float uGap;

// Tone
uniform float uContrast;
uniform float uBrightness;
uniform float uInvert;
uniform float uMinDot;

// Color
uniform int uColorMode;    // 0=mono, 1=auto, 2=cmyk, 3=duotone
uniform vec3 uColor;
uniform vec3 uColorB;
uniform vec3 uBgColor;
uniform vec4 uCmykAngles;  // angles in radians for C, M, Y, K

// Fit
uniform int uFit;          // 0=cover, 1=contain, 2=fill
uniform float uSourceAspect;
uniform float uContainerAspect;

// Interaction
uniform int uInteraction;  // 0=none, 1=reveal, 2=magnify, 3=warp, 4=ripple, 5=vortex, 6=colorShift, 7=focus, 8=comet
uniform vec2 uMouse;       // normalized 0-1
uniform float uMouseActive;
uniform float uRadius;
uniform float uStrength;
uniform float uTime;

// Fade-in
uniform float uFadeIn;

// Trail (comet effect)
uniform sampler2D uTrail;
uniform vec2 uVelocity;
uniform float uHasTrail;

// ─── Helpers ───

mat2 rot2d(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

// ─── Fit UV ───

vec2 fitUV(vec2 uv) {
  if (uFit == 2) return uv; // fill — direct mapping
  float ratio = uContainerAspect / uSourceAspect;
  vec2 st = uv - 0.5;
  if (uFit == 0) { // cover — fill container, crop overflow
    if (ratio > 1.0) st.y /= ratio;
    else st.x *= ratio;
  } else { // contain — fit source, letterbox
    if (ratio > 1.0) st.x *= ratio;
    else st.y /= ratio;
  }
  return st + 0.5;
}

// ─── SDF shapes ───
// All SDFs return: negative inside, positive outside (or vice versa)
// We use them as: dot is drawn where sdf < threshold

float sdfCircle(vec2 p) {
  return length(p);
}

float sdfSquare(vec2 p) {
  vec2 d = abs(p);
  return max(d.x, d.y);
}

float sdfDiamond(vec2 p) {
  vec2 d = abs(p);
  return d.x + d.y; // L1 norm = diamond
}

float sdfLine(vec2 p) {
  return abs(p.y); // horizontal line SDF
}

float sdfCross(vec2 p) {
  vec2 d = abs(p);
  return min(d.x, d.y);
}

float sdfEllipse(vec2 p) {
  return length(p * vec2(1.0, 1.8)); // stretch vertically
}

float getSDF(vec2 p, int shape) {
  if (shape == 1) return sdfSquare(p);
  if (shape == 2) return sdfDiamond(p);
  if (shape == 3) return sdfLine(p);
  if (shape == 4) return sdfCross(p);
  if (shape == 5) return sdfEllipse(p);
  return sdfCircle(p); // default: circle
}

// ─── Tone mapping ───

float toneCurve(float luma) {
  float v = clamp(luma * uBrightness, 0.0, 1.0);
  v = pow(v, uContrast);
  if (uInvert > 0.5) v = 1.0 - v;
  return mix(uMinDot, 1.0, v);
}

// ─── RGB ↔ CMYK ───

vec4 rgbToCMYK(vec3 rgb) {
  float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
  if (k >= 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float invK = 1.0 / (1.0 - k);
  return vec4(
    (1.0 - rgb.r - k) * invK,
    (1.0 - rgb.g - k) * invK,
    (1.0 - rgb.b - k) * invK,
    k
  );
}

// ─── Single-channel halftone ───

float halftoneChannel(vec2 uv, float freq, float angleRad, float dotSize, int shape, float softness) {
  // Aspect-correct UV so grid cells are square in screen space
  vec2 aspectUV = vec2(uv.x * uContainerAspect, uv.y);
  vec2 aspectCenter = vec2(0.5 * uContainerAspect, 0.5);

  // Rotate UV by screen angle
  vec2 rotUV = rot2d(angleRad) * (aspectUV - aspectCenter) + aspectCenter;

  // Scale to grid
  vec2 gridUV = rotUV * freq;

  // Cell coordinates: center of cell
  vec2 cell = floor(gridUV) + 0.5;

  // Position within cell, centered at 0
  vec2 p = gridUV - cell;

  // SDF distance
  float dist = getSDF(p, shape);

  // Dot radius from intensity
  float radius = max(dotSize * uScale * 0.5 - uGap * 0.5, 0.0);

  // Anti-aliased edge
  float edgeWidth = softness * 0.15 + 0.01;
  return 1.0 - smoothstep(radius - edgeWidth, radius + edgeWidth, dist);
}

// ─── Interaction field effects ───

struct InteractionResult {
  vec2 uv;        // modified UV for grid computation
  float freqMul;  // frequency multiplier
  float sizeMul;  // dot size multiplier
  float reveal;   // 0-1 reveal amount (blend with original)
  float hueShift; // hue rotation amount
};

InteractionResult computeInteraction(vec2 uv) {
  InteractionResult r;
  r.uv = uv;
  r.freqMul = 1.0;
  r.sizeMul = 1.0;
  r.reveal = 0.0;
  r.hueShift = 0.0;

  if (uInteraction == 0 || uInteraction == 9 || uMouseActive < 0.01) return r;

  vec2 aspect = vec2(uContainerAspect, 1.0);
  vec2 delta = (uv - uMouse) * aspect;
  float dist = length(delta);
  float field = smoothstep(uRadius, 0.0, dist);
  float active = field * uMouseActive * uStrength;

  if (active < 0.001) return r;

  if (uInteraction == 1) { // reveal
    r.reveal = active;
  }
  else if (uInteraction == 2) { // magnify
    r.sizeMul = 1.0 + active * 2.0;
  }
  else if (uInteraction == 3) { // warp
    vec2 dir = dist > 0.001 ? normalize(delta) : vec2(0.0);
    r.uv = uv + dir * active * 0.1;
  }
  else if (uInteraction == 4) { // ripple
    float wave = sin(dist * 30.0 - uTime * 3.0) * 0.5 + 0.5;
    vec2 dir = dist > 0.001 ? normalize(delta) : vec2(0.0);
    r.uv = uv + dir * wave * active * 0.03;
  }
  else if (uInteraction == 5) { // vortex
    float angle = active * 3.14159;
    vec2 centered = uv - uMouse;
    centered = rot2d(angle) * centered;
    r.uv = centered + uMouse;
  }
  else if (uInteraction == 6) { // colorShift
    r.hueShift = active;
  }
  else if (uInteraction == 7) { // focus
    r.freqMul = 1.0 + active * 2.0;
  }
  else if (uInteraction == 8 && uHasTrail > 0.5) { // comet
    float heat = texture2D(uTrail, uv).r;
    r.sizeMul = 1.0 + heat * uStrength * 2.0;
    float speed = length(uVelocity);
    if (speed > 0.001) {
      r.uv = uv + normalize(uVelocity) * heat * 0.02;
    }
  }
  return r;
}

// ─── Hue rotation for colorShift ───

vec3 hueRotate(vec3 color, float angle) {
  float cosA = cos(angle * 6.28318);
  float sinA = sin(angle * 6.28318);
  mat3 hueRot = mat3(
    0.299 + 0.701*cosA + 0.168*sinA,
    0.587 - 0.587*cosA + 0.330*sinA,
    0.114 - 0.114*cosA - 0.497*sinA,
    0.299 - 0.299*cosA - 0.328*sinA,
    0.587 + 0.413*cosA + 0.035*sinA,
    0.114 - 0.114*cosA + 0.292*sinA,
    0.299 - 0.300*cosA + 1.250*sinA,
    0.587 - 0.588*cosA - 1.050*sinA,
    0.114 + 0.886*cosA - 0.203*sinA
  );
  return clamp(hueRot * color, 0.0, 1.0);
}

// ─── Main ───

void main() {
  vec2 uv = vUv;

  // Compute interaction
  InteractionResult interact = computeInteraction(uv);
  vec2 gridUV = interact.uv;
  float freq = uFrequency * interact.freqMul;

  // Compute cell info (needed for sparkle + texture sampling)
  // Aspect-correct to match halftoneChannel grid
  vec2 aspectUV = vec2(gridUV.x * uContainerAspect, gridUV.y);
  vec2 aspectCenter = vec2(0.5 * uContainerAspect, 0.5);
  vec2 rotUV = rot2d(uAngle) * (aspectUV - aspectCenter) + aspectCenter;
  vec2 cellGridUV = rotUV * freq;
  vec2 cellIdx = floor(cellGridUV);
  vec2 cellCenter = (cellIdx + 0.5) / freq;
  // Un-rotate, then un-aspect to get back to [0,1] UV for texture sampling
  vec2 cellAspectUV = rot2d(-uAngle) * (cellCenter - aspectCenter) + aspectCenter;
  vec2 cellWorldUV = vec2(cellAspectUV.x / uContainerAspect, cellAspectUV.y);

  // Sample source texture
  vec3 srcColor = vec3(0.0);
  float srcLuma = 0.0;

  if (uHasTexture > 0.5) {
    vec2 cellTexUV = fitUV(cellWorldUV);
    srcColor = texture2D(uTexture, clamp(cellTexUV, 0.0, 1.0)).rgb;
    srcLuma = luminance(srcColor) * uFadeIn;
    srcColor *= uFadeIn;
  }

  float dotSize = toneCurve(srcLuma) * interact.sizeMul;

  // Sparkle: trail heatmap + per-cell noise for irregular, movement-driven sparkle
  float sparkleAmount = 0.0;

  if (uInteraction == 9 && uHasTrail > 0.5 && uMouseActive > 0.01) {
    float heat = texture2D(uTrail, uv).r;

    if (heat > 0.01) {
      // Per-cell random phase — each cell oscillates differently
      float h = hash21(cellIdx);
      float phase = h * 6.2832;

      // Smooth wave driven by cursor movement (not time)
      float wave = sin(dot(uMouse, vec2(25.0, 19.0)) + phase) * 0.5 + 0.5;

      // Noise everywhere — reduced at center, stronger at edges
      float noise = mix(wave, 1.0, heat * heat * 0.7);
      sparkleAmount = heat * noise * uMouseActive * uStrength;
    }
  }

  vec3 finalColor;

  if (uColorMode == 2) {
    // ─── CMYK mode ───
    vec4 cmyk = rgbToCMYK(srcColor);
    float cDot = toneCurve(1.0 - cmyk.x) * interact.sizeMul;
    float mDot = toneCurve(1.0 - cmyk.y) * interact.sizeMul;
    float yDot = toneCurve(1.0 - cmyk.z) * interact.sizeMul;
    float kDot = toneCurve(1.0 - cmyk.w) * interact.sizeMul;

    // Sparkle: push CMYK dots toward max size near cursor
    cDot = mix(cDot, 1.0, sparkleAmount);
    mDot = mix(mDot, 1.0, sparkleAmount);
    yDot = mix(yDot, 1.0, sparkleAmount);
    kDot = mix(kDot, 1.0, sparkleAmount);

    float cMask = halftoneChannel(gridUV, freq, uCmykAngles.x, cDot, uShape, uSoftness);
    float mMask = halftoneChannel(gridUV, freq, uCmykAngles.y, mDot, uShape, uSoftness);
    float yMask = halftoneChannel(gridUV, freq, uCmykAngles.z, yDot, uShape, uSoftness);
    float kMask = halftoneChannel(gridUV, freq, uCmykAngles.w, kDot, uShape, uSoftness);

    // Subtractive color mixing (CMYK on white)
    vec3 paper = vec3(1.0);
    paper -= vec3(0.0, 1.0, 1.0) * cMask * cmyk.x; // Cyan removes R
    paper -= vec3(1.0, 0.0, 1.0) * mMask * cmyk.y; // Magenta removes G
    paper -= vec3(1.0, 1.0, 0.0) * yMask * cmyk.z; // Yellow removes B
    paper -= vec3(1.0, 1.0, 1.0) * kMask * cmyk.w; // Key (black)

    finalColor = mix(uBgColor, clamp(paper, 0.0, 1.0), max(max(max(cMask, mMask), yMask), kMask));
  }
  else {
    // ─── Single-channel halftone ───
    dotSize = mix(dotSize, 1.0, sparkleAmount);
    float mask = halftoneChannel(gridUV, freq, uAngle, dotSize, uShape, uSoftness);

    vec3 dotColor;
    if (uColorMode == 1) {
      // auto — use source color
      dotColor = srcColor;
    } else if (uColorMode == 3) {
      // duotone — blend between colorB (shadows) and color (highlights)
      dotColor = mix(uColorB, uColor, srcLuma);
    } else {
      // mono
      dotColor = uColor;
    }

    // Apply hue shift from interaction
    if (interact.hueShift > 0.001) {
      dotColor = hueRotate(dotColor, interact.hueShift);
    }

    finalColor = mix(uBgColor, dotColor, mask);
  }

  // Reveal interaction: blend with original image
  if (interact.reveal > 0.001 && uHasTexture > 0.5) {
    vec3 origColor = texture2D(uTexture, clamp(fitUV(interact.uv), 0.0, 1.0)).rgb;
    finalColor = mix(finalColor, origColor, interact.reveal);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
