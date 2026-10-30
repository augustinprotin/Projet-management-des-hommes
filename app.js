(() => {
  // ---- Données à adapter ----
  const CITIES = {
    "Dijon": ["Montmuzard","Mansart","Maret","Champollion"],
    "Besançon": ["Canot","La Bouloie"],
    "Belfort": ["Duvillard"],
    "Montbéliard": [], "Auxerre": [], "Nevers": [], "Le Creusot": [], "Chalon-sur-Saône": [], "Mâcon": []
  };
  const GROUPS = {
    "Nuisibles": [["Cafards","Insectes"],["Punaises de lit","Piqûres, literie"],["Souris / rongeurs","Traces, bruits"]],
    "Dégâts et bâti": [["Isolation insuffisante","Froid, bruit"],["Humidité / moisissures","Murs, plafond"],["Fenêtre / serrure","Sécurité"]],
    "Équipements": [["Chauffage","Panne ou trop faible"],["Plomberie","Fuite, eau chaude"],["Électricité","Prises, lumière"]],
    "Autre": [["Autre","Précisez ci-dessous"]]
  };
  const CHANGE_GROUP = "Changement de chambre";
  const ORDER = [...Object.keys(GROUPS), CHANGE_GROUP];
  const GROUP_OF = {};
  Object.entries(GROUPS).forEach(([g, l]) => l.forEach(([n]) => GROUP_OF[n] = g));
  const ROOMS = [["Chambre individuelle",1,"1 personne"],["Chambre double",2,"2 personnes"],["Chambre triple",3,"3 personnes"],["Chambre de 4",4,"4 personnes"],["Appartement partagé",5,"T3 ou plus"]];
  const STEPS = ["Reçue","En cours","Traitée"];
  const PAGES = ["incident","change","mine","contact","mentions","accessibilite","donnees"];
  const KEY = "ma-residence-demandes";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  // ---- Stockage (avec reprise des anciennes demandes) ----
  let store = [];
  try { store = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  store.forEach(i => { i.group ||= i.type === "Changement" ? CHANGE_GROUP : (GROUP_OF[i.title] || "Autre"); i.data ||= {}; });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

  // ---- Remplissage des formulaires ----
  $("#cats").innerHTML = Object.entries(GROUPS).map(([g, l]) =>
    `<h3 class="grp">${g}</h3><div class="choices">` + l.map(([n, s]) =>
      `<label class="choice"><input type="radio" name="category" value="${n}"><span>${n}<small>${s}</small></span></label>`).join("") + `</div>`).join("");
  $("#rooms").innerHTML = ROOMS.map(([n, k, s]) =>
    `<label class="choice"><input type="radio" name="target" value="${n}"><span><b class="beds">${"<i></i>".repeat(k)}</b>${n}<small>${s}</small></span></label>`).join("");
  const cityOpts = (first) => `<option value="">${first}</option>` + Object.keys(CITIES).map(c => `<option>${c}</option>`).join("");
  $$("select[name=city]").forEach(s => s.innerHTML = cityOpts("Choisir la ville…"));
  $("select[name=wantedCity]").innerHTML = cityOpts("Peu importe");

  function bindCity(form, citySel, dl) {
    const sel = $(`select[name=${citySel}]`, $(form));
    const upd = () => $(dl).innerHTML = (CITIES[sel.value] || []).map(r => `<option value="${r}">`).join("");
    sel.addEventListener("change", upd); upd();
  }
  bindCity("#form-incident", "city", "#dl-incident");
  bindCity("#form-change", "city", "#dl-change");
  bindCity("#form-change", "wantedCity", "#dl-wanted");

  // ---- Navigation par ancre (#contact, #mine…) ----
  function show(tab) {
    if (!PAGES.includes(tab)) tab = "incident";
    $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $$(".panel").forEach(p => p.hidden = p.id !== "tab-" + tab);
    if (tab === "mine") render();
  }
  $$(".tabs button").forEach(b => b.onclick = () => { location.hash = b.dataset.tab; });
  window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (PAGES.includes(t)) { show(t); window.scrollTo(0, 0); } });

  let tt;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // ---- Édition ----
  let editing = null; // { id, formId }
  const LABEL = { "#form-incident": "Envoyer le signalement", "#form-change": "Envoyer la demande" };
  function setEdit(formId, item) {
    const form = $(formId);
    editing = item ? { id: item.id, formId } : null;
    let bar = $(".editing", form);
    if (!bar) { bar = document.createElement("p"); bar.className = "editing"; bar.hidden = true; form.prepend(bar); }
    bar.hidden = !item;
    bar.innerHTML = item ? `<span>Vous modifiez une demande déjà envoyée.</span><button type="button">Annuler la modification</button>` : "";
    if (item) $("button", bar).onclick = () => { form.reset(); setEdit(formId, null); show("mine"); location.hash = "mine"; };
    $(".btn", form).textContent = item ? "Enregistrer les modifications" : LABEL[formId];
  }
  function startEdit(item) {
    const formId = item.type === "Incident" ? "#form-incident" : "#form-change";
    const form = $(formId);
    form.reset();
    const d = item.data || {};
    Object.entries(d).forEach(([k, v]) => {
      $$(`[name=${k}]`, form).forEach(f => {
        if (f.type === "radio") f.checked = f.value === v;
        else if (f.type === "checkbox") f.checked = !!v;
        else if (f.type !== "file") f.value = v;
      });
      if (k === "city" || k === "wantedCity") $(`[name=${k}]`, form).dispatchEvent(new Event("change"));
    });
    setEdit(formId, item);
    location.hash = item.type === "Incident" ? "incident" : "change";
  }

  // ---- Envoi des formulaires ----
  function check(form, needChoice) {
    let ok = true;
    $$(".err", form).forEach(p => p.textContent = "");
    $$("[required]", form).forEach(f => {
      if (f.type === "radio") return;
      const bad = !f.value.trim() || (f.minLength > 0 && f.value.trim().length < f.minLength);
      f.classList.toggle("invalid", bad);
      if (bad) ok = false;
    });
    if (needChoice && !$(`input[name=${needChoice}]:checked`, form)) {
      $(`.err[data-for=${needChoice}]`, form).textContent = "Choisissez une option pour continuer.";
      ok = false;
    }
    if (!ok) toast("Complétez les champs signalés en rouge.");
    return ok;
  }

  function fromData(type, d) {
    return {
      group: type === "Incident" ? (GROUP_OF[d.category] || "Autre") : CHANGE_GROUP,
      title: type === "Incident" ? d.category : `Passage en ${d.target.toLowerCase()}`,
      place: `${d.city}, ${d.residence}, bât. ${d.building}, ch. ${d.room}`,
      urgency: d.urgency || "",
      detail: d.description || d.reason || "",
      extra: type === "Changement" && (d.wanted || d.wantedCity) ? "Souhaite : " + [d.wanted, d.wantedCity].filter(Boolean).join(", ") : ""
    };
  }

  function handle(formId, type, needChoice) {
    const form = $(formId);
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!check(form, needChoice)) return;
      const d = Object.fromEntries(new FormData(form));
      delete d.photo;
      d.linked = !!$("[name=linked]", form)?.checked;
      if (editing && editing.formId === formId) {
        const it = store.find(x => x.id === editing.id);
        Object.assign(it, fromData(type, d), { data: d, edited: new Date().toISOString() });
        toast("Modifications enregistrées.");
      } else {
        store.unshift({ id: Date.now(), type, date: new Date().toISOString(), status: 0, cancelled: false, data: d, ...fromData(type, d) });
        toast(type === "Incident" ? "Signalement envoyé. Suivez-le dans « Mes demandes »." : "Demande envoyée. Vous serez informé(e) de la décision.");
      }
      save(); form.reset(); setEdit(formId, null); updateCount(); location.hash = "mine";
    });
    form.addEventListener("input", e => e.target.classList.remove("invalid"));
  }
  handle("#form-incident", "Incident", "category");
  handle("#form-change", "Changement", "target");

  // ---- Contact ----
  const cf = $("#form-contact");
  cf.addEventListener("submit", e => {
    e.preventDefault();
    if (!check(cf)) return;
    cf.reset(); toast("Message envoyé. Nous vous répondrons dès que possible.");
  });
  cf.addEventListener("input", e => e.target.classList.remove("invalid"));

  // ---- Liste groupée par catégorie ----
  let filter = "all";
  function updateCount() { $("#count").textContent = store.filter(i => !i.cancelled).length; }
  const fmt = iso => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  function card(i) {
    const cls = i.cancelled ? "s-annule" : ["s-recu", "s-cours", "s-ok"][i.status];
    const lbl = i.cancelled ? "Annulée" : STEPS[i.status];
    const canEdit = !i.cancelled && i.status < 2;
    return `<li class="item ${esc(i.urgency)}">
      <div class="row"><h3>${esc(i.title)}</h3><span class="status ${cls}">${lbl}</span></div>
      <p>${esc(i.place)} · ${fmt(i.date)}${i.urgency ? " · Urgence : " + esc(i.urgency).toLowerCase() : ""}</p>
      ${i.detail ? `<p>${esc(i.detail)}</p>` : ""}${i.extra ? `<p>${esc(i.extra)}</p>` : ""}
      ${i.edited ? `<p class="edited">Modifiée le ${fmt(i.edited)}</p>` : ""}
      ${i.cancelled ? "" : `<div class="steps" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k <= i.status ? "on" : ""}"></i>`).join("")}</div>
      <div class="acts">${canEdit ? `<button class="link edit" data-edit="${i.id}">Modifier</button>` : ""}<button class="link" data-cancel="${i.id}">Annuler</button></div>`}
    </li>`;
  }

  function render() {
    const present = ORDER.filter(g => store.some(i => i.group === g));
    if (filter !== "all" && !present.includes(filter)) filter = "all";
    $("#filters").innerHTML = [["all", "Toutes", store.length], ...present.map(g => [g, g, store.filter(i => i.group === g).length])]
      .map(([v, l, n]) => `<button class="chip ${v === filter ? "on" : ""}" data-f="${esc(v)}">${esc(l)} (${n})</button>`).join("");
    $$("#filters .chip").forEach(c => c.onclick = () => { filter = c.dataset.f; render(); });

    $("#empty").hidden = store.length > 0;
    $("#list").innerHTML = present.filter(g => filter === "all" || g === filter).map(g => {
      const items = store.filter(i => i.group === g);
      return `<section class="group"><h2>${g}<span>${items.length}</span></h2><ul class="list">${items.map(card).join("")}</ul></section>`;
    }).join("");

    $$("[data-edit]").forEach(b => b.onclick = () => startEdit(store.find(x => x.id == b.dataset.edit)));
    $$("[data-cancel]").forEach(b => b.onclick = () => {
      const it = store.find(x => x.id == b.dataset.cancel);
      if (it && confirm("Annuler cette demande ?")) { it.cancelled = true; save(); updateCount(); render(); }
    });
  }

  updateCount();
  show(location.hash.slice(1));
})();
