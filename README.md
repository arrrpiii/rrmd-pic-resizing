# Product Fit Studio

A local, dependency-free frontend for normalizing product image sizing.

## Deploy to Vercel

1. Open [Vercel New Project](https://vercel.com/new) and import `arrrpiii/rrmd-pic-resizing`.
2. Keep the root directory at the repository root (`./`).
3. The committed `vercel.json` selects **Other**, uses **npm run build**, and publishes **dist**.
4. Click **Deploy**. No environment variables or backend configuration are needed.

The build runs the tests and copies only the browser app into `dist/`. `server.mjs` is for local development; Vercel serves the static build directly. Image processing stays in each visitor's browser. Later pushes to the connected production branch can deploy through Vercel's Git integration.

## Run locally

```sh
npm start
```

Open http://127.0.0.1:4173. Use `PORT=4180 npm start` to change the port. Run `npm test` for pixel-detection, geometry, and ZIP tests. Node 20+ is sufficient; no install step is needed.

## Use

Upload or drag in one or multiple PNG, JPG, or WebP files. Products are automatically measured, centered, and fitted to 80% of both available canvas dimensions. This means the limiting dimension fills 80%, not that the product covers 80% of the total pixel area. Proportions remain unchanged. Works with rings, bracelets, necklaces, earrings, and other product types.

The interface contains only Upload, Product coverage, Background tolerance, and Card shape. Each uploaded image appears in a two-column row: the original on the left and its resized result on the right. Choose coverage and square/portrait/landscape cards; changes reprocess the batch automatically. The preview resolution is fixed at 1,200 px on its longest side. There are no export controls, download buttons, captions, or marketing text. Maximum 100 images per batch, 25 MB and 40 megapixels per image. Refresh to start a new batch.

## Detection and limitations

Transparent images use alpha bounds. Opaque images estimate a plain background from corner patches and find foreground pixels by color difference. Connected-component analysis removes isolated specks while retaining meaningful separate pieces. Detection runs on a sample with a maximum 1,000 px side; rendering draws from the original at full resolution. Internal bounds use original pixel coordinates; right and bottom are exclusive.

The crop is centered with `scale = min(canvasWidth * coverage / boundsWidth, canvasHeight * coverage / boundsHeight)`. Transparent backgrounds remain transparent. Plain opaque backgrounds are extended with their sampled color. This is sizing and cropping, not AI background removal. It is designed for individual product photos; a storefront screenshot containing text and several products is not a product photo.

Textured/complex backgrounds trigger a full-image fallback and a warning icon with details available on hover or to assistive technology. Failed uploads also display an accessible warning icon. Faint shadows, watermarks, or backgrounds close to the product color can affect detected bounds; compare the original and resized images and adjust tolerance as needed. Products already cut off at an edge cannot be reconstructed. Upscaling does not restore missing detail. Resized previews use browser Canvas and do not retain source metadata or animation.

All processing happens in the browser. No image data is sent to a server. No private product photos are included in the repository or deployed build. The local server only serves static assets. No third-party runtime requests or dependencies are required.

## Integration

`normalize.js` exports `detectBounds(imageData, tolerance)` and `fitBounds(bounds, width, height, coverage)` as pure functions, plus `normalizeImage(bitmap, settings)` for browser upload workflows. `normalizeImage` returns a PNG Blob, original-coordinate bounds, destination placement, dimensions, and review/upscaling flags. This standalone utility is not yet wired into the store's production uploader.
