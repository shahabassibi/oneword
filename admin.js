/* OneWord — admin page */
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let words = [];

$("#logout").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };

(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.href = "index.html";
  const { data: p } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).single();
  if (!p || !p.is_admin) return $("#denied").classList.remove("hidden");
  $("#panel").classList.remove("hidden");
  await loadWords();
  $$(".tabs button").forEach(b => b.onclick = () => {
    $$(".tabs button").forEach(x => x.classList.toggle("active", x === b));
    ["words", "add", "import", "users"].forEach(t => $("#tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
    if (b.dataset.tab === "users") loadUsers();
  });
})();

/* ---------- words ---------- */
async function loadWords() {
  const { data } = await sb.from("words").select("*, quizzes(*)").order("day_number");
  words = data || []; renderWords();
}
function renderWords() {
  const q = ($("#w-search").value || "").toLowerCase();
  const list = words.filter(w => !q || w.word.toLowerCase().includes(q) || String(w.day_number) === q);
  $("#w-count").textContent = words.length;
  $("#w-table tbody").innerHTML = list.map(w => `<tr>
    <td>${w.day_number}</td><td><b>${esc(w.word)}</b></td><td>${esc(w.meaning)}</td><td>${esc(w.malayalam)}</td>
    <td>${(w.quizzes || []).length ? "✓" : '<span class="badge">none</span>'}</td>
    <td><button class="btn small outline" data-edit="${w.id}">Edit</button> <button class="btn small ghost" data-del="${w.id}">Delete</button></td></tr>`).join("");
}
$("#w-search").oninput = renderWords;
$("#w-table").onclick = async e => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) { fillForm(words.find(w => w.id === +ed.dataset.edit)); $$(".tabs button")[1].click(); }
  if (del && confirm("Delete this word and its quiz?")) { await sb.from("words").delete().eq("id", +del.dataset.del); loadWords(); }
};

/* ---------- add / edit ---------- */
const F = ["day", "word", "meaning", "malayalam", "usage", "ex1", "ex2", "ex3", "audio", "q", "a", "b", "c", "d", "correct"];
function fillForm(w) {
  const qz = (w.quizzes || [])[0] || {};
  $("#f-id").value = w.id; $("#f-day").value = w.day_number; $("#f-word").value = w.word; $("#f-meaning").value = w.meaning;
  $("#f-malayalam").value = w.malayalam || ""; $("#f-usage").value = w.usage || "";
  $("#f-ex1").value = w.example1 || ""; $("#f-ex2").value = w.example2 || ""; $("#f-ex3").value = w.example3 || ""; $("#f-audio").value = w.audio_url || "";
  $("#f-q").value = qz.question || ""; $("#f-a").value = qz.option_a || ""; $("#f-b").value = qz.option_b || ""; $("#f-c").value = qz.option_c || ""; $("#f-d").value = qz.option_d || ""; $("#f-correct").value = qz.correct || "a";
}
$("#f-reset").onclick = () => { $("#w-form").reset(); $("#f-id").value = ""; $("#f-msg").innerHTML = ""; };
$("#w-form").onsubmit = async e => {
  e.preventDefault();
  const row = {
    day_number: +$("#f-day").value, word: $("#f-word").value.trim(), meaning: $("#f-meaning").value.trim(),
    malayalam: $("#f-malayalam").value.trim(), usage: $("#f-usage").value.trim(),
    example1: $("#f-ex1").value.trim(), example2: $("#f-ex2").value.trim(), example3: $("#f-ex3").value.trim(),
    audio_url: $("#f-audio").value.trim() || null
  };
  const quiz = $("#f-q").value.trim() ? { question: $("#f-q").value.trim(), option_a: $("#f-a").value.trim(), option_b: $("#f-b").value.trim(), option_c: $("#f-c").value.trim(), option_d: $("#f-d").value.trim(), correct: $("#f-correct").value } : null;
  const r = await saveWord(row, quiz, $("#f-id").value ? +$("#f-id").value : null);
  $("#f-msg").innerHTML = r.error ? `<div class="err">${esc(r.error.message)}</div>` : `<div class="ok">Saved "${esc(row.word)}" as day ${row.day_number}.</div>`;
  if (!r.error) { $("#w-form").reset(); $("#f-id").value = ""; loadWords(); }
};
async function saveWord(row, quiz, id) {
  let res;
  if (id) res = await sb.from("words").update(row).eq("id", id).select().single();
  else res = await sb.from("words").upsert(row, { onConflict: "day_number" }).select().single();
  if (res.error) return res;
  const wid = res.data.id;
  if (quiz) {
    await sb.from("quizzes").delete().eq("word_id", wid);
    const q = await sb.from("quizzes").insert({ ...quiz, word_id: wid });
    if (q.error) return q;
  }
  return res;
}

/* ---------- bulk import ---------- */
$("#imp-btn").onclick = async () => {
  const lines = $("#imp-text").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let ok = 0, fail = [];
  for (const line of lines) {
    const c = line.split("\t").map(s => s.trim());
    if (c.length < 3 || isNaN(+c[0])) continue;                       // skips header / blank rows
    const row = { day_number: +c[0], word: c[1], meaning: c[2], malayalam: c[3] || "", usage: c[4] || "", example1: c[5] || "", example2: c[6] || "", example3: c[7] || "" };
    const quiz = c[8] ? { question: c[8], option_a: c[9] || "", option_b: c[10] || "", option_c: c[11] || "", option_d: c[12] || "", correct: (c[13] || "a").toLowerCase()[0] } : null;
    const r = await saveWord(row, quiz, null);
    r.error ? fail.push(`Day ${c[0]}: ${r.error.message}`) : ok++;
  }
  $("#imp-msg").innerHTML = `<div class="${fail.length ? "err" : "ok"}">Imported ${ok} word(s).${fail.length ? "<br>" + fail.map(esc).join("<br>") : ""}</div>`;
  if (ok) { $("#imp-text").value = ""; loadWords(); }
};

/* ---------- users ---------- */
async function loadUsers() {
  const [{ data: users }, { data: prog }] = await Promise.all([
    sb.from("profiles").select("*").order("created_at", { ascending: false }),
    sb.from("word_progress").select("user_id")
  ]);
  const learned = {}; (prog || []).forEach(r => learned[r.user_id] = (learned[r.user_id] || 0) + 1);
  $("#u-table tbody").innerHTML = (users || []).map(u => `<tr data-id="${u.id}">
    <td><b>${esc((u.email || "").split("@")[0])}</b>${u.is_admin ? ' <span class="pill">admin</span>' : ""}</td>
    <td>${esc(u.full_name)}<br><span class="muted">${esc(u.phone)}</span></td>
    <td>${u.start_date || ""}</td><td>${u.streak || 0}</td><td>${learned[u.id] || 0}</td>
    <td><input type="date" value="${u.paid_until || ""}" data-field="paid_until"></td>
    <td><input type="checkbox" ${u.paid ? "checked" : ""} data-field="paid"></td></tr>`).join("");
  $("#u-table").onchange = async e => {
    const inp = e.target, tr = inp.closest("tr"); if (!inp.dataset.field) return;
    const val = inp.type === "checkbox" ? inp.checked : (inp.value || null);
    const { error } = await sb.from("profiles").update({ [inp.dataset.field]: val }).eq("id", tr.dataset.id);
    tr.style.background = error ? "#fde8e6" : "#e3f7f3"; setTimeout(() => tr.style.background = "", 800);
  };
}
