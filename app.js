import { normalizeImage } from './normalize.js';

const $ = id => document.getElementById(id);
let items = [], version = 0, running = false;
const settings = () => ({ coverage: +$('coverage').value, size: 1200, aspect: +$('aspect').value, tolerance: +$('tolerance').value });
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

function element(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function issue(message) {
  const icon = element('span', 'issue');
  icon.textContent = '!';
  icon.title = message;
  icon.tabIndex = 0;
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', message);
  return icon;
}

function render() {
  const fragment = document.createDocumentFragment();
  const aspect = settings().aspect;
  for (const item of items) {
    const row = element('article', 'comparison');
    row.setAttribute('aria-label', item.file.name);
    row.style.setProperty('--card-aspect', aspect);
    const original = element('figure', 'image-card');
    const before = element('img');
    before.src = item.originalURL;
    before.alt = `Original ${item.file.name}`;
    original.append(before);

    const normalized = element('figure', 'image-card');
    normalized.setAttribute('aria-label', `Resized ${item.file.name}`);
    normalized.setAttribute('aria-busy', item.state === 'pending' || item.state === 'processing');
    if (item.state === 'ready') {
      const after = element('img');
      after.src = item.result.preserveOriginal ? item.originalURL : item.outputURL;
      after.alt = `Resized ${item.file.name}`;
      normalized.append(after);
      if (item.result.warning) normalized.append(issue(item.result.warning));
    } else if (item.error && item.state === 'error') {
      normalized.append(issue(item.error));
    }
    row.append(original, normalized);
    fragment.append(row);
  }
  $('results').replaceChildren(fragment);
}

async function processQueue() {
  if (running) return;
  running = true;
  try {
    let item;
    while ((item = items.find(i => i.state === 'pending'))) {
      const currentVersion = version, config = settings();
      item.state = 'processing';
      render();
      await pause();
      let bitmap;
      try {
        bitmap = await createImageBitmap(item.file);
        if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Please use an image under 40 megapixels.');
        const result = await normalizeImage(bitmap, config);
        if (!items.includes(item)) continue;
        if (version !== currentVersion) { item.state = 'pending'; continue; }
        if (item.outputURL) URL.revokeObjectURL(item.outputURL);
        item.result = result;
        item.outputURL = result.preserveOriginal ? null : URL.createObjectURL(result.blob);
        item.state = 'ready';
        item.error = '';
      } catch (error) {
        if (items.includes(item)) {
          if (version !== currentVersion) item.state = 'pending';
          else {
            item.state = 'error';
            item.error = error.message.includes('source image') ? 'Please upload a valid PNG, JPG or WebP image.' : error.message;
          }
        }
      } finally { bitmap?.close(); }
      render();
      await pause();
    }
  } finally { running = false; render(); }
}

async function addFiles(files) {
  $('messages').replaceChildren();
  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      $('messages').append(issue(`${file.name}: please choose a PNG, JPG or WebP image.`));
      continue;
    }
    if (file.size > 25 * 1024 * 1024) {
      $('messages').append(issue(`${file.name}: file exceeds the 25 MB limit.`));
      continue;
    }
    if (items.length >= 100) {
      $('messages').append(issue('This batch is limited to 100 images. Refresh the page to start a new batch.'));
      break;
    }
    items.push({ file, originalURL: URL.createObjectURL(file), state: 'pending' });
  }
  render();
  await processQueue();
}

$('upload').onclick = () => $('file-input').click();
$('file-input').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
let dragDepth = 0;
document.addEventListener('dragenter', e => {
  e.preventDefault();
  if (e.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('dragleave', e => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('dragging');
});
document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
});

let timer;
for (const id of ['coverage', 'aspect', 'tolerance']) $(id).addEventListener('input', () => {
  $('coverage-value').textContent = `${$('coverage').value}%`;
  $('coverage').setAttribute('aria-valuetext', `${$('coverage').value}%`);
  $('tolerance-value').textContent = $('tolerance').value;
  version++;
  items.forEach(item => { if (item.state !== 'processing') item.state = 'pending'; });
  render();
  clearTimeout(timer);
  timer = setTimeout(processQueue, 200);
});

render();
