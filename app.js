/* OneWord — main app  (plain JS, no build tools)
   Progress model: your word number = words learned + 1, capped by calendar days since you started.
   Quiz after every QUIZ_EVERY_DAYS learned words. */
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const WA = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=` + encodeURIComponent("Hi, I want to join OneWord (₹499/year).");
const N = CONFIG.QUIZ_EVERY_DAYS, TOTAL = CONFIG.TOTAL_DAYS, TOTAL_QUIZ = Math.floor(TOTAL / N);

let user = null, profile = null, words = [], progress = new Map(), favs = new Set(), results = [];
let calendarDay = 1, currentDay = 1, learned = 0, missedDays = 0;

/* ---------- helpers ---------- */
const todayStr = () => new Date().toLocaleDateString("en-CA");
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const esc = s => (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
function show(id) { ["view-auth", "view-expired", "app"].forEach(v => $("#" + v).classList.toggle("hidden", v !== id)); }
function speak(text) {
  if (!("speechSynthesis" in window)) return toast("Audio not supported on this browser");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices();
  u.voice = v.find(x => /en-IN/i.test(x.lang)) || v.find(x => /en-GB/i.test(x.lang)) || v.find(x => /^en/i.test(x.lang)) || null;
  u.rate = 0.9; speechSynthesis.speak(u);
}
function playWord(w) { if (w.audio_url) new Audio(w.audio_url).play().catch(() => speak(w.word)); else speak(w.word); }
const wordByDay = d => words.find(w => w.day_number === d);

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
  calendarDay = Math.max(1, daysBetween(profile.start_date, todayStr()) + 1);
  await updateStreak();
  await loadData();
  show("app"); route("today");
}
async function updateStreak() {
  const t = todayStr(), last = profile.last_seen;
  if (last === t) return;
  const gap = last ? daysBetween(last, t) : 0;
  missedDays = gap > 1 ? gap - 1 : 0;
  profile.streak = gap === 1 ? (profile.streak || 0) + 1 : 1;
  profile.last_seen = t;
  await sb.from("profiles").update({ streak: profile.streak, last_seen: t }).eq("id", user.id);
}
async function loadData() {
  const [pr, fv, rs] = await Promise.all([
    sb.from("word_progress").select("word_id, learned_on").eq("user_id", user.id),
    sb.from("favourites").select("word_id").eq("user_id", user.id),
    sb.from("quiz_results").select("*").eq("user_id", user.id).order("taken_on", { ascending: false })
  ]);
  progress = new Map((pr.data || []).map(r => [r.word_id, r.learned_on]));
  favs = new Set((fv.data || []).map(r => r.word_id)); results = rs.data || [];
  await recompute(true);
}
async function recompute(fetch = false) {
  learned = progress.size;
  currentDay = Math.min(learned + 1, calendarDay, TOTAL);
  if (fetch || !wordByDay(currentDay + 3)) {
    const { data } = await sb.from("words").select("*, quizzes(*)").lte("day_number", currentDay + 3).order("day_number");
    words = data || [];
  }
}

/* ---------- routing ---------- */
$$("nav.bottom button").forEach(b => b.onclick = () => route(b.dataset.view));
function route(v) {
  ["today", "quiz", "dash", "bank"].forEach(x => $("#view-" + x).classList.toggle("hidden", x !== v));
  $$("nav.bottom button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  window.scrollTo(0, 0);
  ({ today: renderToday, quiz: renderQuiz, dash: renderDash, bank: renderBank })[v]();
}

/* ---------- word card ---------- */
function wordCard(w, { showDay = true } = {}) {
  const isLearned = progress.has(w.id), fav = favs.has(w.id);
  const ex = [w.example1, w.example2, w.example3].filter(Boolean);
  const re = new RegExp(`(${w.word.slice(0, Math.max(4, w.word.length - 3)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)`, "ig");
  return `
  <div class="word-hero">
    ${showDay ? `<div class="day">WORD ${w.day_number} OF ${TOTAL}</div>` : ""}
    <div class="word">${esc(w.word)}</div>
    <div class="meaning">${esc(w.meaning)}</div>
    ${w.malayalam ? `<div class="ml">${esc(w.malayalam)}</div>` : ""}
    <div class="actions">
      <button data-act="speak">🔊 Listen</button>
      <button data-act="fav" class="${fav ? "on" : ""}">${fav ? "★ Saved" : "☆ Save"}</button>
      <button data-act="ai">✨ Practise with AI</button>
    </div>
  </div>
  ${w.usage ? `<div class="card"><h2>How to use it</h2><p class="usage">${esc(w.usage)}</p></div>` : ""}
  ${ex.length ? `<div class="card"><h2>Examples</h2><ul class="examples">${ex.map((s, i) => `<li><span>${esc(s).replace(re, "<b>$1</b>")}</span><button data-say="${i}" title="Listen">🔊</button></li>`).join("")}</ul></div>` : ""}
  <button class="btn ${isLearned ? "done" : "teal"}" data-act="learn">${isLearned ? "✓ Learned" : "Mark as learned"}</button>`;
}
function bindWordCard(root, w, afterLearn) {
  root.onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.say !== undefined) return speak([w.example1, w.example2, w.example3].filter(Boolean)[b.dataset.say]);
    const act = b.dataset.act;
    if (act === "speak") return playWord(w);
    if (act === "ai") return aiSheet(w);
    if (act === "fav") {
      if (favs.has(w.id)) { await sb.from("favourites").delete().match({ user_id: user.id, word_id: w.id }); favs.delete(w.id); toast("Removed from bank"); }
      else { await sb.from("favourites").insert({ user_id: user.id, word_id: w.id }); favs.add(w.id); toast("Saved ★"); }
      return rerender();
    }
    if (act === "learn" && !progress.has(w.id)) {
      await sb.from("word_progress").insert({ user_id: user.id, word_id: w.id });
      progress.set(w.id, todayStr()); await recompute();
      toast("Great! Word learned 🎉");
      return afterLearn ? afterLearn() : rerender();
    }
  };
}
let rerender = () => {};

/* ---------- TODAY ---------- */
function quizDue() { return learned > 0 && learned % N === 0 && !results.some(r => r.day_number === learned / N); }
function renderToday() {
  const el = $("#view-today");
  const w = wordByDay(currentDay);
  let html = "";
  if (missedDays > 0) { html += `<div class="card" style="border-left:4px solid var(--yellow)"><b>Welcome back!</b><div class="muted">You were away ${missedDays} day${missedDays > 1 ? "s" : ""}. Your streak restarted, but your words waited for you. Pick up where you left off.</div></div>`; missedDays = 0; }
  if (quizDue()) {
    html += `<div class="card" style="border:2px solid var(--yellow)"><div class="row"><div><b>Quiz time!</b><div class="muted">Test words ${learned - N + 1}–${learned} before your next word.</div></div><button class="btn small" id="go-quiz">Start</button></div></div>`;
    if (!progress.has(w?.id)) { el.innerHTML = html + `<div class="card center muted">Finish the quiz to unlock word ${currentDay}.</div>`; $("#go-quiz").onclick = () => route("quiz"); return; }
  }
  const caughtUp = learned >= calendarDay;
  if (w && progress.has(w.id) && caughtUp) {
    html += `<div class="card center"><div class="pill teal">All done for today ✓</div><p style="margin-top:10px">Your next word unlocks tomorrow. Revise in your Word Bank.</p></div>`;
  }
  if (w) html += wordCard(w);
  else html += `<div class="card center"><p>Word ${currentDay} isn't published yet. Check back soon!</p></div>`;
  html += upcomingHtml();
  el.innerHTML = html;
  if (w) bindWordCard(el, w, () => renderToday());
  rerender = renderToday;
  const q = $("#go-quiz"); if (q) q.onclick = () => route("quiz");
}
function upcomingHtml() {
  const up = [1, 2, 3].map(i => wordByDay(currentDay + i)).filter(Boolean);
  if (!up.length) return "";
  return `<div class="card"><h2>Coming up</h2>${up.map(u => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b style="color:var(--navy)">${esc(u.word)}</b> <span class="muted">· word ${u.day_number}</span></span><span class="muted">🔒</span></div>`).join("")}</div>`;
}

/* ---------- AI practice ---------- */
function aiSheet(w) {
  const prompt = `I am learning the English word "${w.word}" (meaning: ${w.meaning}). I am from Kerala, India, intermediate level. Please: 1) Give me 3 new example sentences in office, interview and daily-life contexts. 2) Ask me to write one sentence using it and correct my mistakes gently. Keep replies short.`;
  modal(`<h3 style="color:var(--navy);margin-bottom:6px">Practise "${esc(w.word)}" with AI</h3>
  <p class="muted" style="margin-bottom:12px">Copy the prompt, open your AI, paste it.</p>
  <textarea class="search" rows="6" readonly>${esc(prompt)}</textarea>
  <button class="btn" id="ai-copy">📋 Copy prompt</button>
  <div style="display:flex;gap:8px;margin-top:10px">
    <a class="btn outline" target="_blank" href="https://claude.ai/new">Claude</a>
    <a class="btn outline" target="_blank" href="https://gemini.google.com/app">Gemini</a>
    <a class="btn outline" target="_blank" href="https://chatgpt.com/">ChatGPT</a>
  </div>`);
  $("#ai-copy").onclick = () => navigator.clipboard.writeText(prompt).then(() => toast("Prompt copied ✓"));
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
  if (!quizDue() && !quiz) {
    const next = (Math.floor(learned / N) + 1) * N;
    el.innerHTML = `<div class="card center"><p>Your next quiz comes after word ${next}.</p><p class="muted">${next - learned} more word${next - learned > 1 ? "s" : ""} to go.</p><button class="btn ghost" onclick="route('today')">Back</button></div>`; return;
  }
  if (!quiz) {
    const from = learned - N + 1;
    const set = words.filter(w => w.day_number >= from && w.day_number <= learned);
    const qs = set.flatMap(w => (w.quizzes || []).map(q => ({ ...q, word: w })));
    if (!qs.length) { el.innerHTML = `<div class="card center"><p>No quiz questions found for these words.</p><button class="btn ghost" onclick="route('today')">Back</button></div>`; return; }
    quiz = { i: 0, score: 0, wrong: [], from, qs: qs.sort(() => Math.random() - .5) };
  }
  const q = quiz.qs[quiz.i];
  if (!q) return finishQuiz();
  el.innerHTML = `<div class="card">
    <div class="row"><span class="pill yellow">Quiz ${learned / N} · Words ${quiz.from}–${learned}</span><span class="muted">${quiz.i + 1} / ${quiz.qs.length}</span></div>
    <div class="qbar" style="margin-top:12px"><div style="width:${quiz.i / quiz.qs.length * 100}%"></div></div>
    <div class="q">${esc(q.question)}</div>
    <div class="opts">${["a", "b", "c", "d"].map(k => `<button data-k="${k}">${esc(q["option_" + k])}</button>`).join("")}</div></div>`;
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
  const row = { user_id: user.id, day_number: learned / N, score, total: qs.length, wrong_words: [...new Set(wrong)] };
  await sb.from("quiz_results").insert(row); results.unshift({ ...row, taken_on: new Date().toISOString() });
  const pct = Math.round(score / qs.length * 100);
  $("#view-quiz").innerHTML = `<div class="card center">
    <div class="score-big">${score}/${qs.length}</div>
    <p style="font-size:18px;font-weight:700;color:var(--navy)">${pct === 100 ? "Perfect! 🏆" : pct >= 60 ? "Well done 👏" : "Keep practising 💪"}</p>
    ${wrong.length ? `<p class="muted" style="margin:10px 0">Words to revise are marked in your Word Bank.</p>` : ""}
    <button class="btn" style="margin-top:14px" id="q-done">Continue</button></div>`;
  quiz = null;
  $("#q-done").onclick = () => route("today");
}

/* ---------- DASHBOARD ---------- */
function ring(pct, label, value, color) {
  const r = 44, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
  return `<div class="ring"><svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="${r}" fill="none" stroke="#e6ecf5" stroke-width="10"/>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 55 55)"/>
    <text x="55" y="52" text-anchor="middle" font-size="22" font-weight="800" fill="#10306B">${value}</text>
    <text x="55" y="70" text-anchor="middle" font-size="10" fill="#6b7585">${label}</text></svg></div>`;
}
function activityChart() {
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return d.toLocaleDateString("en-CA"); });
  const counts = days.map(d => [...progress.values()].filter(x => x === d).length);
  const max = Math.max(1, ...counts);
  return `<div class="bars">${days.map((d, i) => `<div class="bar" title="${d}: ${counts[i]}"><div style="height:${counts[i] / max * 100}%;${counts[i] ? "" : "background:#e6ecf5"}"></div><span>${new Date(d).toLocaleDateString("en", { weekday: "narrow" })}</span></div>`).join("")}</div>`;
}
function renderDash() {
  const quizzesTaken = results.length, quizzesLeft = Math.max(0, TOTAL_QUIZ - quizzesTaken);
  const avg = results.length ? Math.round(results.reduce((a, r) => a + r.score / r.total, 0) / results.length * 100) : 0;
  const best = Math.max(0, ...results.map(r => Math.round(r.score / r.total * 100)));
  const behind = Math.max(0, calendarDay - learned - 1);
  $("#view-dash").innerHTML = `
  <div class="card" style="background:linear-gradient(135deg,var(--navy),var(--blue));color:#fff">
    <div class="row"><div><div style="font-size:13px;opacity:.85">Hello, ${esc(profile.full_name || (user.email || "").split("@")[0])}</div><div style="font-size:24px;font-weight:800">Day ${calendarDay} · ${profile.streak || 0}🔥 streak</div></div>
    <div style="text-align:right"><div style="font-size:34px;font-weight:800">${learned}</div><div style="font-size:12px;opacity:.85">words learned</div></div></div>
    ${behind ? `<div style="margin-top:10px;background:rgba(255,255,255,.15);padding:8px 12px;border-radius:10px;font-size:13px">You're ${behind} word${behind > 1 ? "s" : ""} behind the daily pace. Catch up today!</div>` : `<div style="margin-top:10px;background:rgba(255,255,255,.15);padding:8px 12px;border-radius:10px;font-size:13px">You're on pace. Keep it up!</div>`}
  </div>
  <div class="rings">
    ${ring(learned / TOTAL, "learned", learned, "#1E63D8")}
    ${ring((TOTAL - learned) / TOTAL, "remaining", TOTAL - learned, "#F7B826")}
    ${ring(quizzesTaken / TOTAL_QUIZ, "quizzes", `${quizzesTaken}/${TOTAL_QUIZ}`, "#15B5A0")}
  </div>
  <div class="card"><h2>Programme progress</h2>
    <div class="progress"><div style="width:${learned / TOTAL * 100}%"></div></div>
    <div class="row muted"><span>${learned} of ${TOTAL} words</span><span>${(learned / TOTAL * 100).toFixed(1)}%</span></div>
    <div class="row muted" style="margin-top:4px"><span>${quizzesLeft} quizzes remaining</span><span>Next quiz after word ${(Math.floor(learned / N) + 1) * N}</span></div></div>
  <div class="card"><h2>Last 14 days</h2>${activityChart()}<p class="muted center" style="margin-top:6px">Words learned per day</p></div>
  <div class="stats">
    <div class="stat"><div class="n">${avg}%</div><div class="l">Avg quiz</div></div>
    <div class="stat"><div class="n">${best}%</div><div class="l">Best quiz</div></div>
    <div class="stat"><div class="n">${favs.size}</div><div class="l">Saved</div></div>
  </div>
  ${results.length ? `<div class="card"><h2>Recent quizzes</h2>${results.slice(0, 5).map(r => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>Quiz ${r.day_number} <span class="muted">· words ${(r.day_number - 1) * N + 1}–${r.day_number * N}</span></span><b style="color:${r.score / r.total >= .6 ? "#0e8a7a" : "#b42318"}">${r.score}/${r.total}</b></div>`).join("")}</div>` : ""}
  ${upcomingHtml()}
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
    revise: words.filter(w => revise.has(w.id))
  };
  const q = bankQuery.toLowerCase();
  const list = lists[bankTab].filter(w => !q || w.word.toLowerCase().includes(q) || (w.meaning || "").toLowerCase().includes(q)).sort((a, b) => b.day_number - a.day_number);
  el.innerHTML = `
  <input class="search" id="bank-q" placeholder="Search words…" value="${esc(bankQuery)}">
  <div class="tabs">${Object.keys(lists).map(k => `<button data-tab="${k}" class="${bankTab === k ? "active" : ""}">${k[0].toUpperCase() + k.slice(1)} (${lists[k].length})</button>`).join("")}</div>
  <div class="wlist">${list.length ? list.map(w => `
    <div class="item" data-id="${w.id}">
      <div><div class="w">${esc(w.word)}${revise.has(w.id) ? '<span class="badge">REVISE</span>' : ""}</div><div class="m">Word ${w.day_number} · ${esc(w.meaning)}</div></div>
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
