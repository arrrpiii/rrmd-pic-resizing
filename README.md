# Product Fit Studio

A local, dependency-free frontend for normalizing product image sizing.

## Deploy to Vercel

1. Open [Vercel New Project](https://vercel.com/new) and import `arrrpiii/rrmd-pic-resizing`.
2. Keep the root directory at the repository root (`./`).
3. The committed `vercel.json` selects **Other**, uses **npm run build**, and publishes **dist**.
4. Click **Deploy**. No environment variables or backend configuration are needed.

The build runs the tests and copies only the browser app and sample assets into `dist/`. `server.mjs` is for local development; Vercel serves the static build directly. Image processing stays in each visitor's browser. Later pushes to the connected production branch can deploy through Vercel's Git integration.

## Run locally

```sh
npm start
```

Open http://127.0.0.1:4173. Use `PORT=4180 npm start` to change the port. Run `npm test` for pixel-detection, geometry, and ZIP tests. Node 20+ is sufficient; no install step is needed.

## Use

Upload or drag in one or multiple PNG, JPG, or WebP files. Products are automatically measured, centered, and fitted to 80% of both available canvas dimensions. This means the limiting dimension fills 80%, not that the product covers 80% of the total pixel area. Proportions remain unchanged. Works with rings, bracelets, necklaces, earrings, and other product types.

Choose coverage, square/portrait/landscape canvas, and export resolution. Adjust background tolerance if faint edges or shadows need attention. Changes reprocess the batch automatically. Toggle original/normalized previews and detected bounds. Download individual PNGs or one ZIP. Maximum 100 images per batch, 25 MB and 40 megapixels per image.

## Detection and limitations

Transparent images use alpha bounds. Opaque images estimate a plain background from corner patches and find foreground pixels by color difference. Connected-component analysis removes isolated specks while retaining meaningful separate pieces. Detection runs on a sample with a maximum 1,000 px side; export draws from the original at full resolution. Bounds are reported in original pixel coordinates; right and bottom are exclusive.

The crop is centered with `scale = min(canvasWidth * coverage / boundsWidth, canvasHeight * coverage / boundsHeight)`. Transparent backgrounds remain transparent. Plain opaque backgrounds are extended with their sampled color. This is sizing and cropping, not AI background removal. It is designed for individual product photos; a storefront screenshot containing text and several products is not a product photo.

Textured/complex backgrounds trigger a full-image fallback and a review warning. Faint shadows, watermarks, or backgrounds close to the product color can affect detected bounds; use the overlay and tolerance control to review. Products already cut off at an edge cannot be reconstructed. Upscaling does not restore missing detail. PNG exports use browser Canvas and do not retain source metadata or animation.

All processing and downloads happen in the browser. No image data is sent to a server. The sample rings are generated vector illustrations; no private product photos are included in the repository or deployed build. The local server only serves static assets. No third-party runtime requests or dependencies are required.

## Integration

`normalize.js` exports `detectBounds(imageData, tolerance)` and `fitBounds(bounds, width, height, coverage)` as pure functions, plus `normalizeImage(bitmap, settings)` for browser upload workflows. `normalizeImage` returns a PNG Blob, original-coordinate bounds, destination placement, dimensions, and review/upscaling flags. This standalone utility is not yet wired into the store's production uploader.
