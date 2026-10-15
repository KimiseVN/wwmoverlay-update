"use strict";
const $ = (id) => document.getElementById(id);
let api = null;
let currentTab = "overlay";
let st = {
  options:{}, order:[], free:[], strings:{}, lang:"vi", licensed:false,
  monitoring:false, flags:{}, langs:["vi","en"], tweaks:[], game_options:{}, game_available:false,
};
const S = (k) => (st.strings && st.strings[k] != null ? st.strings[k] : k);
const esc = (s) => String(s==null?"":s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function applyStatic(){
  document.querySelectorAll("[data-k]").forEach(e => {
    const v = st.strings[e.dataset.k];
    if (v != null) e.textContent = v;
  });
  $("langCode").textContent = (st.lang || "vi").toUpperCase();
  const f = st.flags[st.lang];
  $("langFlag").style.display = f ? "block" : "none";
  if (f) $("langFlag").src = f;
}

/* ── overlay options ── */
function renderOptions(){
  const g = $("optgrid"); g.innerHTML = "";
  for (const attr of st.order){
    const on = !!st.options[attr];
    const gated = !st.free.includes(attr) && !st.licensed;
    const row = document.createElement("div");
    row.className = "opt" + (gated ? " locked" : "");
    row.innerHTML = `<div class="lbl" title="${esc(S("tooltip_"+attr))}">${esc(S("menu_"+attr))}${gated?' <span class="lock">🔒</span>':''}</div>`;
    const sw = document.createElement("div");
    sw.className = "switch" + (on?" on":"") + (gated?" disabled":"");
    sw.onclick = () => toggleOpt(attr, gated);
    row.appendChild(sw); g.appendChild(row);
  }
}
async function toggleOpt(attr, gated){
  if (gated || !api) return;
  st.options[attr] = !st.options[attr]; renderOptions();   // instant
  try{ const r = await api.toggle_option(attr); if (r && r.options) st.options = r.options; }catch(e){}
  renderOptions();
}

/* ── tweaks ── */
function renderTweaks(){
  $("tweakLock").style.display = st.licensed ? "none" : "block";
  const host = $("tweakList"); host.innerHTML = "";
  for (const t of st.tweaks){
    const gated = !st.licensed;
    const row = document.createElement("div");
    row.className = "tweak" + (gated?" locked":"");
    const rr = t.restart ? ' <span class="rflag">⟳ '+(st.lang==="vi"?"cần khởi động lại":"requires restart")+'</span>' : '';
    row.innerHTML = `<div class="tk"><b>${esc(t.title)}${rr}</b><span>${esc(t.desc)}</span></div>`;
    const sw = document.createElement("div");
    sw.className = "switch" + (t.enabled?" on":"") + (gated?" disabled":"");
    sw.title = esc(t.note || "");
    sw.onclick = () => toggleTweak(t.key, gated);
    row.appendChild(sw); host.appendChild(row);
  }
}
async function toggleTweak(key, gated){
  if (gated || !api) return;
  const t = st.tweaks.find(x=>x.key===key); if(t){ t.enabled=!t.enabled; renderTweaks(); }
  try{ const r = await api.toggle_tweak(key); if (r && r.tweaks) st.tweaks = r.tweaks;
    if(r && r.restart && r.enabled) openRestartDialog(); }catch(e){}
  renderTweaks();
}
function openRestartDialog(){
  const vi = st.lang === "vi";
  $("rsTitle").textContent = vi ? "Cần khởi động lại" : "Restart required";
  $("rsBody").textContent  = vi ? "Tinh chỉnh này cần khởi động lại Windows để có hiệu lực." : "This tweak needs a Windows restart to take effect.";
  $("rsLater").textContent = vi ? "Khởi động sau" : "Restart later";
  $("rsNow").textContent   = vi ? "Khởi động ngay" : "Restart now";
  openModal("restartModal");
}

/* ── game options ── */
const GAME_OPTS = [["show_ping","gui_game_show_ping"],["show_connection","gui_game_show_connection"],["show_server_ips","gui_game_show_server_ips"]];
function renderGameOpts(){
  $("gameLock").style.display = st.licensed ? "none" : "block";
  const host = $("gameOpts"); host.innerHTML = "";
  for (const [attr,key] of GAME_OPTS){
    const on = !!st.game_options[attr]; const gated = !st.licensed;
    const row = document.createElement("div");
    row.className = "opt" + (gated?" locked":"");
    row.innerHTML = `<div class="lbl">${esc(S(key))}</div>`;
    const sw = document.createElement("div");
    sw.className = "switch" + (on?" on":"") + (gated?" disabled":"");
    sw.onclick = () => toggleGameOpt(attr, gated);
    row.appendChild(sw); host.appendChild(row);
  }
  // section visibility mirrors the toggles
  $("gamePingSec").style.display = st.game_options.show_ping ? "block" : "none";
  $("gameConnSec").style.display = st.game_options.show_connection ? "block" : "none";
  $("gameSrvSec").style.display  = st.game_options.show_server_ips ? "block" : "none";
}
async function toggleGameOpt(attr, gated){
  if (gated || !api) return;
  st.game_options[attr] = !st.game_options[attr]; renderGameOpts();   // instant
  try{ const r = await api.toggle_game_option(attr); if (r && r.game_options) st.game_options = r.game_options; }catch(e){}
  renderGameOpts();
}

function mrow(labelKey, val){ return `<div class="mcell"><span>${esc(S(labelKey))}</span><b>${esc(val)}</b></div>`; }
function renderMetrics(m){
  if (!m) return;
  if (m.ping){ $("mPing").innerHTML = mrow("gui_game_last_ping",m.ping.last)+mrow("gui_game_average_ping",m.ping.avg)+mrow("gui_game_higher_ping",m.ping.max)+mrow("gui_game_lower_ping",m.ping.min); }
  if (m.conn){ $("mConn").innerHTML = mrow("gui_game_bytes_sent",m.conn.sent)+mrow("gui_game_bytes_received",m.conn.recv)+mrow("gui_game_jitter",m.conn.jitter)+mrow("gui_game_packet_loss",m.conn.loss); }
  if (m.servers){ const rows = m.servers.length ? m.servers : [S("gui_game_servers_empty")]; $("mServers").innerHTML = rows.map(r=>`<div class="srv">${esc(r)}</div>`).join(""); }
}

/* ── run / monitor / status ── */
function setMonitoring(on){
  if (st.monitoring === !!on && $("runBtn").dataset.init) return;
  st.monitoring = !!on;
  $("runBtn").dataset.init = "1";
  const b = $("runBtn");
  b.className = "run" + (on?" stop":"");
  const lbl = $("runLabel");
  if (lbl) lbl.textContent = on ? ("⏹ " + (S("menu_stop")!=="menu_stop"?S("menu_stop"):"Stop"))
                                : ("▶ " + (S("menu_start")!=="menu_start"?S("menu_start"):"Start"));
  $("banner").className = "banner glass" + (on?" active":"");
  $("bWarn").textContent = on ? "●" : "○";
}
function setStatus(title, sub){ if(title!=null)$("bTitle").textContent=title; if(sub!=null)$("bSub").textContent=sub; }
async function startStop(){ if(!api)return;
  const target = !st.monitoring;
  setMonitoring(target);  // instant feedback; corrected by the response below
  const bn = $("banner");
  if(target && bn) bn.classList.add("beam-on");   // run neon beam on status field while connecting
  try{ const d = target ? await api.start() : await api.stop();
    if(d){ setMonitoring(d.monitoring); if(d.status) setStatus(d.status.title, d.status.sub); } }
  catch(e){}
  finally{ if(bn) bn.classList.remove("beam-on"); } }
async function monitorToggle(){ if(api){try{await api.monitor_toggle();}catch(e){}} }

function showTab(name){
  currentTab = name;
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
  document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("show",p.id==="pane-"+name));
}
function openModal(id){ $(id).classList.add("show"); }
function closeModal(id){ $(id).classList.remove("show"); }

async function cycleLang(){
  if(!api)return;
  const i = st.langs.indexOf(st.lang);
  const next = st.langs[(i+1)%st.langs.length];
  try{ const d=await api.set_lang(next); if(d){ st.lang=d.lang||next; if(d.strings)st.strings=d.strings; } }catch(e){ st.lang=next; }
  applyStatic(); renderOptions(); renderTweaks(); renderGameOpts();
}

function applyInit(d){
  if(!d)return;
  st.options=d.options||{}; st.order=d.order||Object.keys(st.options); st.free=d.free||[];
  st.strings=d.strings||{}; st.lang=d.lang||"vi"; st.licensed=!!d.licensed; st.flags=d.flags||{};
  st.langs=d.langs||["vi","en"]; st.tweaks=d.tweaks||[]; st.game_options=d.game_options||{};
  st.game_available=!!d.game_available; st.donate=d.donate||null;
  if(d.version)$("verBadge").textContent="⚡ v"+d.version;
  if(d.brand)$("brandName").textContent=d.brand;
  $("brandSub").textContent=(st.lang==="vi"?"Overlay cho Where Winds Meet":"Overlay for Where Winds Meet");
  $("year").textContent=new Date().getFullYear();
  $("gameTab").classList.toggle("hidden",!d.game_available);
  applyStatic(); renderOptions(); renderTweaks(); renderGameOpts();
  setMonitoring(d.monitoring);
  if(d.status)setStatus(d.status.title,d.status.sub);
  if(d.trial)$("trialLabel").textContent=d.trial;
}

/* live polling (child-driven) */
let _lastPos={x:null,y:null};
function savePos(){
  try{
    if(!api||!api.save_pos) return;
    const x=window.screenX, y=window.screenY;
    if(typeof x!=="number"||typeof y!=="number") return;
    if(x===_lastPos.x && y===_lastPos.y) return;     // unchanged -> skip
    _lastPos={x,y}; api.save_pos(x,y);
  }catch(e){}
}

async function tick(){
  if(!api)return;
  savePos();
  try{
    const d = await api.tick(currentTab);
    if(!d)return;
    setStatus(d.status, "");
    setMonitoring(d.monitoring);
    $("gameTab").classList.toggle("hidden", !d.game_available);
    $("trialLabel").textContent = d.trial || "";
    if(currentTab==="game" && d.metrics) renderMetrics(d.metrics);
  }catch(e){}
}

/* pushes from Python (events) */
window.onStatus  = (t,s)=>setStatus(t,s);
window.onMonitor = (on)=>setMonitoring(on);
window.onTrial   = (txt)=>{ $("trialLabel").textContent=txt||""; };
window.onGameTab = (a)=>$("gameTab").classList.toggle("hidden",!a);
window.onReload  = async ()=>{ if(api){try{applyInit(await api.get_init());}catch(e){}} };

async function boot(){
  api = window.pywebview.api;
  try{ applyInit(await api.get_init()); }catch(e){ console.error(e); }
  // converge the window height while the loader still covers the UI, then reveal.
  // setTimeout (not rAF) so it fires even if the window isn't painting yet at launch.
  setTimeout(sizeToOverlay, 60);
  setTimeout(()=>{ sizeToOverlay(); hideLoader(); }, 180);
  setInterval(tick, 1500);
}
function hideLoader(){
  const l = $("loader"); if(!l) return;
  l.classList.add("hide");
  setTimeout(()=>{ l.style.display="none"; }, 450);
}
window.addEventListener("pywebviewready", boot);
if (window.pywebview && window.pywebview.api && !api) boot();


/* ── phase 3: settings / help / license ── */
function fmtHotkey(spec){
  if(!spec||!spec.key) return "—";
  const m=(spec.modifiers||[]).map(x=>x.charAt(0).toUpperCase()+x.slice(1));
  return [...m, String(spec.key).toUpperCase()].join("+");
}
let setHK={}; let capturing=null;
const HK_ORDER=[["toggle","settings_toggle_label"],["scan","settings_scan_label"],["panel","settings_panel_label"],["reforge","settings_reforge_label"],["giftcode","settings_giftcode_label"]];
async function openSettings(){
  if(!api)return; let d; try{ d=await api.get_settings(); }catch(e){ return; }
  if(!d)return;
  setHK=JSON.parse(JSON.stringify(d.hotkeys||{}));
  const host=$("setHotkeys"); host.innerHTML="";
  for(const [k,lk] of HK_ORDER){
    const row=document.createElement("div"); row.className="hkrow";
    row.innerHTML=`<span class="hklbl">${esc(S(lk))}</span><span class="hkkey" id="hk-${k}">${esc(fmtHotkey(setHK[k]))}</span>`;
    const b=document.createElement("button"); b.className="hkcap"; b.textContent=S("settings_capture_button");
    b.onclick=()=>startCapture(k,b); row.appendChild(b); host.appendChild(row);
  }
  $("setScale").value=d.scale; $("setScaleV").textContent=d.scale+"%";
  $("setTransparent").checked=!!d.transparent; $("setRotate").value=d.rotate;
  $("setAutostart").checked=!!d.autostart; $("setAutoRow").style.display=d.autostart_supported?"flex":"none";
  $("setGuild").value=d.guild||""; $("setErr").style.display="none";
  openModal("settingsModal");
}
function startCapture(target,btn){
  if(capturing) capturing.btn.classList.remove("cap");
  capturing={target,btn}; btn.classList.add("cap"); btn.textContent=S("settings_capture_listening");
}
document.addEventListener("keydown",(e)=>{
  if(!capturing)return; e.preventDefault(); e.stopPropagation();
  const key=e.key;
  if(["Control","Alt","Shift","Meta"].includes(key)) return;  // wait for a non-modifier
  const mods=[]; if(e.ctrlKey)mods.push("ctrl"); if(e.altKey)mods.push("alt"); if(e.shiftKey)mods.push("shift"); if(e.metaKey)mods.push("meta");
  const k = key.length===1 ? key.toUpperCase() : key;
  setHK[capturing.target]={modifiers:mods,key:k};
  const disp=$("hk-"+capturing.target); if(disp)disp.textContent=fmtHotkey(setHK[capturing.target]);
  capturing.btn.classList.remove("cap"); capturing.btn.textContent=S("settings_capture_button"); capturing=null;
},true);
async function saveSettings(){
  if(!api)return;
  const pl={hotkeys:setHK, scale:parseInt($("setScale").value)||100, transparent:$("setTransparent").checked,
    rotate:parseInt($("setRotate").value)||8, autostart:$("setAutostart").checked, guild:($("setGuild").value||"").trim()};
  try{ const r=await api.save_settings(pl); closeModal("settingsModal"); if(r&&r.restart) setStatus(S("settings_saved_restart"),""); }catch(e){}
  try{ applyInit(await api.get_init()); }catch(e){}
}
async function openHelp(){ if(!api)return; try{ const d=await api.license_info(); $("helpHwid").textContent=(d&&d.hwid)||"—"; }catch(e){} openModal("helpModal"); }
async function openLicense(){ if(!api)return;
  try{
    const d=await api.license_info();
    $("licSummary").textContent=(d&&d.summary)||"—";
    $("licHwid").textContent=(d&&d.hwid)||"—";
    $("licKeyMasked").textContent=(d&&d.key_masked)||"—";
    const ico=$("licIco"); if(ico) ico.textContent=(d&&d.licensed)?"✅":"🔑";
    const kl=$("licKeyLabel"); if(kl) kl.textContent=(st.lang==="vi"?"License của bạn":"Your license");
    $("licMsg").style.display="none";
  }catch(e){}
  openModal("licenseModal");
}
async function licenseSave(){ if(!api)return; const k=($("licKey").value||"").trim(); if(!k)return;
  try{ const d=await api.license_save(k); $("licSummary").textContent=(d&&d.summary)||""; $("licMsg").style.display="block"; $("licMsg").textContent=(d&&d.licensed)?"✓ OK":"✗"; }catch(e){}
  try{ applyInit(await api.get_init()); }catch(e){}
}
async function licenseClear(){ if(!api)return; try{ const d=await api.license_clear(); $("licSummary").textContent=(d&&d.summary)||""; $("licKey").value=""; }catch(e){}
  try{ applyInit(await api.get_init()); }catch(e){}
}


/* ── phase 3: user center / account ── */
function showUcMsg(t){ const el=$("ucMsg"); if(!t){el.style.display="none";return;} el.style.display="block"; el.textContent=t; }
function renderUser(d){
  if(!d)return;
  const inn=!!d.logged_in;
  $("ucLoggedOut").style.display=inn?"none":"block";
  $("ucLoggedIn").style.display=inn?"block":"none";
  $("ucStatus").textContent = inn ? (d.email||"") : (d.summary||"");
  const lbl=$("ucPointsLabel"); if(lbl) lbl.textContent = (st.lang==="vi"?"Điểm giới thiệu":"Referral Points");
  const pv=(d.points==null?null:Number(d.points));
  $("ucPoints").textContent = (pv==null||isNaN(pv)) ? "—" : pv.toLocaleString();
}
async function refreshUser(){ try{ renderUser(await api.account_info()); }catch(e){} }
async function openUser(){ if(!api)return; showUcMsg(""); await refreshUser(); openModal("userModal"); }
async function ucResult(d){
  renderUser(d);
  if(d&&d.ok){ showUcMsg(""); $("ucPassword").value=""; } else if(d&&d.msg){ showUcMsg(d.msg); }
  try{ applyInit(await api.get_init()); }catch(e){}
}
async function accountLogin(){ if(!api)return; const e=($("ucEmail").value||"").trim(), p=$("ucPassword").value||"";
  if(!e||!p){ showUcMsg(S("uc_msg_empty")); return; }
  showUcMsg(S("uc_msg_logging_in"));
  try{ await ucResult(await api.account_login(e,p)); }catch(err){ showUcMsg(S("uc_msg_error")); }
}
async function accountOauth(prov){ if(!api)return; showUcMsg(S("uc_msg_waiting_browser"));
  try{ await ucResult(await api.account_oauth(prov)); }catch(err){ showUcMsg(S("uc_msg_error")); }
}
async function accountLogout(){ if(!api)return;
  try{ renderUser(await api.account_logout()); showUcMsg(""); }catch(e){}
  try{ applyInit(await api.get_init()); }catch(e){}
}
async function accountSync(){ if(!api)return; showUcMsg(S("uc_license_fetching"));
  try{ const d=await api.account_sync_license(); renderUser(d); showUcMsg(d&&d.licensed?S("uc_license_ok"):S("uc_license_none")); }
  catch(e){ showUcMsg(S("uc_license_err")); }
  try{ applyInit(await api.get_init()); }catch(e){}
}


/* ── about / donate (populated from bridge) ── */
async function openAbout(){
  openModal("aboutModal");
  if(!api)return;
  try{ const d=await api.about_info();
    if(d){ $("aboutBody").textContent = d.copyright || "WWM Overlay"; if(d.version) $("aboutTitle").textContent="WWM Overlay v"+d.version; }
  }catch(e){}
}
const DI={
  en:{title:"Support the Developer",sub:"More motivation to build for the community",dev:"Dev",via:"Support via Ko-fi / PayPal:",kofi:"Buy me a coffee",scan:"Scan QR",enlarge:"Click to enlarge",thanksT:"✨ Thank You",thanksS:"Every contribution keeps the server running and helps me build more tools for the Where Winds Meet community! ❤",close:"Close"},
  vi:{title:"Ủng Hộ Tác Giả",sub:"Tiếp thêm động lực phát triển sản phẩm cho cộng đồng",dev:"Dev",via:"Ủng hộ qua Ko-fi / PayPal:",kofi:"Mời tôi ly cà phê",scan:"Quét mã QR",enlarge:"Bấm để phóng to",thanksT:"✨ Lời Cảm Ơn",thanksS:"Mọi đóng góp của bạn là động lực cực lớn để mình duy trì server và tạo thêm nhiều công cụ cho cộng đồng Where Winds Meet! ❤",close:"Đóng"}
};
async function openDonate(){
  openModal("donateModal");
  const t=DI[st.lang]||DI.vi;
  $("dTitle").textContent=t.title; $("dSub").textContent=t.sub; $("dDevLabel").textContent=t.dev;
  $("dVia").textContent=t.via; $("dKofi").textContent=t.kofi; $("dScan").textContent=t.scan;
  $("dEnlarge").textContent=t.enlarge; $("dThanksT").textContent=t.thanksT; $("dThanksS").textContent=t.thanksS;
  $("dClose").textContent=t.close;
  fillDonate(st.donate);
  if(!st.donate && api){ try{ fillDonate(await api.donate_info()); }catch(e){} }
}
function fillDonate(d){
  if(!d)return;
  $("donateDev").textContent=d.developer||"";
  if(d.qr && $("donateQr").src!==d.qr) $("donateQr").src=d.qr;
  window._kofi=d.kofi||"https://ko-fi.com/akim86";
}
function donateKofi(){ if(api) try{ api.open_url(window._kofi||"https://ko-fi.com/akim86"); }catch(e){} }
function openQrZoom(){ const s=$("donateQr").src; if(!s)return; $("qrZoomImg").src=s; $("qrZoom").style.display="flex"; }
function closeQrZoom(){ $("qrZoom").style.display="none"; }


function openCloseConfirm(){
  const vi = st.lang === "vi";
  $("ccTitle").textContent = vi ? "Đóng WWM Overlay?" : "Close WWM Overlay?";
  $("ccBody").textContent  = vi ? "Ẩn xuống khay hệ thống (vẫn chạy) hay đóng hẳn ứng dụng?" : "Hide to the system tray (keeps running) or close the app completely?";
  $("ccHide").textContent  = vi ? "Ẩn xuống Systray" : "Hide to tray";
  $("ccClose").textContent = vi ? "Đóng" : "Close";
  openModal("closeConfirm");
}


/* Fix the window height to the Overlay Options tab exactly (measured once at boot).
   .body has flex:1 so scrollHeight never drops below clientHeight — we can't detect
   dead space from overflow, so we measure the overlay section's natural height and
   size the body's content area to it. After this the window is FIXED: Tweaks and the
   Game/Ping tab simply scroll (thin scrollbar) when their content is taller. */
function sizeToOverlay(){
  try{
    if(!api || !api.resize) return;
    const b   = document.querySelector(".body");
    const sec = document.querySelector("#pane-overlay .section");
    if(!b || !sec) return;
    const csb = getComputedStyle(b);
    const padV = parseFloat(csb.paddingTop) + parseFloat(csb.paddingBottom);
    const needBody = sec.offsetHeight + padV + 16;     // +16 safety so overlay never scrolls
    const delta = needBody - b.clientHeight;           // + grow / - shrink away slack
    const target = Math.max(480, Math.min(900, Math.round(window.innerHeight + delta)));
    api.resize(880, target);
  }catch(e){}
}
