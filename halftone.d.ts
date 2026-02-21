export interface HalftoneOptions {
  /** Target element or CSS selector */
  container: HTMLElement | string;
  /** Grid spacing in pixels (default: 12) */
  grid?: number;
  /** Dot shape (default: 'circle') */
  shape?: 'circle' | 'square' | 'diamond' | 'triangle';
  /** Interaction mode name (default: 'repulse') */
  interaction?: string;
  /** Source media fit mode (default: 'cover') */
  fit?: 'cover' | 'contain';
  /** Image/video URL, CSS selector, HTMLElement, or 'webcam' (default: null) */
  source?: string | HTMLElement | null;
  /** Dot scale factor (default: 0.8) */
  dotScale?: number;
  /** Spring tension — how fast dots return home (default: 0.1) */
  spring?: number;
  /** Friction/drag — how quickly motion dampens (default: 0.8) */
  friction?: number;
  /** Mouse interaction radius in pixels (default: 120) */
  radius?: number;
  /** Interaction force multiplier (default: 1.8) */
  strength?: number;
  /** Velocity-based dot stretching (default: 0.2) */
  stretch?: number;
  /** Dot color — hex string or 'auto' for source-sampled colors (default: '#00f2ff') */
  color?: string;
  /** Background color — supports rgba/transparent (default: '#050510') */
  bgColor?: string;
  /** Custom interaction callback, overrides the named interaction */
  onInteract?: InteractionFn | null;
}

export interface Dot {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  sizeScalar: number;
  sampleIdx: number;
  rotation: number;
  color: string | null;
}

export interface InteractionProps {
  dist: number;
  angle: number;
  force: number;
  strength: number;
  dpr: number;
  mouse: { x: number; y: number; px: number; py: number; vx: number; vy: number };
  time: number;
}

export type InteractionFn = (dot: Dot, props: InteractionProps) => void;

declare class Halftone {
  /** Map of all registered interaction plugins */
  static interactions: Record<string, InteractionFn>;

  /** Register a custom interaction plugin globally */
  static register(name: string, fn: InteractionFn): void;

  /** The container element */
  root: HTMLElement;
  /** The visible canvas element */
  canvas: HTMLCanvasElement;
  /** The 2D rendering context */
  ctx: CanvasRenderingContext2D;
  /** All dots in the grid */
  dots: Dot[];
  /** Current configuration */
  config: Required<HalftoneOptions>;
  /** Device pixel ratio */
  dpr: number;
  /** Frame counter */
  time: number;
  /** Whether the source media is ready for sampling */
  sourceReady: boolean;

  constructor(options: HalftoneOptions);

  /** Load or reload the source media */
  loadSource(): Promise<void>;
  /** Recalculate canvas size and rebuild the dot grid */
  resize(): void;
  /** Rebuild the dot grid from current dimensions */
  createGrid(): void;
  /** Stop the animation loop and clean up all resources */
  destroy(): void;
}

export default Halftone;
