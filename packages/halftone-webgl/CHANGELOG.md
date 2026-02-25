# Changelog

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
