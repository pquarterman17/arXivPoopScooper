/**
 * Drag-and-drop PDF import (plan #8 strangler-fig migration).
 *
 * Hooks document-level dragenter/dragleave/dragover/drop listeners that
 * show a #drop-overlay highlight and dispatch dropped PDF files into an
 * upload + arXiv-ID/DOI sniff pipeline. Status is rendered into the
 * #import-progress / #import-list panels.
 *
 * Public surface: `installDragDropImport()` is called once from main.js
 * at module-load time. Everything else is internal.
 *
 * The PDF-text sniff uses the legacy `pdfjsLib` global (loaded from CDN).
 * Upload posts to `POST /api/upload-pdf` (handled by serve.py).
 */

let dragCounter = 0;
let installed = false;

export function installDragDropImport() {
  if (installed) return;
  installed = true;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    const overlay = document.getElementById('drop-overlay');
    if (overlay) overlay.classList.add('active');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      const overlay = document.getElementById('drop-overlay');
      if (overlay) overlay.classList.remove('active');
    }
  });

  document.addEventListener('dragover', (e) => { e.preventDefault(); });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    const overlay = document.getElementById('drop-overlay');
    if (overlay) overlay.classList.remove('active');
    if (e.dataTransfer && e.dataTransfer.files) {
      handleDroppedFiles(e.dataTransfer.files);
    }
  });
}

async function handleDroppedFiles(files) {
  const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
  if (pdfFiles.length === 0) {
    alert('No PDF files found. Please drag PDF files only.');
    return;
  }

  const progressPanel = document.getElementById('import-progress');
  if (progressPanel) progressPanel.style.display = 'block';
  const importList = document.getElementById('import-list');
  if (importList) importList.innerHTML = '';

  for (const file of pdfFiles) {
    const itemId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (importList) {
      const item = document.createElement('div');
      item.id = itemId;
      item.className = 'import-item';
      item.innerHTML = `
        <div class="import-item-icon loading">⟳</div>
        <div class="import-item-details">
          <div class="import-item-name">${escapeHtml(file.name)}</div>
          <div class="import-item-status">Uploading...</div>
        </div>
      `;
      importList.appendChild(item);
    }

    try {
      const firstPageText = await extractTextFromPDF(file, 2);
      const arxivId = findArxivId(firstPageText);
      const doi = findDOI(firstPageText);
      const uploadResponse = await uploadPDF(file);
      if (!uploadResponse.ok) {
        updateImportItem(itemId, 'error', `Upload failed: ${uploadResponse.statusText}`);
        continue;
      }
      const result = await uploadResponse.json();
      if (arxivId) {
        updateImportItem(itemId, 'success', `Processing arXiv:${arxivId}`);
        queuePaperForProcessing(arxivId, result.path);
      } else if (doi) {
        updateImportItem(itemId, 'success', `Lookup DOI: ${doi}`);
      } else {
        updateImportItem(itemId, 'success', `Uploaded: ${file.name}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      updateImportItem(itemId, 'error', `Error: ${error.message}`);
    }
  }

  setTimeout(() => {
    const items = document.querySelectorAll('.import-item-icon.error');
    if (items.length === 0) {
      setTimeout(() => {
        if (progressPanel) progressPanel.style.display = 'none';
      }, 3000);
    }
  }, 1000);
}

async function extractTextFromPDF(file, maxPages = 2) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await globalThis.pdfjsLib.getDocument(arrayBuffer).promise;
    let text = '';
    for (let i = 1; i <= Math.min(maxPages, pdf.numPages); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      text += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  } catch (error) {
    console.error('PDF text extraction error:', error);
    return '';
  }
}

export function findArxivId(text) {
  const patterns = [
    /arXiv:(\d{4}\.\d{4,5})/i,
    /arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i,
    /(\d{4}\.\d{4,5})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const id = match[1];
      if (/^\d{4}\.\d{4,5}$/.test(id)) return id;
    }
  }
  return null;
}

export function findDOI(text) {
  const patterns = [
    /doi:\s*(10\.\S+)/i,
    /doi\.org\/(10\.\S+)/i,
    /(10\.\d+\/[^\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let doi = match[1].replace(/[.,;:)\]]*$/, '');
      if (doi.startsWith('10.')) return doi;
    }
  }
  return null;
}

async function uploadPDF(file) {
  const formData = new FormData();
  formData.append('pdf', file);
  return fetch('/api/upload-pdf', { method: 'POST', body: formData });
}

function updateImportItem(itemId, status, statusText) {
  const item = document.getElementById(itemId);
  if (!item) return;
  const icon = item.querySelector('.import-item-icon');
  const statusEl = item.querySelector('.import-item-status');
  if (status === 'success') {
    icon.className = 'import-item-icon success';
    icon.textContent = '✓';
  } else if (status === 'error') {
    icon.className = 'import-item-icon error';
    icon.textContent = '✕';
  }
  if (statusEl) statusEl.textContent = statusText;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function queuePaperForProcessing(arxivId, pdfPath) {
  console.log(`Paper queued for processing: ${arxivId} (${pdfPath})`);
}
