# ScrapScan — AI Scrap Quality Intelligence Platform
**IIM MATRIXx 2026 Hackathon | IIT ISM Dhanbad**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org) [![ONNX Runtime Web](https://img.shields.io/badge/ONNX%20Runtime-Web-blue)](https://onnxruntime.ai) [![IS 2314](https://img.shields.io/badge/Standard-IS%202314-orange)](https://www.bis.gov.in)

---

## 🔧 Problem We Solve

When scrap-loaded trucks arrive at Indian steel plants, workers do **manual visual inspection** to assess quality — this is subjective, slow, and misses critical contamination.

**The #1 problem: Galvanized (zinc-coated) steel**
- Zinc boils at 907°C — well below EAF operating temperature of 1550–1650°C
- ALL zinc volatilizes into EAF Dust (EAFD) — a **hazardous waste**
- EAFD disposal costs ₹8,000–15,000/tonne
- A mill processing 1M tonnes/year generates 15,000–20,000 tonnes EAFD annually
- Manual inspection **cannot** reliably detect galvanized vs bare steel

**ScrapScan** provides real-time IS 2314 grade classification + zinc risk scoring via smartphone camera.

---

## 🚀 Quick Start

```bash
git clone https://github.com/Saurabh6266/scrapscan
cd scrapscan
npm install
npm start
# Open http://localhost:3000
```

The app launches in **Demo Mode** immediately — no model file needed.

---

## 🔬 Demo Mode vs Production Mode

| | Demo Mode | Production Mode |
|---|---|---|
| **Header** | 🟡 Yellow dot — "Model: Demo Mode" | 🟢 Green dot — "Model: Ready" |
| **Banner** | Yellow demo banner visible | Hidden |
| **Inference** | Rule-based pixel analysis (canvas API) | ONNX Runtime Web (EfficientNet-B0) |
| **Results labeled** | "(Demo)" badge | No badge |
| **UI pipeline** | Full — all tabs, panels, PDF export | Full |

The app detects whether `public/models/scrapscan_model.onnx` exists at startup and switches modes automatically.

---

## 🧠 Training the Real Model (Google Colab)

### Step 1 — Prepare YouTube URLs (optional but recommended for galvanized class)
Edit `ml/config/youtube_urls.txt` and add YouTube URLs showing galvanized steel scrap:
```
https://www.youtube.com/watch?v=YOUR_URL_1
https://www.youtube.com/watch?v=YOUR_URL_2
```

### Step 2 — Open Colab Notebook
1. Go to [Google Colab](https://colab.research.google.com)
2. Upload `ml/ScrapScan_Training.ipynb`
3. Set runtime: **Runtime → Change runtime type → T4 GPU**

### Step 3 — Run All Cells (in order)
| Cell | What it does | Time |
|------|-------------|------|
| 1 | Install packages | 2 min |
| 2 | Mount Google Drive | 1 min |
| 3 | Scrape images via Bing (~200/query × 4 queries × 6 classes) | 30–60 min |
| 4 | Extract YouTube frames for galvanized class | 10 min |
| 5 | **STOP HERE** — manually review/delete wrong images (30 min) | Manual |
| 6 | Split dataset 70/20/10 | 1 min |
| 7 | Define model + augmentation | instant |
| 8 | Training setup + class weights | instant |
| 9 | Stage 1: Train heads only (10 epochs) | 15 min |
| 10 | Stage 2: Full fine-tuning (30 epochs) | 60–90 min |
| 11 | Evaluate + confusion matrix | 5 min |
| 12 | Export to ONNX + verify | 2 min |
| 13 | **Download scrapscan_model.onnx** | instant |

### Step 4 — Deploy Model
```bash
# Copy downloaded file to project:
cp ~/Downloads/scrapscan_model.onnx public/models/scrapscan_model.onnx

# Restart the app:
npm start
```
The app will automatically switch to Production Mode.

---

## 📁 File Structure

```
scrapscan/
├── server.js                 Express server (static files + API)
├── package.json
├── render.yaml               Render.com deployment config
├── .env.example
│
├── public/
│   ├── index.html            Single-page app
│   ├── css/style.css         Dark theme design system
│   ├── js/
│   │   ├── app.js            Main controller (upload, camera, analyse)
│   │   ├── model.js          ONNX Runtime Web inference
│   │   ├── demo.js           Rule-based demo fallback
│   │   ├── ui.js             All rendering functions + radar chart
│   │   └── utils.js          Helpers: softmax, economics, formatting
│   └── models/
│       └── README.txt        ← place scrapscan_model.onnx here
│
└── ml/
    ├── ScrapScan_Training.ipynb  Google Colab notebook
    ├── model.py                  EfficientNet-B0 multi-task model
    ├── dataset.py                PyTorch Dataset class
    ├── train.py                  Training script (local)
    ├── augmentation.py           Albumentations pipeline
    ├── scrape_data.py            Bing image scraper
    ├── export_onnx.py            ONNX export + verification
    ├── evaluate.py               Confusion matrix + metrics
    └── config/
        ├── classes.json          IS 2314 class definitions
        └── youtube_urls.txt      YouTube URLs (fill manually)
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/health` | Server + model status |
| `POST` | `/api/analyse` | Server-side inference (fallback) |
| `POST` | `/api/report`  | Generate PDF report |

---

## 🚢 Deploy to Render

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Render auto-detects `render.yaml` — just click Deploy
5. To use the trained model, add it as a build step or use Render Disk (persistent storage)

---

## 📊 IS 2314 Grade Reference

| Class | IS 2314 Grade | Fe Yield | EAF | BOF | Induction |
|-------|--------------|----------|-----|-----|-----------|
| HMS-1 | No. 1 Heavy Melting | 95% | ✅ EXCELLENT | ✅ EXCELLENT | GOOD |
| HMS-2 | No. 2 Heavy Melting | 88% | GOOD | GOOD | ✅ EXCELLENT |
| Galvanized | HMS-2/Zorba ⚠ | 82% | LIMITED | ❌ NONE | ❌ NONE |
| Stainless | SS Grade | 90% | GOOD | ❌ NONE | ✅ EXCELLENT |
| Non-Ferrous | Not Applicable | 0% | ❌ NONE | ❌ NONE | ❌ NONE |
| Mixed | Mixed Grade | 65% | ❌ NONE | ❌ NONE | ❌ NONE |

---

## ⚗ Zinc / EAFD Technical Background

**Why zinc is dangerous:**
- Galvanized steel has a 60–300 g/m² zinc coating
- Zinc melting point: 419°C, boiling point: **907°C**
- EAF operating temperature: **1550–1650°C**
- All zinc volatilizes into fine dust (EAFD — Electric Arc Furnace Dust)
- EAFD contains: ZnO (~20–35%), Fe₂O₃, CaO, PbO, CdO — classified **hazardous waste**
- Disposal: stabilization + landfill = ₹8,000–15,000/tonne
- EAFD generation: ~15–20 kg per tonne of scrap processed (increases with zinc content)

**EAFD cost formula used in ScrapScan:**
```
eafd_kg_per_tonne = zinc_probability × 25
disposal_cost = eafd_kg × 1000_g/kg × (weight_in_tonnes) × ₹12,000/tonne
```

**XRF verification recommended** for any load with MEDIUM or HIGH zinc risk before charging.

---

## 👥 Team

**ScrapScan** — IIM MATRIXx 2026 Startup Hackathon Submission  
B.Tech, Mineral & Metallurgical Engineering — IIT ISM Dhanbad
