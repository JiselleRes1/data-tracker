(async () => {
  const { esc, usd, big, pct, cls } = JW;
  const KEY = "datatracker.shortlist";
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch {} };
  const shortlist = load();
  const $ = id => document.getElementById(id);

  let rows;
  try { rows = await JW.loadHistory(); } catch (e) { $("summary").textContent = "No data yet — the first daily run has not completed."; return; }
  const items = JW.latestItems(rows);
  const state = { asc: true, only: false };
  [...new Set(items.map(i => i.source))].sort().forEach(s => $("source").insertAdjacentHTML("beforeend", `<option>${esc(s)}</option>`));

  const inTier = (rank, t) => rank !== null && (t === "1-10" ? rank <= 10 : t === "11-25" ? rank > 10 && rank <= 25 : rank > 25);

  function filtered() {
    const q = $("q").value.trim().toLowerCase(), src = $("source").value, tier = $("tier").value, dir = $("dir").value, key = $("sort").value;
    const out = items.filter(i =>
      (!state.only || shortlist.has(i.item_id)) && (!src || i.source === src) && (!tier || inTier(i.rank, tier)) &&
      (!dir || (i.pct !== null && (dir === "up" ? i.pct > 0 : i.pct < 0))) &&
      (!q || i.item.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q)));
    const sign = state.asc ? 1 : -1;
    out.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x === null || x === undefined) return (y === null || y === undefined) ? 0 : 1;   // empty values always last
      if (y === null || y === undefined) return -1;
      return sign * (x - y) || a.item_id.localeCompare(b.item_id);
    });
    return out;
  }

  function render() {
    const out = filtered();
    $("summary").textContent = `${out.length} of ${items.length} items match.`;
    $("shortlist-count").textContent = shortlist.size;
    $("order").textContent = state.asc ? "▲ Ascending" : "▼ Descending";
    $("results").innerHTML = out.length ? out.map(i => {
      const on = shortlist.has(i.item_id);
      return `<div class="coin"><button class="star" data-id="${esc(i.item_id)}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Add to"} shortlist">${on ? "★" : "☆"}</button>
        <div><div class="t">${esc(i.item)} <span class="muted">${esc(i.symbol)}</span></div><div class="muted">${esc(i.source)} · rank ${i.rank ?? "—"} · ${esc(i.date)}${i.stale ? " (old)" : ""}</div></div>
        <div class="vals"><div><small>Price</small>${usd(i.price_usd)}</div><div><small>Market cap</small>${big(i.market_cap_usd)}</div><div><small>24h volume</small>${big(i.volume_24h_usd)}</div>
        <div><small>24h</small><span class="${cls(i.change_24h_pct)}">${pct(i.change_24h_pct)}</span></div><div><small>Since last run</small><span class="${cls(i.pct)}">${pct(i.pct)}</span></div></div></div>`;
    }).join("") : JW.elfNote("Nothing matches — the elves are still searching the workshop!");
  }

  ["q", "source", "tier", "dir", "sort"].forEach(id => $(id).addEventListener("input", render));
  $("order").onclick = () => { state.asc = !state.asc; render(); };
  $("shortlist-only").onclick = e => { Theme.iceOver($("results")); state.only = !state.only; e.currentTarget.setAttribute("aria-pressed", state.only); render(); };
  $("results").addEventListener("click", e => {
    const b = e.target.closest(".star"); if (!b) return;
    const id = b.dataset.id, adding = !shortlist.has(id); adding ? shortlist.add(id) : shortlist.delete(id);
    if (adding) { const r = b.getBoundingClientRect(); Theme.sparkle(r.left + r.width / 2, r.top + r.height / 2, 18); }
    save(shortlist); render();
  });
  render();
})();
