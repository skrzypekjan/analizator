'use strict';
const SYSTEM = 'Jesteś doradcą finansów osobistych. Odpowiadasz po polsku, zwięźle i konkretnie, wyłącznie na podstawie dostarczonych danych (kwoty w PLN). ' +
  'Nie wymyślaj liczb, których nie ma w danych. Gdy czegoś nie da się ustalić z danych, napisz to wprost.';
let history = [], busy = false;

function buildContext() {
  const v = view;
  if (!v.cats) return '';
  const per = m => v.expAll.filter(t => t.month === m).reduce((s, t) => s - t.amount, 0);
  const L = [];
  L.push(`Okres analizy: ${v.sel === 'all' ? 'wszystkie miesiące' : monthLabel(v.sel)}`);
  L.push(`Wydatki w okresie: ${fmt(v.expSum)}; wpływy: ${fmt(v.incSum)}`);
  if (v.prevSum) L.push(`Wydatki w poprzednim miesiącu (${monthLabel(v.prevKey)}): ${fmt(v.prevSum)}`);
  L.push('', 'Wydatki wg miesięcy:');
  v.months.forEach(m => L.push(`- ${monthLabel(m)}: ${fmt0(per(m))}`));
  L.push('', 'Kategorie w okresie (kwota; średnia z pozostałych miesięcy):');
  v.cats.forEach(([c, s]) => L.push(`- ${c}: ${fmt0(s)}${v.baseline.has(c) ? `; średnio ${fmt0(v.baseline.get(c))}` : ''}`));
  const mer = new Map();
  v.exp.forEach(t => { const o = mer.get(t.merchant) || { s: 0, n: 0 }; o.s -= t.amount; o.n++; mer.set(t.merchant, o); });
  L.push('', 'Najwięksi odbiorcy w okresie:');
  [...mer].sort((a, b) => b[1].s - a[1].s).slice(0, 15).forEach(([n, o]) => L.push(`- ${n}: ${fmt0(o.s)} (${o.n} transakcji)`));
  if (v.subs.length) {
    L.push('', 'Wykryte cykliczne opłaty (miesięcznie):');
    v.subs.slice(0, 25).forEach(o => L.push(`- ${o.name}: ${fmt(o.amount)} (${o.cat})`));
  }
  return L.join('\n');
}

async function refreshModels() {
  const st = $('aiStatus');
  try {
    const r = await fetch($('aiUrl').value.replace(/\/$/, '') + '/api/tags');
    const names = (await r.json()).models.map(m => m.name);
    $('aiModel').innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
    const saved = sessionStorage.getItem('aiModel');
    if (saved && names.includes(saved)) $('aiModel').value = saved;
    st.textContent = names.length ? `Połączono. Dostępne modele: ${names.length}.` : 'Połączono, ale brak modeli. Uruchom np.: ollama pull qwen2.5:7b';
    st.className = 'muted';
  } catch {
    st.className = 'error';
    st.textContent = 'Nie można połączyć się z Ollamą. Sprawdź, czy działa, a jeśli otwierasz stronę z GitHub Pages, uruchom ją z OLLAMA_ORIGINS (instrukcja w README).';
  }
}

async function ask(prompt, title) {
  if (busy) return;
  const model = $('aiModel').value;
  if (!model) { $('aiStatus').className = 'error'; $('aiStatus').textContent = 'Najpierw połącz się z Ollamą i wybierz model.'; return; }
  sessionStorage.setItem('aiModel', model);
  const ctx = buildContext();
  $('aiCtx').textContent = ctx;
  const out = $('aiOut');
  out.insertAdjacentHTML('beforeend', `<div class="q">${esc(title)}</div><div class="a"></div>`);
  const slot = out.lastElementChild;
  history.push({ role: 'user', content: prompt });
  busy = true;
  let answer = '';
  try {
    const r = await fetch($('aiUrl').value.replace(/\/$/, '') + '/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model, stream: true,
        messages: [{ role: 'system', content: SYSTEM + '\n\nDANE:\n' + ctx }, ...history.slice(-8)]
      })
    });
    if (!r.ok) throw new Error(`Ollama zwróciła ${r.status}: ${await r.text()}`);
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        const j = JSON.parse(l);
        if (j.error) throw new Error(j.error);
        answer += j.message?.content || '';
        slot.textContent = answer;
      }
    }
    history.push({ role: 'assistant', content: answer });
  } catch (e) {
    history.pop();
    slot.innerHTML = `<span class="error">${esc(e.message)}</span>`;
  } finally { busy = false; }
}

$('aiRefresh').onclick = refreshModels;
$('aiComment').onclick = () => ask(
  'Przeanalizuj wydatki w wybranym okresie. Wskaż 3–5 najważniejszych wniosków: co wzrosło względem średniej, gdzie wydaję najwięcej, które cykliczne opłaty warto zweryfikować, i podaj konkretne propozycje oszczędności z kwotami.',
  'Komentarz do okresu');
const send = () => { const q = $('aiQ').value.trim(); if (q) { $('aiQ').value = ''; ask(q, q); } };
$('aiAsk').onclick = send;
$('aiQ').onkeydown = e => e.key === 'Enter' && send();
$('month').addEventListener('change', () => { history = []; });
$('reset').addEventListener('click', () => { history = []; $('aiOut').innerHTML = ''; });
refreshModels();
