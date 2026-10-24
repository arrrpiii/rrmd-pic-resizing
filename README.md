# Product Fit Studio

Browser-based jewellery photo capture and adjustable 2D try-on, with the existing image-sizing tool preserved at `/sizing.html`.

## Camera try-on

The home page supports earrings (face landmarks) and rings (hand landmarks). Start camera explicitly, allow the browser's camera permission, and follow the live feedback. Microphone access is never requested.

- Manual mode: after a valid pose stays stable for 600 ms, Take photo becomes available. A click requests capture on the next fresh validated frame.
- Auto mode: after the same stability check, a visible three-second countdown runs. Invalid pose, significant movement, missing/stale frames, mode changes, switching jewellery type, and page visibility changes reset it. One photo is captured, then the camera stops.
- Retake restarts the flow. Stop camera cancels a running or loading session. Leaving or hiding the page stops tracks and terminates inference.
- Upload a transparent PNG/WebP containing one jewellery item, before or after capture. The app trims transparent margins, estimates two earring anchors or a ring-finger anchor, and composites it onto the photo. Adjust each piece by dragging or using size, rotation, and position controls.

The browser uses **@mediapipe/tasks-vision 1.1.1**, pinned with a package lock. Its Face Landmarker and Hand Landmarker run in a classic Web Worker, using locally served WASM/runtime assets copied from the installed package. Versioned model files are downloaded from Google's MediaPipe model storage. Photos and landmark data are processed locally, never uploaded or persisted by this app.

Pose validation checks one detected subject, frame margins, minimum subject size, approximate face yaw/roll/pitch, straight and separated fingers, thumb opening, hand angle, average lighting, and landmark motion. These are heuristics. They do not guarantee sharpness, visible earlobes, an uncovered face, or that the back of a hand is visible. Hair occlusion and exact ear position are not reliably determined by Face Landmarker. This is a 2D compositing prototype, not photorealistic rendering, physical sizing, 3D finger wrapping, or hair/skin occlusion. Other jewellery categories are not enabled yet.

Camera use requires HTTPS (Vercel provides it) or localhost. First use requires access to Google's model downloads. Permission denial, missing devices, loading failures, stale frames, and detector errors show retry guidance. Test with real face/hand poses on the target browsers before production rollout; synthetic geometry tests cannot establish detection accuracy.

## Validation

`npm test` covers normalization plus capture gating, reset conditions, face/hand pose heuristics, motion, lighting, and overlay placement. After starting the local server, `/tests/vision-browser.html` loads both real MediaPipe models and runs blank-frame inference without camera access. `/tests/camera-browser.html` uses an explicitly synthetic stream and mocked landmarks to exercise UI capture and overlay behaviour. Test pages and fixtures are excluded from the Vercel build.

Official guides: [Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) and [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

## Deploy to Vercel

1. Open [Vercel New Project](https://vercel.com/new) and import `arrrpiii/rrmd-pic-resizing`.
2. Keep the root directory at the repository root (`./`).
3. The committed `vercel.json` selects **Other**, uses **npm run build**, and publishes **dist**.
4. Click **Deploy**. No environment variables or backend configuration are needed.

The build runs the tests and copies only the browser app into `dist/`. `server.mjs` is for local development; Vercel serves the static build directly. Image processing stays in each visitor's browser. Later pushes to the connected production branch can deploy through Vercel's Git integration.

## Run locally

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. Use `PORT=4180 npm start` to change the port. Run `npm test` for pixel-detection, geometry, and ZIP tests. Node 20+ is sufficient. Run `npm ci` first; prestart copies the browser runtime into `vendor/`.

## Image-sizing tool

Upload or drag in one or multiple PNG, JPG, or WebP files. Products surrounded on every outer edge by transparent padding are automatically measured, centered, and fitted to 80% of both available canvas dimensions. Opaque images, including lifestyle photos and products on solid backgrounds, are shown unchanged using the original file. This means the limiting dimension fills 80%, not that the product covers 80% of the total pixel area. Proportions remain unchanged. Works with rings, bracelets, necklaces, earrings, and other product types.

The interface contains only Upload, Product coverage, Background tolerance, and Card shape. Each uploaded image appears in a two-column row: the original on the left and its resized result on the right. Choose coverage and square/portrait/landscape cards; changes reprocess the batch automatically. Resized transparent-product previews use 1,200 px on their longest side; unchanged images retain the original file and resolution. There are no export controls, download buttons, captions, or marketing text. Maximum 100 images per batch, 25 MB and 40 megapixels per image. Refresh to start a new batch.

## Detection and limitations

Background tolerance is an alpha threshold on a 0–255 scale, not a color-distance threshold. Pixels at or below it count as transparent. Normalization requires the entire outer perimeter to be below that threshold. Opaque images, images with only internal transparent holes, and products that reach a canvas edge are preserved. No color sampling or artificial background is added.

For qualifying images, connected-component analysis finds the visible product and ignores isolated specks while retaining separate pieces such as earrings. Detection runs on a sample with a maximum 1,000 px side; rendering draws from the original. Internal bounds use original pixel coordinates; right and bottom are exclusive.

The crop is centered with `scale = min(canvasWidth * coverage / boundsWidth, canvasHeight * coverage / boundsHeight)`. Transparent backgrounds remain transparent. The coverage slider applies only to qualifying cutouts. Preserved images use the same original URL in both comparison columns, so there is no padding, recompression, or loss of detail added by processing. Card shape still controls the display frame; both columns contain the original proportionally when it is preserved.

This is sizing and cropping, not AI background removal. A completely transparent image reports no product. Failed uploads display an accessible warning icon. Semi-transparent shadows can affect bounds; adjust tolerance as needed. Upscaling cannot restore detail. Resized previews use browser Canvas and do not retain source metadata or animation.

All processing happens in the browser. No image data is sent to a server. No private product photos are included in the repository or deployed build. The local server only serves static assets. The image-sizing page itself has no third-party runtime requests; the camera page downloads detection models as described above.

## Integration

`normalize.js` exports `detectBounds(imageData, tolerance)` and `fitBounds(bounds, width, height, coverage)` as pure functions, plus `normalizeImage(bitmap, settings)` for browser upload workflows. `normalizeImage` returns `preserveOriginal: true` with a null Blob for unchanged photos (the caller should reuse the original file). For transparent cutouts it returns `preserveOriginal: false`, a PNG Blob, original-coordinate bounds, destination placement, dimensions, and upscaling flags. This standalone utility is not yet wired into the store's production uploader.
