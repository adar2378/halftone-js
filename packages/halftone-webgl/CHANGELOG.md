# Changelog

## 1.0.3 (2026-02-26)

### Fixed

- Cover/contain aspect ratio bug — portrait images in landscape containers were stretched instead of cropped/letterboxed. The `fitUV()` shader function had inverted multiply/divide operations.

## 1.0.2 (2026-02-26)

### Fixed

- Video/webcam sources now properly cleaned up when switching to a new source (prevents memory leaks)
- Uploaded video files (blob URLs) now correctly detected and loaded as video textures

### Added

- `loadSource(src, { type: 'video' })` type hint for extensionless or blob video URLs
- Source URL input field in playground for loading remote image/video URLs

## 1.0.1 (2026-02-25)

### Added

- LICENSE file to npm package
- CHANGELOG.md

### Fixed

- Upgraded playground with full controls for all 22 config options
- Live copyable code output panel (Data Attributes & JavaScript tabs)

## 1.0.0 (2026-02-25)

### Features

- GPU-accelerated halftone rendering via OGL/WebGL
- 6 dot shapes: circle, square, diamond, line, cross, ellipse
- 4 color modes: mono, auto, cmyk, duotone
- 10 interaction effects: reveal, magnify, warp, ripple, vortex, colorShift, focus, comet, sparkle, none
- Full tonal control: contrast, brightness, invert, minDot
- Screen controls: frequency, angle, scale, softness, gap
- Color customization: primary color, secondary color, background color, CMYK angles
- Interaction tuning: radius, strength, trailFade
- Source fitting: cover, contain, fill
- Image, video, and webcam source support
- Zero-config HTML API via `data-hwgl-*` attributes with auto-init
- Programmatic JS API: `set()`, `loadSource()`, `snapshot()`, `pause()`, `resume()`, `destroy()`
- Smart render-on-demand (static images) / continuous (video/interaction)
- Interactive playground demo with live code output
