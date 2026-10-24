import { CaptureGate, validatePose, motionBetween, placementsFor } from './capture-logic.js';
const $ = id => document.getElementById(id);
const video = $('camera'), photo = $('photo');
const gate = new CaptureGate();
let stream, worker, session = 0, active = false, loading = false, raf, watchdog;
let ready = false, busy = false, previous = null, lastVideoTime = -1, sentAt = 0, lastResult = 0;
let snapshot, quality, manualRequested = false, captured = null, capturePoints = null, pieces = [];
let product = null, productURL = null, uploadVersion = 0;
const kind = () => $('jewellery-type').value;
const mode = () => document.querySelector('[name=capture-mode]:checked').value;
function status(message, style = '') { $('status').textContent = message; $('status').className = `status ${style}`; }
function resetGate() { gate.reset(); ready = false; previous = null; manualRequested = false; $('capture').disabled = true; $('countdown').hidden = true; }
function stopCamera(message) {
  session++; active = false; loading = false; busy = false;
  cancelAnimationFrame(raf); clearInterval(watchdog);
  worker?.terminate(); worker = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; video.hidden = true; $('guide').hidden = true;
  $('stop').hidden = true; $('start').hidden = !!captured; $('start').disabled = false;
  resetGate();
  if (!captured) $('empty').hidden = false;
  if (message) status(message);
}
function poseCopy() {
  const face = kind() === 'earrings';
  $('pose-title').textContent = face ? 'Face the camera' : 'Open your hand';
  $('pose-help').textContent = face ? 'Keep your face upright and fully in view. Move hair away from both ears.' : 'Show the back of one hand, fingers straight and spread apart. Keep the whole hand in view.';
  $('limitation').textContent = face ? 'Ear visibility needs your own check; the detector cannot reliably spot hair covering an earlobe.' : 'The detector checks hand geometry. Confirm that the back of your hand faces the camera.';
  $('guide').className = `guide ${face ? 'face' : 'hand'}`;
  $('mode-help').textContent = mode() === 'auto' ? 'Once your pose is steady, a 3–2–1 countdown starts. Moving out of position resets it.' : 'When your pose is ready, press Take photo.';
  $('capture').hidden = mode() === 'auto' || !!captured;
}
async function startCamera() {
  if (active || loading) return;
  if (!navigator.mediaDevices?.getUserMedia) { status('Camera access requires HTTPS or localhost and a supported browser.', 'error'); return; }
  stopCamera();
  const id = session;
  loading = true; $('start').disabled = true; $('stop').hidden = false;
  status('Allow camera access to begin.');
  let acquired;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    if (id !== session) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    stream.getVideoTracks()[0].onended = () => { if (active || loading) stopCamera('Camera disconnected. Start it again to continue.'); };
    video.srcObject = stream; await video.play();
    if (id !== session) return;
    $('empty').hidden = true; video.hidden = false; $('guide').hidden = false;
    $('stage').style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    status('Loading pose detection. First use may take a moment.');
    worker = new Worker('./vision-worker.js');
    let loadTimeout = setTimeout(() => { if (id === session && loading) stopCamera('Detection models could not load. Check your connection and try again.'); }, 60000);
    worker.onerror = () => { clearTimeout(loadTimeout); if (id === session) { stopCamera(); status('Pose detection could not start. Check your connection or try a current Chrome, Edge, or Safari browser.', 'error'); } };
    worker.onmessage = ({ data }) => {
      if (id !== session) return;
      if (data.type === 'ready') {
        clearTimeout(loadTimeout); loading = false; active = true; busy = false;
        $('start').hidden = true; lastVideoTime = -1; sentAt = 0; lastResult = performance.now();
        status(kind() === 'earrings' ? 'Bring your face into the frame.' : 'Show your whole hand with fingers open.');
        raf = requestAnimationFrame(tick);
        watchdog = setInterval(() => {
          if (!active) return;
          const age = performance.now() - lastResult;
          if (age > 650) { resetGate(); status('Waiting for a clear camera frame.'); }
          if (age > 12000) { stopCamera(); status('Pose detection stopped responding. Start the camera to retry.', 'error'); }
        }, 200);
      } else if (data.type === 'result') {
        busy = false;
        const now = performance.now(); lastResult = now;
        if (!active || !snapshot) return;
        if (now - data.timestamp > 650) { resetGate(); status('Detection is slow. Hold still or try a faster device.'); return; }
        const validation = validatePose(kind(), data.points, quality, snapshot.width / snapshot.height);
        const points = data.points[0];
        const moving = validation.valid && motionBetween(previous, points, snapshot.width / snapshot.height) > .025;
        previous = validation.valid ? points : null;
        const valid = validation.valid && !moving;
        const decision = gate.update(valid, now, mode());
        ready = decision.ready;
        $('capture').disabled = !ready;
        $('countdown').hidden = decision.remaining === null;
        if (decision.remaining !== null) $('countdown').textContent = decision.remaining;
        status(!validation.valid ? validation.message : moving ? 'Hold still for a moment.' : ready ? mode() === 'auto' ? 'Looking good. Hold your pose.' : 'Pose ready. You can take the photo.' : 'Hold still while we check your pose.', ready ? 'ready' : '');
        if (decision.capture || (manualRequested && ready)) takePhoto(points);
        else if (manualRequested && !valid) manualRequested = false;
      } else if (data.type === 'error') {
        clearTimeout(loadTimeout); stopCamera(); status('Could not analyse the camera frame. Restart the camera to retry.', 'error');
      }
    };
    worker.postMessage({ type: 'init', kind: kind() });
  } catch (error) {
    if (id !== session) { acquired?.getTracks().forEach(track => track.stop()); return; }
    stopCamera();
    status(error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser, then try again.' : error.name === 'NotFoundError' ? 'No camera was found. Connect a camera and try again.' : 'The camera could not start. Close other apps using it, then try again.', 'error');
  }
}
async function tick(now) {
  if (!active) return;
  raf = requestAnimationFrame(tick);
  if (busy || video.readyState < 2 || video.currentTime === lastVideoTime || now - sentAt < 100) return;
  busy = true; lastVideoTime = video.currentTime; sentAt = now;
  const id = session;
  try {
    snapshot = document.createElement('canvas');
    snapshot.width = video.videoWidth; snapshot.height = video.videoHeight;
    snapshot.getContext('2d').drawImage(video, 0, 0);
    const small = document.createElement('canvas');
    small.width = Math.min(640, snapshot.width); small.height = Math.round(snapshot.height * small.width / snapshot.width);
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(snapshot, 0, 0, small.width, small.height);
    const pixels = ctx.getImageData(0, 0, small.width, small.height).data;
    let light = 0;
    for (let i = 0; i < pixels.length; i += 16) light += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
    quality = { brightness: light / Math.ceil(pixels.length / 16) };
    const bitmap = await createImageBitmap(small);
    if (id !== session || !active) { bitmap.close(); return; }
    worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
  } catch { if (id === session) { stopCamera(); status('Unable to read the camera frame. Please restart the camera.', 'error'); } }
}
function takePhoto(points) {
  if (!active || !snapshot || !points) return;
  captured = document.createElement('canvas');
  captured.width = snapshot.width; captured.height = snapshot.height;
  const ctx = captured.getContext('2d');
  ctx.translate(captured.width, 0); ctx.scale(-1, 1); ctx.drawImage(snapshot, 0, 0);
  capturePoints = points.map(p => ({ ...p, x: 1 - p.x }));
  stopCamera();
  photo.hidden = false; $('empty').hidden = true; $('retake').hidden = false; $('capture').hidden = true;
  status(product ? 'Photo captured. Adjust the jewellery to fit.' : 'Photo captured. Add a jewellery image to try it on.', 'ready');
  resetPlacements();
}
function resetPlacements() {
  if (!captured) return;
  pieces = placementsFor(kind(), capturePoints, captured.width, captured.height).map(p => ({ ...p, baseWidth: p.width, scale: 1 }));
  $('piece').replaceChildren(...pieces.map((_, i) => new Option(kind() === 'ring' ? 'Ring finger' : i === 0 ? 'Earring 1' : 'Earring 2', i)));
  $('adjustments').hidden = !product;
  syncAdjustments(); drawPhoto();
}
function drawPhoto() {
  if (!captured) return;
  photo.width = captured.width; photo.height = captured.height;
  const ctx = photo.getContext('2d'); ctx.drawImage(captured, 0, 0);
  if (!product) return;
  pieces.forEach(p => {
    const width = p.baseWidth * p.scale, height = width * product.height / product.width;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.drawImage(product, -width / 2, kind() === 'earrings' ? 0 : -height / 2, width, height); ctx.restore();
  });
}
function syncAdjustments() {
  const p = pieces[+$('piece').value]; if (!p) return;
  $('scale').value = Math.round(p.scale * 100); $('scale-value').textContent = `${$('scale').value}%`;
  const degrees = ((p.angle * 180 / Math.PI + 540) % 360) - 180;
  $('rotation').value = Math.round(degrees); $('rotation-value').textContent = `${$('rotation').value}°`;
  $('position-x').value = p.x / captured.width * 100; $('position-y').value = p.y / captured.height * 100;
}
$('start').onclick = startCamera;
$('stop').onclick = () => stopCamera('Camera stopped.');
$('capture').onclick = () => { if (ready && active) manualRequested = true; };
$('retake').onclick = () => {
  captured = null; capturePoints = null; pieces = []; photo.hidden = true; $('adjustments').hidden = true; $('retake').hidden = true;
  poseCopy(); startCamera();
};
$('jewellery-type').onchange = () => {
  stopCamera(); captured = null; capturePoints = null; pieces = []; photo.hidden = true;
  $('empty').hidden = false; $('start').hidden = false; $('retake').hidden = true; $('adjustments').hidden = true;
  poseCopy(); status('Start the camera to check your pose.');
};
document.querySelectorAll('[name=capture-mode]').forEach(el => el.onchange = () => { resetGate(); poseCopy(); if (active) status('Hold your pose while we check again.'); });
$('upload-product').onclick = () => $('product-file').click();
$('product-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const upload = ++uploadVersion;
  if (!['image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { $('product-status').textContent = 'Choose a transparent PNG or WebP under 15 MB.'; return; }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 16000000) throw Error('Choose an image under 16 megapixels.');
    const temp = document.createElement('canvas'); temp.width = bitmap.width; temp.height = bitmap.height;
    const ctx = temp.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, temp.width, temp.height).data;
    let left = temp.width, top = temp.height, right = -1, bottom = -1, transparent = 0;
    for (let y = 0; y < temp.height; y++) for (let x = 0; x < temp.width; x++) {
      const alpha = data[(y * temp.width + x) * 4 + 3];
      if (alpha < 16) transparent++;
      if (alpha > 24) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    if (transparent < temp.width * temp.height * .01 || right < left) throw Error('Use a cutout with a transparent background, showing one jewellery piece.');
    const cutout = document.createElement('canvas'); cutout.width = right - left + 1; cutout.height = bottom - top + 1;
    cutout.getContext('2d').drawImage(temp, left, top, cutout.width, cutout.height, 0, 0, cutout.width, cutout.height);
    const blob = await new Promise(resolve => cutout.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Could not read the jewellery image.');
    if (upload !== uploadVersion) return;
    product = cutout;
    if (productURL) URL.revokeObjectURL(productURL);
    productURL = URL.createObjectURL(blob); $('product-preview').src = productURL; $('product-preview').hidden = false;
    $('product-status').textContent = 'Jewellery added. Use one earring cutout for the pair, or a front-view ring cutout.';
    if (captured) { resetPlacements(); status('Adjust the jewellery to fit.', 'ready'); }
  } catch (error) { if (upload === uploadVersion) $('product-status').textContent = error.message || 'Could not read this image.'; }
  finally { bitmap?.close(); }
};
$('piece').onchange = syncAdjustments;
for (const id of ['scale', 'rotation', 'position-x', 'position-y']) $(id).oninput = () => {
  const p = pieces[+$('piece').value]; if (!p) return;
  p.scale = +$('scale').value / 100; p.angle = +$('rotation').value * Math.PI / 180;
  p.x = +$('position-x').value * captured.width / 100; p.y = +$('position-y').value * captured.height / 100;
  syncAdjustments(); drawPhoto();
};
let drag = null;
function canvasPoint(e) { const r = photo.getBoundingClientRect(); return { x: (e.clientX - r.left) * photo.width / r.width, y: (e.clientY - r.top) * photo.height / r.height }; }
photo.onpointerdown = e => {
  if (!captured || !product) return;
  const at = canvasPoint(e);
  const index = pieces.findIndex(p => Math.hypot(p.x - at.x, p.y - at.y) < p.baseWidth * p.scale * 2);
  if (index < 0) return;
  $('piece').value = index; syncAdjustments(); drag = { index, dx: pieces[index].x - at.x, dy: pieces[index].y - at.y };
  photo.setPointerCapture(e.pointerId);
};
photo.onpointermove = e => {
  if (!drag) return; const at = canvasPoint(e), p = pieces[drag.index];
  p.x = Math.max(0, Math.min(photo.width, at.x + drag.dx)); p.y = Math.max(0, Math.min(photo.height, at.y + drag.dy));
  syncAdjustments(); drawPhoto();
};
photo.onpointerup = photo.onpointercancel = photo.onlostpointercapture = () => { drag = null; };
document.addEventListener('visibilitychange', () => { if (document.hidden && (active || loading)) stopCamera('Camera paused. Start it again when you are ready.'); });
window.addEventListener('pagehide', () => stopCamera());
poseCopy();
