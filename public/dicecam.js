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
  const PATCH = 28;                // Seitenlänge des ausgeschnittenen Würfelbildes

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
  function patch(src, die, rot) {
    const S = PATCH, out = new Float32Array(S * S * 3);
    const [SW, SH] = dims(src);
    if (fullCanvas.width !== SW || fullCanvas.height !== SH) { fullCanvas.width = SW; fullCanvas.height = SH; }
    const fx = fullCanvas.getContext('2d', { willReadFrequently: true });
    fx.drawImage(src, 0, 0);
    const half = die.size * 0.40, x0 = Math.max(0, Math.floor(die.x - die.size)), y0 = Math.max(0, Math.floor(die.y - die.size));
    const w = Math.min(SW - x0, Math.ceil(die.size * 2)), h = Math.min(SH - y0, Math.ceil(die.size * 2));
    const img = fx.getImageData(x0, y0, w, h).data;
    const ang = die.angle + rot * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1;
      const px = die.x + (u * ca - v * sa) * half - x0, py = die.y + (u * sa + v * ca) * half - y0;
      const ix = Math.max(0, Math.min(w - 1, px | 0)), iy = Math.max(0, Math.min(h - 1, py | 0)), k = (iy * w + ix) * 4, o = (j * S + i) * 3;
      out[o] = img[k]; out[o + 1] = img[k + 1]; out[o + 2] = img[k + 2];
    }
    return out;
  }

  // Merkmale: Druck (dunkel) + Farbanteile, normiert
  function features(p) {
    const S = PATCH, n = S * S, ink = new Float32Array(n), rg = new Float32Array(n), bg = new Float32Array(n);
    let maxL = 1;
    for (let q = 0; q < n; q++) { const L = 0.299 * p[q * 3] + 0.587 * p[q * 3 + 1] + 0.114 * p[q * 3 + 2]; ink[q] = L; if (L > maxL) maxL = L; }
    for (let q = 0; q < n; q++) {
      const r = p[q * 3], g = p[q * 3 + 1], b = p[q * 3 + 2];
      ink[q] = 1 - ink[q] / maxL; rg[q] = (r - g) / 255; bg[q] = (b - g) / 255;
    }
    // weichzeichnen + verkleinern auf 14×14, damit kleine Verschiebungen weniger stören
    const down = (a, s) => { const T = S / s, o = new Float32Array(s * s);
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { let t = 0;
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t += a[(j * T + y) * S + i * T + x]; o[j * s + i] = t / (T * T); }
      return o; };
    const norm = (a, w) => { let m = 0; for (const v of a) m += v; m /= a.length; let sd = 0; for (const v of a) sd += (v - m) ** 2;
      sd = Math.sqrt(sd / a.length) || 1; return Array.from(a, v => (v - m) / sd * w); };
    return [...norm(down(ink, 14), 1), ...norm(down(rg, 7), 0.8), ...norm(down(bg, 7), 0.8)];
  }
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na * nb) || 1); };

  function classify(src, die, model) {
    const scores = FACES.map(() => -1);
    for (let rot = 0; rot < 4; rot++) {
      const f = features(patch(src, die, rot));
      model.faces.forEach((samples, fi) => { for (const s of samples) { const c = cos(f, s); if (c > scores[fi]) scores[fi] = c; } });
    }
    const order = scores.map((s, i) => [s, i]).sort((p, q) => q[0] - p[0]);
    return { face: order[0][1], score: order[0][0], margin: order[0][0] - order[1][0] };
  }

  const DiceCV = { FACES, findDice, patch, features, classify };
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
  let stream = null, raf = 0, stable = 0, lastCenters = null, lastStableKey = '', moved = true;
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
      <div class="dc-view"><video playsinline muted autoplay></video><canvas class="dc-ov"></canvas><div class="dc-hint"></div></div>
      <div class="dc-panel"></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-x]').onclick = close;
    const video = el.querySelector('video'), ov = el.querySelector('.dc-ov'), hint = el.querySelector('.dc-hint'), panel = el.querySelector('.dc-panel');

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

    const state = { mode: ctx.getModel() ? 'scan' : 'teach', teachFace: 0, throwNo: 1, pid: ctx.nextPlayer() || ctx.game.players[0], col: ctx.col || 0, result: null };
    let model = ctx.getModel();

    const renderPanel = () => {
      const g = ctx.game;
      if (state.mode === 'teach') {
        const counts = FACES.map((_, i) => model?.faces?.[i]?.length || 0);
        panel.innerHTML = `<div class="dc-title">🎓 Würfel anlernen</div>
          <p class="muted" style="margin:4px 0 10px">Lege alle Würfel so hin, dass sie <b>dieselbe Seite</b> zeigen, wähle die Seite und tippe auf „Erfassen“. Für jede Seite 1–2 Mal, gern mit gedrehten Würfeln.</p>
          <div class="dc-faces">${FACES.map((f, i) => `<button class="dc-face ${state.teachFace === i ? 'on' : ''}" data-tf="${i}">${ctx.faceLabels[i]}<small>${counts[i]} ✓</small></button>`).join('')}</div>
          <div class="row" style="margin-top:10px"><button class="btn primary grow" data-cap>📸 Erfassen</button>
            <button class="btn grow" data-done ${counts.every(n => n) ? '' : 'disabled'}>Fertig</button></div>
          ${model ? '<button class="btn small" data-reset style="margin-top:8px">Angelerntes löschen</button>' : ''}`;
        panel.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { state.teachFace = +b.dataset.tf; renderPanel(); });
        panel.querySelector('[data-cap]').onclick = capture;
        panel.querySelector('[data-done]').onclick = async () => { await ctx.saveModel(model); state.mode = 'scan'; renderPanel(); ctx.toast('Gelernt ✓ – jetzt würfeln!'); };
        const rs = panel.querySelector('[data-reset]'); if (rs) rs.onclick = async () => { model = null; await ctx.saveModel(null); renderPanel(); };
        return;
      }
      const sheet = g.scores[state.pid][state.col] || {};
      const r = state.result;
      panel.innerHTML = `<div class="dc-who">${g.players.map(pid => `<button class="dc-p ${pid === state.pid ? 'on' : ''}" data-pid="${pid}">${ctx.avatar(pid)}<span>${ctx.playerName(pid)}</span></button>`).join('')}</div>
        <div class="dc-opts">${g.columns > 1 ? `<div class="dc-seg"><span>Spalte</span>${Array.from({ length: g.columns }, (_, i) => `<button class="${i === state.col ? 'on' : ''}" data-col="${i}">${i + 1}<small>×${g.multipliers[i]}</small></button>`).join('')}</div>` : ''}
          <div class="dc-seg"><span>Wurf</span>${[1, 2, 3].map(n => `<button class="${n === state.throwNo ? 'on' : ''}" data-th="${n}">${n}</button>`).join('')}</div></div>
        ${r ? `<div class="dc-res">${r.faces.map((f, i) => `<span class="dc-die ${r.weak[i] ? 'weak' : ''}">${ctx.faceLabels[f]}</span>`).join('')}</div>
          ${r.weak.some(Boolean) ? '<p class="muted" style="margin:4px 0;font-size:12px">⚠️ Gelb markierte Würfel sind unsicher – bitte prüfen.</p>' : ''}
          <div class="dc-sugg">${suggestions(r.faces.map(f => f + 1), state.throwNo, g, sheet).map(s => `<button class="btn ${s.fig ? 'primary' : ''}" data-k="${s.k}" data-v="${s.v}">
            ${s.fig ? s.label : `${s.n}× ${ctx.faceLabels[+s.k - 1]}`} <b>${s.v}</b></button>`).join('') || '<p class="muted">Kein passendes freies Feld – über die Tabelle streichen.</p>'}</div>`
          : `<div class="dc-wait">🎲 Würfle – sobald die Würfel ruhig liegen, erkenne ich sie.</div>`}
        <div class="row" style="margin-top:8px"><button class="btn small" data-teach>🎓 Neu anlernen</button><span class="grow"></span><span class="muted" style="font-size:11px">Prototyp – Ergebnis immer kurz prüfen</span></div>`;
      panel.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { state.pid = b.dataset.pid; renderPanel(); });
      panel.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { state.col = +b.dataset.col; renderPanel(); });
      panel.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { state.throwNo = +b.dataset.th; renderPanel(); });
      panel.querySelector('[data-teach]').onclick = () => { state.mode = 'teach'; renderPanel(); };
      panel.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
        await ctx.enter(state.pid, state.col, b.dataset.k, +b.dataset.v);
        state.result = null; state.throwNo = 1; lastStableKey = ''; moved = true;
        state.pid = ctx.nextPlayer() || state.pid; renderPanel();
      });
    };

    function capture() {
      const found = findDice(video).dice;
      if (!found.length) { ctx.toast('Keine Würfel gefunden – heller Würfel auf dunklem Untergrund?'); return; }
      model ||= { faces: FACES.map(() => []) };
      for (const d of found) model.faces[state.teachFace].push(features(patch(video, d, 0)).map(v => Math.round(v * 1000) / 1000));
      model.faces[state.teachFace] = model.faces[state.teachFace].slice(-15);
      ctx.toast(`${found.length} Würfel als „${ctx.faceLabels[state.teachFace]}“ gelernt`);
      if (state.teachFace < 5 && model.faces[state.teachFace].length >= 2) state.teachFace++;
      renderPanel();
    }

    renderPanel();
    let last = 0;
    const loop = t => {
      raf = requestAnimationFrame(loop);
      if (t - last < 140 || video.readyState < 2) return; last = t;
      const vw = video.videoWidth, vh = video.videoHeight;
      ov.width = ov.clientWidth * devicePixelRatio; ov.height = ov.clientHeight * devicePixelRatio;
      const det = findDice(video), dice = det.dice;
      // Darstellung: Video wird vollständig angezeigt (object-fit: contain)
      const sc = Math.min(ov.width / vw, ov.height / vh), offX = (ov.width - vw * sc) / 2, offY = (ov.height - vh * sc) / 2;
      const o = ov.getContext('2d'); o.clearRect(0, 0, ov.width, ov.height);
      // Ruhe-Erkennung
      const centers = dice.map(d => [d.x / vw, d.y / vh]);
      const still = lastCenters && lastCenters.length === centers.length && centers.every((c, i) => Math.hypot(c[0] - lastCenters[i][0], c[1] - lastCenters[i][1]) < 0.012);
      stable = still ? stable + 1 : 0; if (!still) moved = true;
      lastCenters = centers;
      dice.forEach((d, i) => {
        o.save(); o.translate(offX + d.x * sc, offY + d.y * sc); o.rotate(d.angle);
        const s = d.size * sc; o.lineWidth = 3 * devicePixelRatio;
        o.strokeStyle = state.result && state.result.weak[i] ? '#facc15' : stable > 3 ? '#4ade80' : 'rgba(255,255,255,.7)';
        o.strokeRect(-s / 2, -s / 2, s, s);
        if (state.result && state.mode === 'scan' && state.result.faces[i] !== undefined) {
          o.rotate(-d.angle); o.fillStyle = '#f2cf63'; o.font = `900 ${Math.max(16, s * 0.45)}px Inter, sans-serif`; o.textAlign = 'center';
          o.fillText(ctx.faceLabels[state.result.faces[i]], 0, -s * 0.65);
        }
        o.restore();
      });
      hint.classList.toggle('show', !dice.length);
      hint.innerHTML = '🎲 Keine Würfel im Bild<br><small>Handy von oben über die Würfel halten, helle Würfel auf dunklem Untergrund</small>';
      if (state.mode === 'scan' && model && stable === 5 && dice.length === 5 && moved) {
        const res = dice.map(d => classify(video, d, model));
        const key = res.map(r => r.face).join(',') + '|' + centers.map(c => c.map(v => v.toFixed(2)).join(':')).join(',');
        if (key !== lastStableKey) {
          if (state.result) state.throwNo = Math.min(3, state.throwNo + 1);
          lastStableKey = key; moved = false;
          state.result = { faces: res.map(r => r.face), weak: res.map(r => r.margin < 0.04 || r.score < 0.55) };
          navigator.vibrate && navigator.vibrate(30);
          renderPanel();
        }
      }
    };
    raf = requestAnimationFrame(loop);
  }
})();
