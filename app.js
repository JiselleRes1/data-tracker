/* Shared by every page: navigation, data loading, formatting, and the calculations the
   Today and Browse pages use. Everything is computed in the browser from data/history.csv. */
const ELF = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M13 29 L2 22 L14 24Z M35 29 L46 22 L34 24Z" fill="#f0b98d"/>
  <circle cx="24" cy="29" r="11" fill="#f7d0a8"/>
  <path d="M10 25 Q24 -4 38 25 Q24 18 10 25Z" fill="#2f9e5f"/>
  <path d="M11 24 Q24 31 37 24" stroke="#c4283a" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M26 5 Q40 4 42 15" stroke="#2f9e5f" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="42" cy="16" r="4.2" fill="#fff"/>
  <circle cx="20" cy="30" r="1.7" fill="#2b2b2b"/><circle cx="28" cy="30" r="1.7" fill="#2b2b2b"/>
  <circle cx="16" cy="34" r="2.2" fill="#f4a3a3" opacity=".7"/><circle cx="32" cy="34" r="2.2" fill="#f4a3a3" opacity=".7"/>
  <path d="M20 35 Q24 40 28 35" stroke="#7a3b2a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;

const JW = (() => {
  const PAGES = [["index.html", "Today"], ["browse.html", "Browse"], ["trends.html", "Trends"]];
  const NUMERIC = ["rank", "price_usd", "market_cap_usd", "volume_24h_usd", "change_24h_pct"];

  function nav() {
    const here = location.pathname.split("/").pop() || "index.html";
    const links = PAGES.map(([href, label]) =>
      `<a class="link" href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("");
    document.body.insertAdjacentHTML("afterbegin",
      `<header class="nav"><div class="nav-inner"><a class="brand" href="index.html" data-sleigh>${ELF}<span>Data Tracker<small>Elf coin watch</small></span></a>${links}</div></header>`);
  }

  function parseCSV(text) {
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const head = rows.shift() || [];
    return rows.filter(r => r.length === head.length).map(r => {
      const o = {}; head.forEach((h, i) => o[h] = r[i]);
      NUMERIC.forEach(k => o[k] = o[k] === "" || o[k] === undefined ? null : Number(o[k]));
      return o;
    });
  }

  async function getJSON(path) { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(path); return r.json(); }
  async function getText(path) { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(path); return r.text(); }
  const loadStatus = () => getJSON("data/status.json");
  const loadHistory = async () => parseCSV(await getText("data/history.csv"));

  /* ---- calculations shared by Today and Browse ---- */
  const pctChange = (oldV, newV) => (oldV && newV !== null && newV !== undefined ? (newV - oldV) / oldV * 100 : null);

  /* One entry per item: its latest row, its previous row, and the price move between them. */
  function latestItems(rows) {
    const by = {};
    rows.forEach(r => (by[r.item_id] = by[r.item_id] || []).push(r));
    const maxDate = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
    return Object.values(by).map(list => {
      list.sort((a, b) => a.date.localeCompare(b.date));
      const last = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null;
      return { ...last, prev, pct: prev ? pctChange(prev.price_usd, last.price_usd) : null, stale: last.date !== maxDate };
    });
  }
  /* The move rule (same as the pipeline): top 10 items by size of the price move. */
  const biggestMoves = (items, n = 10) =>
    items.filter(i => i.pct !== null).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.item_id.localeCompare(b.item_id)).slice(0, n);

  /* ---- formatting ---- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = iso => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const usd = v => v === null || v === undefined ? "—" : Math.abs(v) >= 1 ? "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "$" + Number(v.toPrecision(3)).toString();
  const big = v => {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    return "$" + (a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v.toLocaleString());
  };
  const pct = v => v === null || v === undefined ? "—" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const cls = v => v === null || v === undefined || v === 0 ? "" : v > 0 ? "up" : "down";

  function offlineBanner() {
    const show = () => { if (!document.querySelector(".offline")) document.body.insertAdjacentHTML("afterbegin", '<div class="offline">You are offline — showing the last data this device loaded.</div>'); };
    const hide = () => document.querySelector(".offline")?.remove();
    window.addEventListener("offline", show); window.addEventListener("online", hide);
    if (!navigator.onLine) show();
  }

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  document.addEventListener("DOMContentLoaded", () => { nav(); offlineBanner(); });

  return { loadStatus, loadHistory, parseCSV, latestItems, biggestMoves, pctChange, esc, fmtTime, usd, big, pct, cls,
    elfNote: msg => `<div class="elf-empty">${ELF}<span>${msg}</span></div>` };
})();
