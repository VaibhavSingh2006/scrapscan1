// utils.js — Helper functions

const CLASSES = ['HMS-1 Heavy Steel','HMS-2 Light Steel','Galvanized Steel','Stainless Steel','Non-Ferrous','Mixed/Contaminated'];
const CLASS_KEYS = ['hms1','hms2','galv','ss','nonfe','mixed'];

const IS_2314 = {
  'HMS-1 Heavy Steel':    'IS 2314: No. 1 Heavy Melting Scrap (HMS-1)',
  'HMS-2 Light Steel':    'IS 2314: No. 2 Heavy Melting Scrap (HMS-2)',
  'Galvanized Steel':     'IS 2314: HMS-2 / Zorba [ZINC RISK]',
  'Stainless Steel':      'IS 2314: Stainless Steel Scrap Grade',
  'Non-Ferrous':          'Non-Ferrous — Not IS 2314 Applicable',
  'Mixed/Contaminated':   'IS 2314: Mixed Grade — Pre-sort Required'
};

const FERROUS_YIELD = { hms1:0.95, hms2:0.88, galv:0.82, ss:0.90, nonfe:0.0, mixed:0.65 };

const FURNACE_COMPAT = {
  hms1:  { eaf:'EXCELLENT', bof:'EXCELLENT', induction:'GOOD' },
  hms2:  { eaf:'GOOD',      bof:'GOOD',      induction:'EXCELLENT' },
  galv:  { eaf:'LIMITED',   bof:'NONE',      induction:'NONE' },
  ss:    { eaf:'GOOD',      bof:'NONE',      induction:'EXCELLENT' },
  nonfe: { eaf:'NONE',      bof:'NONE',      induction:'NONE' },
  mixed: { eaf:'NONE',      bof:'NONE',      induction:'NONE' }
};

const COMPOSITION = {
  hms1:  { fe:95, nfe:1,  waste:4  },
  hms2:  { fe:88, nfe:3,  waste:9  },
  galv:  { fe:82, nfe:14, waste:4  },
  ss:    { fe:70, nfe:27, waste:3  },
  nonfe: { fe:0,  nfe:95, waste:5  },
  mixed: { fe:65, nfe:10, waste:25 }
};

const MAT_PROPS = {
  hms1:  ['Thickness ≥ 6mm','Min. length 450mm','Density ~7.85 g/cm³','Low alloy content','Prime EAF/BOF feedstock'],
  hms2:  ['Thickness < 6mm','Sheet stampings & small sections','Moderate alloy variability','Good for induction furnaces'],
  galv:  ['Zinc coating: 60–300 g/m²','Spangled or matte surface','⚠ Volatile at 907°C in furnace','Generates hazardous EAFD dust','MUST be segregated from prime charge'],
  ss:    ['Cr: 10–30%, Ni: 0–20%','High corrosion resistance','Melt temp ~1480°C','High value — test with magnet/XRF','Separate from carbon steel charge'],
  nonfe: ['Non-magnetic','Copper: reddish-orange','Aluminium: bright silver','NOT suitable for ferrous furnaces','High value — sell separately'],
  mixed: ['Contamination visible','Contains plastics/organics','⚠ Gas generation risk in furnace','Pre-sorting mandatory','Reduced yield and value']
};

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - max));
  const sum = exps.reduce((a,b) => a+b, 0);
  return exps.map(x => x/sum);
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function zincLevel(prob) {
  if (prob < 0.30) return 'LOW';
  if (prob < 0.60) return 'MEDIUM';
  return 'HIGH';
}

function formatInr(amount) {
  const n = Math.round(amount);
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + ' Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(2)   + ' L';
  return '₹' + n.toLocaleString('en-IN');
}

function calculateEconomics(weightKg, pricePerTonne, zincProb, classKey) {
  const yield_ = FERROUS_YIELD[classKey] ?? 0.75;
  const usableKg   = weightKg * yield_;
  const lossKg     = weightKg - usableKg;
  const grossValue = (weightKg / 1000) * pricePerTonne;
  const lossValue  = (lossKg  / 1000) * pricePerTonne;
  const eafdTonnes = (zincProb * 0.025) * (weightKg / 1000);
  const eafdCost   = eafdTonnes * 12000;
  return {
    usableKg, lossKg, grossValue, lossValue,
    eafdTonnes, eafdCost,
    netValue: grossValue - lossValue - eafdCost
  };
}

function zincRecommendation(level, classKey) {
  if (classKey === 'galv' || level === 'HIGH')
    return 'SEGREGATE this load immediately. Request XRF spot-check at ≥3 points before charging. Consider de-galvanizing at 700°C prior to melt. Do NOT charge directly into EAF/BOF.';
  if (level === 'MEDIUM')
    return 'Proceed with caution. Limit to ≤20% of total charge. Monitor EAFD collection system. Consider spot XRF test on suspect areas.';
  return 'Low galvanization risk detected. Standard charging procedure applicable. Continue routine inspection.';
}

function chargeRecommendation(classKey) {
  const recs = {
    hms1:  'Recommended: 60% this load + 30% pig iron + 10% Grade HMS-2. Ideal prime EAF charge. No pre-treatment required.',
    hms2:  'Recommended: 50% this load + 40% HMS-1 + 10% DRI. Suitable for induction furnaces at 100%. Verify thin sections for yield.',
    galv:  '⚠ Segregate and de-zinc at 700°C before charging. If de-zinced: blend max 30% with HMS-1. Direct charging NOT recommended.',
    ss:    'Process in dedicated SS heat. Do NOT mix with carbon steel charge. Value-add by selling to SS specialty re-melters.',
    nonfe: 'REMOVE from ferrous charge entirely. Route to non-ferrous recovery. Higher value as separate commodity.',
    mixed: 'MANDATORY pre-sort required. Remove all plastics, organics, rubber. After sorting, re-assess grade before charging.'
  };
  return recs[classKey] || 'Run full analysis for charge recommendation.';
}

function envMetrics(classKey, weightKg) {
  const co2Saved = classKey === 'nonfe' ? 0 : (weightKg / 1000) * 1.8;
  const recycEff = (FERROUS_YIELD[classKey] ?? 0.75) * 100;
  const marketVal = { hms1:28, hms2:24, galv:20, ss:85, nonfe:150, mixed:15 }[classKey] ?? 18;
  const carbon = (weightKg / 1000) * 0.4;
  const esg = recycEff > 88 ? 'A' : recycEff > 70 ? 'B' : 'C';
  return { co2Saved: co2Saved.toFixed(1), recycEff: recycEff.toFixed(0), marketVal, carbon: carbon.toFixed(2), esg };
}

function protocolSteps(classKey, zincLvl) {
  const base = [
    'Document truck/batch ID and supplier details',
    'Photograph all sides of the scrap load',
    'Use magnet to verify ferrous content',
  ];
  if (classKey === 'galv' || zincLvl === 'HIGH') {
    return [...base,
      'Perform XRF spot-check at minimum 3 locations',
      'Segregate load to zinc-positive bay',
      'Notify furnace operator — do NOT charge until cleared',
      'Record EAFD generation estimate in audit log'
    ];
  }
  if (zincLvl === 'MEDIUM') {
    return [...base,
      'Visually inspect for spangled/silvery surface patches',
      'Limit batch to 20% of total EAF charge',
      'Update EAFD collection records accordingly'
    ];
  }
  return [...base,
    'Proceed with standard charging procedure',
    'Record grade and weight in system',
    'Archive this scan report for audit trail'
  ];
}

function regTags(classKey) {
  const tags = ['IS 2314', 'IS 1875'];
  if (classKey === 'galv' || classKey === 'mixed') tags.push('Hazardous Waste Rules 2016');
  if (classKey === 'nonfe') tags.push('E-Waste Rules 2022');
  return tags;
}

function saveToHistory(result) {
  const history = JSON.parse(localStorage.getItem('scrapscan_history') || '[]');
  history.unshift({
    ts: Date.now(),
    classLabel: result.topClass,
    classKey: result.classKey,
    grade: result.isGrade,
    confidence: result.confidence,
    zincLevel: result.zincRisk.level,
    demo: result.demo || false
  });
  localStorage.setItem('scrapscan_history', JSON.stringify(history.slice(0,10)));
}

function loadHistory() {
  return JSON.parse(localStorage.getItem('scrapscan_history') || '[]');
}
