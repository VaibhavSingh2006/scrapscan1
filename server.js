require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const PDFDocument = require('pdfkit');
const QRCode   = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CROSS-ORIGIN ISOLATION (required for ONNX Runtime WASM multi-threading) ──
// These headers allow SharedArrayBuffer in the browser, which ONNX Runtime Web
// needs to load the WASM backend. Without them the model silently fails to load.
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ── CHECK MODEL ──
const MODEL_PATH = path.join(__dirname, 'public', 'models', 'scrapscan_model.onnx');
const modelLoaded = fs.existsSync(MODEL_PATH);

// ── HEALTH ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', modelLoaded, version: '2.0.0', mode: modelLoaded ? 'production' : 'demo' });
});

// ── ANALYSE (server-side fallback) ──
app.post('/api/analyse', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  // Color histogram heuristic (placeholder for server-side inference)
  const buf = req.file.buffer;
  // Simple mock analysis based on buffer size/content
  const mock = serverSideDemo(buf.length);
  res.json(mock);
});

function serverSideDemo(bufLen) {
  const classes = ['hms1','hms2','galv','ss','nonfe','mixed'];
  const labels  = ['HMS-1 Heavy Steel','HMS-2 Light Steel','Galvanized Steel','Stainless Steel','Non-Ferrous','Mixed/Contaminated'];
  const idx = bufLen % 6;
  const conf = 0.55 + Math.random() * 0.3;
  const zincProb = idx === 2 ? 0.75 + Math.random()*0.2 : Math.random()*0.25;
  return {
    topClass: labels[idx], classKey: classes[idx],
    confidence: conf, demo: true, server: true,
    zincRisk: {
      probability: zincProb,
      level: zincProb > 0.6 ? 'HIGH' : zincProb > 0.3 ? 'MEDIUM' : 'LOW',
      eafdKgPerTonne: zincProb * 25,
      disposalCostPer100T: zincProb * 25 * 100 * 120
    }
  };
}

// ── PDF REPORT ──
app.post('/api/report', async (req, res) => {
  try {
    const { truckId, weightKg, price, result, timestamp } = req.body;
    if (!result) return res.status(400).json({ error: 'No result data' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ScrapScan_${truckId || 'Report'}.pdf"`);
    doc.pipe(res);

    // QR Code
    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(`ScrapScan|${truckId}|${result.topClass}|${result.classKey}|Zn:${result.zincRisk?.level}|${timestamp}`);
    } catch (e) { /* skip qr if fails */ }

    // ── HEADER ──
    doc.rect(0, 0, 595, 80).fill('#12121a');
    doc.fillColor('#FF2D78').fontSize(28).font('Helvetica-Bold').text('ScrapScan', 50, 25);
    doc.fillColor('#8888aa').fontSize(10).font('Helvetica').text('AI Scrap Quality Intelligence Platform', 50, 57);
    doc.fillColor('#ffffff').fontSize(9).text(`Generated: ${new Date(timestamp).toLocaleString('en-IN')}`, 380, 30);
    doc.text(`Truck/Batch ID: ${truckId || 'N/A'}`, 380, 45);
    if (qrDataUrl) {
      const qrBuf = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/,''), 'base64');
      doc.image(qrBuf, 530, 10, { width: 60 });
    }
    doc.moveDown(4);

    // ── MAIN RESULT ──
    doc.fillColor('#FF2D78').fontSize(14).font('Helvetica-Bold').text('CLASSIFICATION RESULT', 50, 100);
    doc.rect(50, 118, 495, 1).fill('#2a2a3f');
    doc.moveDown(0.5);

    const yStart = 130;
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(result.topClass, 50, yStart);
    doc.fillColor('#8888aa').fontSize(10).font('Helvetica').text(result.isGrade, 50, yStart + 28);
    doc.fillColor('#00ff88').fontSize(11).font('Helvetica-Bold')
       .text(`Confidence: ${Math.round(result.confidence * 100)}%`, 50, yStart + 44);

    // ── ZINC RISK ──
    const zy = yStart + 75;
    doc.fillColor('#FF2D78').fontSize(13).font('Helvetica-Bold').text('ZINC CONTAMINATION RISK', 50, zy);
    doc.rect(50, zy+18, 495, 1).fill('#2a2a3f');
    const zr = result.zincRisk;
    const zColor = zr.level === 'HIGH' ? '#FF2D78' : zr.level === 'MEDIUM' ? '#ffaa00' : '#00ff88';
    doc.fillColor(zColor).fontSize(20).font('Helvetica-Bold')
       .text(`${zr.level} — ${Math.round(zr.probability * 100)}% Zinc Probability`, 50, zy + 26);
    doc.fillColor('#8888aa').fontSize(10).font('Helvetica')
       .text(`EAFD estimate: ~${zr.eafdKgPerTonne?.toFixed(1)} kg/tonne processed`, 50, zy + 52)
       .text(`Disposal cost per 100 tonnes: ₹${Math.round(zr.disposalCostPer100T || 0).toLocaleString('en-IN')}`, 50, zy + 66);

    // ── FURNACE ──
    const fy = zy + 100;
    doc.fillColor('#7B2FBE').fontSize(13).font('Helvetica-Bold').text('FURNACE COMPATIBILITY', 50, fy);
    doc.rect(50, fy+18, 495, 1).fill('#2a2a3f');
    const fc = result.furnaceCompatibility || {};
    ['EAF','BOF','Induction'].forEach((f, i) => {
      const key = ['eaf','bof','induction'][i];
      const val = fc[key] || 'N/A';
      const col = val === 'EXCELLENT' ? '#00ff88' : val === 'GOOD' ? '#60a5fa' : val === 'LIMITED' ? '#ffaa00' : '#FF2D78';
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text(`${f} Furnace:`, 50, fy + 28 + i*18);
      doc.fillColor(col).font('Helvetica-Bold').text(val, 200, fy + 28 + i*18);
    });

    // ── ECONOMICS ──
    const ey = fy + 95;
    doc.fillColor('#ffaa00').fontSize(13).font('Helvetica-Bold').text('ECONOMIC ANALYSIS', 50, ey);
    doc.rect(50, ey+18, 495, 1).fill('#2a2a3f');
    const wkg = parseFloat(weightKg) || 10000;
    const pr  = parseFloat(price) || 28000;
    const FYIELD = { hms1:0.95, hms2:0.88, galv:0.82, ss:0.90, nonfe:0.0, mixed:0.65 };
    const yield_ = FYIELD[result.classKey] || 0.75;
    const gross = (wkg/1000)*pr;
    const usable = wkg*yield_;
    const net = gross - (wkg-usable)/1000*pr - (zr.probability*0.025*(wkg/1000))*12000;
    const rows = [
      ['Load Weight', `${wkg.toLocaleString('en-IN')} kg`],
      ['Gross Value', `₹${Math.round(gross).toLocaleString('en-IN')}`],
      ['Usable Iron', `${Math.round(usable).toLocaleString('en-IN')} kg (${Math.round(yield_*100)}%)`],
      ['Net Value',   `₹${Math.round(net).toLocaleString('en-IN')}`]
    ];
    rows.forEach(([k,v], i) => {
      doc.fillColor('#8888aa').fontSize(10).font('Helvetica').text(k + ':', 50, ey + 28 + i*16);
      doc.fillColor('#ffffff').font('Helvetica-Bold').text(v, 250, ey + 28 + i*16);
    });

    // ── FOOTER ──
    doc.rect(0, 780, 595, 62).fill('#12121a');
    doc.fillColor('#FF2D78').fontSize(9).font('Helvetica-Bold').text('ScrapScan v2.0', 50, 793);
    doc.fillColor('#8888aa').fontSize(8).font('Helvetica')
       .text('IIM MATRIXx 2026 | IIT ISM Dhanbad | AI Scrap Quality Intelligence', 50, 807)
       .text('This report is AI-generated. Verify with XRF for regulatory decisions.', 50, 820);

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
});

// ── CATCH-ALL ──
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── START SERVER (with EADDRINUSE fallback) ──
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n⚙  ScrapScan v2.0 running on http://localhost:${port}`);
    console.log(`   Mode: ${modelLoaded ? '✅ Production (ONNX model found)' : '🔬 Demo (place scrapscan_model.onnx in public/models/)'}\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`\n⚠  Port ${port} is already in use.`);
      if (port < 3010) {
        console.log(`   Trying port ${port + 1}...\n`);
        startServer(port + 1);
      } else {
        console.error('   Could not find a free port between 3000–3010. Kill existing Node processes with:\n   pkill -f "node server.js"\n');
        process.exit(1);
      }
    } else {
      throw err;
    }
  });
}

startServer(PORT);
