(() => {
  "use strict";

  const CONFIG = window.SATANOS_CONFIG;
  const NAMES  = window.SATANOS_NAMES;
  const SINS   = window.SATANOS_SINS;

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const rand  = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const pad2  = (n) => String(n).padStart(2,"0");
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

  const punishments = SINS.map(s => s.punishment);

  const state = {
    day: CONFIG.startDay,
    hour: CONFIG.startHour,
    minute: 0,

    souls: [],
    selectedSoulId: null,

    doom: 0,
    quotaNeed: CONFIG.quotaStart,
    quotaDone: 0,

    lastSoulSpawnAtGameMin: CONFIG.startHour * 60,
    spawnEveryGameMin: CONFIG.spawnEveryGameMinStart,

    maxInbox: CONFIG.maxInbox,
    running: true,

    zTop: 10,
    taskButtons: new Map(),
    winStates: new Map(),
  };

  /* =========================
     Helpers
  ========================= */
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[s]));
  }

  function toast(msg){
    const t = $("#toast");
    t.style.display = "block";
    t.firstElementChild.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> t.style.display="none", 1600);
  }

  function formatGameTime(h, m){
    let ampm = h >= 12 ? "PM" : "AM";
    let hh = h % 12; if(hh === 0) hh = 12;
    return `${pad2(hh)}:${pad2(m)} ${ampm}`;
  }

  function formatRealClock(d=new Date()){
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function getInbox(){ return state.souls.filter(s => !s.processed); }
  function byId(id){ return state.souls.find(s => s.id === id) || null; }

  function setDoom(delta){
    state.doom = clamp(state.doom + delta, 0, 100);
    $("#doomPct").textContent = state.doom + "%";
    $("#doomBarInner").style.width = state.doom + "%";
    if(state.doom >= 100) loseGame();
  }

  function updateStatus(){
    $("#dayNum").textContent = state.day;
    $("#quotaNow").textContent = state.quotaDone;
    $("#quotaNeed").textContent = state.quotaNeed;
    $("#gameTime").textContent = formatGameTime(state.hour, state.minute);
    $("#mailCount").textContent = `${getInbox().length} unread`;
  }

  /* =========================
     Save/Load (Cookie-first; localStorage fallback)
  ========================= */
  const SAVE = CONFIG.save;

  function setCookie(name, value, days){
    const d = new Date();
    d.setTime(d.getTime() + (days*24*60*60*1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/;SameSite=Lax";
  }

  function getCookie(name){
    const n = name + "=";
    const decoded = decodeURIComponent(document.cookie || "");
    const parts = decoded.split(";");
    for(let p of parts){
      p = p.trim();
      if(p.indexOf(n) === 0) return p.substring(n.length);
    }
    return null;
  }

  function deleteCookie(name){
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  }

  function snapshotState(){
    const processedKeep = 12;
    const processed = state.souls.filter(s => s.processed).slice(-processedKeep);
    const unprocessed = state.souls.filter(s => !s.processed);

    return {
      v: SAVE.version,
      t: Date.now(),
      state: {
        day: state.day,
        hour: state.hour,
        minute: state.minute,
        doom: state.doom,
        quotaNeed: state.quotaNeed,
        quotaDone: state.quotaDone,
        lastSoulSpawnAtGameMin: state.lastSoulSpawnAtGameMin,
        spawnEveryGameMin: state.spawnEveryGameMin,
        maxInbox: state.maxInbox,
        selectedSoulId: state.selectedSoulId,
        souls: [...processed, ...unprocessed]
      }
    };
  }

  function applySnapshot(snap){
    if(!snap || !snap.state) return false;
    if(snap.v !== SAVE.version) return false;

    const s = snap.state;
    state.day = s.day;
    state.hour = s.hour;
    state.minute = s.minute;
    state.doom = s.doom;
    state.quotaNeed = s.quotaNeed;
    state.quotaDone = s.quotaDone;
    state.lastSoulSpawnAtGameMin = s.lastSoulSpawnAtGameMin;
    state.spawnEveryGameMin = s.spawnEveryGameMin;
    state.maxInbox = s.maxInbox;
    state.selectedSoulId = s.selectedSoulId;
    state.souls = Array.isArray(s.souls) ? s.souls : [];

    $("#doomPct").textContent = state.doom + "%";
    $("#doomBarInner").style.width = state.doom + "%";

    renderMail();
    renderPreviewSafe();
    updateStatus();
    renderPics();

    return true;
  }

  function saveGame(){
    try{
      const payload = JSON.stringify(snapshotState());
      setCookie(SAVE.cookieName, payload, SAVE.cookieDays);

      const back = getCookie(SAVE.cookieName);
      if(back !== payload){
        localStorage.setItem(SAVE.cookieName, payload);
        setCookie(SAVE.cookieName, "__LS__", SAVE.cookieDays);
      }
    }catch(_){
      try{
        localStorage.setItem(SAVE.cookieName, JSON.stringify(snapshotState()));
        setCookie(SAVE.cookieName, "__LS__", SAVE.cookieDays);
      }catch(__){}
    }
  }

  function loadGame(){
    try{
      const raw = getCookie(SAVE.cookieName);
      if(!raw) return false;

      let dataStr = raw;
      if(raw === "__LS__"){
        dataStr = localStorage.getItem(SAVE.cookieName);
        if(!dataStr) return false;
      }

      const snap = JSON.parse(dataStr);
      return applySnapshot(snap);
    }catch(_){
      return false;
    }
  }

  function clearSave(){
    deleteCookie(SAVE.cookieName);
    try{ localStorage.removeItem(SAVE.cookieName); }catch(_){}
  }

  /* =========================
     Soul generation
  ========================= */
  function makeSoul(idNum){
    const sin = rand(SINS);
    const first = rand(NAMES.first);
    const last  = rand(NAMES.last);

    const id = "SOUL-" + pad2(Math.floor(Math.random()*90)+10) + "-" + pad2(idNum % 100) + "-" + pad2(Math.floor(Math.random()*90)+10);

    const cause = rand(sin.clues.causes);
    const acc   = rand(sin.clues.accomplishments);
    const fam   = rand(sin.clues.family);

    const subject = `${last}, ${first} — Intake Packet`;

    return {
      id, first, last, name:`${first} ${last}`,
      subject,
      sinKey: sin.key,
      sinPunish: sin.punishment,
      cause, acc, fam,
      createdAt: Date.now(),
      processed:false,
      mistakes:0
    };
  }

  /* =========================
     Window Manager
  ========================= */
  function focusWindow(win){
    state.zTop += 1;
    win.style.zIndex = String(state.zTop);
    state.taskButtons.forEach((btn, wid) => btn.classList.toggle("active", wid === win.id));
  }

  function ensureTaskButton(win){
    if(state.taskButtons.has(win.id)) return;
    const btn = document.createElement("div");
    btn.className = "taskbtn bevel-out";
    btn.innerHTML = `<span style="font-family:'Courier New',monospace;">▣</span><span>${win.querySelector(".titlebar .title span").textContent}</span>`;
    btn.addEventListener("click", () => {
      if(win.style.display === "none") win.style.display = "block";
      focusWindow(win);
    });
    $("#tasks").appendChild(btn);
    state.taskButtons.set(win.id, btn);
  }

  function removeTaskButton(win){
    const btn = state.taskButtons.get(win.id);
    if(btn){ btn.remove(); state.taskButtons.delete(win.id); }
  }

  function openWindow(id){
    const win = document.getElementById(id);
    if(!win) return;
    win.style.display = "block";
    ensureTaskButton(win);
    focusWindow(win);
  }

  function closeWindow(win){
    win.style.display = "none";
    removeTaskButton(win);
    state.winStates.delete(win.id);
  }

  function minimizeWindow(win){ win.style.display = "none"; }

  function maximizeWindow(win){
    const desktop = $("#desktop");
    const rect = desktop.getBoundingClientRect();
    const st = state.winStates.get(win.id) || { max:false, prev:null };

    if(!st.max){
      st.prev = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
      win.style.left = "8px";
      win.style.top = "8px";
      win.style.width = (rect.width - 16) + "px";
      win.style.height = (rect.height - 16) + "px";
      st.max = true;
      state.winStates.set(win.id, st);
    }else{
      if(st.prev){
        win.style.left = st.prev.left;
        win.style.top = st.prev.top;
        win.style.width = st.prev.width;
        win.style.height = st.prev.height;
      }
      st.max = false;
      state.winStates.set(win.id, st);
    }
    focusWindow(win);
  }

  function installWindowChrome(win){
    win.addEventListener("mousedown", () => focusWindow(win));
    win.querySelector("[data-close]")?.addEventListener("click", (e)=>{ e.stopPropagation(); closeWindow(win); });
    win.querySelector("[data-minimize]")?.addEventListener("click", (e)=>{ e.stopPropagation(); minimizeWindow(win); });
    win.querySelector("[data-maximize]")?.addEventListener("click", (e)=>{ e.stopPropagation(); maximizeWindow(win); });

    const bar = win.querySelector("[data-drag]");
    let drag = null;

    bar?.addEventListener("mousedown", (e)=>{
      e.preventDefault();
      focusWindow(win);

      const st = state.winStates.get(win.id);
      if(st?.max) return;

      const r = win.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp, { once:true });
    });

    function onMove(e){
      if(!drag) return;
      const desktopRect = $("#desktop").getBoundingClientRect();
      let left = e.clientX - desktopRect.left - drag.dx;
      let top  = e.clientY - desktopRect.top - drag.dy;
      left = clamp(left, -80, desktopRect.width - 120);
      top  = clamp(top, -10, desktopRect.height - 40);
      win.style.left = left + "px";
      win.style.top  = top + "px";
    }
    function onUp(){
      drag = null;
      document.removeEventListener("mousemove", onMove);
    }
  }

  /* =========================
     Apps - SinMail
  ========================= */
  function renderMail(){
    const inbox = getInbox();
    const list = $("#mailList");
    list.innerHTML = "";

    inbox.slice().reverse().forEach((soul) => {
      const row = document.createElement("div");
      row.className = "mailRow";
      row.dataset.id = soul.id;
      row.innerHTML = `<div>${escapeHtml(soul.subject)}</div><div class="muted">${new Date(soul.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>`;
      if(state.selectedSoulId === soul.id) row.classList.add("sel");
      row.addEventListener("click", () => {
        state.selectedSoulId = soul.id;
        renderMail();
        renderPreview(soul);
        saveGame();
      });
      list.appendChild(row);
    });

    updateSoulSelect();
    updateStatus();
  }

  function renderPreview(soul){
    const prev = $("#mailPreview");
    prev.innerHTML = `
      <div><b>From:</b> IntakeDaemon@purgatory.local</div>
      <div><b>To:</b> You@SatanOS98</div>
      <div><b>Subject:</b> ${escapeHtml(soul.subject)}</div>
      <hr/>
      <div><b>Soul Name:</b> ${escapeHtml(soul.name)}</div>
      <div><b>Soul ID:</b> <span style="font-family:'Courier New',monospace;">${escapeHtml(soul.id)}</span></div>
      <p class="muted">Please classify the primary sin and apply the matching punishment.</p>
      <button class="btn98" id="openRecordBtn">Open Soul Record</button>
    `;
    $("#openRecordBtn").addEventListener("click", () => {
      openWindow("win-note");
      loadNotepad(soul.id);
      saveGame();
    });
  }

  function renderPreviewSafe(){
    const soul = state.selectedSoulId ? byId(state.selectedSoulId) : null;
    const inbox = getInbox();
    if(soul && !soul.processed) renderPreview(soul);
    else if(inbox[0]){
      state.selectedSoulId = inbox[0].id;
      renderPreview(inbox[0]);
    } else {
      $("#mailPreview").innerHTML = `<div class="muted">No emails. Enjoy the silence while it lasts.</div>`;
    }
  }

  function loadNotepad(soulId){
    const soul = byId(soulId);
    if(!soul){
      $("#notepad").textContent = "SOUL_RECORD.TXT\n\nNo record found.\n";
      return;
    }
    const txt =
`SOUL_RECORD.TXT
-----------------------------------------
ID: ${soul.id}
NAME: ${soul.name}

CAUSE OF DEATH:
${soul.cause}

LIFE ACCOMPLISHMENT:
${soul.acc}

FAMILY STATEMENT:
"${soul.fam}"

NOTES:
- Classify ONE (1) primary sin.
- Submit matching punishment in Punish.exe.`;
    $("#notepad").textContent = txt;
    state.selectedSoulId = soul.id;
    renderMail();
    focusWindow($("#win-note"));
  }

  /* =========================
     Apps - CHM
  ========================= */
  function renderCHM(){
    const list = $("#sinList");
    list.innerHTML = "";

    SINS.forEach((s, idx) => {
      const li = document.createElement("div");
      li.className = "listItem" + (idx===0 ? " sel" : "");
      li.textContent = s.key;
      li.addEventListener("click", () => {
        $$("#sinList .listItem").forEach(x => x.classList.remove("sel"));
        li.classList.add("sel");
        $("#sinBody").innerHTML = `
          <h3>${escapeHtml(s.key)}</h3>
          <div>${escapeHtml(s.definition)}</div>
          <div class="pun"><b>Mandatory Punishment:</b> ${escapeHtml(s.punishment)}</div>
          <div class="muted" style="margin-top:10px;">Compliance is mandatory. Humor is optional.</div>
        `;
      });
      list.appendChild(li);
    });

    const first = SINS[0];
    $("#sinBody").innerHTML = `
      <h3>${escapeHtml(first.key)}</h3>
      <div>${escapeHtml(first.definition)}</div>
      <div class="pun"><b>Mandatory Punishment:</b> ${escapeHtml(first.punishment)}</div>
      <div class="muted" style="margin-top:10px;">Compliance is mandatory. Humor is optional.</div>
    `;
  }

  /* =========================
     Apps - Punish.exe
  ========================= */
  function renderPunishRadios(){
    const box = $("#punishRadios");
    box.innerHTML = "";
    punishments.forEach((p, i) => {
      const id = "rad_" + i;
      const wrap = document.createElement("label");
      wrap.style.display = "flex";
      wrap.style.gap = "6px";
      wrap.style.alignItems = "center";
      wrap.innerHTML = `<input type="radio" name="punish" id="${id}" value="${escapeHtml(p)}" ${i===0?"checked":""}/> <span>${escapeHtml(p)}</span>`;
      box.appendChild(wrap);
    });
  }

  function updateSoulSelect(){
    const sel = $("#soulSelect");
    const inbox = getInbox();
    const cur = sel.value || state.selectedSoulId || "";
    sel.innerHTML = "";

    if(inbox.length === 0){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(Inbox empty)";
      sel.appendChild(opt);
      return;
    }

    inbox.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.id} — ${s.name}`;
      sel.appendChild(opt);
    });

    sel.value = inbox.some(s => s.id === cur) ? cur : inbox[0].id;
  }

  function submitJudgment(){
    const soulId = $("#soulSelect").value;
    const soul = byId(soulId);
    if(!soul){ toast("No soul selected."); return; }

    const chosen = ($('input[name="punish"]:checked') || {}).value || "";
    if(!chosen){ toast("Pick a punishment."); return; }

    if(chosen === soul.sinPunish){
      soul.processed = true;
      state.quotaDone += 1;
      setDoom(CONFIG.doom.correct);
      toast("Correct. Soul processed. Paperwork filed under: 'eternal'.");
      state.selectedSoulId = (getInbox()[0] || {}).id || null;
      renderMail();
      renderPreviewSafe();
    }else{
      soul.mistakes += 1;
      setDoom(CONFIG.doom.wrong);
      if(soul.mistakes >= 2) setDoom(CONFIG.doom.repeatWrongBonus);
      toast("Wrong. The soul remains. Management takes notes.");
    }

    updateStatus();
    saveGame();
  }

  /* =========================
     Apps - Calc 666
  ========================= */
  function initCalc(){
    const keys = ["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+"];
    const host = $("#calcKeys");
    host.innerHTML = "";

    keys.forEach(k => {
      const b = document.createElement("button");
      b.className = "btn98";
      b.textContent = k;
      b.addEventListener("click", () => {
        if(k === "=") $("#calcDisplay").textContent = "666";
        else{
          const cur = $("#calcDisplay").textContent;
          const next = (cur === "0" || cur === "666") ? "6" : (cur + "6").slice(-16);
          $("#calcDisplay").textContent = next;
        }
      });
      host.appendChild(b);
    });
  }

  /* =========================
     Apps - SinPics (real images)
  ========================= */
  const sinpics = (CONFIG.sinpics && CONFIG.sinpics.length) ? CONFIG.sinpics : [
    { file: "", caption: "Sinner #404: Attempted to bribe God" }
  ];
  let picsIndex = 0;

  function renderPics(){
    const item = sinpics[picsIndex];

    const img = $("#picsImg");
    const fb  = $("#picsFallback");

    $("#picsCaption").textContent = item.caption || "";

    if(!item.file){
      img.style.display = "none";
      fb.style.display = "flex";
      fb.textContent = "[IMAGE CORRUPTED BY EVIL]";
      return;
    }

    img.onload = () => {
      fb.style.display = "none";
      img.style.display = "block";
    };
    img.onerror = () => {
      img.style.display = "none";
      fb.style.display = "flex";
      fb.textContent = "[CENSORED BY MANAGEMENT]";
    };

    // Force reload even if same file
    img.src = item.file + (item.file.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  /* =========================
     Apps - Explorer
  ========================= */
  const explorerFolders = [
    {name:"Lava", err:"Error: File is too hot to open."},
    {name:"Eternal Fire", err:"Error: Access denied. Reason: combusts instantly."},
    {name:"System32", err:"Error: Missing soul permissions. Try sacrificing admin rights."},
    {name:"Recycling Bin", err:"Error: Nothing is ever truly deleted here."},
    {name:"Payroll", err:"Error: Not found. Management says 'soon'."},
    {name:"Complaints", err:"Error: Folder is full. (Always.)"},
  ];

  function renderExplorer(drive="C"){
    const grid = $("#fileGrid");
    grid.innerHTML = "";
    explorerFolders.forEach(f => {
      const el = document.createElement("div");
      el.className = "fileIcon";
      el.innerHTML = `<div class="box">${drive}:</div><div>${escapeHtml(f.name)}</div>`;
      el.addEventListener("click", () => alert(f.err));
      grid.appendChild(el);
    });
  }

  /* =========================
     Gameplay Loop
  ========================= */
  function spawnSoul(){
    const soul = makeSoul(state.souls.length + 1);
    state.souls.push(soul);
    renderMail();
    if(!state.selectedSoulId){
      state.selectedSoulId = soul.id;
      renderPreview(soul);
    }
    toast("New email: soul intake packet received.");
    saveGame();
  }

  function endOfDay(){
    if(state.quotaDone < state.quotaNeed){
      const miss = state.quotaNeed - state.quotaDone;
      setDoom(CONFIG.doom.dayMissBase + miss * CONFIG.doom.dayMissPerSoul);
      toast("Quota missed. Management is furious.");
    }else{
      setDoom(CONFIG.doom.dayPassBonus);
      toast("Day cleared. Bureaucracy approves.");
    }

    if(state.day >= CONFIG.daysToWin){
      winGame();
      return;
    }

    state.day += 1;
    state.hour = CONFIG.startHour;
    state.minute = 0;
    state.quotaDone = 0;

    state.quotaNeed = clamp(state.quotaNeed + 1, CONFIG.quotaStart, CONFIG.quotaMax);
    state.spawnEveryGameMin = clamp(state.spawnEveryGameMin - 1, CONFIG.spawnEveryGameMinMin, CONFIG.spawnEveryGameMinStart);
    state.lastSoulSpawnAtGameMin = CONFIG.startHour*60;

    renderMail();
    renderPreviewSafe();
    updateStatus();
    saveGame();
  }

  function gameTick(){
    if(!state.running) return;

    let min = state.minute + CONFIG.gameMinutesPerTick;
    while(min >= 60){
      min -= 60;
      state.hour += 1;
    }
    state.minute = Math.floor(min);

    if(state.hour >= CONFIG.endHour){
      endOfDay();
      return;
    }

    const gameNowMin = state.hour*60 + state.minute;

    if(getInbox().length < state.maxInbox && (gameNowMin - state.lastSoulSpawnAtGameMin) >= state.spawnEveryGameMin){
      state.lastSoulSpawnAtGameMin = gameNowMin;
      spawnSoul();
    }

    const inbox = getInbox().length;
    if(inbox >= 12) setDoom(CONFIG.doom.inboxPressure12);
    if(inbox >= 18) setDoom(CONFIG.doom.inboxPressure18);

    updateStatus();
  }

  function loseGame(){
    state.running = false;
    $("#overlay").style.display = "block";
    saveGame(); // save your final shame
  }

  function winGame(){
    state.running = false;
    clearSave();
    alert("You survived 7 days. Satan awards you one (1) complimentary paperclip.\n\nSave cleared. Refresh to play again.");
  }

  /* =========================
     Desktop Wiring
  ========================= */
  $$(".icon").forEach(icon => {
    icon.addEventListener("click", () => {
      $$(".icon").forEach(i => i.classList.remove("selected"));
      icon.classList.add("selected");
    });
    icon.addEventListener("dblclick", () => {
      const id = icon.dataset.open;
      if(id) openWindow(id);
      $("#startMenu").style.display = "none";
    });
  });

  $("#desktop").addEventListener("mousedown", (e) => {
    if(e.target.id === "desktop"){
      $$(".icon").forEach(i => i.classList.remove("selected"));
      $("#startMenu").style.display = "none";
    }
  });

  $("#startBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const m = $("#startMenu");
    m.style.display = (m.style.display === "block") ? "none" : "block";
  });

  document.addEventListener("mousedown", () => $("#startMenu").style.display = "none");
  $("#startMenu").addEventListener("mousedown", (e)=> e.stopPropagation());

  $$("#startMenu .menuItem").forEach(mi => {
    mi.addEventListener("click", () => {
      const act = mi.dataset.action;
      if(act === "open"){
        openWindow(mi.dataset.win);
      }else if(act === "clearsave"){
        clearSave();
        toast("Save deleted. Like your PTO request.");
      }else if(act === "logoff"){
        toast("Nice try. You can’t log off Hell.");
        setDoom(CONFIG.doom.logoffTap);
      }else{
        toast("Disabled by Management.");
      }
      $("#startMenu").style.display = "none";
      saveGame();
    });
  });

  $$(".window").forEach(installWindowChrome);

  $("#loadRecordBtn").addEventListener("click", () => {
    const id = $("#soulSelect").value;
    if(!id){ toast("No soul to load."); return; }
    openWindow("win-note");
    loadNotepad(id);
    saveGame();
  });

  $("#submitJudgmentBtn").addEventListener("click", submitJudgment);

  $$(".tree .listItem").forEach(li => {
    li.addEventListener("click", () => {
      $$(".tree .listItem").forEach(x => x.classList.remove("sel"));
      li.classList.add("sel");
      renderExplorer(li.dataset.drive || "C");
    });
  });

  $("#picsPrev").addEventListener("click", () => {
    picsIndex = (picsIndex - 1 + sinpics.length) % sinpics.length;
    renderPics();
  });
  $("#picsNext").addEventListener("click", () => {
    picsIndex = (picsIndex + 1) % sinpics.length;
    renderPics();
  });

  setInterval(() => { $("#clock").textContent = formatRealClock(); }, 500);

  /* =========================
     Init
  ========================= */
  function init(){
    renderCHM();
    renderPunishRadios();
    initCalc();
    renderExplorer("C");

    // Open key windows
    openWindow("win-mail");
    openWindow("win-punish");
    openWindow("win-chm");

    // Load save if present
    const hadSave = !!getCookie(SAVE.cookieName);
    if(hadSave){
      const ok = loadGame();
      if(ok){
        toast("Save loaded. Welcome back to your suffering.");
      }else{
        toast("Save found but corrupted. Management shrugs.");
      }
    }

    // If no save loaded / empty state, seed fresh game
    if(state.souls.length === 0){
      for(let i=0;i<CONFIG.startingSouls;i++) spawnSoul();
    }

    updateStatus();
    renderPreviewSafe();
    renderPics();

    // Engine + autosave
    setInterval(gameTick, CONFIG.tickMs);
    setInterval(saveGame, SAVE.autosaveSeconds * 1000);

    // Save on tab close
    window.addEventListener("beforeunload", saveGame);
  }

  init();

})();
