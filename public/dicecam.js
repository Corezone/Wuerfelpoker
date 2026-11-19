// =====================================================================
//  Würfelpoker – Kamera-Erkennung für Pokerwürfel  (PROTOTYP)
//  Läuft komplett im Browser. Ablauf:
//   1. Würfel im Bild finden (helle, wenig farbige Flächen auf dunklerem Grund)
//   2. Jeden Würfel gerade ausrichten und als kleines Merkmalsbild ausschneiden
//   3. Mit angelernten Mustern der 6 Seiten (9, 10, B, D, K, A) vergleichen
// =====================================================================
(function () {
  'use strict';
  const FACES = ['9', '10', 'B', 'D', 'K', 'A'];
  const WORK_W = 360;              // Arbeitsbreite für die Würfelsuche
  const PATCH = 32;                // Seitenlänge des ausgeschnittenen Würfelbildes

  // ---------- Bildverarbeitung ----------
  function otsu(values) {
    const hist = new Array(256).fill(0);
    for (const v of values) hist[Math.max(0, Math.min(255, v | 0))]++;
    const total = values.length; let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }

  // Video meldet seine echte Größe über videoWidth/videoHeight, Bilder/Canvas über width/height
  const dims = src => [src.videoWidth || src.naturalWidth || src.width, src.videoHeight || src.naturalHeight || src.height];

  // Findet Würfel als zusammenhängende helle Flächen. Gibt Mittelpunkt, Drehung und Größe zurück.
  function findDice(src) {
    const [SW, SH] = dims(src); if (!SW || !SH) return { dice: [] };
    const scale = WORK_W / SW, W = WORK_W, H = Math.round(SH * scale);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const score = new Float32Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      score[p] = Math.max(0, Math.min(255, 0.299 * r + 0.587 * g + 0.114 * b - 1.1 * (mx - mn)));
    }
    const thr = Math.max(90, otsu(score));
    let mask = new Uint8Array(W * H);
    for (let p = 0; p < mask.length; p++) mask[p] = score[p] > thr ? 1 : 0;
    // Symbole auf den Würfeln sind dunkel → Löcher schließen (dilatieren, dann erodieren)
    const morph = (m, dil, it) => {
      for (let n = 0; n < it; n++) {
        const o = new Uint8Array(m.length);
        for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
          const p = yy * W + xx;
          const s = m[p - 1] + m[p + 1] + m[p - W] + m[p + W] + m[p - W - 1] + m[p - W + 1] + m[p + W - 1] + m[p + W + 1] + m[p];
          o[p] = dil ? (s > 0 ? 1 : 0) : (s === 9 ? 1 : 0);
        }
        m = o;
      }
      return m;
    };
    mask = morph(mask, true, 3); mask = morph(mask, false, 3);
    // Löcher innerhalb der Würfel füllen: Hintergrund vom Rand aus fluten
    const bg = new Uint8Array(W * H), stack = [];
    for (let xx = 0; xx < W; xx++) { stack.push(xx, (H - 1) * W + xx); }
    for (let yy = 0; yy < H; yy++) { stack.push(yy * W, yy * W + W - 1); }
    while (stack.length) {
      const p = stack.pop(); if (bg[p] || mask[p]) continue; bg[p] = 1;
      const xx = p % W, yy = (p / W) | 0;
      if (xx > 0) stack.push(p - 1); if (xx < W - 1) stack.push(p + 1);
      if (yy > 0) stack.push(p - W); if (yy < H - 1) stack.push(p + W);
    }
    for (let p = 0; p < mask.length; p++) if (!bg[p]) mask[p] = 1;

    // Zusammenhängende Flächen
    const label = new Int32Array(W * H), dice = [];
    let lab = 0;
    const minA = W * H * 0.002, maxA = W * H * 0.2;
    for (let p0 = 0; p0 < mask.length; p0++) {
      if (!mask[p0] || label[p0]) continue;
      lab++; const st = [p0]; label[p0] = lab;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; const edge = [];
      while (st.length) {
        const p = st.pop(); const xx = p % W, yy = (p / W) | 0;
        n++; sx += xx; sy += yy; sxx += xx * xx; syy += yy * yy; sxy += xx * yy;
        if (xx === 0 || yy === 0 || xx === W - 1 || yy === H - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - W] || !mask[p + W]) edge.push(xx, yy);
        const nb = [xx > 0 ? p - 1 : -1, xx < W - 1 ? p + 1 : -1, yy > 0 ? p - W : -1, yy < H - 1 ? p + W : -1];
        for (const q of nb) if (q >= 0 && mask[q] && !label[q]) { label[q] = lab; st.push(q); }
      }
      if (n < minA || n > maxA) continue;
      const mx = sx / n, my = sy / n;
      const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
      // Hauptachsen → Ausrichtung und Seitenlängen
      const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
      const a = Math.sqrt(12 * l1), b = Math.sqrt(12 * Math.max(l2, 1e-6));
      const squareness = b / a, fill = n / (a * b);
      if (squareness < 0.6 || fill < 0.7 || fill > 1.25) continue;
      // Drehung eines Quadrats: die Ecken liegen am weitesten vom Mittelpunkt entfernt.
      // 4-fache Winkelsymmetrie → Mittelwert über 4·φ, gewichtet mit r⁴ (Ecken dominieren)
      let C = 0, Sn = 0;
      for (let e = 0; e < edge.length; e += 2) {
        const dx = edge[e] - mx, dy = edge[e + 1] - my, r2 = dx * dx + dy * dy, ph = Math.atan2(dy, dx), w = r2 * r2;
        C += w * Math.cos(4 * ph); Sn += w * Math.sin(4 * ph);
      }
      const angle = (Math.atan2(Sn, C) - Math.PI) / 4;
      dice.push({ x: mx / scale, y: my / scale, size: Math.sqrt(n) / scale, angle, area: n, pca: theta });
    }
    // Größte zuerst, max. 5 Würfel
    dice.sort((p, q) => q.area - p.area);
    return { dice: dice.slice(0, 5), workW: W, workH: H };
  }

  // Würfel gerade ausschneiden (Innenbereich, ohne Kanten)
  const fullCanvas = document.createElement('canvas');
  let frameTick = 0;   // neues Kamerabild → einmal neu zeichnen
  // Würfelfläche ausschneiden und gerade drehen (mit Flächenmittelung gegen Treppeneffekte)
  function patch(src, die, rot = 0) {
    const S = PATCH, SS = 3, out = new Float32Array(S * S * 3);
    const [SW, SH] = dims(src);
    if (fullCanvas.width !== SW || fullCanvas.height !== SH) { fullCanvas.width = SW; fullCanvas.height = SH; }
    const fx = fullCanvas.getContext('2d', { willReadFrequently: true });
    if (fullCanvas._src !== src || fullCanvas._t !== frameTick) { fx.drawImage(src, 0, 0); fullCanvas._src = src; fullCanvas._t = frameTick; }
    const half = die.size * 0.44, x0 = Math.max(0, Math.floor(die.x - die.size)), y0 = Math.max(0, Math.floor(die.y - die.size));
    const w = Math.max(1, Math.min(SW - x0, Math.ceil(die.size * 2))), h = Math.max(1, Math.min(SH - y0, Math.ceil(die.size * 2)));
    const img = fx.getImageData(x0, y0, w, h).data;
    const ang = die.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      let r = 0, g = 0, bl = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (i + (sx + 0.5) / SS) / S * 2 - 1, v = (j + (sy + 0.5) / SS) / S * 2 - 1;
        const px = die.x + (u * ca - v * sa) * half - x0, py = die.y + (u * sa + v * ca) * half - y0;
        const ix = Math.max(0, Math.min(w - 1, px | 0)), iy = Math.max(0, Math.min(h - 1, py | 0)), k = (iy * w + ix) * 4;
        r += img[k]; g += img[k + 1]; bl += img[k + 2];
      }
      const o = (j * S + i) * 3; out[o] = r / 9; out[o + 1] = g / 9; out[o + 2] = bl / 9;
    }
    let p = out; for (let k = 0; k < rot; k++) p = rot90(p);
    return p;
  }
  function rot90(p) {
    const S = PATCH, o = new Float32Array(p.length);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = (j * S + i) * 3, b = (i * S + (S - 1 - j)) * 3; o[b] = p[a]; o[b + 1] = p[a + 1]; o[b + 2] = p[a + 2]; }
    return o;
  }

  // Merkmale v2: Aufdruck (16×16) + Farbanteile (8×8) + Kantenrichtungen (4×4 Zellen × 8 Richtungen)
  const MODEL_V = 2;
  function features(p) {
    const S = PATCH, n = S * S, L = new Float32Array(n), ink = new Float32Array(n), rg = new Float32Array(n), bg = new Float32Array(n);
    let maxL = 1;
    for (let q = 0; q < n; q++) { L[q] = 0.299 * p[q * 3] + 0.587 * p[q * 3 + 1] + 0.114 * p[q * 3 + 2]; if (L[q] > maxL) maxL = L[q]; }
    for (let q = 0; q < n; q++) { ink[q] = 1 - L[q] / maxL; rg[q] = (p[q * 3] - p[q * 3 + 1]) / 255; bg[q] = (p[q * 3 + 2] - p[q * 3 + 1]) / 255; }
    const down = (a, s) => { const T = S / s, o = new Float32Array(s * s);
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { let t = 0;
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t += a[(j * T + y) * S + i * T + x]; o[j * s + i] = t / (T * T); }
      return o; };
    const norm = (a, w) => { let m = 0; for (const v of a) m += v; m /= a.length; let sd = 0; for (const v of a) sd += (v - m) ** 2;
      sd = Math.sqrt(sd / a.length) || 1; return Array.from(a, v => (v - m) / sd * w); };
    // Kantenrichtungs-Histogramm (HOG-ähnlich): beschreibt die Form, unabhängig von Helligkeit
    const C = 4, B = 8, cs = S / C, H = new Float32Array(C * C * B);
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const gx = L[y * S + x + 1] - L[y * S + x - 1], gy = L[(y + 1) * S + x] - L[(y - 1) * S + x], m = Math.hypot(gx, gy);
      if (m < 4) continue;
      let a = Math.atan2(gy, gx); if (a < 0) a += Math.PI;
      const bf = a / Math.PI * B, b0 = Math.floor(bf) % B, b1 = (b0 + 1) % B, w1 = bf - Math.floor(bf);
      const o = (Math.min(C - 1, (y / cs) | 0) * C + Math.min(C - 1, (x / cs) | 0)) * B;
      H[o + b0] += m * (1 - w1); H[o + b1] += m * w1;
    }
    for (let c = 0; c < C * C; c++) { let t = 0; for (let k = 0; k < B; k++) t += H[c * B + k] ** 2; t = Math.sqrt(t) + 1e-3;
      for (let k = 0; k < B; k++) H[c * B + k] = Math.min(0.25, H[c * B + k] / t); }
    const base = [...norm(down(ink, 16), 1), ...norm(down(rg, 8), 0.8), ...norm(down(bg, 8), 0.8)];
    return [...base, ...norm(H, Math.sqrt(base.length / H.length))];
  }
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; const l = Math.min(a.length, b.length); for (let i = 0; i < l; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na * nb) || 1); };

  // Ähnlichkeit je Seite: Mittel der 2 besten Muster, beste der 4 Drehungen
  function scoreDie(src, die, model) {
    const scores = FACES.map(() => -1); let bestFeat = null, best = -2;
    let p = patch(src, die, 0);
    for (let rot = 0; rot < 4; rot++, p = rot90(p)) {
      const f = features(p);
      model.faces.forEach((samples, fi) => {
        let a = -1, b = -1;
        for (const smp of samples) { const c = cos(f, smp); if (c > a) { b = a; a = c; } else if (c > b) b = c; }
        const sc = b > -1 ? (a + b) / 2 : a;
        if (sc > scores[fi]) scores[fi] = sc;
        if (sc > best) { best = sc; bestFeat = f; }
      });
    }
    return { scores, feat: bestFeat };
  }
  function classify(src, die, model) {
    const { scores } = scoreDie(src, die, model);
    const order = scores.map((v, i) => [v, i]).sort((p, q) => q[0] - p[0]);
    return { face: order[0][1], score: order[0][0], margin: order[0][0] - order[1][0], scores };
  }
  // Varianten für robusteres Anlernen (leicht gedreht / skaliert)
  const variants = d => [d, { ...d, angle: d.angle + 0.1 }, { ...d, angle: d.angle - 0.1 }, { ...d, size: d.size * 0.94 }, { ...d, size: d.size * 1.06 }];
  // Würfel zweier Bilder einander zuordnen (nächster Nachbar), statt nach Reihenfolge
  function matchDice(a, b) {
    const used = new Set(), pairs = [];
    for (let i = 0; i < a.length; i++) {
      let bj = -1, bd = Infinity;
      for (let j = 0; j < b.length; j++) { if (used.has(j)) continue; const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y); if (d < bd) { bd = d; bj = j; } }
      if (bj >= 0) { used.add(bj); pairs.push([i, bj, bd]); }
    }
    return pairs;
  }

  const DiceCV = { FACES, findDice, patch, features, classify, scoreDie, matchDice, variants, MODEL_V };
  window.DiceCV = DiceCV;

  // ---------- Vorschläge aus 5 Würfeln ----------
  // Würfelseiten → Werte: 9=1, 10=2, B=3, D=4, K=5, A=6
  function suggestions(values, throwNo, g, sheet) {
    const c = [0, 0, 0, 0, 0, 0, 0]; values.forEach(v => c[v]++);
    const counts = c.slice(1), mx = Math.max(...counts), distinct = counts.filter(Boolean).length;
    const out = [], served = throwNo === 1, fig = (k, label) => {
      const v = g.figures[k][served ? 1 : 0];
      out.push({ k, label: label + (served ? ' serviert' : ''), v, fig: true });
    };
    if (mx === 5) fig('grande', 'Grande');
    if (mx >= 4) fig('poker', 'Poker');
    if (counts.includes(3) && counts.includes(2)) fig('full', 'Full House');
    if (distinct === 5 && (!c[1] || !c[6])) fig('strasse', 'Straße');
    for (let k = 1; k <= 6; k++) if (c[k]) out.push({ k: String(k), label: null, v: c[k] * k, n: c[k] });
    return out.filter(s => sheet[s.k] === undefined).sort((p, q) => (q.fig - p.fig) || (q.v - p.v));
  }
  DiceCV.suggestions = suggestions;

  // ---------- Oberfläche ----------
  let stream = null, raf = 0;
  window.DiceCam = { open, close };

  function close() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) stream.getTracks().forEach(t => t.stop()); stream = null;
    document.getElementById('dicecam')?.remove();
  }

  async function open(ctx) {
    // ctx: { game, faceLabels, getModel, saveModel, enter(pid, col, k, v), playerName, nextPlayer, avatar, toast }
    close();
    const el = document.createElement('div'); el.id = 'dicecam';
    el.innerHTML = `
      <div class="dc-top"><span class="dc-proto">🧪 PROTOTYP</span><b>Kamera-Erkennung</b><button class="btn small" data-x>✕</button></div>
      <div class="dc-view"><video playsinline muted autoplay></video><canvas class="dc-ov"></canvas><div class="dc-hint"></div><div class="dc-status"></div></div>
      <div class="dc-panel"></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-x]').onclick = close;
    const video = el.querySelector('video'), ov = el.querySelector('.dc-ov'), hint = el.querySelector('.dc-hint'), panel = el.querySelector('.dc-panel'), status = el.querySelector('.dc-status');

    if (!navigator.mediaDevices?.getUserMedia) {
      hint.innerHTML = '📷 Die Kamera ist hier nicht verfügbar.<br><br>Der Browser erlaubt die Kamera nur über <b>HTTPS</b> – z. B. über die Home-Assistant-App mit Nabu Casa oder deine eigene Domain, nicht über <code>http://IP</code>.';
      hint.classList.add('show'); return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    } catch (e) {
      hint.innerHTML = '📷 Kein Kamerazugriff: ' + (e.message || e.name) + '<br><br>Bitte die Kamera-Berechtigung für diese Seite erlauben.';
      hint.classList.add('show'); return;
    }
    video.srcObject = stream; await video.play().catch(() => {});

    let model = ctx.getModel();
    const outdated = model && model.v !== MODEL_V;
    if (outdated) model = null;
    const state = { mode: model ? 'scan' : 'teach', teachFace: 0, throwNo: 1, pid: ctx.nextPlayer() || ctx.game.players[0], col: ctx.col || 0,
      result: null, fix: -1, outdated };
    // Bewegungs-/Abstimmungs-Zustand
    let prev = [], moveFrames = 0, stillFrames = 0, phase = 'moving', votes = null, voteFrames = 0, ref = null;
    let saveTimer = null;
    const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => ctx.saveModel(model), 800); };

    const renderPanel = () => {
      const g = ctx.game;
      if (state.mode === 'teach') {
        const counts = FACES.map((_, i) => model?.faces?.[i]?.length || 0);
        panel.innerHTML = `<div class="dc-title">🎓 Würfel anlernen</div>
          ${state.outdated ? '<p class="dc-note">✨ Die Erkennung wurde verbessert – bitte einmal neu anlernen.</p>' : ''}
          <p class="muted" style="margin:4px 0 10px">Lege alle Würfel so hin, dass sie <b>dieselbe Seite</b> zeigen, wähle die Seite und tippe auf „Erfassen“. Für jede Seite <b>2×</b>, beim zweiten Mal die Würfel etwas drehen und verschieben.</p>
          <div class="dc-faces">${FACES.map((f, i) => `<button class="dc-face ${state.teachFace === i ? 'on' : ''}" data-tf="${i}">${ctx.faceLabels[i]}<small>${((state.caps && state.caps[i]) || 0) >= 2 || (counts[i] && !(state.caps && state.caps[i])) ? '✓' : `${(state.caps && state.caps[i]) || 0}/2`}</small></button>`).join('')}</div>
          <div class="row" style="margin-top:10px"><button class="btn primary grow" data-cap>📸 Erfassen</button>
            <button class="btn grow" data-done ${counts.every(n => n) ? '' : 'disabled'}>Fertig</button></div>
          ${model ? '<button class="btn small" data-reset style="margin-top:8px">Angelerntes löschen</button>' : ''}`;
        panel.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { state.teachFace = +b.dataset.tf; renderPanel(); });
        panel.querySelector('[data-cap]').onclick = capture;
        panel.querySelector('[data-done]').onclick = async () => { await ctx.saveModel(model); state.mode = 'scan'; state.outdated = false; phase = 'moving'; renderPanel(); ctx.toast('Gelernt ✓ – jetzt würfeln!'); };
        const rs = panel.querySelector('[data-reset]'); if (rs) rs.onclick = async () => { model = null; await ctx.saveModel(null); renderPanel(); };
        return;
      }
      const sheet = g.scores[state.pid][state.col] || {};
      const r = state.result;
      panel.innerHTML = `<div class="dc-who">${g.players.map(pid => `<button class="dc-p ${pid === state.pid ? 'on' : ''}" data-pid="${pid}">${ctx.avatar(pid)}<span>${ctx.playerName(pid)}</span></button>`).join('')}</div>
        <div class="dc-opts">${g.columns > 1 ? `<div class="dc-seg"><span>Spalte</span>${Array.from({ length: g.columns }, (_, i) => `<button class="${i === state.col ? 'on' : ''}" data-col="${i}">${i + 1}<small>×${g.multipliers[i]}</small></button>`).join('')}</div>` : ''}
          <div class="dc-seg"><span>Wurf</span>${[1, 2, 3].map(n => `<button class="${n === state.throwNo ? 'on' : ''}" data-th="${n}">${n}</button>`).join('')}</div></div>
        ${r ? `<div class="dc-res ${r.shown ? 'still' : ''}">${r.faces.map((f, i) => `<button class="dc-die ${r.weak[i] ? 'weak' : ''} ${state.fix === i ? 'fixing' : ''}" data-die="${i}">${ctx.faceLabels[f]}</button>`).join('')}</div>
          ${state.fix >= 0 ? `<div class="dc-fix"><span>Richtig ist:</span>${FACES.map((_, fi) => `<button data-setface="${fi}">${ctx.faceLabels[fi]}</button>`).join('')}</div>`
            : `<p class="muted" style="margin:4px 0;font-size:12px;text-align:center">${r.weak.some(Boolean) ? '⚠️ Gelbe Würfel sind unsicher. ' : ''}Falsch erkannt? Würfel antippen und korrigieren – die App lernt mit.</p>`}
          <div class="dc-sugg">${suggestions(r.faces.map(f => f + 1), state.throwNo, g, sheet).map(s => `<button class="btn ${s.fig ? 'primary' : ''}" data-k="${s.k}" data-v="${s.v}">
            ${s.fig ? s.label : `${s.n}× ${ctx.faceLabels[+s.k - 1]}`} <b>${s.v}</b></button>`).join('') || '<p class="muted">Kein passendes freies Feld – über die Tabelle streichen.</p>'}</div>`
          : `<div class="dc-wait">🎲 Würfle – sobald die Würfel ruhig liegen, erkenne ich sie.</div>`}
        <div class="row" style="margin-top:8px"><button class="btn small" data-teach>🎓 Neu anlernen</button>${r ? '<button class="btn small" data-rescan>🔄 Neu erkennen</button>' : ''}<span class="grow"></span><span class="muted" style="font-size:11px">Prototyp – Ergebnis kurz prüfen</span></div>`;
      if (r) r.shown = true;
      panel.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { state.pid = b.dataset.pid; renderPanel(); });
      panel.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { state.col = +b.dataset.col; renderPanel(); });
      panel.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { state.throwNo = +b.dataset.th; renderPanel(); });
      panel.querySelector('[data-teach]').onclick = () => { state.mode = 'teach'; renderPanel(); };
      const rsc = panel.querySelector('[data-rescan]'); if (rsc) rsc.onclick = () => { phase = 'moving'; stillFrames = 0; state.fix = -1; };
      panel.querySelectorAll('[data-die]').forEach(b => b.onclick = () => { state.fix = state.fix === +b.dataset.die ? -1 : +b.dataset.die; renderPanel(); });
      panel.querySelectorAll('[data-setface]').forEach(b => b.onclick = () => {
        const i = state.fix, f = +b.dataset.setface; if (i < 0) return;
        const old = r.faces[i]; r.faces[i] = f; r.weak[i] = false; state.fix = -1;
        // Lerneffekt: dieses Würfelbild als Muster für die richtige Seite merken
        if (old !== f && r.feats[i]) {
          model.faces[f].push(r.feats[i].map(v => Math.round(v * 100) / 100));
          model.faces[f] = model.faces[f].slice(-50); saveSoon();
          ctx.toast(`Gemerkt: das ist ${ctx.faceLabels[f]} 👍`);
        }
        renderPanel();
      });
      panel.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
        await ctx.enter(state.pid, state.col, b.dataset.k, +b.dataset.v);
        state.result = null; state.throwNo = 1; state.fix = -1; phase = 'moving';
        state.pid = ctx.nextPlayer() || state.pid; renderPanel();
      });
    };

    function capture() {
      frameTick++;
      const found = findDice(video).dice;
      if (!found.length) { ctx.toast('Keine Würfel gefunden – heller Würfel auf dunklem Untergrund?'); return; }
      model ||= { v: MODEL_V, faces: FACES.map(() => []) };
      for (const d of found) for (const vd of variants(d)) model.faces[state.teachFace].push(features(patch(video, vd, 0)).map(v => Math.round(v * 100) / 100));
      model.faces[state.teachFace] = model.faces[state.teachFace].slice(-50);
      ctx.toast(`${found.length} Würfel als „${ctx.faceLabels[state.teachFace]}“ gelernt`);
      state.caps = state.caps || {}; state.caps[state.teachFace] = (state.caps[state.teachFace] || 0) + 1;
      if (state.teachFace < 5 && state.caps[state.teachFace] >= 2) state.teachFace++;
      renderPanel();
    }

    renderPanel();
    let last = 0;
    const loop = t => {
      raf = requestAnimationFrame(loop);
      if (t - last < 140 || video.readyState < 2) return; last = t; frameTick++;
      const vw = video.videoWidth, vh = video.videoHeight, diag = Math.hypot(vw, vh);
      ov.width = ov.clientWidth * devicePixelRatio; ov.height = ov.clientHeight * devicePixelRatio;
      const dice = findDice(video).dice;
      const sc = Math.min(ov.width / vw, ov.height / vh), offX = (ov.width - vw * sc) / 2, offY = (ov.height - vh * sc) / 2;
      const o = ov.getContext('2d'); o.clearRect(0, 0, ov.width, ov.height);

      // --- Bewegung erkennen: Würfel nach Position zuordnen, nicht nach Reihenfolge ---
      const pairs = matchDice(dice, prev), maxMove = pairs.reduce((m, p) => Math.max(m, p[2] / diag), 0);
      const changed = dice.length !== prev.length || maxMove > 0.025;
      if (changed) { moveFrames++; stillFrames = 0; } else { stillFrames++; moveFrames = 0; }
      if (moveFrames >= 2 && phase !== 'moving') { phase = 'moving'; votes = null; }
      prev = dice;

      if (state.mode === 'scan' && model) {
        if (phase === 'moving' && stillFrames >= 4 && dice.length === 5) { phase = 'voting'; ref = dice; votes = dice.map(() => FACES.map(() => 0)); voteFrames = 0; ref.feats = []; }
        if (phase === 'voting') {
          if (dice.length !== 5) phase = 'moving';
          else {
            // über 3 Bilder abstimmen: Ähnlichkeiten je Würfel aufsummieren
            for (const [i, j] of matchDice(ref, dice)) { const r = scoreDie(video, dice[j], model); r.scores.forEach((v, f) => votes[i][f] += v); ref.feats[i] = r.feat; }
            if (++voteFrames >= 3) finalize();
          }
        }
      }
      // --- Zeichnen ---
      const showRes = state.result && phase === 'done';
      dice.forEach(d => {
        o.save(); o.translate(offX + d.x * sc, offY + d.y * sc); o.rotate(d.angle);
        const s = d.size * sc; o.lineWidth = 3 * devicePixelRatio;
        o.strokeStyle = phase === 'voting' ? '#7dd3fc' : stillFrames > 3 ? '#4ade80' : 'rgba(255,255,255,.7)';
        o.strokeRect(-s / 2, -s / 2, s, s); o.restore();
      });
      if (showRes) state.result.pos.forEach((p, i) => {
        const s = p.size * sc, x = offX + p.x * sc, y = offY + p.y * sc;
        if (state.result.weak[i]) { o.save(); o.translate(x, y); o.rotate(p.angle); o.strokeStyle = '#facc15'; o.lineWidth = 4 * devicePixelRatio; o.strokeRect(-s / 2, -s / 2, s, s); o.restore(); }
        o.fillStyle = state.result.weak[i] ? '#facc15' : '#f2cf63'; o.font = `900 ${Math.max(16, s * 0.45)}px Inter, sans-serif`; o.textAlign = 'center';
        o.strokeStyle = 'rgba(0,0,0,.7)'; o.lineWidth = 4 * devicePixelRatio; o.strokeText(ctx.faceLabels[state.result.faces[i]], x, y - s * 0.62);
        o.fillText(ctx.faceLabels[state.result.faces[i]], x, y - s * 0.62);
      });
      hint.classList.toggle('show', !dice.length);
      hint.innerHTML = '🎲 Keine Würfel im Bild<br><small>Handy von oben über die Würfel halten, helle Würfel auf dunklem Untergrund</small>';
      status.textContent = state.mode !== 'scan' ? '' : phase === 'voting' ? '🔎 Erkenne …' : phase === 'moving' ? (dice.length === 5 ? '⏳ Warte, bis die Würfel ruhig liegen' : `🎲 ${dice.length}/5 Würfel im Bild`) : '';
    };

    function finalize() {
      phase = 'done';
      const faces = [], weak = [];
      votes.forEach(v => { const o = v.map((x, i) => [x / 3, i]).sort((a, b) => b[0] - a[0]); faces.push(o[0][1]); weak.push(o[0][0] - o[1][0] < 0.035 || o[0][0] < 0.5); });
      const prevRes = state.result;
      // Gleiches Bild wie vorher (nur kurz verdeckt)? Dann kein neuer Wurf
      const same = prevRes && faces.slice().sort().join() === prevRes.faces.slice().sort().join()
        && matchDice(ref, prevRes.pos).every(p => p[2] < Math.hypot(video.videoWidth, video.videoHeight) * 0.04);
      if (prevRes && !same) state.throwNo = Math.min(3, state.throwNo + 1);
      state.result = { faces, weak, feats: ref.feats, pos: ref.map(d => ({ x: d.x, y: d.y, size: d.size, angle: d.angle })) };
      state.fix = -1;
      if (!same) { navigator.vibrate && navigator.vibrate(30); }
      renderPanel();
    }
    raf = requestAnimationFrame(loop);
  }
})();
