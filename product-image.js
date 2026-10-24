// Crop visible pixels without rejecting valid opaque or almost-opaque images.
export function productBounds({ data, width, height }) {
  let left = width, top = height, right = -1, bottom = -1, transparent = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha < 255) transparent++;
    if (alpha > 24) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  if (right < left) throw Error('This image is empty or fully transparent. Choose a visible jewellery image.');
  return { left, top, width: right - left + 1, height: bottom - top + 1, opaque: transparent === 0 };
}
