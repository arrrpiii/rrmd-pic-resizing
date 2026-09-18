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

Upload or drag in one or multiple PNG, JPG, or WebP files. Products surrounded on every outer edge by transparent padding are automatically measured, centered, and fitted to 80% of both available canvas dimensions. Opaque images, including lifestyle photos and products on solid backgrounds, are shown unchanged using the original file. This means the limiting dimension fills 80%, not that the product covers 80% of the total pixel area. Proportions remain unchanged. Works with rings, bracelets, necklaces, earrings, and other product types.

The interface contains only Upload, Product coverage, Background tolerance, and Card shape. Each uploaded image appears in a two-column row: the original on the left and its resized result on the right. Choose coverage and square/portrait/landscape cards; changes reprocess the batch automatically. Resized transparent-product previews use 1,200 px on their longest side; unchanged images retain the original file and resolution. There are no export controls, download buttons, captions, or marketing text. Maximum 100 images per batch, 25 MB and 40 megapixels per image. Refresh to start a new batch.

## Detection and limitations

Background tolerance is an alpha threshold on a 0–255 scale, not a color-distance threshold. Pixels at or below it count as transparent. Normalization requires the entire outer perimeter to be below that threshold. Opaque images, images with only internal transparent holes, and products that reach a canvas edge are preserved. No color sampling or artificial background is added.

For qualifying images, connected-component analysis finds the visible product and ignores isolated specks while retaining separate pieces such as earrings. Detection runs on a sample with a maximum 1,000 px side; rendering draws from the original. Internal bounds use original pixel coordinates; right and bottom are exclusive.

The crop is centered with `scale = min(canvasWidth * coverage / boundsWidth, canvasHeight * coverage / boundsHeight)`. Transparent backgrounds remain transparent. The coverage slider applies only to qualifying cutouts. Preserved images use the same original URL in both comparison columns, so there is no padding, recompression, or loss of detail added by processing. Card shape still controls the display frame; both columns contain the original proportionally when it is preserved.

This is sizing and cropping, not AI background removal. A completely transparent image reports no product. Failed uploads display an accessible warning icon. Semi-transparent shadows can affect bounds; adjust tolerance as needed. Upscaling cannot restore detail. Resized previews use browser Canvas and do not retain source metadata or animation.

All processing happens in the browser. No image data is sent to a server. No private product photos are included in the repository or deployed build. The local server only serves static assets. No third-party runtime requests or dependencies are required.

## Integration

`normalize.js` exports `detectBounds(imageData, tolerance)` and `fitBounds(bounds, width, height, coverage)` as pure functions, plus `normalizeImage(bitmap, settings)` for browser upload workflows. `normalizeImage` returns `preserveOriginal: true` with a null Blob for unchanged photos (the caller should reuse the original file). For transparent cutouts it returns `preserveOriginal: false`, a PNG Blob, original-coordinate bounds, destination placement, dimensions, and upscaling flags. This standalone utility is not yet wired into the store's production uploader.
