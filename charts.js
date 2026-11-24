/* Tiny dependency-free SVG charts (work offline). */
const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nice = max => { if (max <= 4) return 4; const p = 10 ** Math.floor(Math.log10(max)) / 2; return Math.ceil(max / (p * 4)) * p * 4; };

  /* Vertical grouped bars. series: [{name, values:[]}] */
  function bars(el, labels, series, { height = 260, ariaLabel = "Bar chart", rawLabels = false } = {}) {
    const W = 760, H = height, m = { l: 40, r: 10, t: 10, b: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = nice(Math.max(1, ...series.flatMap(s => s.values)));
    const gw = iw / Math.max(labels.length, 1), bw = Math.min(28, (gw * 0.8) / series.length);
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const y = m.t + ih - (ih * i) / 4;
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${Math.round((max * i) / 4)}</text>`;
    }
    const step = Math.ceil(labels.length / 12);
    labels.forEach((lab, i) => {
      const cx = m.l + gw * i + gw / 2;
      series.forEach((s, j) => {
        const v = s.values[i], h = (v / max) * ih;
        const x = cx - (bw * series.length) / 2 + bw * j;
        g += `<rect x="${x}" y="${m.t + ih - h}" width="${bw - 1}" height="${Math.max(h, 0)}" rx="2" fill="${COLORS[j % 4]}"><title>${esc(lab)} — ${esc(s.name)}: ${v}</title></rect>`;
      });
      if (i % step === 0) g += `<text x="${cx}" y="${H - m.b + 16}" text-anchor="middle">${esc(rawLabels ? lab : lab.slice(5))}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${g}</svg>` + legend(series);
  }

  /* Horizontal bars. items: [{label, value}] */
  function hbars(el, items, { ariaLabel = "Bar chart", color = COLORS[0], fmt = String } = {}) {
    const rowH = 26, W = 760, lw = 230, H = items.length * rowH + 10;
    const max = Math.max(1, ...items.map(i => i.value));
    const body = items.map((it, i) => {
      const y = 5 + i * rowH, w = ((W - lw - 60) * it.value) / max;
      const lab = it.label.length > 34 ? it.label.slice(0, 33) + "…" : it.label;
      return `<text x="${lw - 8}" y="${y + 16}" text-anchor="end">${esc(lab)}</text>
        <rect x="${lw}" y="${y + 3}" width="${Math.max(w, 1)}" height="${rowH - 8}" rx="2" fill="${color}"><title>${esc(it.label)}: ${fmt(it.value)}</title></rect>
        <text x="${lw + w + 6}" y="${y + 16}">${fmt(it.value)}</text>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${body}</svg>`;
  }

  function legend(series) {
    if (series.length < 2) return "";
    return `<div class="legend">${series.map((s, j) => `<span><i style="background:${COLORS[j % 4]}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  }

  /* Horizontal bars that can be negative (zero line in the middle). items: [{label, value}] */
  function signed(el, items, { ariaLabel = "Bar chart", fmt = String } = {}) {
    const rowH = 26, W = 760, lw = 190, H = items.length * rowH + 10, pw = W - lw - 80;
    const max = Math.max(1e-9, ...items.map(i => Math.abs(i.value)));
    const lo = Math.min(0, ...items.map(i => i.value)), hi = Math.max(0, ...items.map(i => i.value));
    const scale = pw / ((hi - lo) || 1), zero = lw + 40 + (-lo) * scale;
    const body = items.map((it, i) => {
      const y = 5 + i * rowH, w = Math.abs(it.value) * scale, x = it.value >= 0 ? zero : zero - w;
      const lab = it.label.length > 30 ? it.label.slice(0, 29) + "…" : it.label;
      const tx = it.value >= 0 ? zero + w + 6 : zero - w - 6, anchor = it.value >= 0 ? "start" : "end";
      return `<text x="${lw - 8}" y="${y + 16}" text-anchor="end">${esc(lab)}</text>
        <rect x="${x}" y="${y + 3}" width="${Math.max(w, 1)}" height="${rowH - 8}" rx="2" fill="${it.value >= 0 ? COLORS[0] : COLORS[1]}"><title>${esc(it.label)}: ${fmt(it.value)}</title></rect>
        <text x="${tx}" y="${y + 16}" text-anchor="${anchor}">${fmt(it.value)}</text>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${body}<line x1="${zero}" x2="${zero}" y1="0" y2="${H}" stroke="var(--muted)"/></svg>`;
  }

  /* Lines over days. series: [{name, values:[number|null per label]}] */
  function line(el, labels, series, { height = 320, ariaLabel = "Line chart", fmt = String } = {}) {
    const W = 760, H = height, m = { l: 64, r: 14, t: 12, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined && isFinite(v));
    if (!vals.length) { el.innerHTML = '<p class="empty">No values to draw for this choice.</p>'; return; }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= Math.abs(lo) * .05 || 1; hi += Math.abs(hi) * .05 || 1; }
    const pad = (hi - lo) * .06; lo -= pad; hi += pad;
    const X = i => m.l + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
    const Y = v => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4, y = Y(v);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    }
    const step = Math.ceil(labels.length / 8);
    labels.forEach((lab, i) => { if (i % step === 0) g += `<text x="${X(i)}" y="${H - m.b + 18}" text-anchor="middle">${esc(lab.slice(5))}</text>`; });
    series.forEach((s, j) => {
      const color = s.color || `hsl(${(j * 47) % 360} 62% 46%)`;
      let d = "", pen = false;
      s.values.forEach((v, i) => {
        if (v === null || v === undefined || !isFinite(v)) { pen = false; return; }
        d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true;
      });
      g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" class="ln"/>`;
      s.values.forEach((v, i) => {
        if (v === null || v === undefined || !isFinite(v)) return;
        g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.2" fill="${color}"><title>${esc(s.name)} · ${esc(labels[i])}: ${esc(fmt(v))}</title></circle>`;
      });
    });
    const leg = series.length <= 12 ? `<div class="legend">${series.map((s, j) => `<span><i style="background:${s.color || `hsl(${(j * 47) % 360} 62% 46%)`}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${g}</svg>${leg}`;
  }

  return { bars, hbars, signed, line };
})();
