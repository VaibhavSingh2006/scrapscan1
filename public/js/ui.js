// ui.js — All UI rendering functions
let radarChartInstance = null;

function renderResult(result) {
  const { topClass, classKey, isGrade, confidence, predictions, zincRisk, composition, furnaceCompatibility, demo } = result;

  // ── Classification Result ──
  const classBadge = document.getElementById('classBadge');
  classBadge.textContent = topClass + (demo ? ' (Demo)' : '');
  classBadge.className = `class-badge ${classKey}${demo?' demo':''}`;
  document.getElementById('detectedName').textContent = topClass;
  document.getElementById('isGradeTag').textContent = isGrade;

  const confPct = Math.round(confidence * 100);
  document.getElementById('confPct').textContent = confPct + '%';
  setTimeout(() => { document.getElementById('confBarFill').style.width = confPct + '%'; }, 50);

  // Top 3
  const top3 = document.getElementById('top3List');
  top3.innerHTML = '';
  predictions.forEach(p => {
    const pct = Math.round(p.confidence * 100);
    top3.innerHTML += `
      <div class="top3-item">
        <div class="top3-labels"><span class="top3-name">${p.label}</span><span class="top3-pct">${pct}%</span></div>
        <div class="top3-bar-bg"><div class="top3-bar-fill" style="width:0" data-pct="${pct}"></div></div>
      </div>`;
  });
  setTimeout(() => {
    top3.querySelectorAll('.top3-bar-fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  }, 80);

  // ── Zinc Risk ──
  const zp = zincRisk.probability;
  const zl = zincRisk.level.toLowerCase();
  const zPanel = document.getElementById('zincPanel');
  zPanel.classList.add('visible');
  document.getElementById('zincLevelBadge').textContent = zincRisk.level;
  document.getElementById('zincLevelBadge').className = `zinc-level-badge ${zl}`;
  document.getElementById('zincProbBig').textContent = Math.round(zp * 100) + '%';
  document.getElementById('eafdKg').textContent = zincRisk.eafdKgPerTonne.toFixed(1) + ' kg/T';
  document.getElementById('eafdCost').textContent = formatInr(zincRisk.disposalCostPer100T);
  document.getElementById('zincRec').textContent = zincRecommendation(zincRisk.level, classKey);

  // ── Material ──
  const { fe, nfe, waste } = composition;
  document.getElementById('fePct').textContent = fe + '%';
  document.getElementById('nfePct').textContent = nfe + '%';
  document.getElementById('wastePct').textContent = waste + '%';
  setTimeout(() => {
    document.getElementById('feBar').style.width    = fe + '%';
    document.getElementById('nfeBar').style.width   = nfe + '%';
    document.getElementById('wasteBar').style.width = waste + '%';
  }, 100);

  const props = MAT_PROPS[classKey] || [];
  document.getElementById('materialProps').innerHTML = props.map(p => `<li>• ${p}</li>`).join('');

  // ── Furnace ──
  const gradeDescs = {
    hms1: 'Prime heavy melting scrap. Structural steel ≥6mm thick. Preferred EAF/BOF feedstock across Indian steel plants.',
    hms2: 'Light steel scrap <6mm. Sheet metal, stampings, small sections. Excellent induction furnace grade.',
    galv: '⚠ Galvanized/zinc-coated scrap. Requires zinc removal or strict blending limits. Generates EAFD hazardous waste.',
    ss:   'Stainless steel scrap. High alloy content (Cr, Ni). Must be processed in dedicated SS heats. High intrinsic value.',
    nonfe:'Non-ferrous contamination. Incompatible with ferrous furnaces. Route to dedicated non-ferrous recovery process.',
    mixed:'Mixed/contaminated scrap. Contains organics, plastics, rubber. Mandatory pre-sorting before any furnace charge.'
  };
  document.getElementById('gradeDesc').textContent = gradeDescs[classKey] || '';
  ['eaf','bof','ind'].forEach((f, i) => {
    const key = ['eaf','bof','induction'][i];
    const val = furnaceCompatibility[key] || 'NONE';
    const el = document.getElementById(`compat-${f}`);
    el.textContent = val;
    el.className = `compat-tag ${val}`;
  });
  document.getElementById('chargeRec').textContent = chargeRecommendation(classKey);

  // ── Contamination ──
  const zLvlLower = zincRisk.level.toLowerCase();
  document.getElementById('contamZinc').textContent = zincRisk.level;
  document.getElementById('contamZinc').className = `contam-level ${zLvlLower}`;
  const cuLevel = ['galv','mixed','nonfe'].includes(classKey) ? 'medium' : 'low';
  document.getElementById('contamCu').textContent = cuLevel.toUpperCase();
  document.getElementById('contamCu').className = `contam-level ${cuLevel}`;
  const orgLevel = classKey === 'mixed' ? 'high' : 'low';
  document.getElementById('contamOrg').textContent = orgLevel.toUpperCase();
  document.getElementById('contamOrg').className = `contam-level ${orgLevel}`;
  const pbLevel = ['galv','mixed','hms2'].includes(classKey) ? 'medium' : 'low';
  document.getElementById('contamPb').textContent = pbLevel.toUpperCase();
  document.getElementById('contamPb').className = `contam-level ${pbLevel}`;

  const tagsEl = document.getElementById('regTags');
  tagsEl.innerHTML = regTags(classKey).map(t =>
    `<span style="padding:3px 12px;border-radius:12px;background:rgba(123,47,190,0.15);color:#a855f7;font-size:0.75rem;font-weight:600;border:1px solid rgba(123,47,190,0.3);">${t}</span>`
  ).join('');

  const steps = protocolSteps(classKey, zincRisk.level);
  document.getElementById('protocolSteps').innerHTML = steps.map((s,i) =>
    `<div class="protocol-step"><div class="step-num">${i+1}</div><span>${s}</span></div>`
  ).join('');

  // ── Environmental ──
  const env = envMetrics(classKey, parseFloat(document.getElementById('econWeight').value) || 10000);
  document.getElementById('envCo2').textContent    = env.co2Saved + ' T CO₂';
  document.getElementById('envCarbon').textContent = env.carbon   + ' T CO₂e';
  document.getElementById('envEff').textContent    = env.recycEff + '%';
  document.getElementById('envMarket').textContent = '₹' + env.marketVal + '/kg';
  const esgEl = document.getElementById('esgBadge');
  esgEl.textContent = env.esg;
  esgEl.className = `esg-badge ${env.esg}`;
  document.getElementById('esgDesc').textContent =
    env.esg === 'A' ? 'Excellent recycling efficiency. Meets ESG benchmark A.' :
    env.esg === 'B' ? 'Good recycling performance. Minor improvements possible.' :
                     'Below ESG threshold. Sorting and contamination control required.';

  // ── Radar ──
  renderRadar(classKey, zincRisk.probability);

  // ── Economics (initial render) ──
  updateEconomics(result);

  // ── Show sections ──
  document.getElementById('resultSection').classList.add('visible');
  document.getElementById('btnExportReport').disabled = false;
  document.getElementById('btnShare').disabled = false;
}

function renderRadar(classKey, zincProb) {
  const ctx = document.getElementById('radarChart').getContext('2d');
  if (radarChartInstance) radarChartInstance.destroy();

  // Axes: [Ferrous Value, Grade Quality, Zinc Risk(inverted), EAF Suitability, Sustainability]
  const radarData = {
    hms1:  [95, 90, 95, 95, 80],
    hms2:  [75, 72, 90, 70, 75],
    galv:  [60, 40, 10, 20, 50],
    ss:    [70, 85, 92, 65, 90],
    nonfe: [5,  10, 85,  0, 60],
    mixed: [40, 30, 70,  5, 35]
  };
  const vals = radarData[classKey] || [50,50,50,50,50];
  // Axis 2 = Zinc Risk (inverted): high zinc probability → low score
  vals[2] = Math.max(0, 100 - Math.round(zincProb * 100));

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Ferrous Value','Grade Quality','Zinc Risk\n(Inverted)','EAF\nSuitability','Sustainability'],
      datasets: [{
        label: classKey.toUpperCase(),
        data: vals,
        backgroundColor: 'rgba(255,45,120,0.15)',
        borderColor: '#FF2D78',
        borderWidth: 2,
        pointBackgroundColor: '#FF2D78',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.07)' },
          angleLines: { color: 'rgba(255,255,255,0.07)' },
          ticks: { display: false },
          pointLabels: { color: '#8888aa', font: { size: 11 } }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function updateEconomics(result) {
  if (!result) return;
  const weightKg = parseFloat(document.getElementById('econWeight').value) || 10000;
  const pricePerTonne = parseFloat(document.getElementById('econPrice').value) || 28000;
  const econ = calculateEconomics(weightKg, pricePerTonne, result.zincRisk.probability, result.classKey);

  document.getElementById('econGross').textContent  = formatInr(econ.grossValue);
  document.getElementById('econUsable').textContent = Math.round(econ.usableKg).toLocaleString('en-IN') + ' kg';
  document.getElementById('econLoss').textContent   = Math.round(econ.lossKg).toLocaleString('en-IN')   + ' kg (' + formatInr(econ.lossValue) + ')';
  document.getElementById('econEafd').textContent   = formatInr(econ.eafdCost);
  document.getElementById('econNet').textContent    = formatInr(econ.netValue);
}

function renderHistory() {
  const history = loadHistory();
  const el = document.getElementById('historyList');
  if (!history.length) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.84rem;text-align:center;padding:20px 0;">No scans yet. Upload an image to begin.</p>';
    return;
  }
  const BADGE_COLORS = {
    hms1:['rgba(0,200,100,0.15)','#00c864'], hms2:['rgba(0,150,255,0.15)','#60a5fa'],
    galv:['rgba(255,45,120,0.15)','#FF2D78'], ss:['rgba(123,47,190,0.15)','#a855f7'],
    nonfe:['rgba(255,170,0,0.15)','#ffaa00'], mixed:['rgba(255,100,0,0.15)','#ff6400']
  };
  el.innerHTML = history.map(h => {
    const [bg,col] = BADGE_COLORS[h.classKey] || ['rgba(255,255,255,0.1)','#fff'];
    const date = new Date(h.ts).toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'});
    const zlColor = h.zincLevel==='HIGH'?'var(--high)':h.zincLevel==='MEDIUM'?'var(--medium)':'var(--low)';
    return `<div class="history-item">
      <span class="history-badge" style="background:${bg};color:${col};">${h.classLabel||h.classKey}</span>
      <span style="font-size:0.78rem;color:${zlColor};">Zn: ${h.zincLevel}</span>
      <span style="font-weight:700;font-size:0.8rem;">${Math.round(h.confidence*100)}%</span>
      <span class="history-time">${date}</span>
    </div>`;
  }).join('');
}
