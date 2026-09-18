import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const output = new URL('./dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Publish only browser assets; the development server and tests stay private.
for (const name of ['index.html', 'styles.css', 'app.js', 'normalize.js', 'zip.js']) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
await mkdir(new URL('assets/', output));
for (const name of ['demo-emerald.svg', 'demo-oval.svg']) {
  await cp(new URL(`assets/${name}`, root), new URL(`assets/${name}`, output));
}
console.log('Static site built in dist/.');
