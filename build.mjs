import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const output = new URL('./dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Publish only browser assets; the development server and tests stay private.
for (const name of ['index.html', 'styles.css', 'app.js', 'normalize.js']) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
console.log('Static site built in dist/.');
