import { cp, mkdir } from 'node:fs/promises';
const root = new URL('.', import.meta.url);
const target = new URL('vendor/mediapipe/', root);
await mkdir(target, { recursive: true });
for (const file of ['vision_bundle.mjs', 'wasm']) {
  await cp(new URL(`node_modules/@mediapipe/tasks-vision/${file}`, root), new URL(file, target), { recursive: true });
}
console.log('MediaPipe browser runtime ready.');
