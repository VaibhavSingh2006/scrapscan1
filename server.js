require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const MODEL_PATH = path.join(__dirname, 'public', 'models', 'scrapscan_model.onnx');
const modelLoaded = fs.existsSync(MODEL_PATH);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', modelLoaded, version: '2.0.0', mode: modelLoaded ? 'production' : 'demo' });
});

app.post('/api/analyse', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  res.json(serverSideDemo(req.file.buffer.length));
});

function serverSideDemo(bufLen) {
  const classes = ['hms1', 'hms2', 'galv', 'ss', 'nonfe', 'mixed'];
  const labels = ['HMS-1 Heavy Steel', 'HMS-2 Light Steel', 'Galvanized Steel', 'Stainless Steel', 'Non-Ferrous', 'Mixed/Contaminated'];
  const idx = bufLen % 6;
  const conf = 0.55 + Math.random() * 0.3;
  const zincProb = idx === 2 ? 0.75 + Math.random() * 0.2 : Math.random() * 0.25;
  return {
    topClass: labels[idx], classKey: classes[idx], confidence: conf, demo: true, server: true,
    zincRisk: {
      probability: zincProb,
      level: zincProb > 0.6 ? 'HIGH' : zincProb > 0.3 ? 'MEDIUM' : 'LOW',
      eafdKgPerTonne: zincProb * 25,
      disposalCostPer100T: zincProb * 25 * 100 * 120
    }
  };
}

// ── PDF REPORT ──
// BUG FIXED 1: All body value text was #ffffff (white on white page = invisible).
//              Now using #111111 for values, #444444 for labels.
// BUG FIXED 2: ₹ symbol (U+20B9) not in Helvetica font → replaced with Rs.
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
      qrDataUrl = await QRCode.toDataURL(
        `ScrapScan|${truckId}|${result.topClass}|${result.classKey}|Zn:${result.zincRisk?.level}|${timestamp}`
      );
    } catch (e) { }

    // ── HEADER (dark background — white text is fine here) ──
    doc.rect(0, 0, 595, 80).fill('#12121a');
    doc.fillColor('#FF2D78').fontSize(28).font('Helvetica-Bold').text('ScrapScan', 50, 25);
    doc.fillColor('#aaaacc').fontSize(10).font('Helvetica').text('AI Scrap Quality Intelligence Platform', 50, 57);
    doc.fillColor('#ffffff').fontSize(9)
      .text(`Generated: ${new Date(timestamp).toLocaleString('en-IN')}`, 350, 30)
      .text(`Truck/Batch ID: ${truckId || 'N/A'}`, 350, 45);
    if (qrDataUrl) {
      const qrBuf = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
      doc.image(qrBuf, 530, 10, { width: 55 });
    }

    // Helper — thin gray divider line
    const divider = (y) => doc.rect(50, y, 495, 1).fill('#dddddd');

    // ── CLASSIFICATION RESULT ──
    let y = 100;
    doc.fillColor('#FF2D78').fontSize(13).font('Helvetica-Bold').text('CLASSIFICATION RESULT', 50, y);
    divider(y + 18);

    y += 28;
    doc.fillColor('#111111').fontSize(20).font('Helvetica-Bold').text(result.topClass || 'Unknown', 50, y);
    doc.fillColor('#555555').fontSize(10).font('Helvetica').text(result.isGrade || '', 50, y + 26);

    const confPct = Math.round((result.confidence || 0) * 100);
    const confColor = confPct >= 70 ? '#1a7a3a' : confPct >= 40 ? '#7a5a00' : '#7a1a1a';
    doc.fillColor(confColor).fontSize(11).font('Helvetica-Bold').text(`Confidence: ${confPct}%`, 50, y + 40);

    // ── ZINC CONTAMINATION RISK ──
    y += 80;
    doc.fillColor('#FF2D78').fontSize(13).font('Helvetica-Bold').text('ZINC CONTAMINATION RISK', 50, y);
    divider(y + 18);

    y += 26;
    const zr = result.zincRisk || {};
    const zincPct = Math.round((zr.probability || 0) * 100);
    const zColor = zr.level === 'HIGH' ? '#cc0000' : zr.level === 'MEDIUM' ? '#996600' : '#006600';
    doc.fillColor(zColor).fontSize(18).font('Helvetica-Bold')
      .text(`${zr.level || 'LOW'} — ${zincPct}% Zinc Probability`, 50, y);

    y += 28;
    doc.fillColor('#444444').fontSize(10).font('Helvetica')
      .text(`EAFD estimate: ~${(zr.eafdKgPerTonne || 0).toFixed(1)} kg/tonne processed`, 50, y)
      .text(`Disposal cost per 100 tonnes: Rs.${Math.round(zr.disposalCostPer100T || 0).toLocaleString('en-IN')}`, 50, y + 14);

    // ── FURNACE COMPATIBILITY ──
    y += 55;
    doc.fillColor('#7B2FBE').fontSize(13).font('Helvetica-Bold').text('FURNACE COMPATIBILITY', 50, y);
    divider(y + 18);

    y += 26;
    const fc = result.furnaceCompatibility || {};
    [['EAF Furnace', 'eaf'], ['BOF Furnace', 'bof'], ['Induction Furnace', 'induction']].forEach(([label, key], i) => {
      const val = fc[key] || 'N/A';
      const col = val === 'EXCELLENT' ? '#006600' : val === 'GOOD' ? '#003d99' : val === 'LIMITED' ? '#996600' : '#990000';
      doc.fillColor('#333333').fontSize(10).font('Helvetica').text(`${label}:`, 50, y + i * 18);
      doc.fillColor(col).font('Helvetica-Bold').text(val, 220, y + i * 18);
    });

    // ── ECONOMIC ANALYSIS ──
    y += 75;
    doc.fillColor('#aa7700').fontSize(13).font('Helvetica-Bold').text('ECONOMIC ANALYSIS', 50, y);
    divider(y + 18);

    y += 26;
    const wkg = parseFloat(weightKg) || 10000;
    const pr = parseFloat(price) || 28000;
    const FYIELD = { hms1: 0.95, hms2: 0.88, galv: 0.82, ss: 0.90, nonfe: 0.0, mixed: 0.65 };
    const yield_ = FYIELD[result.classKey] || 0.75;
    const gross = (wkg / 1000) * pr;
    const usable = wkg * yield_;
    const eafdTonnes = (zr.probability || 0) * 0.025 * (wkg / 1000);
    const net = gross - ((wkg - usable) / 1000) * pr - eafdTonnes * 12000;

    const rows = [
      ['Load Weight', `${wkg.toLocaleString('en-IN')} kg`],
      ['Gross Value', `Rs.${Math.round(gross).toLocaleString('en-IN')}`],
      ['Usable Iron', `${Math.round(usable).toLocaleString('en-IN')} kg (${Math.round(yield_ * 100)}%)`],
      ['Net Value', `Rs.${Math.round(net).toLocaleString('en-IN')}`]
    ];
    rows.forEach(([k, v], i) => {
      doc.fillColor('#444444').fontSize(10).font('Helvetica').text(`${k}:`, 50, y + i * 18);
      doc.fillColor('#111111').font('Helvetica-Bold').text(v, 230, y + i * 18);
    });

    // ── IS 2314 REFERENCE BOX ──
    y += 90;
    doc.rect(50, y, 495, 28).fill('#f5f5f5');
    doc.fillColor('#333333').fontSize(9).font('Helvetica')
      .text(
        `IS 2314 Grade: ${result.isGrade || 'N/A'}   |   Class: ${(result.classKey || '').toUpperCase()}   |   Zinc Head Output: ${zincPct}%`,
        55, y + 9
      );

    // ── FOOTER (dark background — white text fine here) ──
    doc.rect(0, 780, 595, 62).fill('#12121a');
    doc.fillColor('#FF2D78').fontSize(9).font('Helvetica-Bold').text('ScrapScan v2.0', 50, 793);
    doc.fillColor('#aaaacc').fontSize(8).font('Helvetica')
      .text('IIM MATRIXx 2026 | IIT ISM Dhanbad | AI Scrap Quality Intelligence', 50, 807)
      .text('This report is AI-generated. Verify with XRF for regulatory decisions.', 50, 820);

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n  ScrapScan v2.0 running on http://localhost:${port}`);
    console.log(`   Mode: ${modelLoaded ? 'Production (ONNX model found)' : 'Demo mode'}\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (port < 3010) startServer(port + 1);
      else process.exit(1);
    } else throw err;
  });
}

startServer(PORT);