// app.js — Main application logic

let currentResult = null;
let cameraStream = null;

// ── INIT ──
(async function init() {
  renderHistory();

  // Try loading ONNX model
  const loaded = await loadModel();
  if (loaded) {
    document.getElementById('statusDot').classList.remove('demo');
    document.getElementById('statusText').textContent = 'Model: Ready';
    document.getElementById('demoBanner').classList.add('hidden');
  }

  // Panel tab switching
  document.getElementById('panelTabs').addEventListener('click', e => {
    const btn = e.target.closest('.panel-tab');
    if (!btn) return;
    document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
  });

  // Main tab switching (Ferrous / E-Waste)
  document.getElementById('mainTabPills').addEventListener('click', e => {
    const btn = e.target.closest('.tab-pill');
    if (!btn) return;
    document.querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.mainTab;
    document.getElementById('ferrousTab').classList.toggle('hidden', tab !== 'ferrous');
    document.getElementById('ewasteTab').classList.toggle('hidden', tab !== 'ewaste');
  });

  // Upload zone
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');

  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });

  // Camera
  document.getElementById('btnCamera').addEventListener('click', openCamera);
  document.getElementById('btnCloseCamera').addEventListener('click', closeCamera);
  document.getElementById('btnCapture').addEventListener('click', capturePhoto);

  // Clear
  document.getElementById('btnClear').addEventListener('click', clearAll);

  // Analyse
  document.getElementById('btnAnalyse').addEventListener('click', runAnalysis);

  // Economics live update
  ['econWeight', 'econPrice'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (currentResult) updateEconomics(currentResult);
    });
  });

  // Export PDF
  document.getElementById('btnExportReport').addEventListener('click', exportReport);

  // Share
  document.getElementById('btnShare').addEventListener('click', shareResult);
})();

// ── FILE LOADING ──
function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('previewImg');
    img.src = e.target.result;
    img.onload = () => {
      document.getElementById('previewContainer').classList.add('visible');
      document.getElementById('btnAnalyse').disabled = false;
    };
  };
  reader.readAsDataURL(file);
}

function clearAll() {
  document.getElementById('previewImg').src = '';
  document.getElementById('previewContainer').classList.remove('visible');
  document.getElementById('fileInput').value = '';
  document.getElementById('btnAnalyse').disabled = true;
  document.getElementById('resultSection').classList.remove('visible');
  document.getElementById('zincPanel').classList.remove('visible');
  document.getElementById('btnExportReport').disabled = true;
  document.getElementById('btnShare').disabled = true;
  currentResult = null;
}

// ── CAMERA ──
async function openCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('cameraVideo').srcObject = cameraStream;
    document.getElementById('cameraModal').style.display = 'flex';
  } catch (e) {
    alert('Camera access denied or unavailable: ' + e.message);
  }
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('cameraModal').style.display = 'none';
}

function capturePhoto() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('captureCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    loadFile(blob);
    closeCamera();
  }, 'image/jpeg', 0.9);
}

// ── ANALYSIS ──
async function runAnalysis() {
  const img = document.getElementById('previewImg');
  if (!img.src || img.src === window.location.href) return;

  const btn = document.getElementById('btnAnalyse');
  const spinner = document.getElementById('analyseSpinner');
  const text = document.getElementById('analyseText');
  btn.disabled = true;
  spinner.classList.add('active');
  text.textContent = 'Analysing...';

  try {
    const result = await classifyScrap(img);
    currentResult = result;
    renderResult(result);
    saveToHistory(result);
    renderHistory();
  } catch (e) {
    console.error('Analysis failed:', e);
    alert('Analysis failed: ' + e.message);
  } finally {
    btn.disabled = false;
    spinner.classList.remove('active');
    text.textContent = 'Analyse Scrap';
  }
}

// ── EXPORT PDF ──
async function exportReport() {
  if (!currentResult) return;
  const truckId = document.getElementById('truckId').value || 'UNKNOWN';
  const weightKg = document.getElementById('econWeight').value || '10000';
  const price = document.getElementById('econPrice').value || '28000';

  try {
    const resp = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truckId, weightKg, price,
        result: currentResult,
        timestamp: new Date().toISOString()
      })
    });
    if (!resp.ok) throw new Error('Server error ' + resp.status);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScrapScan_${truckId}_${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    // Fallback: browser print
    alert('PDF server unavailable — using browser print.\n\nTip: Start the Node.js server with "npm start" for full PDF export.');
    window.print();
  }
}

// ── SHARE ──
function shareResult() {
  if (!currentResult) return;
  const text = `ScrapScan Report\n` +
    `Grade: ${currentResult.topClass}\n` +
    `IS 2314: ${currentResult.isGrade}\n` +
    `Confidence: ${Math.round(currentResult.confidence * 100)}%\n` +
    `Zinc Risk: ${currentResult.zincRisk.level} (${Math.round(currentResult.zincRisk.probability * 100)}%)`;
  if (navigator.share) {
    navigator.share({ title: 'ScrapScan Report', text });
  } else {
    navigator.clipboard.writeText(text).then(() => alert('Report copied to clipboard!'));
  }
}
