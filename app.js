import { normalizeImage } from './normalize.js';
import { createZip } from './zip.js';
const $ = id => document.getElementById(id);
let items = [], view = 'after', version = 0, running = false, exporting = false;
const settings = () => ({ coverage: +$('coverage').value, size: +$('size').value, aspect: +$('aspect').value, tolerance: +$('tolerance').value });
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function notice(text) { const el = element('div', 'notice', text); $('messages').append(el); }
function dispose(item) { if (item.originalURL) URL.revokeObjectURL(item.originalURL); if (item.outputURL) URL.revokeObjectURL(item.outputURL); }
function save(blob, name) { const url = URL.createObjectURL(blob), a = element('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function filename(item) { return item.file.name.replace(/\.[^.]+$/, '').replace(/[\\/\x00-\x1f]/g, '_') + '-normalized.png'; }

function render() {
  $('count').textContent = items.length;
  $('clear').hidden = !items.length;
  $('dropzone').classList.toggle('compact', !!items.length);
  $('how-it-works').hidden = !!items.length;
  $('results-toolbar').hidden = !items.length;
  $('results').classList.toggle('show-guides', $('guides').checked);
  const ready = items.filter(i => i.result && i.state === 'ready');
  $('results-label').textContent = `${ready.length} of ${items.length} images ready`;
  $('download-all').disabled = exporting || !ready.length || items.some(i => i.state === 'pending' || i.state === 'processing');
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const card = element('article', 'result-card');
    const wrap = element('div', 'image-wrap' + (item.state === 'processing' || item.state === 'pending' ? ' processing' : ''));
    const normalized = view === 'after' && item.result && item.state === 'ready';
    const image = element('img'); image.src = normalized ? item.outputURL : item.originalURL; image.alt = `${normalized ? 'Normalized' : 'Original'} ${item.file.name}`;
    if (normalized) wrap.style.aspectRatio = `${item.result.width} / ${item.result.height}`;
    wrap.append(image);
    if (item.result && item.state === 'ready') {
      const r = item.result, box = element('div', 'bound-box');
      if (normalized) {
        Object.assign(box.style, { left: r.placement.x / r.width * 100 + '%', top: r.placement.y / r.height * 100 + '%', width: r.placement.width / r.width * 100 + '%', height: r.placement.height / r.height * 100 + '%' });
      } else {
        const longest = Math.max(item.width, item.height), ox = (longest - item.width) / 2, oy = (longest - item.height) / 2;
        Object.assign(box.style, { left: (ox + r.bounds.left) / longest * 100 + '%', top: (oy + r.bounds.top) / longest * 100 + '%', width: r.bounds.width / longest * 100 + '%', height: r.bounds.height / longest * 100 + '%' });
      }
      wrap.append(box);
    }
    const info = element('div', 'card-info'), titleRow = element('div', 'card-title-row');
    const title = element('h3', 'card-title', item.file.name); title.title = item.file.name;
    const remove = element('button', 'remove', '×'); remove.setAttribute('aria-label', `Remove ${item.file.name}`);
    remove.onclick = () => { items = items.filter(i => i !== item); dispose(item); render(); };
    titleRow.append(title, remove); info.append(titleRow);
    if (item.result && item.state === 'ready') {
      const r = item.result;
      info.append(element('p', 'card-meta', `${item.width} × ${item.height} → ${r.width} × ${r.height} px`));
      const coords = element('div', 'coordinates', `L ${r.bounds.left} · T ${r.bounds.top} · R ${r.bounds.right} · B ${r.bounds.bottom}`);
      coords.hidden = !$('guides').checked; info.append(coords);
      if (r.warning) info.append(element('p', 'card-warning', r.warning));
      else if (r.upscale) info.append(element('p', 'card-warning', 'Enlarged from original; fine details may appear softer.'));
      const bottom = element('div', 'card-bottom'); bottom.append(element('span', 'ready-tag' + (r.warning ? ' warning' : ''), r.warning ? 'Check image' : '✓ Centered & sized'));
      const download = element('button', '', '↓ PNG'); download.setAttribute('aria-label', `Download ${item.file.name}`); download.onclick = () => save(r.blob, filename(item)); bottom.append(download); info.append(bottom);
    } else if (item.error) info.append(element('p', 'error-text', item.error));
    else info.append(element('p', 'card-meta', 'Finding product edges…'));
    card.append(wrap, info); fragment.append(card);
  }
  $('results').replaceChildren(fragment);
}

async function processQueue() {
  if (running) return;
  running = true;
  try {
    let item;
    while ((item = items.find(i => i.state === 'pending'))) {
      const currentVersion = version, config = settings(); item.state = 'processing'; render(); await pause();
      let bitmap;
      try {
        bitmap = await createImageBitmap(item.file);
        if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Image is too large. Please use an image under 40 megapixels.');
        item.width = bitmap.width; item.height = bitmap.height;
        const result = await normalizeImage(bitmap, config);
        if (!items.includes(item)) continue;
        if (version !== currentVersion) { item.state = 'pending'; continue; }
        if (item.outputURL) URL.revokeObjectURL(item.outputURL);
        item.result = result; item.outputURL = URL.createObjectURL(result.blob); item.state = 'ready'; item.error = '';
      } catch (error) {
        if (items.includes(item)) {
          if (version !== currentVersion) item.state = 'pending';
          else { item.state = 'error'; item.error = error.message.includes('source image') ? 'Could not read this image. Please upload a valid PNG, JPG or WebP.' : error.message; }
        }
      } finally { bitmap?.close(); }
      render(); await pause();
    }
  } finally { running = false; render(); }
}

async function addFiles(files) {
  $('messages').replaceChildren();
  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { notice(`${file.name}: please choose a PNG, JPG or WebP image.`); continue; }
    if (file.size > 25 * 1024 * 1024) { notice(`${file.name}: file exceeds the 25 MB limit.`); continue; }
    if (items.length >= 100) { notice('This batch is limited to 100 images. Download and clear this batch to add more.'); break; }
    items.push({ file, originalURL: URL.createObjectURL(file), state: 'pending' });
  }
  render(); await processQueue();
}
$('file-input').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', e => { e.preventDefault(); $('dropzone').classList.remove('dragging'); addFiles([...e.dataTransfer.files]); });
$('dropzone').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file-input').click(); } };
document.addEventListener('dragover', e => e.preventDefault()); document.addEventListener('drop', e => e.preventDefault());
$('clear').onclick = () => { items.forEach(dispose); items = []; $('messages').replaceChildren(); render(); };
let timer;
for (const id of ['coverage', 'size', 'aspect', 'tolerance']) $(id).addEventListener('input', () => {
  $('coverage-value').innerHTML = `${+$('coverage').value}<span>%</span>`;
  $('tolerance-value').textContent = $('tolerance').value;
  document.querySelector('.measure').textContent = $('coverage').value + '%';
  document.querySelector('.fit-area').style.width = $('coverage').value + '%';
  document.querySelector('.fit-area').style.height = $('coverage').value + '%';
  document.querySelector('.setting-note').textContent = `The product fits inside ${$('coverage').value}% of the canvas width and height, with its proportions preserved.`;
  version++; items.forEach(i => { if (i.state !== 'processing') i.state = 'pending'; }); render();
  clearTimeout(timer); timer = setTimeout(processQueue, 200);
});
$('guides').onchange = render;
for (const mode of ['after', 'before']) $(`view-${mode}`).onclick = () => {
  view = mode;
  for (const m of ['after', 'before']) { $(`view-${m}`).classList.toggle('active', m === mode); $(`view-${m}`).setAttribute('aria-pressed', m === mode); }
  render();
};
$('download-all').onclick = async () => {
  const ready = items.filter(i => i.result && i.state === 'ready'); if (!ready.length) return;
  exporting = true; render();
  try {
    const used = new Set();
    const files = ready.map(item => { const base = filename(item); let name = base, n = 2; while (used.has(name.toLowerCase())) name = base.replace(/\.png$/, `-${n++}.png`); used.add(name.toLowerCase()); return { name, blob: item.result.blob }; });
    save(await createZip(files), 'product-fit-images.zip');
  } catch { notice('The download could not be created. Try downloading the images individually.'); }
  finally { exporting = false; render(); }
};
const demos = [['assets/demo-emerald.svg', 'Sample emerald ring.png'], ['assets/demo-oval.svg', 'Sample oval ring.png']];
async function demoFile(url, name) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Sample could not be loaded.')), 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}
$('demo').onclick = async () => { $('demo').disabled = true; try { await addFiles(await Promise.all(demos.map(d => demoFile(...d)))); } catch { notice('Could not load the samples. Please add your own images.'); } finally { $('demo').disabled = false; } };
async function heroPreviews() {
  for (let i = 0; i < demos.length; i++) {
    let bitmap;
    try { bitmap = await createImageBitmap(await demoFile(...demos[i])); const result = await normalizeImage(bitmap, { size: 300 }); const url = URL.createObjectURL(result.blob); const img = $(i ? 'hero-two' : 'hero-one'); img.onload = () => URL.revokeObjectURL(url); img.src = url; }
    catch { /* Static source image remains visible if preview creation fails. */ }
    finally { bitmap?.close(); }
  }
}
render(); heroPreviews();
