import { STATUS, SIZE, ABILITIES, createState } from "./state.js";
import { makeUnit, createCustomUnit, statusIcons, isBattleUnit } from "./units.js";
import { createEmptyMap, getCell, lineOfSight, makeTerrain, DEFAULT_TERRAIN } from "./board.js";
import { reachable, applyDamage, rollHit } from "./combat.js";
import { saveMap as persistMap, loadMap as readMap, clone } from "./storage.js";
import { setText, delegatedClick } from "./ui.js";

const templates = {
  powerkim:{id:"powerkim",name:"Powerkim",short:"P",team:"hero",className:"Nahkampf / Tank",x:2,y:17,hp:180,maxHp:180,attack:20,defense:18,movement:5,range:1,damage:35,knockback:3,stability:25,abilityName:"Power-Schlag",abilityType:"stun",color:"#1686e6"},
  visor:{id:"visor",name:"Visor",short:"V",team:"hero",className:"Fernkampf / Taktiker",x:3,y:17,hp:80,maxHp:80,attack:22,defense:10,movement:6,range:10,damage:24,knockback:1,stability:12,abilityName:"Markieren",abilityType:"mark",color:"#7f66ff"},
  watson:{id:"watson",name:"Watson",short:"W",team:"hero",className:"Heiler / Fliegend",x:4,y:17,hp:100,maxHp:100,attack:8,defense:10,movement:8,range:8,heal:40,knockback:0,stability:10,abilityName:"Heilstrahl",abilityType:"heal",flying:true,color:"#53d7a0"},
  nyra:{id:"nyra",name:"Nyra",short:"N",team:"hero",className:"Spionin / Fallen",x:1,y:18,hp:70,maxHp:70,attack:15,defense:12,movement:9,range:1,damage:18,knockback:2,stability:8,trapDamage:30,abilityName:"Mine",abilityType:"trap",color:"#d56cff"},
  drone1:{id:"drone1",name:"Sicherheitsdrohne 1",short:"D",team:"enemy",className:"Fernkampf / Fliegend",x:16,y:3,hp:40,maxHp:40,attack:14,defense:3,movement:8,range:7,damage:14,flying:true,color:"#d24252"},
  drone2:{id:"drone2",name:"Sicherheitsdrohne 2",short:"D",team:"enemy",className:"Fernkampf / Fliegend",x:17,y:5,hp:40,maxHp:40,attack:14,defense:3,movement:8,range:7,damage:14,flying:true,color:"#d24252"},
  bulwark:{id:"bulwark",name:"Bulwark",short:"B",team:"enemy",className:"Schwerer Tank",x:15,y:15,hp:220,maxHp:220,attack:26,defense:20,movement:3,range:1,damage:16,knockback:3,stability:30,color:"#b24d4d"}
};

let board = createEmptyMap();
let state = createState();
let battleInitial = null;

const terrainTools = ["floor","wall","water","tree","container","vehicle","core"];

function getCurrentUnit(){ return state.turnOrder[state.turnIndex] || null; }
function at(x,y){ return state.units.find(u=>isBattleUnit(u)&&u.x===x&&u.y===y) || null; }
function atAny(x,y){ return state.units.find(u=>u.x===x&&u.y===y) || null; }
function dist(a,b){ return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)); }
function addLog(text){ state.log.unshift(text); state.log=state.log.slice(0,24); }
function hasStatus(e,id){ return !!e?.statuses?.some(s=>s.id===id); }
function addStatus(e,id,duration=STATUS[id]?.duration||1){
  if(!e||!STATUS[id])return;
  const old=e.statuses.find(s=>s.id===id);
  if(old)old.remaining=Math.max(old.remaining,duration); else e.statuses.push({id,remaining:duration});
  addLog(`${e.name}: ${STATUS[id].label}.`);
}
function effectiveDefense(unit){
  const cell=getCell(board,unit?.x,unit?.y);
  const cover=Number(cell?.cover||0);
  return Math.max(0,Number(unit?.defense||0)+cover-(hasStatus(unit,"marked")?5:0));
}
function setupMap(){
  board=createEmptyMap();
  for(let i=0;i<SIZE;i++){
    for(const [x,y] of [[i,0],[i,SIZE-1],[0,i],[SIZE-1,i]]){
      const c=getCell(board,x,y); if(c) Object.assign(c,makeTerrain("wall"));
    }
  }
}
function startRound(){
  state.turnOrder=state.units.filter(isBattleUnit).sort((a,b)=>(b.movement||0)-(a.movement||0));
  state.turnIndex=0;
  state.turnOrder.forEach(u=>{u.ap=2;u.moveLeft=Math.max(1,(u.movement||0)-(hasStatus(u,"slowed")?2:0));});
  skipUnavailable();
}
function skipUnavailable(){
  let guard=0;
  while(getCurrentUnit()&&guard<state.turnOrder.length){
    const u=getCurrentUnit();
    if(!hasStatus(u,"stunned")&&!hasStatus(u,"knocked_down"))return;
    addLog(`${u.name} setzt wegen Status aus.`);
    advanceTurn(true); guard++;
  }
}
function tickStatuses(u){
  if(!u)return;
  u.statuses=u.statuses.filter(s=>{
    s.remaining--;
    if(s.remaining<=0){addLog(`${u.name}: ${STATUS[s.id]?.label||s.id} endet.`);return false;}
    return true;
  });
}
function checkMission(){
  const core=state.core;
  if(core?.hp<=0){state.victory=true;state.mode=null;state.highlight=[];addLog("Missionsziel erreicht: Energiekern zerstört.");}
  const heroes=state.units.filter(u=>u.team==="hero"&&u.alive);
  if(!heroes.length){state.defeat=true;state.mode=null;state.highlight=[];addLog("Niederlage: Alle Helden sind kampfunfähig.");}
}
function advanceTurn(skipTick=false){
  if(!skipTick)tickStatuses(getCurrentUnit());
  state.turnIndex++;
  if(state.turnIndex>=state.turnOrder.length){state.round++;startRound();}
  else skipUnavailable();
  checkMission();
}
function canEnter(unit,x,y,ignoreUnitId=null){
  const c=getCell(board,x,y);
  return !!c&&c.walk&&(c.type!=="water"||unit.flying)&&!state.units.some(u=>isBattleUnit(u)&&u.id!==ignoreUnitId&&u.x===x&&u.y===y);
}
function resetState(){state=createState();}
function loadScenario(){
  resetState();
  state.units=Object.values(templates).map(t=>makeUnit(t));
  const coreCell=findCoreCell();
  state.core={x:coreCell.x,y:coreCell.y,hp:100,maxHp:100};
  getCell(board,coreCell.x,coreCell.y).type="core";
  startRound(); snapshotBattle(); render();
}
function findCoreCell(){
  for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++)if(!atAny(x,y)&&getCell(board,x,y)?.walk)return{x,y};
  return{x:10,y:10};
}
function snapshotBattle(){battleInitial=clone({board,units:state.units,core:state.core,traps:state.traps});state.battleSnapshot=battleInitial;}
function restoreBattle(){
  if(!battleInitial)return;
  board=clone(battleInitial.board); state.units=clone(battleInitial.units); state.core=clone(battleInitial.core); state.traps=clone(battleInitial.traps);
  state.victory=false;state.defeat=false;state.log=[];state.round=1;startRound();render();
}
function terrainStyle(cell){
  return cell?.image ? `background-image:url("${cell.image}")` : "";
}
function renderBoard(element){
  if(!element)return;
  element.innerHTML="";
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const cell=getCell(board,x,y), tile=document.createElement("div");
    tile.className=`tile ${cell?.type||"floor"} ${cell?.image?"has-image":""}`;
    tile.style.cssText=terrainStyle(cell);
    tile.dataset.x=x;tile.dataset.y=y;
    const h=state.highlight.find(p=>p.x===x&&p.y===y);
    if(h)tile.classList.add(state.mode==="move"?"move-range":state.mode==="ability"?"ability-range":"attack-range");
    const trap=state.traps.find(t=>t.x===x&&t.y===y);
    if(trap){const n=document.createElement("span");n.className="trap";n.textContent="✹";tile.appendChild(n);}
    if(state.core&&state.core.x===x&&state.core.y===y){
      const n=document.createElement("span");n.className="trap";n.textContent="💠";n.title=`Energiekern ${state.core.hp}/${state.core.maxHp}`;tile.appendChild(n);
    }
    const u=atAny(x,y);
    if(u){
      const n=document.createElement("div");
      n.className=`unit ${u.team} ${u.id===getCurrentUnit()?.id?"selected":""} ${u.alive?"":"defeated"}`;
      n.dataset.unitId=u.id;
      n.style.backgroundColor=u.color||"";
      if(u.image)n.style.backgroundImage=`url("${u.image}")`;
      n.innerHTML=`<div class="unit-core"><span class="unit-short">${u.alive?(u.image?"":(u.short||"?")):"☠"}</span><span class="unit-status">${statusIcons(u,STATUS)}</span></div><div class="unit-hpbar"><span style="width:${Math.max(0,(u.hp/(u.maxHp||1))*100)}%"></span></div><div class="unit-hptext">${u.hp}/${u.maxHp}</div>`;
      tile.appendChild(n);
    }
    element.appendChild(tile);
  }
}
function renderInitiative(){
  const list=document.getElementById("initiative-list");if(!list)return;
  list.innerHTML=state.turnOrder.filter(isBattleUnit).map(u=>`<div class="card ${u.id===getCurrentUnit()?.id?"active":""}"><span>${u.name}</span><span>HP ${u.hp}/${u.maxHp} · AP ${u.ap||0}</span></div>`).join("")||'<div class="small">Keine Figuren.</div>';
}
function renderSelectedUnitCard(){
  const c=document.getElementById("selected-unit-card");if(!c)return;
  const u=getCurrentUnit();
  c.innerHTML=u?`<h4>${u.name}</h4><div>${u.team==="hero"?"Held":"Gegner"} · ${u.className}</div><div class="stats"><span>HP</span><b>${u.hp}/${u.maxHp}</b></div><div class="stats"><span>AP</span><b>${u.ap}</b></div><div class="stats"><span>Bewegung</span><b>${u.moveLeft}</b></div><div class="stats"><span>Angriff/Schaden</span><b>${u.attack}/${u.damage||"-"}</b></div><div class="ability">${u.abilityName||"Keine"} · KB ${u.knockback||0} · Stabilität ${u.stability||0}</div>`:'<div class="small">Keine aktive Figur.</div>';
}
function renderBattleLog(){const n=document.getElementById("battle-log");if(n)n.innerHTML=state.log.map(x=>`<div>${x}</div>`).join("")||'<div class="small">Noch keine Ereignisse.</div>';}
function renderBattleScreen(){
  document.getElementById("battle-screen")?.classList.remove("hidden");document.getElementById("editor-screen")?.classList.add("hidden");
  setText("battle-state-title",state.victory?"Sieg":state.defeat?"Niederlage":"Kampf");
  setText("battle-round-label",`Runde ${state.round}${getCurrentUnit()?` · ${getCurrentUnit().name}`:""}`);
  renderBoard(document.getElementById("board"));renderInitiative();renderSelectedUnitCard();renderBattleLog();
  const overlay=document.getElementById("battle-overlay");
  if(overlay)overlay.classList.toggle("hidden",!(state.victory||state.defeat));
  if(overlay)overlay.innerHTML=`<div class="battle-overlay-box"><h2>${state.victory?"Sieg":"Niederlage"}</h2><p>${state.victory?"Der Energiekern wurde zerstört.":"Alle Helden sind kampfunfähig."}</p><button data-action="restore-battle">Kampf zurücksetzen</button></div>`;
}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");}
function renderUnitForm(u,isNew){
  const numberField=(id,label,value)=>`<label class="formlabel">${label}<input class="input" id="unit-${id}" type="number" value="${Number(value||0)}"></label>`;
  return `${isNew?'<div class="small">Neue Einheit – noch nicht gespeichert.</div>':""}
  <label class="formlabel">Name<input class="input" id="unit-name" value="${esc(u.name)}"></label>
  <div class="two"><label class="formlabel">Kurzicon<input class="input" id="unit-short" value="${esc(u.short)}"></label><label class="formlabel">Farbe<input class="input" id="unit-color" type="color" value="${u.color||"#4daeff"}"></label></div>
  <label class="formlabel">Klasse<input class="input" id="unit-class" value="${esc(u.className)}"></label>
  <label class="formlabel">Team<select class="input" id="unit-team"><option value="hero" ${u.team==="hero"?"selected":""}>Held</option><option value="enemy" ${u.team==="enemy"?"selected":""}>Gegner</option></select></label>
  <div class="preview" id="unit-preview" style="${u.image?`background-image:url('${u.image}')`:""}"></div><label class="upload">Einheitenbild hochladen<input class="file" id="unit-image" type="file" accept="image/*"></label>
  <div class="two">
  ${numberField("maxhp","Max. HP",u.maxHp??u.hp)}
  ${["attack","defense","movement","range","damage","heal","knockback","stability","trapDamage"].map(k=>numberField(k,k,u[k])).join("")}</div>
  ${isNew?"":`<div class="small">Aktuelle HP: ${u.hp}/${u.maxHp} (bleiben beim Speichern erhalten, außer Max. HP wird unterschritten).</div>`}
  <label class="check"><input id="unit-flying" type="checkbox" ${u.flying?"checked":""}> Fliegend</label>
  <label class="formlabel">Fähigkeit<select class="input" id="unit-ability">${Object.entries(ABILITIES).map(([k,v])=>`<option value="${k}" ${u.abilityType===k?"selected":""}>${v.label}</option>`).join("")}</select></label>
  <label class="formlabel">Fähigkeitsname<input class="input" id="unit-ability-name" value="${esc(u.abilityName)}"></label>
  <div class="two"><label class="formlabel">X<input class="input" id="unit-x" type="number" min="0" max="${SIZE-1}" value="${u.x}"></label><label class="formlabel">Y<input class="input" id="unit-y" type="number" min="0" max="${SIZE-1}" value="${u.y}"></label></div>
  <div class="two"><button class="success wide" id="save-unit-btn">${isNew?"Einheit anlegen":"Änderungen speichern"}</button><button class="wide" id="cancel-unit-btn">Abbrechen</button></div>
  ${isNew?"":'<button class="warning wide" id="delete-unit-btn">Einheit entfernen</button>'}`;
}
function renderTerrainForm(x,y){
  const c=getCell(board,x,y);if(!c)return "";
  return `<div class="small">Feld ${x},${y}</div><label class="formlabel">Geländetyp<select class="input" id="terrain-type">${terrainTools.map(t=>`<option value="${t}" ${c.type===t?"selected":""}>${DEFAULT_TERRAIN[t].label}</option>`).join("")}</select></label>
  <div class="two"><label class="formlabel">Deckung<input class="input" id="terrain-cover" type="number" min="0" max="9" value="${c.cover||0}"></label><label class="formlabel">Begehbar<select class="input" id="terrain-walk"><option value="1" ${c.walk?"selected":""}>Ja</option><option value="0" ${!c.walk?"selected":""}>Nein</option></select></label></div>
  <label class="check"><input id="terrain-los" type="checkbox" ${c.los?"checked":""}> Sicht blockieren</label>
  <div class="preview" id="terrain-preview" style="${c.image?`background-image:url('${c.image}')`:""}"></div><label class="upload">Geländebild hochladen<input class="file" id="terrain-image" type="file" accept="image/*"></label>
  <button class="success wide" id="save-terrain-btn">Gelände speichern</button>`;
}
function renderEditorScreen(){
  document.getElementById("battle-screen")?.classList.add("hidden");document.getElementById("editor-screen")?.classList.remove("hidden");
  renderBoard(document.getElementById("editor-board"));
  const list=document.getElementById("unit-list");
  if(list)list.innerHTML=state.units.map(u=>`<button class="unit-item ${(!state.editorDraft?.isNew&&state.editorDraft?.unit.id===u.id)?"selected-item":""}" data-unit-id="${u.id}"><span>${u.name}</span><small>${u.team==="hero"?"Held":"Gegner"}</small></button>`).join("")||'<div class="small">Keine Einheiten.</div>';
  const form=document.getElementById("unit-form");
  form.innerHTML=state.editorDraft?renderUnitForm(state.editorDraft.unit,state.editorDraft.isNew):state.editorTerrain?renderTerrainForm(state.editorTerrain.x,state.editorTerrain.y):'<div class="small">Einheit auswählen oder im Gelände-Editor ein Feld anklicken.</div>';
  document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===state.tool));
}
function render(){state.screen==="battle"?renderBattleScreen():renderEditorScreen();}
function readFile(file){return new Promise((resolve,reject)=>{if(!file)return resolve("");const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
// --- Einheiten-Editor: Bearbeiten (bestehend) und Anlegen (neu) sind bewusst
// getrennte Pfade. Beide arbeiten auf state.editorDraft, einer Arbeitskopie,
// die state.units erst beim Speichern verändert. So bleibt "Abbrechen" immer
// verlustfrei, und eine neue Einheit landet nie unvollständig/ungewollt auf
// der Karte, nur weil man den Editor verlassen hat.

function startEditUnit(unit){
  state.editorDraft={isNew:false,unit:clone(unit)};
  state.formTarget=unit.id;
  state.editorTerrain=null;
}
function findFreeEditorCell(){
  for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++)if(!atAny(x,y)&&getCell(board,x,y)?.walk)return{x,y};
  return{x:0,y:0};
}
function startNewUnitDraft(overrides={}){
  const free=findFreeEditorCell();
  const unit=createCustomUnit();
  Object.assign(unit,{x:free.x,y:free.y},overrides);
  state.editorDraft={isNew:true,unit};
  state.formTarget=null;
  state.editorTerrain=null;
}
function cancelUnitDraft(){
  state.editorDraft=null;
  state.formTarget=null;
  render();
}
function readUnitFormValues(current){
  const val=id=>document.getElementById(id)?.value;
  const num=(id,fallback)=>{const n=Number(val(id));return Number.isFinite(n)?n:fallback;};
  const abilityType=val("unit-ability")||current.abilityType||"none";
  return {
    name:val("unit-name")||current.name,
    short:val("unit-short")||current.short,
    color:val("unit-color")||current.color,
    className:val("unit-class")||current.className,
    team:val("unit-team")||current.team,
    maxHp:Math.max(1,num("unit-maxhp",current.maxHp??current.hp)),
    attack:Math.max(0,num("unit-attack",current.attack)),
    defense:Math.max(0,num("unit-defense",current.defense)),
    movement:Math.max(0,num("unit-movement",current.movement)),
    range:Math.max(0,num("unit-range",current.range)),
    damage:Math.max(0,num("unit-damage",current.damage)),
    heal:Math.max(0,num("unit-heal",current.heal)),
    knockback:Math.max(0,num("unit-knockback",current.knockback)),
    stability:Math.max(0,num("unit-stability",current.stability)),
    trapDamage:Math.max(0,num("unit-trapDamage",current.trapDamage)),
    flying:!!document.getElementById("unit-flying")?.checked,
    abilityType,
    abilityName:val("unit-ability-name")||ABILITIES[abilityType]?.label||"Keine",
    x:Math.max(0,Math.min(SIZE-1,num("unit-x",current.x))),
    y:Math.max(0,Math.min(SIZE-1,num("unit-y",current.y)))
  };
}
async function saveUnitDraft(){
  if(!state.editorDraft)return;
  const {isNew,unit}=state.editorDraft;
  const values=readUnitFormValues(unit);
  const file=document.getElementById("unit-image")?.files?.[0];
  const image=file?await readFile(file):unit.image;

  if(isNew){
    if(atAny(values.x,values.y)){addLog("Feld ist bereits belegt – Einheit nicht angelegt.");return;}
    const created=makeUnit({...unit,...values,image,hp:values.maxHp});
    state.units.push(created);
    state.editorDraft=null;
    state.formTarget=created.id;
    addLog(`${created.name} wurde angelegt.`);
  } else {
    const existing=state.units.find(u=>u.id===unit.id);
    if(!existing){state.editorDraft=null;render();return;}
    const moved=values.x!==existing.x||values.y!==existing.y;
    if(moved&&state.units.some(o=>o.id!==existing.id&&o.x===values.x&&o.y===values.y)){
      addLog("Feld ist bereits belegt – Position nicht geändert.");values.x=existing.x;values.y=existing.y;
    }
    // Bewusst KEIN Vollheilen beim Bearbeiten: aktuelle HP bleiben erhalten
    // und werden nur auf die neue Max-HP begrenzt, falls diese gesenkt wurde.
    const hp=Math.min(existing.hp,values.maxHp);
    Object.assign(existing,makeUnit({...existing,...values,image,id:existing.id,hp}));
    state.editorDraft=null;
    addLog(`${existing.name} wurde aktualisiert.`);
  }
  render();
}
function deleteUnit(id){
  state.units=state.units.filter(u=>u.id!==id);
  if(state.formTarget===id)state.formTarget=null;
  if(state.editorDraft&&!state.editorDraft.isNew&&state.editorDraft.unit.id===id)state.editorDraft=null;
  render();
}
async function saveTerrain(){
  const p=state.editorTerrain;if(!p)return;const c=getCell(board,p.x,p.y);if(!c)return;
  const type=document.getElementById("terrain-type").value;Object.assign(c,makeTerrain(type,c.image));
  c.cover=Number(document.getElementById("terrain-cover").value||0);c.walk=document.getElementById("terrain-walk").value==="1";c.los=!!document.getElementById("terrain-los").checked;
  const file=document.getElementById("terrain-image")?.files?.[0];if(file)c.image=await readFile(file);
  state.editorTerrain=null;render();
}
function deleteEditedUnit(){
  if(state.editorDraft&&!state.editorDraft.isNew)deleteUnit(state.editorDraft.unit.id);
}
function createCustomUnitAtEditor(){startNewUnitDraft();render();}
function saveEditableMap(){
  if(state.editorDraft)addLog("Hinweis: eine Einheit wurde noch nicht gespeichert und ist nicht Teil der gespeicherten Karte.");
  persistMap({version:3,board,units:state.units,traps:state.traps,core:state.core});addLog("Karte gespeichert.");
}
function loadEditableMap(){
  const d=readMap();if(!d){alert("Keine gespeicherte Karte gefunden.");return;}
  board=d.board||createEmptyMap();state.units=(d.units||[]).map(u=>makeUnit(u));state.traps=d.traps||[];state.core=d.core||null;
  state.formTarget=null;state.editorTerrain=null;state.editorDraft=null;render();
}
function clearEditableMap(){setupMap();state.units=[];state.traps=[];state.core=null;state.formTarget=null;state.editorTerrain=null;state.editorDraft=null;render();}
function endTurn(){state.mode=null;state.highlight=[];advanceTurn();render();}
function activateMode(mode){
  const u=getCurrentUnit();if(!u||u.ap<1||hasStatus(u,"stunned")||hasStatus(u,"knocked_down")||state.victory||state.defeat)return;
  state.mode=mode;
  if(mode==="move")state.highlight=reachable(board,state.units,u,getCell);
  if(mode==="attack"){
    state.highlight=state.units.filter(t=>isBattleUnit(t)&&t.team!==u.team&&dist(u,t)<=u.range&&lineOfSight(board,u,t)).map(t=>({x:t.x,y:t.y}));
    if(state.core&&state.core.hp>0&&dist(u,state.core)<=u.range&&lineOfSight(board,u,state.core))state.highlight.push({x:state.core.x,y:state.core.y});
  }
  if(mode==="ability"){
    if(u.abilityType==="trap")state.highlight=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:u.x+dx,y:u.y+dy})).filter(p=>canEnter(u,p.x,p.y)&&!state.traps.some(t=>t.x===p.x&&t.y===p.y));
    else if(u.abilityType==="heal")state.highlight=state.units.filter(t=>isBattleUnit(t)&&t.team===u.team&&t.hp<t.maxHp&&dist(u,t)<=u.range&&lineOfSight(board,u,t)).map(t=>({x:t.x,y:t.y}));
    else state.highlight=state.units.filter(t=>isBattleUnit(t)&&t.team!==u.team&&dist(u,t)<=u.range&&lineOfSight(board,u,t)).map(t=>({x:t.x,y:t.y}));
  }
  render();
}
function triggerTrap(unit){
  const trap=state.traps.find(t=>t.x===unit.x&&t.y===unit.y);if(!trap)return;
  const dealt=applyDamage(unit,trap.damage,effectiveDefense(unit));state.traps=state.traps.filter(t=>t!==trap);
  addLog(`${unit.name} löst eine Mine aus und erleidet ${dealt} Schaden.`);applyKnockback(unit,{x:unit.x,y:unit.y},1);
}
function collisionDamage(unit,impact){return Math.max(1,Math.round(impact*2-(unit.stability||0)/10));}
function applyKnockback(target,source,distance){
  if(!target?.alive||distance<=0)return;
  const dx=Math.sign(target.x-source.x),dy=Math.sign(target.y-source.y);if(!dx&&!dy)return;
  let moved=0;
  for(let i=0;i<distance;i++){
    const nx=target.x+dx,ny=target.y+dy,cell=getCell(board,nx,ny);
    const blocker=atAny(nx,ny);
    if(!cell||!cell.walk||blocker){if(blocker&&blocker.id!==target.id){const dealt=applyDamage(target,collisionDamage(target,i+1),0);addLog(`${target.name} prallt auf ${blocker.name} und erleidet ${dealt} Kollisionsschaden.`);addStatus(target,"knocked_down");}else if(!cell||!cell.walk){const dealt=applyDamage(target,collisionDamage(target,i+1),0);addLog(`${target.name} prallt auf ein Hindernis und erleidet ${dealt} Kollisionsschaden.`);if(target.alive)addStatus(target,"knocked_down");}break;}
    target.x=nx;target.y=ny;moved++;
  }
  if(moved) addLog(`${target.name} wird ${moved} Feld${moved===1?"":"er"} zurückgestoßen.`);
}
function executeMove(x,y){
  const u=getCurrentUnit(),step=state.highlight.find(p=>p.x===x&&p.y===y);if(!u||!step||u.ap<1)return;
  u.x=x;u.y=y;u.ap--;u.moveLeft-=step.d;triggerTrap(u);state.mode=null;state.highlight=[];checkMission();render();
}
function executeCoreAttack(core){
  const u=getCurrentUnit();
  if(!u||!core||u.ap<1||dist(u,core)>u.range||!lineOfSight(board,u,core))return;
  const defense=Number(getCell(board,core.x,core.y)?.cover||0);
  if(rollHit(u,core,defense)){
    const dealt=applyDamage(core,u.damage||u.attack+5,defense);
    addLog(`${u.name} verursacht ${dealt} Schaden am Energiekern.`);
    if(core.hp<=0){core.hp=0;addLog("Der Energiekern zerbricht.");}
  }else addLog(`${u.name} verfehlt den Energiekern.`);
  u.ap--;state.mode=null;state.highlight=[];checkMission();render();
}
function executeAttack(target){
  const u=getCurrentUnit();if(!u||!target||u.ap<1||target.team===u.team||dist(u,target)>u.range||!lineOfSight(board,u,target))return;
  if(rollHit(u,target,effectiveDefense(target))){const dealt=applyDamage(target,u.damage||u.attack+5,effectiveDefense(target));addLog(`${u.name} verursacht ${dealt} Schaden an ${target.name}.`);if(target.alive&&u.knockback)applyKnockback(target,u,u.knockback);}
  else addLog(`${u.name} verfehlt ${target.name}.`);
  u.ap--;state.mode=null;state.highlight=[];checkMission();render();
}
function executeAbility(target,x,y){
  const u=getCurrentUnit();if(!u||u.ap<1)return;
  if(u.abilityType==="trap"){if(!state.highlight.some(p=>p.x===x&&p.y===y))return;state.traps.push({x,y,damage:u.trapDamage||30});addLog(`${u.name} legt eine Mine.`);}
  else if(u.abilityType==="heal"){if(!target||target.team!==u.team||dist(u,target)>u.range||!lineOfSight(board,u,target))return;const amount=u.heal||0;target.hp=Math.min(target.maxHp,target.hp+amount);addLog(`${u.name} heilt ${target.name} um ${amount}.`);}
  else {if(!target||target.team===u.team||dist(u,target)>u.range||!lineOfSight(board,u,target))return;const dealt=applyDamage(target,u.damage||10,effectiveDefense(target));addLog(`${u.name} verursacht ${dealt} Fähigkeitsschaden an ${target.name}.`);
    if(u.abilityType==="stun")addStatus(target,"stunned");if(u.abilityType==="mark")addStatus(target,"marked");
    if(u.abilityType==="push")applyKnockback(target,u,1);if(u.abilityType==="pull"){const dx=Math.sign(u.x-target.x),dy=Math.sign(u.y-target.y),nx=target.x+dx,ny=target.y+dy;if(canEnter(target,nx,ny,target.id)){target.x=nx;target.y=ny;}}
  }
  u.ap--;state.mode=null;state.highlight=[];checkMission();render();
}
function clickBattleTile(x,y){
  const u=getCurrentUnit(),target=at(x,y);
  const coreTarget=state.core&&state.core.x===x&&state.core.y===y?state.core:null;
  if(!u||state.victory||state.defeat)return;
  if(state.mode==="move")return executeMove(x,y);
  if(state.mode==="attack")return coreTarget?executeCoreAttack(coreTarget):executeAttack(target);
  if(state.mode==="ability")return executeAbility(target,x,y);
  if(target?.team==="hero"){state.selected=target.id;const i=state.turnOrder.findIndex(v=>v.id===target.id);if(i>=0)state.turnIndex=i;}
  render();
}
function clickEditorTile(x,y){
  if(state.tool==="select"){
    const u=atAny(x,y);
    if(u)startEditUnit(u);
    else{state.editorDraft=null;state.formTarget=null;state.editorTerrain={x,y};}
    return;
  }
  if(state.tool==="unit"){
    if(atAny(x,y)){addLog("Feld ist bereits belegt.");return;}
    const key=state.editorSelected||"powerkim",t=templates[key]?{...templates[key]}:null;
    startNewUnitDraft(t?{...t,x,y}:{x,y});
    return;
  }
  if(terrainTools.includes(state.tool)){const c=getCell(board,x,y);Object.assign(c,makeTerrain(state.tool,c.image));state.editorTerrain={x,y};state.formTarget=null;state.editorDraft=null;}
  if(state.tool==="delete"){Object.assign(getCell(board,x,y),makeTerrain("floor"));state.editorTerrain=null;}
}
function buildStaticShell(){
  const w=document.getElementById("workspace");
  w.innerHTML=`<div id="battle-screen" class="screen"><div id="board-container"><div id="board"></div><div id="battle-overlay" class="battle-overlay hidden"></div></div><aside id="sidebar">
  <div class="panel"><h3 id="battle-state-title">Kampf</h3><p id="battle-round-label"></p><div id="selected-unit-card"></div></div>
  <div class="panel"><h3>Aktionen</h3><button class="action-btn" data-action="move">Bewegen</button> <button class="action-btn" data-action="attack">Angriff</button> <button class="action-btn" data-action="ability">Fähigkeit</button> <button class="action-btn success" data-action="end-turn">Zug beenden</button></div>
  <div class="panel"><h3>Initiative</h3><div id="initiative-list"></div></div><div class="panel"><h3>Log</h3><div id="battle-log"></div></div></aside></div>
  <div id="editor-screen" class="screen hidden"><div id="board-container-editor"><div id="editor-board"></div></div><aside id="sidebar-editor">
  <div class="panel"><h3>Editor-Werkzeuge</h3><div class="editor-tools">${["select",...terrainTools,"unit","delete"].map(t=>`<button data-tool="${t}">${t==="select"?"Auswählen":t==="unit"?"Einheit":t==="delete"?"Löschen":DEFAULT_TERRAIN[t]?.label||t}</button>`).join("")}</div><div class="small">Bei „Einheit“ kannst du unten einen Vorlagentyp wählen. Bei „Auswählen“ öffnet ein Feld den Gelände-Editor.</div><div id="template-tools"></div></div>
  <div class="panel"><h3>Einheiten</h3><div id="unit-list" class="unit-editor-list"></div><button id="new-unit-btn" class="wide success">Neue Einheit</button></div>
  <div class="panel"><h3>Einheit / Gelände bearbeiten</h3><div id="unit-form"></div></div>
  <div class="panel"><h3>Karte</h3><button id="save-map-btn" class="wide success">Karte speichern</button><button id="load-map-btn" class="wide">Karte laden</button><button id="clear-map-btn" class="wide warning">Karte leeren</button><button id="test-map-btn" class="wide primary">Karte testen</button></div></aside></div>`;
  delegatedClick(w,"[data-action]",b=>{const a=b.dataset.action;if(a==="move"||a==="attack"||a==="ability")activateMode(a);if(a==="end-turn")endTurn();if(a==="restore-battle")restoreBattle();});
  delegatedClick(w,".tile",t=>{const x=Number(t.dataset.x),y=Number(t.dataset.y);state.screen==="battle"?clickBattleTile(x,y):clickEditorTile(x,y);render();});
  delegatedClick(w,"[data-tool]",b=>{state.tool=b.dataset.tool;if(state.tool!=="unit")state.editorSelected=null;render();});
  delegatedClick(w,"[data-unit-id]",b=>{const u=state.units.find(x=>x.id===b.dataset.unitId);if(u)startEditUnit(u);render();});
  delegatedClick(w,"#new-unit-btn",createCustomUnitAtEditor);delegatedClick(w,"#save-unit-btn",saveUnitDraft);delegatedClick(w,"#cancel-unit-btn",cancelUnitDraft);delegatedClick(w,"#delete-unit-btn",deleteEditedUnit);delegatedClick(w,"#save-terrain-btn",saveTerrain);
  delegatedClick(w,"#save-map-btn",saveEditableMap);delegatedClick(w,"#load-map-btn",loadEditableMap);delegatedClick(w,"#clear-map-btn",clearEditableMap);
  delegatedClick(w,"#test-map-btn",()=>{state.screen="battle";startRound();snapshotBattle();render();});
  document.getElementById("battle-button").onclick=()=>{state.screen="battle";startRound();render();};
  document.getElementById("editor-button").onclick=()=>{state.screen="editor";render();};
  document.getElementById("abort-button").onclick=()=>restoreBattle();
}
function init(){
  buildStaticShell();setupMap();loadScenario();state.screen="battle";render();
}
document.addEventListener("DOMContentLoaded",init);
