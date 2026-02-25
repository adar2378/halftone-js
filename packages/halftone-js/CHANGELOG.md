# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-21

### Added
- 17 built-in interaction plugins (repulse, attract, vortex, magnetic, shatter, swell, ripple, glitch, wind, pulse, twist, float, frenzy, warp, bounce, gravity, drift)
- Plugin registry system via `Halftone.register()`
- HTML data attribute configuration via `data-ht-*` with validation and warnings for unknown keys
- Source media support: images, video, webcam
- `color: 'auto'` option for per-dot color sampling from source media
- `cover` and `contain` fit modes for source media
- Spring-mass physics simulation with configurable spring, friction, and stretch
- Conditional canvas alpha based on `bgColor` transparency detection
- DPR change detection via `matchMedia` for multi-monitor support
- High-performance direct draw path for static dots (skips `save()`/`restore()`)
- Auto-cleanup on DOM removal with full resource teardown (webcam streams, event listeners, media queries)
- JSDoc documentation for constructor options
