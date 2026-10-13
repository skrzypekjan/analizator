'use strict';
const $ = id => document.getElementById(id);
const DEFAULT_EXCLUDED = ['Lokaty i konto oszcz.', 'Spłata karty kredytowej', 'Przelew własny', 'Fundusze', 'Wypłata gotówki'];
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const fmt = n => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const fmt0 = n => Math.round(n).toLocaleString('pl-PL') + ' zł';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const monthLabel = k => { const [y, m] = k.split('-'); return `${MONTHS[+m - 1]} ${y}`; };

let txs = [], excluded = new Set(), view = {};

function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1250').decode(buf); }
}

function splitLine(line) {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ';' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseAmount(s) {
  const n = parseFloat(s.replace(/[^\d,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function merchant(desc) {
  const first = desc.trim().split(/\s{2,}/)[0].replace(/\s+\d{3,}$/, '').trim();
  return first || desc.trim();
}

function parse(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const hi = lines.findIndex(l => l.trim().startsWith('#Data operacji'));
  if (hi < 0) throw new Error('Nie rozpoznano formatu pliku (brak nagłówka „#Data operacji"). Obsługiwany jest eksport „Lista operacji" z mBanku.');
  const head = splitLine(lines[hi]).map(h => h.replace('#', '').trim().toLowerCase());
  const col = name => head.findIndex(h => h.startsWith(name));
  const [iD, iO, iA, iC, iK] = ['data', 'opis', 'rachunek', 'kategoria', 'kwota'].map(col);
  if ([iD, iO, iC, iK].some(i => i < 0)) throw new Error('Brak oczekiwanych kolumn w pliku.');
  const rows = [];
  for (const l of lines.slice(hi + 1)) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(l)) continue;
    const c = splitLine(l);
    const amount = parseAmount(c[iK] || '');
    if (amount === null) continue;
    const desc = (c[iO] || '').replace(/\s+/g, ' ').trim();
    rows.push({
      date: c[iD].trim(), month: c[iD].slice(0, 7), amount,
      desc, merchant: merchant(c[iO] || ''),
      account: (c[iA] || '').trim(), cat: (c[iC] || '').trim() || 'Bez kategorii',
      pending: /nierozliczona/i.test(c[iO] || '')
    });
  }
  if (!rows.length) throw new Error('Nie znaleziono żadnych transakcji.');
  return rows;
}

function load(file) {
  $('error').textContent = '';
  const r = new FileReader();
  r.onload = () => {
    try { txs = parse(decode(r.result)); init(); }
    catch (e) { $('error').textContent = e.message; }
  };
  r.readAsArrayBuffer(file);
}

function init() {
  const cats = [...new Set(txs.map(t => t.cat))].sort((a, b) => a.localeCompare(b, 'pl'));
  excluded = new Set(DEFAULT_EXCLUDED.filter(c => cats.includes(c)));
  const months = [...new Set(txs.map(t => t.month))].sort().reverse();
  $('month').innerHTML = `<option value="all">Wszystkie miesiące</option>` +
    months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  $('month').value = months.length > 1 ? months[1] : months[0]; // ostatni pełny miesiąc
  $('excl').innerHTML = cats.map(c =>
    `<label><input type="checkbox" value="${esc(c)}" ${excluded.has(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('');
  $('catFilter').innerHTML = `<option value="">Wszystkie kategorie</option>` + cats.map(c => `<option>${esc(c)}</option>`).join('');
  $('drop').hidden = true; $('app').hidden = false;
  render();
}

const sumBy = (arr, key) => {
  const m = new Map();
  for (const t of arr) m.set(key(t), (m.get(key(t)) || 0) + Math.abs(t.amount));
  return [...m].sort((a, b) => b[1] - a[1]);
};

function render() {
  const sel = $('month').value, thr = (+$('threshold').value || 30) / 100;
  const active = txs.filter(t => !excluded.has(t.cat));
  const expAll = active.filter(t => t.amount < 0), incAll = active.filter(t => t.amount > 0);
  const inSel = t => sel === 'all' || t.month === sel;
  const exp = expAll.filter(inSel), inc = incAll.filter(inSel);
  const months = [...new Set(txs.map(t => t.month))].sort();

  const total = a => a.reduce((s, t) => s + Math.abs(t.amount), 0);
  const expSum = total(exp), incSum = total(inc);
  const prevKey = sel === 'all' ? null : months[months.indexOf(sel) - 1];
  const prevSum = prevKey ? total(expAll.filter(t => t.month === prevKey)) : null;
  const nm = sel === 'all' ? months.length : 1;
  const delta = prevSum ? (expSum - prevSum) / prevSum * 100 : null;

  $('kpis').innerHTML = [
    ['Wydatki', fmt(expSum), delta === null ? (sel === 'all' ? `średnio ${fmt0(expSum / nm)} / mies.` : '') :
      `<span class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%</span> vs ${monthLabel(prevKey)}`],
    ['Wpływy', fmt(incSum), sel === 'all' ? `średnio ${fmt0(incSum / nm)} / mies.` : ''],
    ['Bilans', `<span class="${incSum - expSum < 0 ? 'up' : 'down'}">${fmt(incSum - expSum)}</span>`, ''],
    ['Transakcji', exp.length, `śr. wydatek ${exp.length ? fmt(expSum / exp.length) : '–'}`]
  ].map(([l, v, d]) => `<div class="kpi"><div class="muted">${l}</div><div class="v">${v}</div><div class="d muted">${d}</div></div>`).join('');

  // średnie kategorii z pozostałych miesięcy
  const otherMonths = months.filter(m => m !== sel);
  const baseline = new Map();
  if (sel !== 'all' && otherMonths.length) {
    for (const [c, v] of sumBy(expAll.filter(t => t.month !== sel), t => t.cat)) baseline.set(c, v / otherMonths.length);
  }
  const cats = sumBy(exp, t => t.cat);
  const max = cats[0]?.[1] || 1;
  const hot = c => { const b = baseline.get(c[0]); return b !== undefined ? { b, over: c[1] - b, pct: (c[1] - b) / b } : null; };

  $('categories').innerHTML = cats.map(c => {
    const h = hot(c), isHot = h && h.pct > thr && h.over > 50;
    const tag = h ? `<span class="tag ${h.pct > 0 ? 'up' : 'down'}" title="średnia z pozostałych miesięcy: ${fmt0(h.b)}">${h.pct > 0 ? '+' : ''}${(h.pct * 100).toFixed(0)}%</span>` : '';
    return `<div class="bar-row ${isHot ? 'hot' : ''}"><span class="name" title="${esc(c[0])}">${esc(c[0])}${tag}</span>
      <span class="bar"><i style="width:${c[1] / max * 100}%"></i></span><span class="val">${fmt0(c[1])}</span></div>`;
  }).join('') || '<p class="muted">Brak wydatków.</p>';

  const mer = sumBy(exp, t => t.merchant).slice(0, 15), mmax = mer[0]?.[1] || 1;
  const cnt = new Map(); exp.forEach(t => cnt.set(t.merchant, (cnt.get(t.merchant) || 0) + 1));
  $('merchants').innerHTML = mer.map(([n, v]) =>
    `<div class="bar-row"><span class="name" title="${esc(n)}">${esc(n)} <span class="muted">×${cnt.get(n)}</span></span>
     <span class="bar"><i style="width:${v / mmax * 100}%"></i></span><span class="val">${fmt0(v)}</span></div>`).join('');

  // insighty
  const ins = [];
  if (sel === 'all') ins.push(`<div class="insight ok">Wybierz konkretny miesiąc, aby porównać go ze średnią z pozostałych miesięcy.</div>`);
  else if (!otherMonths.length) ins.push(`<div class="insight ok">Do porównań potrzeba danych z co najmniej dwóch miesięcy.</div>`);
  else {
    const over = cats.map(c => ({ c, h: hot(c) })).filter(x => x.h && x.h.pct > thr && x.h.over > 50 || (!x.h && x.c[1] > 200))
      .sort((a, b) => (b.h ? b.h.over : b.c[1]) - (a.h ? a.h.over : a.c[1]));
    over.forEach(({ c, h }) => ins.push(h
      ? `<div class="insight"><b>${esc(c[0])}</b>: ${fmt0(c[1])} – o ${fmt0(h.over)} (${(h.pct * 100).toFixed(0)}%) więcej niż średnio (${fmt0(h.b)}).</div>`
      : `<div class="insight"><b>${esc(c[0])}</b>: ${fmt0(c[1])} – nowa kategoria, której nie było w innych miesiącach.</div>`));
    if (!over.length) ins.push(`<div class="insight ok">Żadna kategoria nie przekracza średniej o ${(thr * 100).toFixed(0)}%.</div>`);
    const big = [...exp].sort((a, b) => a.amount - b.amount).slice(0, 3);
    ins.push(`<p class="muted">Największe pojedyncze wydatki: ${big.map(t => `${esc(t.merchant)} (${fmt0(Math.abs(t.amount))})`).join(', ')}.</p>`);
  }
  $('insights').innerHTML = ins.join('');

  renderTrend(months, expAll, incAll, sel);
  const subs = detectSubs(expAll, months);
  renderSubs(subs);
  view = { sel, months, exp, expAll, expSum, incSum, prevKey, prevSum, cats, baseline, subs, thr };
  renderTable(sel);
}

function detectSubs(expAll, months) {
  const g = new Map();
  for (const t of expAll) {
    const k = t.merchant.toLowerCase() + '|' + Math.round(Math.abs(t.amount));
    if (!g.has(k)) g.set(k, { name: t.merchant, amount: Math.abs(t.amount), cat: t.cat, months: new Set(), last: '' });
    const o = g.get(k); o.months.add(t.month); if (t.date > o.last) o.last = t.date;
  }
  const latest = months[months.length - 1], idx = m => months.indexOf(m);
  return [...g.values()].filter(o => {
    if (o.months.size < 3) return false;
    const ix = [...o.months].map(idx).sort((a, b) => a - b);
    const span = ix[ix.length - 1] - ix[0] + 1;
    return o.months.size / span >= 0.7 && idx(latest) - ix[ix.length - 1] <= 1;
  }).sort((a, b) => b.amount - a.amount);
}

function renderSubs(subs) {
  const sum = subs.reduce((s, o) => s + o.amount, 0);
  $('subs').innerHTML = subs.length
    ? `<p class="muted">Powtarzające się co miesiąc opłaty o stałej kwocie (min. 3 miesiące). Razem ok. <b>${fmt0(sum)}</b> miesięcznie, czyli ${fmt0(sum * 12)} rocznie.</p>
       <div class="table-wrap"><table><tr><th>Odbiorca</th><th>Kategoria</th><th class="num">Kwota / mies.</th><th>Miesięcy</th><th>Ostatnio</th></tr>` +
      subs.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.cat)}</td><td class="num">${fmt(o.amount)}</td><td>${o.months.size}</td><td>${o.last}</td></tr>`).join('') + '</table></div>'
    : '<p class="muted">Nie wykryto cyklicznych opłat.</p>';
}

function renderTrend(months, expAll, incAll, sel) {
  const data = months.map(m => ({ m, e: expAll.filter(t => t.month === m).reduce((s, t) => s - t.amount, 0), i: incAll.filter(t => t.month === m).reduce((s, t) => s + t.amount, 0) }));
  const max = Math.max(...data.map(d => Math.max(d.e, d.i)), 1), W = 1050, H = 200, bw = Math.min(40, W / data.length / 2.6);
  const step = W / data.length;
  const bars = data.map((d, k) => {
    const x = k * step + step / 2, eh = d.e / max * (H - 30), ih = d.i / max * (H - 30);
    return `<g ${d.m === sel ? 'opacity="1"' : sel === 'all' ? '' : 'opacity=".55"'}>
      <rect x="${x - bw - 1}" y="${H - 20 - ih}" width="${bw}" height="${ih}" fill="#1f9d62"><title>Wpływy ${monthLabel(d.m)}: ${fmt0(d.i)}</title></rect>
      <rect x="${x + 1}" y="${H - 20 - eh}" width="${bw}" height="${eh}" fill="#d6443a"><title>Wydatki ${monthLabel(d.m)}: ${fmt0(d.e)}</title></rect>
      <text x="${x}" y="${H - 5}" text-anchor="middle">${monthLabel(d.m)}</text>
      <text x="${x + bw / 2}" y="${H - 24 - eh}" text-anchor="middle">${Math.round(d.e / 1000 * 10) / 10}k</text></g>`;
  }).join('');
  $('trend').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${bars}</svg>
    <p class="muted"><span class="down">■</span> wpływy &nbsp; <span class="up">■</span> wydatki</p>`;
}

function renderTable(sel) {
  const q = $('search').value.toLowerCase(), cf = $('catFilter').value;
  const rows = txs.filter(t => (sel === 'all' || t.month === sel) && (!cf || t.cat === cf) &&
    (!q || t.desc.toLowerCase().includes(q)));
  $('tx').innerHTML = `<tr><th>Data</th><th>Opis</th><th>Kategoria</th><th class="num">Kwota</th></tr>` +
    rows.slice(0, 500).map(t => `<tr${excluded.has(t.cat) ? ' style="opacity:.5"' : ''}><td>${t.date}</td>
      <td title="${esc(t.desc)}">${esc(t.merchant)}${t.pending ? ' <span class="muted">(nierozliczona)</span>' : ''}</td>
      <td>${esc(t.cat)}</td><td class="num ${t.amount < 0 ? '' : 'down'}">${fmt(t.amount)}</td></tr>`).join('') +
    (rows.length > 500 ? `<tr><td colspan="4" class="muted">Pokazano 500 z ${rows.length} – zawęź filtr.</td></tr>` : '');
}

$('file').onchange = e => e.target.files[0] && load(e.target.files[0]);
const drop = $('drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => e.dataTransfer.files[0] && load(e.dataTransfer.files[0]));
$('month').onchange = $('threshold').oninput = render;
$('search').oninput = $('catFilter').onchange = () => renderTable($('month').value);
$('excl').onchange = e => { e.target.checked ? excluded.add(e.target.value) : excluded.delete(e.target.value); render(); };
$('reset').onclick = () => { txs = []; $('file').value = ''; $('app').hidden = true; $('drop').hidden = false; };
