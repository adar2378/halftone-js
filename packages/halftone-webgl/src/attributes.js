import { DEFAULTS } from './utils.js';

const ARRAY_KEYS = new Set(['cmykAngles']);

export function parseAttributes(el) {
  const attrs = {};
  const ds = el.dataset;

  for (const key in ds) {
    if (!key.startsWith('hwgl') || key === 'hwglElement') continue;

    // Convert camelCase dataset key to config key: hwglFrequency → frequency
    const prop = key.slice(4, 5).toLowerCase() + key.slice(5);

    const raw = ds[key];

    if (ARRAY_KEYS.has(prop)) {
      // Parse comma-separated numbers: "15,75,0,45"
      attrs[prop] = raw.split(',').map(s => parseFloat(s.trim()));
    } else if (raw === 'true') {
      attrs[prop] = true;
    } else if (raw === 'false') {
      attrs[prop] = false;
    } else if (!isNaN(raw) && raw !== '') {
      attrs[prop] = parseFloat(raw);
    } else {
      attrs[prop] = raw;
    }
  }

  return attrs;
}

export function resolveConfig(options) {
  return { ...DEFAULTS, ...options };
}
