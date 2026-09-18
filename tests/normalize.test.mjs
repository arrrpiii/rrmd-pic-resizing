import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBounds, fitBounds, normalizeImage } from '../normalize.js';
import { createZip } from '../zip.js';
function pixels(width, height, background = [248, 248, 248, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(background, i);
  return { width, height, data };
}
function rectangle(img, x, y, w, h, color = [160, 110, 30, 255]) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) img.data.set(color, (j * img.width + i) * 4);
  return img;
}
test('finds all four edges on an off-center product, ignoring isolated noise', () => {
  const img = rectangle(pixels(200, 200, [0, 0, 0, 0]), 90, 30, 50, 100); rectangle(img, 5, 190, 1, 1);
  const b = detectBounds(img);
  assert.deepEqual([b.left, b.top, b.right, b.bottom], [90, 30, 140, 130]);
  assert.equal(b.background, null);
  assert.equal(b.preserveOriginal, false);
});
test('retains separated earrings and a fine necklace chain', () => {
  const img = rectangle(pixels(200, 200, [0, 0, 0, 0]), 40, 40, 15, 70); rectangle(img, 140, 40, 15, 70);
  rectangle(img, 60, 130, 80, 1);
  const b = detectBounds(img);
  assert.deepEqual([b.left, b.top, b.right, b.bottom], [40, 40, 155, 131]);
});
test('uses alpha bounds even for white products on transparency', () => {
  const img = rectangle(pixels(100, 100, [0, 0, 0, 0]), 20, 10, 30, 70, [255, 255, 255, 255]);
  const b = detectBounds(img);
  assert.equal(b.background, null); assert.equal(b.width, 30); assert.equal(b.height, 70);
});
test('centers tall necklaces and wide bracelets at 80% without distortion', () => {
  for (const [w, h] of [[20, 180], [180, 20], [100, 100]]) {
    for (const [cw, ch] of [[1200, 1200], [960, 1200], [1200, 960]]) {
      const p = fitBounds({ width: w, height: h }, cw, ch);
      assert.ok(Math.abs(p.width / p.height - w / h) < 1e-9);
      assert.equal(p.x + p.width / 2, cw / 2); assert.equal(p.y + p.height / 2, ch / 2);
      assert.ok(p.width <= cw * .8 + 1e-8 && p.height <= ch * .8 + 1e-8);
      assert.ok(Math.abs(Math.max(p.width / cw, p.height / ch) - .8) < 1e-9);
    }
  }
});
test('blank opaque images stay unchanged and fully transparent images report no product', () => {
  assert.equal(detectBounds(pixels(100, 100)).preserveOriginal, true);
  assert.throws(() => detectBounds(pixels(100, 100, [0, 0, 0, 0])), /No product/);
});
test('opaque lifestyle photos keep full coverage without a warning', () => {
  const img = pixels(100, 100);
  for (let y = 0; y < 100; y++) rectangle(img, 0, y, 100, 1, [y * 2, 70, 80, 255]);
  const b = detectBounds(img);
  assert.equal(b.width, 100); assert.equal(b.height, 100); assert.equal(b.preserveOriginal, true); assert.equal(b.warning, '');
});
test('products touching an outer edge stay unchanged', () => {
  const b = detectBounds(rectangle(pixels(100, 100, [0, 0, 0, 0]), 0, 30, 50, 50));
  assert.equal(b.preserveOriginal, true); assert.equal(b.width, 100); assert.equal(b.warning, '');
});
test('exports UTF-8 file names and a valid ZIP directory', async () => {
  const zip = await createZip([{ name: 'necklace-é.png', blob: new Blob(['test content']) }]);
  const data = await zip.arrayBuffer(), view = new DataView(data);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(data.byteLength - 22, true), 0x06054b50);
  assert.equal(view.getUint16(data.byteLength - 12, true), 1);
  assert.equal(view.getUint16(6, true), 0x800);
});

test('plain opaque backgrounds stay unchanged at every UI tolerance', () => {
  const img = rectangle(pixels(100, 100), 25, 20, 30, 60);
  for (const tolerance of [5, 24, 70]) assert.equal(detectBounds(img, tolerance).preserveOriginal, true);
});
test('internal transparent holes and transparent corners do not qualify as outer padding', () => {
  const holes = rectangle(pixels(100, 100), 25, 25, 50, 50, [0, 0, 0, 0]);
  assert.equal(detectBounds(holes).preserveOriginal, true);
  const corners = pixels(100, 100);
  for (const [x, y] of [[0, 0], [90, 0], [0, 90], [90, 90]]) rectangle(corners, x, y, 10, 10, [0, 0, 0, 0]);
  assert.equal(detectBounds(corners).preserveOriginal, true);
});
test('background tolerance controls alpha, regardless of background RGB', () => {
  const img = rectangle(pixels(100, 100, [255, 0, 180, 30]), 20, 20, 60, 50);
  assert.equal(detectBounds(img, 24).preserveOriginal, true);
  const b = detectBounds(img, 35);
  assert.equal(b.preserveOriginal, false);
  assert.deepEqual([b.left, b.top, b.right, b.bottom], [20, 20, 80, 70]);
});
test('normalization bypasses opaque files but applies coverage to transparent products', async t => {
  let source = rectangle(pixels(100, 100), 20, 20, 50, 60);
  const canvases = [];
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0, draws: [], toBlob(callback) { callback(new Blob(['rendered'])); } };
    canvas.getContext = () => ({ drawImage(...args) { canvas.draws.push(args); }, getImageData() { return source; } });
    canvases.push(canvas);
    return canvas;
  } };
  const bitmap = { width: 100, height: 100 };
  const kept = await normalizeImage(bitmap, { coverage: 50, aspect: .8 });
  assert.equal(kept.preserveOriginal, true);
  assert.equal(kept.blob, null);
  assert.equal(kept.width, 100); assert.equal(kept.height, 100);
  assert.equal(canvases.length, 1, 'must not create an output canvas for unchanged photos');
  source = rectangle(pixels(100, 100, [0, 0, 0, 0]), 20, 20, 50, 60);
  const resized = await normalizeImage(bitmap, { coverage: 80, aspect: .8 });
  assert.equal(resized.preserveOriginal, false);
  assert.equal(resized.width, 960); assert.equal(resized.height, 1200);
  assert.ok(Math.abs(resized.placement.width - 768) < 1e-8);
  assert.equal(resized.placement.x + resized.placement.width / 2, 480);
  assert.equal(resized.placement.y + resized.placement.height / 2, 600);
  assert.ok(resized.blob instanceof Blob);
});
