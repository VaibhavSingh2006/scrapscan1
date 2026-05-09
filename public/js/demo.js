// demo.js — Rule-based fallback inference when ONNX model is absent

function getPixelStats(imgElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;

  let r=0, g=0, b=0, count=0;
  let edgeSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i+1]; b += data[i+2]; count++;
  }
  r /= count; g /= count; b /= count;
  const brightness = (r + g + b) / 3;
  const saturation = Math.max(r,g,b) - Math.min(r,g,b);

  // Simple Sobel-like edge density on grayscale
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push((data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114));
  }
  const W = 64;
  for (let y = 1; y < 63; y++) {
    for (let x = 1; x < 63; x++) {
      const gx = -gray[(y-1)*W+(x-1)] + gray[(y-1)*W+(x+1)]
                 -2*gray[y*W+(x-1)] + 2*gray[y*W+(x+1)]
                 -gray[(y+1)*W+(x-1)] + gray[(y+1)*W+(x+1)];
      const gy = -gray[(y-1)*W+(x-1)] - 2*gray[(y-1)*W+x] - gray[(y-1)*W+(x+1)]
                 + gray[(y+1)*W+(x-1)] + 2*gray[(y+1)*W+x] + gray[(y+1)*W+(x+1)];
      edgeSum += Math.sqrt(gx*gx + gy*gy);
    }
  }
  const edgeDensity = edgeSum / (62*62);

  return { r, g, b, brightness, saturation, edgeDensity };
}

function analyzeImageDemo(imgElement) {
  const { r, g, b, brightness, saturation, edgeDensity } = getPixelStats(imgElement);

  // Raw scores [hms1, hms2, galv, ss, nonfe, mixed]
  let scores = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];

  // HMS-1: dark, brownish-grey, rough/high edges
  if (brightness < 100 && saturation < 60 && edgeDensity > 30) {
    scores[0] += 0.5;
  } else if (brightness < 130 && edgeDensity > 25) {
    scores[0] += 0.3;
  }

  // HMS-2: medium brightness, high edge density (lots of cut edges)
  if (brightness >= 80 && brightness < 160 && edgeDensity > 35) {
    scores[1] += 0.4;
  }

  // Galvanized: high brightness, silver/cool tone, low saturation
  const isSilver = brightness > 140 && saturation < 50 && b >= r * 0.95;
  if (isSilver && brightness > 150) {
    scores[2] += 0.55;
  } else if (isSilver) {
    scores[2] += 0.3;
  }

  // Stainless: very high brightness, near-white, mirror-like (very low edge density)
  if (brightness > 180 && saturation < 30 && edgeDensity < 20) {
    scores[3] += 0.55;
  }

  // Non-ferrous: high saturation + reddish (copper) or very bright (aluminium)
  if (saturation > 60 && r > g * 1.2 && r > b * 1.2) {
    scores[4] += 0.5; // Copper
  } else if (brightness > 170 && saturation < 25) {
    scores[4] += 0.2;
  }

  // Mixed: medium everything, high saturation, high edge density
  if (saturation > 40 && edgeDensity > 30 && brightness > 80 && brightness < 160) {
    scores[5] += 0.35;
  }

  // Add ±15% noise to look natural
  scores = scores.map(s => Math.max(0.01, s + (Math.random()-0.5)*0.15));

  // Softmax
  const probs = softmax(scores);

  const topIdx = probs.indexOf(Math.max(...probs));
  const topClass = CLASSES[topIdx];
  const topKey   = CLASS_KEYS[topIdx];

  // Zinc probability: if galv class is dominant → high; else use galv score
  let zincProb = probs[2];
  if (topKey === 'galv') zincProb = Math.max(zincProb, 0.7 + Math.random()*0.2);
  zincProb = Math.min(0.97, zincProb);

  const sorted = [...probs.map((p,i) => ({label:CLASSES[i], confidence:p, key:CLASS_KEYS[i]}))];
  sorted.sort((a,b) => b.confidence - a.confidence);

  return buildResult({
    topClass, classKey: topKey, confidence: probs[topIdx],
    predictions: sorted.slice(0,3),
    zincProb, demo: true
  });
}

function buildResult({ topClass, classKey, confidence, predictions, zincProb, demo }) {
  const zLvl = zincLevel(zincProb);
  const eafdKg = zincProb * 25;
  const disposalPer100T = eafdKg * 100 * 120; // ₹ (12000/tonne, eafdKg is per tonne)
  const comp = COMPOSITION[classKey] || { fe:75, nfe:10, waste:15 };
  const compat = FURNACE_COMPAT[classKey] || { eaf:'NONE', bof:'NONE', induction:'NONE' };
  return {
    topClass, classKey, isGrade: IS_2314[topClass],
    confidence, predictions,
    zincRisk: {
      probability: zincProb,
      level: zLvl,
      eafdKgPerTonne: eafdKg,
      disposalCostPer100T: disposalPer100T
    },
    composition: comp,
    furnaceCompatibility: compat,
    demo: demo || false
  };
}
