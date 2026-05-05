const form = document.querySelector('#generatorForm');
const promptInput = document.querySelector('#prompt');
const countInput = document.querySelector('#count');
const aspectSelect = document.querySelector('#aspect');
const sizeSelect = document.querySelector('#size');
const qualitySelect = document.querySelector('#quality');
const outputFormatSelect = document.querySelector('#outputFormat');
const referencesInput = document.querySelector('#references');
const referencePreview = document.querySelector('#referencePreview');
const uploadZone = document.querySelector('#uploadZone');
const gallery = document.querySelector('#gallery');
const loadingState = document.querySelector('#loadingState');
const errorBox = document.querySelector('#errorBox');
const resultMeta = document.querySelector('#resultMeta');
const keyStatus = document.querySelector('#keyStatus');
const clearButton = document.querySelector('#clearButton');

let referenceFiles = [];
let objectUrls = [];

const aspectToSize = {
  '1:1': '1024x1024',
  '16:9': '1536x864',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  auto: 'auto'
};

checkHealth();

aspectSelect.addEventListener('change', () => {
  sizeSelect.value = aspectToSize[aspectSelect.value] || '1024x1024';
});

sizeSelect.addEventListener('change', () => {
  const matched = Object.entries(aspectToSize).find(([, size]) => size === sizeSelect.value);
  aspectSelect.value = matched?.[0] || 'auto';
});

referencesInput.addEventListener('change', () => {
  addReferenceFiles([...referencesInput.files]);
  referencesInput.value = '';
});

['dragenter', 'dragover'].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove('dragging');
  });
});

uploadZone.addEventListener('drop', (event) => {
  addReferenceFiles([...event.dataTransfer.files]);
});

clearButton.addEventListener('click', () => {
  form.reset();
  countInput.value = 4;
  aspectSelect.value = '1:1';
  sizeSelect.value = '1024x1024';
  qualitySelect.value = 'auto';
  outputFormatSelect.value = 'png';
  referenceFiles = [];
  renderReferences();
  clearError();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  setLoading(true);

  const data = new FormData(form);
  data.set('prompt', promptInput.value.trim());
  data.set('count', String(clamp(Number(countInput.value), 1, 10)));
  data.set('size', sizeSelect.value);
  data.set('quality', qualitySelect.value);
  data.set('outputFormat', outputFormatSelect.value);
  data.delete('references');

  referenceFiles.forEach((file) => {
    data.append('references', file, file.name);
  });

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      body: data
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Image generation failed.');
    }

    renderGallery(json.images || [], json.outputFormat || outputFormatSelect.value);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    const json = await response.json();
    keyStatus.textContent = json.hasApiKey ? 'API key ready' : 'API key missing';
    keyStatus.classList.toggle('ready', json.hasApiKey);
    keyStatus.classList.toggle('missing', !json.hasApiKey);
  } catch {
    keyStatus.textContent = 'Server offline';
    keyStatus.classList.add('missing');
  }
}

function addReferenceFiles(files) {
  const imageFiles = files.filter((file) => /^image\/(png|jpeg|webp)$/.test(file.type));
  referenceFiles = [...referenceFiles, ...imageFiles].slice(0, 16);
  renderReferences();
}

function renderReferences() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  referencePreview.innerHTML = '';

  referenceFiles.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);

    const tile = document.createElement('div');
    tile.className = 'reference-tile';
    tile.innerHTML = `
      <img src="${url}" alt="${escapeHtml(file.name)}" />
      <button type="button" aria-label="Remove ${escapeHtml(file.name)}">×</button>
    `;
    tile.querySelector('button').addEventListener('click', () => {
      referenceFiles.splice(index, 1);
      renderReferences();
    });
    referencePreview.append(tile);
  });
}

function renderGallery(images, format) {
  gallery.classList.toggle('empty', images.length === 0);
  gallery.innerHTML = '';

  if (!images.length) {
    gallery.innerHTML = `
      <div class="empty-state">
        <div class="empty-frame"></div>
        <p>No images returned.</p>
      </div>
    `;
    resultMeta.textContent = 'No images returned';
    return;
  }

  images.forEach((image, index) => {
    const src = image.b64 ? `data:image/${format};base64,${image.b64}` : image.url;
    const card = document.createElement('article');
    card.className = 'image-card';
    card.innerHTML = `
      <img src="${src}" alt="Generated image ${index + 1}" />
      <div class="image-actions">
        <span>#${index + 1}</span>
        <a href="${src}" download="image-2-generation-${index + 1}.${format}">Download</a>
      </div>
    `;
    gallery.append(card);
  });

  resultMeta.textContent = `${images.length} image${images.length === 1 ? '' : 's'} generated`;
}

function setLoading(isLoading) {
  form.querySelector('.primary-button').disabled = isLoading;
  loadingState.hidden = !isLoading;
  if (isLoading) {
    gallery.classList.add('empty');
    gallery.innerHTML = '';
    resultMeta.textContent = 'Working...';
  }
}

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
  resultMeta.textContent = 'Generation failed';
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}
