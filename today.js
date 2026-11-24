(async () => {
  const { esc, fmtTime, usd, pct, cls } = JW;
  let status, rows;
  try { [status, rows] = await Promise.all([JW.loadStatus(), JW.loadHistory()]); }
  catch (e) { document.getElementById("last-run").textContent = "No data yet — the first daily run has not completed."; return; }

  document.getElementById("last-run").textContent = `Last run: ${fmtTime(status.run_time)} (UTC date ${status.run_time.slice(0, 10)})`;
  const stat = (n, l, ico) => `<div class="stat" data-sleigh><span class="ico">${ico}</span><div class="n">${n.toLocaleString()}</div><div class="l">${l}</div></div>`;
  document.getElementById("stats").innerHTML =
    stat(status.days_with_success, "days with a successful run", "🎄") + stat(status.items, "items tracked", "🪙") +
    stat(status.new_today, "appeared today", "🎁") + stat(status.gone_today, "disappeared today", "🫠");

  document.getElementById("sources").innerHTML = status.sources.map(s =>
    `<tr><td>${esc(s.name)}</td><td><span class="pill ${s.ok ? "ok" : "bad"}">${s.ok ? "on duty" : "snowed in"}</span></td><td class="num">${s.count.toLocaleString()}</td></tr>`).join("");

  const items = JW.latestItems(rows);
  const moves = JW.biggestMoves(items);
  document.getElementById("moves").innerHTML = moves.length
    ? moves.map(i => `<li><strong>${esc(i.item)}</strong> <span class="muted">${esc(i.symbol)}</span><div>${usd(i.prev.price_usd)} → ${usd(i.price_usd)} <span class="${cls(i.pct)}"><strong>${pct(i.pct)}</strong></span></div></li>`).join("")
    : `<li class="empty">${JW.elfNote("Nothing to compare yet — moves appear after the second daily run.")}</li>`;

  document.getElementById("latest").innerHTML = items.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.item_id.localeCompare(b.item_id)).map(i =>
    `<tr><td>${esc(i.item)} <span class="muted">${esc(i.symbol)}</span>${i.stale ? ' <span class="pill bad">old</span>' : ""}</td><td>${esc(i.source)}</td>` +
    `<td class="num">${usd(i.price_usd)}</td><td class="num ${cls(i.pct)}">${pct(i.pct)}</td><td class="num ${cls(i.change_24h_pct)}">${pct(i.change_24h_pct)}</td></tr>`).join("");
})();
