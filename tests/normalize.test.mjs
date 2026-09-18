import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBounds, fitBounds } from '../normalize.js';
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
  const img = rectangle(pixels(200, 200), 90, 30, 50, 100); rectangle(img, 5, 190, 1, 1);
  const b = detectBounds(img);
  assert.deepEqual([b.left, b.top, b.right, b.bottom], [90, 30, 140, 130]);
  assert.deepEqual(b.background, [248, 248, 248]);
});
test('retains separated earrings and a fine necklace chain', () => {
  const img = rectangle(pixels(200, 200), 40, 40, 15, 70); rectangle(img, 140, 40, 15, 70);
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
test('blank opaque and transparent images report no product', () => {
  assert.throws(() => detectBounds(pixels(100, 100)), /No product/);
  assert.throws(() => detectBounds(pixels(100, 100, [0, 0, 0, 0])), /No product/);
});
test('complex background keeps full image and requests review', () => {
  const img = pixels(100, 100);
  for (let y = 0; y < 100; y++) rectangle(img, 0, y, 100, 1, [y * 2, 70, 80, 255]);
  const b = detectBounds(img);
  assert.equal(b.width, 100); assert.equal(b.height, 100); assert.match(b.warning, /not uniform/);
});
test('edge-touching subjects receive a warning', () => {
  const b = detectBounds(rectangle(pixels(100, 100), 0, 30, 50, 50));
  assert.match(b.warning, /touches/);
});
test('exports UTF-8 file names and a valid ZIP directory', async () => {
  const zip = await createZip([{ name: 'necklace-é.png', blob: new Blob(['test content']) }]);
  const data = await zip.arrayBuffer(), view = new DataView(data);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(data.byteLength - 22, true), 0x06054b50);
  assert.equal(view.getUint16(data.byteLength - 12, true), 1);
  assert.equal(view.getUint16(6, true), 0x800);
});
