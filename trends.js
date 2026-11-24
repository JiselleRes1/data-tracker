(async () => {
  const { esc, usd, big, pct } = JW;
  const $ = id => document.getElementById(id);
  let rows;
  try { rows = await JW.loadHistory(); } catch (e) { $("asof").textContent = "No data yet — the first daily run has not completed."; return; }
  if (!rows.length) { $("asof").textContent = "The history file is empty."; return; }

  // Everything below is computed here from data/history.csv.
  const days = [...new Set(rows.map(r => r.date))].sort();
  const first = days[0], last = days[days.length - 1];
  const itemIds = [...new Set(rows.map(r => r.item_id))];
  const byItem = {}; rows.forEach(r => (byItem[r.item_id] = byItem[r.item_id] || {})[r.date] = r);
  const nameOf = id => Object.values(byItem[id])[0].item;
  const latestRow = id => { const d = Object.keys(byItem[id]).sort().pop(); return byItem[id][d]; };
  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => sum(a) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };
  const f2 = x => x.toFixed(2);
  $("asof").textContent = `Based on ${rows.length.toLocaleString()} rows in the history file: ${itemIds.length} items over ${days.length} day${days.length === 1 ? "" : "s"} (${first} to ${last}).`;

  /* ---------- explorer: any numeric value over the days, items chosen by the visitor ---------- */
  $("explorer").hidden = false;
  const topFive = [...itemIds].sort((a, b) => (latestRow(b).market_cap_usd ?? 0) - (latestRow(a).market_cap_usd ?? 0)).slice(0, 5);
  const chosen = new Set(topFive);
  $("picker").innerHTML = [...itemIds].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map(id =>
    `<label><input type="checkbox" value="${esc(id)}"${chosen.has(id) ? " checked" : ""}> ${esc(nameOf(id))}</label>`).join("");
  const FMT = { price_usd: usd, market_cap_usd: big, volume_24h_usd: big, change_24h_pct: v => v.toFixed(2) + "%", rank: v => "#" + Math.round(v) };
  function drawExplorer() {
    const metric = $("metric").value, indexed = $("index").checked && ["price_usd", "market_cap_usd", "volume_24h_usd"].includes(metric);
    $("index").disabled = !["price_usd", "market_cap_usd", "volume_24h_usd"].includes(metric);
    const series = [...chosen].map(id => {
      const vals = days.map(d => byItem[id][d]?.[metric] ?? null);
      const base = vals.find(v => v !== null && v !== 0);
      return { name: nameOf(id), values: indexed ? vals.map(v => (v === null || !base ? null : v / base * 100)) : vals };
    });
    Charts.line($("explorer-chart"), days, series, { ariaLabel: "Values over the days", fmt: indexed ? v => v.toFixed(1) : FMT[metric] });
  }
  $("picker").addEventListener("change", e => { e.target.checked ? chosen.add(e.target.value) : chosen.delete(e.target.value); drawExplorer(); });
  $("metric").addEventListener("input", drawExplorer); $("index").addEventListener("input", drawExplorer);
  const setAll = ids => { chosen.clear(); ids.forEach(i => chosen.add(i)); document.querySelectorAll("#picker input").forEach(c => c.checked = chosen.has(c.value)); drawExplorer(); };
  $("pick-top").onclick = () => setAll(topFive); $("pick-all").onclick = () => setAll(itemIds); $("pick-none").onclick = () => setAll([]);
  drawExplorer();

  /* ---------- findings ---------- */
  const sections = [];
  const add = (heading, para, draw) => sections.push({ heading, para, draw });
  const none = el => (el.innerHTML = '<p class="empty">Not enough days yet — this fills in as the history grows.</p>');

  // 1. Rise and fall since the first run: price on the item's first day vs its latest day.
  const since = itemIds.map(id => {
    const ds = Object.keys(byItem[id]).sort().filter(d => byItem[id][d].price_usd), a = ds[0], b = ds[ds.length - 1];
    return a && b && a !== b ? { id, label: nameOf(id), value: JW.pctChange(byItem[id][a].price_usd, byItem[id][b].price_usd) } : null;
  }).filter(x => x && x.value !== null).sort((x, y) => y.value - x.value);
  if (since.length) {
    const up = since.filter(x => x.value > 0).length, best = since[0], worst = since[since.length - 1];
    add(`${best.label} rose the most (${pct(best.value)}) and ${worst.label} fell the most (${pct(worst.value)}) since the first run`,
      `${up} of ${since.length} items are higher than on their first day and ${since.length - up} are not. For each item, the change is (latest price − price on its first day) ÷ price on its first day × 100, using the price_usd column of data/history.csv. The chart shows the five biggest risers and the five biggest fallers.`,
      el => Charts.signed(el, [...since.slice(0, 5), ...since.slice(-5)].filter((x, i, a) => a.indexOf(x) === i), { ariaLabel: "Price change since first run", fmt: pct }));
  } else add("No price change to report yet — only the first day exists",
    "Each item's change since the first run is (latest price − first price) ÷ first price × 100. It needs at least two days in data/history.csv.", none);

  // 2. The day with the biggest move: mean absolute price change per day, vs the item's previous day.
  const dayMove = days.slice(1).map(d => {
    const ch = itemIds.map(id => {
      const prevD = Object.keys(byItem[id]).sort().filter(x => x < d).pop();
      return byItem[id][d] && prevD ? JW.pctChange(byItem[id][prevD].price_usd, byItem[id][d].price_usd) : null;
    }).filter(x => x !== null).map(Math.abs);
    return ch.length ? { day: d, v: mean(ch), n: ch.length } : null;
  }).filter(Boolean);
  if (dayMove.length) {
    const top = dayMove.reduce((a, b) => (b.v > a.v ? b : a));
    add(`${top.day} was the biggest day: items moved ${f2(top.v)}% on average`,
      `For every day after the first, take each item's price change from its previous run, ignore the sign, and average over the ${top.n} items that have a previous run that day. ${top.day} is the highest of ${dayMove.length} day${dayMove.length === 1 ? "" : "s"}; the quietest is ${dayMove.reduce((a, b) => (b.v < a.v ? b : a)).day} at ${f2(Math.min(...dayMove.map(x => x.v)))}%.`,
      el => Charts.bars(el, dayMove.map(x => x.day), [{ name: "Average absolute move (%)", values: dayMove.map(x => Number(f2(x.v))) }], { ariaLabel: "Average absolute move per day" }));
  } else add("No day-to-day moves yet — only the first day exists",
    "The size of a day's move is the average of the absolute price changes of all items from their previous run. It needs at least two days in data/history.csv.", none);

  // 3. How far apart the items are: market cap on the latest day each item was seen.
  const caps = itemIds.map(id => ({ id, label: nameOf(id), value: latestRow(id).market_cap_usd })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  if (caps.length > 1) {
    const total = sum(caps.map(x => x.value)), a = caps[0], z = caps[caps.length - 1];
    add(`${a.label} is ${Math.round(a.value / z.value).toLocaleString()}× the size of ${z.label} and holds ${f2(a.value / total * 100)}% of the tracked market cap`,
      `Using each item's latest market_cap_usd: the largest is ${big(a.value)} (${a.label}), the smallest is ${big(z.value)} (${z.label}), and all ${caps.length} items together are ${big(total)}. The chart shows each of the ten largest items' share of that total (market cap ÷ total × 100).`,
      el => Charts.hbars(el, caps.slice(0, 10).map(x => ({ label: x.label, value: Number(f2(x.value / total * 100)) })), { ariaLabel: "Share of tracked market cap", fmt: v => v + "%" }));
  } else add("Not enough items with a market cap", "This compares each item's latest market_cap_usd.", none);

  // 4. Volatility: standard deviation of each item's day-to-day price changes (needs 3+ days).
  const vol = itemIds.map(id => {
    const ds = Object.keys(byItem[id]).sort().filter(d => byItem[id][d].price_usd);
    const ch = ds.slice(1).map((d, i) => JW.pctChange(byItem[id][ds[i]].price_usd, byItem[id][d].price_usd)).filter(x => x !== null);
    return ch.length >= 2 ? { label: nameOf(id), value: sd(ch), n: ch.length } : null;
  }).filter(Boolean).sort((a, b) => b.value - a.value);
  if (vol.length) {
    add(`${vol[0].label} is the bumpiest: its daily moves have a standard deviation of ${f2(vol[0].value)}%`,
      `For each item, take its day-to-day price changes (at least two are needed, so three days of history) and compute their sample standard deviation; a larger number means a rougher ride. ${vol[0].label} has ${vol[0].n} changes; the calmest of the ${vol.length} measured items is ${vol[vol.length - 1].label} at ${f2(vol[vol.length - 1].value)}%. The chart shows the ten bumpiest.`,
      el => Charts.hbars(el, vol.slice(0, 10).map(x => ({ label: x.label, value: Number(f2(x.value)) })), { ariaLabel: "Standard deviation of daily moves", fmt: v => v + "%" }));
  } else add("Volatility needs at least three days of history",
    "For each item the tool takes its day-to-day price changes and computes their sample standard deviation, which needs at least two changes, so three days in data/history.csv.", none);

  // 5. Trading activity: 24h volume as a share of market cap, latest day.
  const turn = itemIds.map(id => { const r = latestRow(id); return r.volume_24h_usd !== null && r.market_cap_usd > 0 ? { label: nameOf(id), value: r.volume_24h_usd / r.market_cap_usd * 100 } : null; })
    .filter(Boolean).sort((a, b) => b.value - a.value);
  if (turn.length) {
    add(`${turn[0].label} trades the most for its size: ${f2(turn[0].value)}% of its market cap changed hands in 24 hours`,
      `Turnover = 24h volume ÷ market cap × 100, from each item's latest volume_24h_usd and market_cap_usd. The median across ${turn.length} items is ${f2(turn.map(x => x.value).sort((a, b) => a - b)[Math.floor(turn.length / 2)])}%; the lowest is ${turn[turn.length - 1].label} at ${f2(turn[turn.length - 1].value)}%. The chart shows the ten highest.`,
      el => Charts.hbars(el, turn.slice(0, 10).map(x => ({ label: x.label, value: Number(f2(x.value)) })), { ariaLabel: "Turnover", fmt: v => v + "%" }));
  } else add("No turnover to report", "Turnover = 24h volume ÷ market cap.", none);

  $("sections").innerHTML = sections.map((s, i) => `<section class="card finding"><h2>${esc(s.heading)}</h2><p>${esc(s.para)}</p><div class="chart" id="chart-${i}"></div></section>`).join("");
  sections.forEach((s, i) => s.draw($("chart-" + i)));
})();
