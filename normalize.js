// Pure pixel analysis: usable in an upload pipeline, a browser, or a worker.
export function detectBounds({ data, width, height }, tolerance = 24) {
  const total = width * height;
  if (!width || !height || data.length !== total * 4) throw new Error('Invalid image pixels.');
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) transparent++;
  const hasTransparency = transparent > total * .005;
  const samples = [];
  const patch = Math.max(1, Math.round(Math.min(width, height) * .035));
  for (const [sx, sy] of [[0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch]]) {
    for (let y = sy; y < sy + patch; y++) for (let x = sx; x < sx + patch; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 240) samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const bg = [0, 1, 2].map(c => samples.length ? samples.map(p => p[c]).sort((a, b) => a - b)[Math.floor(samples.length / 2)] : 255);
  const distance = (r, g, b) => Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
  const consistency = samples.length ? samples.filter(p => distance(...p) <= tolerance).length / samples.length : 1;
  const background = hasTransparency ? null : bg;
  const mask = new Uint8Array(total);
  let foreground = 0;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (data[i + 3] > 16 && (hasTransparency || distance(data[i], data[i + 1], data[i + 2]) > tolerance)) { mask[p] = 1; foreground++; }
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
  let warning = '';
  if (!hasTransparency && (consistency < .88 || foreground / total > .9)) {
    left = 0; top = 0; right = width - 1; bottom = height - 1;
    warning = 'Background is not uniform. Full image retained; use a plain-background product photo for accurate sizing.';
  } else if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1) {
    warning = 'Product touches an image edge. Check that the original product is not already cropped.';
  }
  return { left, top, right: right + 1, bottom: bottom + 1, width: right - left + 1, height: bottom - top + 1, background, warning };
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
  if (detected.background) { out.fillStyle = `rgb(${detected.background.join(',')})`; out.fillRect(0, 0, canvas.width, canvas.height); }
  const placement = fitBounds(bounds, canvas.width, canvas.height, coverage / 100);
  out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
  out.drawImage(bitmap, bounds.left, bounds.top, bounds.width, bounds.height, placement.x, placement.y, placement.width, placement.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to export image.')), 'image/png'));
  return { blob, bounds, placement, width: canvas.width, height: canvas.height, warning: detected.warning, upscale: placement.scale > 1.1 };
}
