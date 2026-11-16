/* OneWord — main app  (no build tools; plain JS) */
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const WA = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=` + encodeURIComponent("Hi, I want to join OneWord (₹499/year).");

let user = null, profile = null, words = [], progress = new Set(), favs = new Set(), results = [];
let todayDay = 1;

/* ---------- helpers ---------- */
const todayStr = () => new Date().toLocaleDateString("en-CA");           // YYYY-MM-DD local
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const esc = s => (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
function show(id) { ["view-auth", "view-expired", "app"].forEach(v => $("#" + v).classList.toggle("hidden", v !== id)); }
function speak(text) {
  if (!("speechSynthesis" in window)) return toast("Audio not supported on this browser");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find(v => /en-IN/i.test(v.lang)) || voices.find(v => /en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
  u.rate = 0.9; speechSynthesis.speak(u);
}
function playWord(w) { if (w.audio_url) { new Audio(w.audio_url).play().catch(() => speak(w.word)); } else speak(w.word); }

/* ---------- auth ---------- */
$("#buy-link").href = WA; $("#renew-link").href = WA;
$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#login-err"); err.classList.add("hidden");
  let id = $("#login-id").value.trim().toLowerCase();
  if (!id.includes("@")) id = `${id}@${CONFIG.LOGIN_DOMAIN}`;
  const { error } = await sb.auth.signInWithPassword({ email: id, password: $("#login-pw").value });
  if (error) { err.textContent = "Wrong user ID or password."; err.classList.remove("hidden"); return; }
  boot();
});
$("#logout").onclick = $("#expired-logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show("view-auth");
  user = session.user;

  const { data: p } = await sb.from("profiles").select("*").eq("id", user.id).single();
  profile = p || { id: user.id, start_date: todayStr(), paid: true, streak: 0 };
  if (!profile.paid || (profile.paid_until && profile.paid_until < todayStr())) return show("view-expired");
  if (profile.is_admin) $("#admin-link").classList.remove("hidden");

  todayDay = Math.max(1, daysBetween(profile.start_date, todayStr()) + 1);
  await updateStreak();
  await loadData();
  show("app");
  route("today");
}

async function updateStreak() {
  const t = todayStr(), last = profile.last_seen;
  let streak = profile.streak || 0;
  if (last === t) return;
  streak = (last && daysBetween(last, t) === 1) ? streak + 1 : 1;
  profile.streak = streak; profile.last_seen = t;
  await sb.from("profiles").update({ streak, last_seen: t }).eq("id", user.id);
}

async function loadData() {
  const [w, pr, fv, rs] = await Promise.all([
    sb.from("words").select("*, quizzes(*)").lte("day_number", todayDay).order("day_number"),
    sb.from("word_progress").select("word_id").eq("user_id", user.id),
    sb.from("favourites").select("word_id").eq("user_id", user.id),
    sb.from("quiz_results").select("*").eq("user_id", user.id).order("taken_on", { ascending: false })
  ]);
  words = w.data || []; progress = new Set((pr.data || []).map(r => r.word_id));
  favs = new Set((fv.data || []).map(r => r.word_id)); results = rs.data || [];
}

/* ---------- routing ---------- */
$$("nav.bottom button").forEach(b => b.onclick = () => route(b.dataset.view));
function route(v) {
  ["today", "quiz", "dash", "bank"].forEach(x => $("#view-" + x).classList.toggle("hidden", x !== v));
  $$("nav.bottom button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  window.scrollTo(0, 0);
  ({ today: renderToday, quiz: renderQuiz, dash: renderDash, bank: renderBank })[v]();
}

/* ---------- TODAY ---------- */
function quizDueToday() {
  const n = CONFIG.QUIZ_EVERY_DAYS;
  if (todayDay % n !== 0) return false;
  return !results.some(r => r.day_number === todayDay);
}
function wordCard(w, { showDay = true } = {}) {
  const learned = progress.has(w.id), fav = favs.has(w.id);
  const ex = [w.example1, w.example2, w.example3].filter(Boolean);
  const re = new RegExp(`(${w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)`, "ig");
  return `
  <div class="word-hero">
    ${showDay ? `<div class="day">DAY ${w.day_number} OF ${CONFIG.TOTAL_DAYS}</div>` : ""}
    <div class="word">${esc(w.word)}</div>
    <div class="meaning">${esc(w.meaning)}</div>
    ${w.malayalam ? `<div class="ml">${esc(w.malayalam)}</div>` : ""}
    <div class="actions">
      <button data-act="speak">🔊 Listen</button>
      <button data-act="fav" class="${fav ? "on" : ""}">${fav ? "★ Saved" : "☆ Save to bank"}</button>
      <button data-act="ai">✨ Practise with AI</button>
    </div>
  </div>
  ${w.usage ? `<div class="card"><h2>How to use it</h2><p class="usage">${esc(w.usage)}</p></div>` : ""}
  ${ex.length ? `<div class="card"><h2>Examples</h2><ul class="examples">${ex.map((s, i) => `<li><span>${esc(s).replace(re, "<b>$1</b>")}</span><button data-say="${i}" title="Listen">🔊</button></li>`).join("")}</ul></div>` : ""}
  <button class="btn ${learned ? "done" : "teal"}" data-act="learn">${learned ? "✓ Learned" : "Mark as learned"}</button>`;
}
function bindWordCard(root, w) {
  root.onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    const act = b.dataset.act;
    if (b.dataset.say !== undefined) return speak([w.example1, w.example2, w.example3].filter(Boolean)[b.dataset.say]);
    if (act === "speak") return playWord(w);
    if (act === "ai") return aiSheet(w);
    if (act === "fav") {
      if (favs.has(w.id)) { await sb.from("favourites").delete().match({ user_id: user.id, word_id: w.id }); favs.delete(w.id); toast("Removed from bank"); }
      else { await sb.from("favourites").insert({ user_id: user.id, word_id: w.id }); favs.add(w.id); toast("Saved ★"); }
      return rerender();
    }
    if (act === "learn" && !progress.has(w.id)) {
      await sb.from("word_progress").insert({ user_id: user.id, word_id: w.id }); progress.add(w.id); toast("Great! Word learned 🎉"); return rerender();
    }
  };
}
let rerender = () => {};
function renderToday() {
  const el = $("#view-today");
  const w = words.find(x => x.day_number === todayDay);
  let html = "";
  if (quizDueToday()) html += `<div class="card" style="border:2px solid var(--yellow)"><div class="row"><div><b>Quiz day!</b><div class="muted">Test the last ${CONFIG.QUIZ_EVERY_DAYS} words before today's word.</div></div><button class="btn small" id="go-quiz">Start</button></div></div>`;
  const missed = words.filter(x => x.day_number < todayDay && !progress.has(x.id));
  if (missed.length) html += `<div class="card"><div class="row"><div><b>${missed.length} missed word${missed.length > 1 ? "s" : ""}</b><div class="muted">Catch up in your Word Bank.</div></div><button class="btn small outline" id="go-missed">View</button></div></div>`;
  html += w ? wordCard(w) : `<div class="card center"><h2>Day ${todayDay}</h2><p>Today's word isn't published yet. Check back soon!</p></div>`;
  el.innerHTML = html;
  if (w) bindWordCard(el, w);
  rerender = renderToday;
  const q = $("#go-quiz"); if (q) q.onclick = () => route("quiz");
  const m = $("#go-missed"); if (m) m.onclick = () => { bankTab = "missed"; route("bank"); };
}

/* ---------- AI practice ---------- */
function aiSheet(w) {
  const prompt = `I am learning the English word "${w.word}" (meaning: ${w.meaning}). I am from Kerala, India, intermediate level. Please: 1) Give me 3 new example sentences in office, interview and daily-life contexts. 2) Ask me to write one sentence using it and correct my mistakes gently. Keep replies short.`;
  modal(`<h3 style="color:var(--navy);margin-bottom:6px">Practise "${esc(w.word)}" with AI</h3>
  <p class="muted" style="margin-bottom:12px">Copy the prompt, open your AI, paste it.</p>
  <textarea class="search" rows="6" readonly id="ai-prompt">${esc(prompt)}</textarea>
  <button class="btn" id="ai-copy">📋 Copy prompt</button>
  <div style="display:flex;gap:8px;margin-top:10px">
    <a class="btn outline" target="_blank" href="https://claude.ai/new">Open Claude</a>
    <a class="btn outline" target="_blank" href="https://gemini.google.com/app">Open Gemini</a>
    <a class="btn outline" target="_blank" href="https://chatgpt.com/">ChatGPT</a>
  </div>`);
  $("#ai-copy").onclick = () => { navigator.clipboard.writeText(prompt).then(() => toast("Prompt copied ✓")); };
}
function modal(inner) {
  $("#modal-root").innerHTML = `<div class="modal"><div class="sheet"><button class="close">×</button>${inner}</div></div>`;
  $("#modal-root .close").onclick = closeModal;
  $("#modal-root .modal").onclick = e => { if (e.target.classList.contains("modal")) closeModal(); };
}
function closeModal() { $("#modal-root").innerHTML = ""; }

/* ---------- QUIZ ---------- */
let quiz = null;
function renderQuiz() {
  const el = $("#view-quiz");
  const n = CONFIG.QUIZ_EVERY_DAYS;
  const from = todayDay - n + 1;
  const set = words.filter(w => w.day_number >= from && w.day_number <= todayDay);
  const qs = set.flatMap(w => (w.quizzes || []).map(q => ({ ...q, word: w })));
  if (!qs.length) { el.innerHTML = `<div class="card center"><p>No quiz available yet.</p><button class="btn ghost" onclick="route('today')">Back</button></div>`; return; }
  if (!quizDueToday() && !quiz) {
    el.innerHTML = `<div class="card center"><p>Your next quiz comes on day ${Math.ceil((todayDay + 1) / n) * n}.</p><button class="btn ghost" onclick="route('today')">Back</button></div>`; return;
  }
  quiz = quiz || { i: 0, score: 0, wrong: [], qs: qs.sort(() => Math.random() - .5) };
  const q = quiz.qs[quiz.i];
  if (!q) return finishQuiz();
  el.innerHTML = `<div class="card">
    <div class="row"><span class="pill yellow">Quiz · Days ${from}–${todayDay}</span><span class="muted">${quiz.i + 1} / ${quiz.qs.length}</span></div>
    <div class="qbar" style="margin-top:12px"><div style="width:${quiz.i / quiz.qs.length * 100}%"></div></div>
    <div class="q">${esc(q.question)}</div>
    <div class="opts">${["a", "b", "c", "d"].map(k => `<button data-k="${k}">${esc(q["option_" + k])}</button>`).join("")}</div>
  </div>`;
  $$(".opts button", el).forEach(b => b.onclick = () => {
    const ok = b.dataset.k === q.correct;
    b.classList.add(ok ? "correct" : "wrong");
    if (!ok) { $(`.opts button[data-k="${q.correct}"]`, el).classList.add("correct"); quiz.wrong.push(q.word.id); } else quiz.score++;
    $$(".opts button", el).forEach(x => x.disabled = true);
    setTimeout(() => { quiz.i++; renderQuiz(); }, 900);
  });
}
async function finishQuiz() {
  const { score, qs, wrong } = quiz;
  const row = { user_id: user.id, day_number: todayDay, score, total: qs.length, wrong_words: [...new Set(wrong)] };
  await sb.from("quiz_results").insert(row); results.unshift(row);
  const pct = Math.round(score / qs.length * 100);
  $("#view-quiz").innerHTML = `<div class="card center">
    <div class="score-big">${score}/${qs.length}</div>
    <p style="font-size:18px;font-weight:700;color:var(--navy)">${pct === 100 ? "Perfect! 🏆" : pct >= 60 ? "Well done 👏" : "Keep practising 💪"}</p>
    ${wrong.length ? `<p class="muted" style="margin:10px 0">Words to revise are marked in your Word Bank.</p>` : ""}
    <button class="btn" style="margin-top:14px" id="q-done">Continue to today's word</button></div>`;
  quiz = null;
  $("#q-done").onclick = () => route("today");
}

/* ---------- DASHBOARD ---------- */
function renderDash() {
  const learned = progress.size, pct = Math.min(100, learned / CONFIG.TOTAL_DAYS * 100);
  const last = results[0];
  const avg = results.length ? Math.round(results.reduce((a, r) => a + r.score / r.total, 0) / results.length * 100) : null;
  $("#view-dash").innerHTML = `
  <div class="stats">
    <div class="stat"><div class="n">${learned}</div><div class="l">Words learned</div></div>
    <div class="stat"><div class="n">${profile.streak || 0}🔥</div><div class="l">Day streak</div></div>
    <div class="stat"><div class="n">${todayDay}</div><div class="l">Your day</div></div>
  </div>
  <div class="card"><h2>Programme progress</h2>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="row muted"><span>${learned} of ${CONFIG.TOTAL_DAYS} words</span><span>${pct.toFixed(1)}%</span></div></div>
  <div class="card"><h2>Quizzes</h2>
    ${results.length ? `<div class="row"><span>Last quiz</span><b>${last.score}/${last.total}</b></div>
    <div class="row" style="margin-top:6px"><span>Average score</span><b>${avg}%</b></div>
    <div class="row" style="margin-top:6px"><span>Quizzes taken</span><b>${results.length}</b></div>` : `<p class="muted">No quizzes yet. Your first comes on day ${CONFIG.QUIZ_EVERY_DAYS}.</p>`}
  </div>
  <div class="card"><h2>Account</h2>
    <div class="row"><span>User</span><b>${esc((user.email || "").split("@")[0])}</b></div>
    <div class="row" style="margin-top:6px"><span>Started</span><b>${profile.start_date}</b></div>
    ${profile.paid_until ? `<div class="row" style="margin-top:6px"><span>Valid till</span><b>${profile.paid_until}</b></div>` : ""}
  </div>`;
}

/* ---------- WORD BANK ---------- */
let bankTab = "learned", bankQuery = "";
function renderBank() {
  const el = $("#view-bank");
  const revise = new Set(results.flatMap(r => r.wrong_words || []));
  const lists = {
    learned: words.filter(w => progress.has(w.id)),
    favourites: words.filter(w => favs.has(w.id)),
    revise: words.filter(w => revise.has(w.id)),
    missed: words.filter(w => w.day_number < todayDay && !progress.has(w.id))
  };
  const q = bankQuery.toLowerCase();
  const list = lists[bankTab].filter(w => !q || w.word.toLowerCase().includes(q) || (w.meaning || "").toLowerCase().includes(q)).sort((a, b) => b.day_number - a.day_number);
  el.innerHTML = `
  <input class="search" id="bank-q" placeholder="Search words…" value="${esc(bankQuery)}">
  <div class="tabs">${Object.keys(lists).map(k => `<button data-tab="${k}" class="${bankTab === k ? "active" : ""}">${k[0].toUpperCase() + k.slice(1)} (${lists[k].length})</button>`).join("")}</div>
  <div class="wlist">${list.length ? list.map(w => `
    <div class="item" data-id="${w.id}">
      <div><div class="w">${esc(w.word)}${revise.has(w.id) ? '<span class="badge">REVISE</span>' : ""}</div><div class="m">Day ${w.day_number} · ${esc(w.meaning)}</div></div>
      <button class="star ${favs.has(w.id) ? "on" : ""}" data-fav="${w.id}">★</button>
    </div>`).join("") : `<div class="card center muted">Nothing here yet.</div>`}</div>`;
  $("#bank-q").oninput = e => { bankQuery = e.target.value; const pos = e.target.selectionStart; renderBank(); const i = $("#bank-q"); i.focus(); i.setSelectionRange(pos, pos); };
  $$(".tabs button", el).forEach(b => b.onclick = () => { bankTab = b.dataset.tab; renderBank(); });
  el.querySelector(".wlist").onclick = async e => {
    const star = e.target.closest("[data-fav]");
    if (star) {
      const id = +star.dataset.fav;
      if (favs.has(id)) { await sb.from("favourites").delete().match({ user_id: user.id, word_id: id }); favs.delete(id); }
      else { await sb.from("favourites").insert({ user_id: user.id, word_id: id }); favs.add(id); }
      return renderBank();
    }
    const item = e.target.closest(".item"); if (!item) return;
    const w = words.find(x => x.id === +item.dataset.id);
    modal(`<div id="bank-word">${wordCard(w)}</div>`);
    const root = $("#bank-word"); bindWordCard(root, w);
    rerender = () => { root.innerHTML = wordCard(w); renderBank(); };
  };
}

/* ---------- start ---------- */
if ("speechSynthesis" in window) speechSynthesis.getVoices();
boot();
