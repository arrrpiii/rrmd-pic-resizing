// Pure pixel analysis: usable in an upload pipeline, a browser, or a worker.
export function detectBounds({ data, width, height }, tolerance = 24) {
  const total = width * height;
  if (!width || !height || data.length !== total * 4) throw new Error('Invalid image pixels.');
  // Tolerance is an alpha threshold: 0 is transparent, 255 is opaque.
  // Resize only when transparent space surrounds the entire outer perimeter.
  const alphaThreshold = Math.max(0, Math.min(254, tolerance));
  const isForeground = p => data[p * 4 + 3] > alphaThreshold;
  const unchanged = () => ({
    left: 0, top: 0, right: width, bottom: height, width, height,
    background: null, warning: '', preserveOriginal: true,
  });
  for (let x = 0; x < width; x++) {
    if (isForeground(x) || isForeground((height - 1) * width + x)) return unchanged();
  }
  for (let y = 0; y < height; y++) {
    if (isForeground(y * width) || isForeground(y * width + width - 1)) return unchanged();
  }
  const mask = new Uint8Array(total);
  let foreground = 0;
  for (let p = 0; p < total; p++) {
    if (isForeground(p)) { mask[p] = 1; foreground++; }
  }
  if (!foreground) throw new Error('No product detected. Try lowering the background tolerance.');
  // Keep all meaningful components (including disconnected earrings and chains).
  // Ignore only isolated noise, relative to the largest foreground component.
  const queue = new Int32Array(total), components = [];
  for (let p = 0; p < total; p++) {
    if (mask[p] !== 1) continue;
    let head = 0, tail = 1, left = width, top = height, right = -1, bottom = -1;
    queue[0] = p; mask[p] = 2;
    while (head < tail) {
      const v = queue[head++], x = v % width, y = Math.floor(v / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (mask[n] === 1) { mask[n] = 2; queue[tail++] = n; }
      }
    }
    components.push({ left, top, right, bottom, count: tail });
  }
  const largest = components.reduce((max, c) => Math.max(max, c.count), 0);
  const minimum = Math.max(2, Math.min(12, largest * .0005));
  const kept = components.filter(c => c.count >= minimum);
  if (!kept.length) throw new Error('No clear product detected. Try a larger image or lower tolerance.');
  let left = width, top = height, right = -1, bottom = -1;
  for (const c of kept) { left = Math.min(left, c.left); top = Math.min(top, c.top); right = Math.max(right, c.right); bottom = Math.max(bottom, c.bottom); }
  return {
    left, top, right: right + 1, bottom: bottom + 1,
    width: right - left + 1, height: bottom - top + 1,
    background: null, warning: '', preserveOriginal: false,
  };
}

export function fitBounds(bounds, width, height, coverage = .8) {
  if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0 || coverage <= 0 || coverage > 1) throw new Error('Invalid sizing settings.');
  const scale = Math.min(width * coverage / bounds.width, height * coverage / bounds.height);
  const drawWidth = bounds.width * scale, drawHeight = bounds.height * scale;
  return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight, scale };
}

export async function normalizeImage(bitmap, { coverage = 80, size = 1200, aspect = 1, tolerance = 24 } = {}) {
  const factor = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const sample = document.createElement('canvas');
  sample.width = Math.max(1, Math.round(bitmap.width * factor)); sample.height = Math.max(1, Math.round(bitmap.height * factor));
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, sample.width, sample.height);
  const detected = detectBounds(ctx.getImageData(0, 0, sample.width, sample.height), tolerance);
  if (detected.preserveOriginal) {
    // The caller reuses the original file URL: no resampling or added padding.
    return {
      preserveOriginal: true, blob: null,
      bounds: { left: 0, top: 0, right: bitmap.width, bottom: bitmap.height, width: bitmap.width, height: bitmap.height },
      placement: { x: 0, y: 0, width: bitmap.width, height: bitmap.height, scale: 1 },
      width: bitmap.width, height: bitmap.height, warning: '', upscale: false,
    };
  }
  const bounds = {
    left: Math.floor(detected.left / sample.width * bitmap.width), top: Math.floor(detected.top / sample.height * bitmap.height),
    right: Math.min(bitmap.width, Math.ceil(detected.right / sample.width * bitmap.width)),
    bottom: Math.min(bitmap.height, Math.ceil(detected.bottom / sample.height * bitmap.height)),
  };
  bounds.width = bounds.right - bounds.left; bounds.height = bounds.bottom - bounds.top;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(aspect >= 1 ? size : size * aspect);
  canvas.height = Math.round(aspect >= 1 ? size / aspect : size);
  const out = canvas.getContext('2d');
  const placement = fitBounds(bounds, canvas.width, canvas.height, coverage / 100);
  out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
  out.drawImage(bitmap, bounds.left, bounds.top, bounds.width, bounds.height, placement.x, placement.y, placement.width, placement.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to export image.')), 'image/png'));
  return { preserveOriginal: false, blob, bounds, placement, width: canvas.width, height: canvas.height, warning: detected.warning, upscale: placement.scale > 1.1 };
}
