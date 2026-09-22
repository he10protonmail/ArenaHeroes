"use strict";

/* Arena Heroes - compact tactical core.
 * The editor remains the source of truth: a new game starts on an empty map.
 */
const SIZE = 20;
let board = [];
const state = {
  screen: "battle", round: 1, units: [], selected: null, turnOrder: [], turnIndex: 0,
  mode: null, highlight: [], log: [], victory: false, defeat: false, core: null,
  tool: "select", editorSelected: null, traps: [], battleSnapshot: null
};

const STATUS = {
  burning: { label: "Brennend", icon: "🔥", duration: 2 },
  stunned: { label: "Betäubt", icon: "⚡", duration: 1 },
  slowed: { label: "Verkrüppelt", icon: "❄", duration: 2 },
  marked: { label: "Markiert", icon: "🎯", duration: 1 },
  knocked_down: { label: "Am Boden", icon: "💫", duration: 1 },
  shielded: { label: "Geschützt", icon: "🛡", duration: 1 }
};

const templates = {
  powerkim:{id:"powerkim",name:"Powerkim",short:"P",team:"hero",className:"Nahkampf / Tank",x:2,y:17,hp:180,maxHp:180,attack:20,defense:18,stability:25,movement:5,range:1,damage:35,knockback:3,abilityName:"Power-Schlag",ability:"stun"},
  visor:{id:"visor",name:"Visor",short:"V",team:"hero",className:"Fernkampf / Taktiker",x:3,y:17,hp:80,maxHp:80,attack:22,defense:10,stability:15,movement:6,range:10,damage:24,knockback:1,abilityName:"Markieren",ability:"mark"},
  watson:{id:"watson",name:"Watson",short:"W",team:"hero",className:"Heiler / Fliegend",x:4,y:17,hp:100,maxHp:100,attack:8,defense:10,stability:20,movement:8,range:8,heal:40,abilityName:"Heilstrahl",ability:"heal",flying:true},
  nyra:{id:"nyra",name:"Nyra",short:"N",team:"hero",className:"Spionin / Fallen",x:1,y:18,hp:70,maxHp:70,attack:15,defense:12,stability:15,movement:9,range:1,damage:18,knockback:2,trapDamage:30,abilityName:"Mine",ability:"trap"},
  drone1:{id:"drone1",name:"Sicherheitsdrohne 1",short:"D",team:"enemy",className:"Fernkampf / Fliegend",x:16,y:3,hp:40,maxHp:40,attack:14,defense:3,stability:10,movement:8,range:7,damage:14,flying:true},
  drone2:{id:"drone2",name:"Sicherheitsdrohne 2",short:"D",team:"enemy",className:"Fernkampf / Fliegend",x:17,y:5,hp:40,maxHp:40,attack:14,defense:3,stability:10,movement:8,range:7,damage:14,flying:true},
  bulwark:{id:"bulwark",name:"Bulwark",short:"B",team:"enemy",className:"Schwerer Tank",x:15,y:15,hp:220,maxHp:220,attack:26,defense:20,stability:40,movement:3,range:1,damage:16,knockback:3}
};

const el = id => document.getElementById(id);
const cell = (x,y) => x>=0 && y>=0 && x<SIZE && y<SIZE ? board[y][x] : null;
const aliveAt = (x,y) => state.units.find(u=>u.alive && u.x===x && u.y===y);
const anyAt = (x,y) => state.units.find(u=>u.x===x && u.y===y);
const current = () => state.turnOrder[state.turnIndex] || null;
const dist = (a,b) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y));
function log(message){ state.log.unshift(message); state.log=state.log.slice(0,18); }
function hasStatus(u,id){ return !!u?.statuses?.some(s=>s.id===id); }
function addStatus(u,id,duration=STATUS[id]?.duration||1){
  if(!u || !STATUS[id]) return;
  const old=u.statuses.find(s=>s.id===id);
  if(old) old.remaining=Math.max(old.remaining,duration); else u.statuses.push({id,remaining:duration});
  log(`${u.name}: ${STATUS[id].label}.`);
}
function statusIcons(u){ return (u.statuses||[]).map(s=>STATUS[s.id]?.icon||"?").join(""); }
function effectiveDefense(u){ return Math.max(0,(u.defense||0)-(hasStatus(u,"marked")?5:0)); }
function makeUnit(t){ return {...t,id:`${t.id}-${Math.random().toString(36).slice(2,8)}`,alive:true,ap:2,moveLeft:t.movement,statuses:[],x:t.x,y:t.y}; }

function setupMap(){
  board=Array.from({length:SIZE},()=>Array.from({length:SIZE},()=>({type:"floor",walk:true,los:false,cover:0})));
  state.core=null;
}
function resetState(){ state.units=[];state.selected=null;state.turnOrder=[];state.turnIndex=0;state.round=1;state.mode=null;state.highlight=[];state.traps=[];state.victory=false;state.defeat=false;state.log=[]; }
function loadScenario(){
  resetState(); state.units=Object.values(templates).map(makeUnit); state.selected=state.units[0]?.id||null; startRound(); snapshot(); log("Szenario geladen."); render();
}
function startRound(){
  state.turnOrder=state.units.filter(u=>u.alive).sort((a,b)=>b.movement-a.movement);
  state.turnIndex=0; state.turnOrder.forEach(u=>{u.ap=2;u.moveLeft=hasStatus(u,"slowed")?Math.max(1,u.movement-2):u.movement;});
  skipUnavailable();
}
function skipUnavailable(){
  let guard=0; while(current() && guard++<state.turnOrder.length){ if(!hasStatus(current(),"stunned")) return; log(`${current().name} ist betäubt und setzt aus.`); advanceTurn(true); }
}
function tick(u){
  if(!u) return;
  u.statuses=u.statuses.filter(s=>{s.remaining--;if(s.remaining<=0){log(`${u.name}: ${STATUS[s.id].label} endet.`);return false;}return true;});
}
function advanceTurn(skipped=false){
  tick(current()); state.turnIndex++;
  if(state.turnIndex>=state.turnOrder.length){state.round++;startRound();} else skipUnavailable();
}
function canEnter(u,x,y){const c=cell(x,y);return !!c&&c.walk&&(c.type!=="water"||u.flying)&&!aliveAt(x,y);}
function reachable(u){
  const result=[], seen=new Map([[`${u.x},${u.y}`,0]]), queue=[{x:u.x,y:u.y,d:0}], dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while(queue.length){const p=queue.shift();if(p.d>=u.moveLeft)continue;for(const [dx,dy] of dirs){const x=p.x+dx,y=p.y+dy,d=p.d+1,k=`${x},${y}`;if(d<=u.moveLeft&&(!seen.has(k)||seen.get(k)>d)&&canEnter(u,x,y)){seen.set(k,d);queue.push({x,y,d});result.push({x,y,d});}}} return result;
}
function lineOfSight(a,b){const n=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));for(let i=1;i<n;i++){const c=cell(a.x+Math.round((b.x-a.x)*i/n),a.y+Math.round((b.y-a.y)*i/n));if(c?.los)return false;}return true;}
function moveToward(t,a,direction,fields=1){
  const dx=Math.sign(t.x-a.x),dy=Math.sign(t.y-a.y),sign=direction==="toward"?-1:1;
  for(let i=0;i<fields&&t.alive;i++){const x=t.x+dx*sign,y=t.y+dy*sign,c=cell(x,y);if(!c||!c.walk||aliveAt(x,y))break;t.x=x;t.y=y;}
}
function damage(source,target,amount){
  if(!target?.alive)return;const value=Math.max(1,amount-effectiveDefense(target));target.hp=Math.max(0,target.hp-value);log(`${source.name} verursacht ${value} Schaden an ${target.name}.`);if(!target.hp){target.alive=false;target.ap=0;log(`${target.name} ist kampfunfähig.`);}
}
function attack(target,ability=false){
  const a=current(); if(!a||!target||target.team===a.team||a.ap<1||dist(a,target)>a.range||!lineOfSight(a,target)||hasStatus(a,"knocked_down"))return;
  const hit=a.attack+Math.floor(Math.random()*6)-effectiveDefense(target); if(hit<=0)log(`${a.name} verfehlt ${target.name}.`);else{damage(a,target,ability?a.damage||10:a.attack+5);if(target.alive&&a.knockback)moveToward(target,a,"away",a.knockback);}
  a.ap--;a.acted=true;finishAction();
}
function ability(target,x,y){
  const a=current();if(!a||a.ap<1)return;
  if(a.ability==="trap"){if(!cell(x,y)?.walk||anyAt(x,y)||state.traps.some(t=>t.x===x&&t.y===y)||dist(a,{x,y})!==1)return;state.traps.push({x,y,damage:a.trapDamage||30});log(`${a.name} legt eine Mine.`);}
  else if(a.ability==="heal"){if(!target||target.team!==a.team||dist(a,target)>a.range)return;target.hp=Math.min(target.maxHp,target.hp+a.heal);log(`${a.name} heilt ${target.name}.`);}
  else {if(!target||target.team===a.team||dist(a,target)>a.range||!lineOfSight(a,target))return;damage(a,target,a.damage||10);if(a.ability==="stun")addStatus(target,"stunned");if(a.ability==="mark")addStatus(target,"marked");if(a.ability==="pull")moveToward(target,a,"toward",1);if(a.ability==="whip")moveToward(target,a,"toward",1);}
  a.ap--;a.acted=true;finishAction();
}
function move(x,y){const a=current(),p=state.highlight.find(v=>v.x===x&&v.y===y);if(!a||!p||a.ap<1)return;a.x=x;a.y=y;a.moveLeft-=p.d;const trap=state.traps.findIndex(t=>t.x===x&&t.y===y);if(trap>=0){state.traps.splice(trap,1);damage({name:"Mine"},a,30);}a.ap--;a.acted=true;state.highlight=reachable(a);render();}
function finishAction(){state.mode=null;state.highlight=[];check();render();}
function check(){if(state.units.length&& !state.units.some(u=>u.alive&&u.team==="hero"))state.defeat=true;if(state.units.length&&!state.units.some(u=>u.alive&&u.team==="enemy"))state.victory=true;}
function snapshot(){state.battleSnapshot=JSON.parse(JSON.stringify({board,units:state.units,traps:state.traps,core:state.core}));}
function resetBattle(){if(!state.battleSnapshot)return;Object.assign(state,JSON.parse(JSON.stringify({units:state.battleSnapshot.units,traps:state.battleSnapshot.traps,core:state.battleSnapshot.core})));board=JSON.parse(JSON.stringify(state.battleSnapshot.board));state.victory=false;state.defeat=false;state.round=1;state.log=[];startRound();render();}
function mode(m){const a=current();if(!a||a.ap<1||hasStatus(a,"stunned"))return;state.mode=m;if(m==="move")state.highlight=reachable(a);else if(m==="ability"&&a.ability==="trap")state.highlight=[[1,0],[-1,0],[0,1],[0,-1].map?.(v=>v)];else state.highlight=state.units.filter(t=>t.alive&&((m==="ability"&&a.heal)?t.team===a.team&&t.hp<t.maxHp:t.team!==a.team)&&dist(a,t)<=a.range&&lineOfSight(a,t)).map(t=>({x:t.x,y:t.y}));render();}
function clickTile(x,y){const a=current(),t=aliveAt(x,y);if(state.mode==="move")return move(x,y);if(state.mode==="attack")return attack(t);if(state.mode==="ability")return ability(t,x,y);if(t?.team==="hero")state.selected=t.id;render();}

function boardView(){const root=el("board");if(!root)return;root.innerHTML="";for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const e=document.createElement("div"),c=cell(x,y);e.className=`tile ${c.type}`;const h=state.highlight.find(p=>p.x===x&&p.y===y);if(h)e.classList.add(state.mode==="move"?"move-range":state.mode==="ability"?"ability-range":"attack-range");if(state.traps.some(t=>t.x===x&&t.y===y)){const trap=document.createElement("span");trap.className="trap";trap.textContent="✹";e.append(trap);}const u=anyAt(x,y);if(u){const q=document.createElement("div");q.className=`unit ${u.team} ${u===current()?"selected":""} ${u.alive?"":"defeated"} ${hasStatus(u,"marked")?"marked":""}`;q.textContent=u.alive?(u.short||"?"):"☠";q.title=`${u.name} · ${u.hp}/${u.maxHp} HP ${statusIcons(u)}`;q.innerHTML+=`<span class="status-icons">${statusIcons(u)}</span>`;e.append(q);}e.onclick=()=>state.screen==="editor"?editorClick(x,y):clickTile(x,y);root.append(e);}}
function battle(){el("workspace").innerHTML=`<div id="board-container"><div id="board"></div></div><aside id="sidebar"><div class="panel"><h3>${state.victory?"Sieg":state.defeat?"Niederlage":"Kampf"}</h3><p>Runde ${state.round}${current()?` · ${current().name}`:""}</p><button class="primary wide" id="load-scenario">Szenario laden</button><button class="warning wide" id="reset-battle">Kampf zurücksetzen</button></div><div class="panel"><h3>Aktionen</h3><button id="move-button" class="wide">Bewegen</button><button id="attack-button" class="wide">Angriff</button><button id="ability-button" class="wide">${current()?.abilityName||"Fähigkeit"}</button><button id="end-button" class="success wide">Zug beenden</button></div><div class="panel"><h3>Log</h3><div class="log">${state.log.map(x=>`<div>${x}</div>`).join("")}</div></div></aside>`;boardView();el("load-scenario").onclick=loadScenario;el("reset-battle").onclick=resetBattle;el("move-button").onclick=()=>mode("move");el("attack-button").onclick=()=>mode("attack");el("ability-button").onclick=()=>mode("ability");el("end-button").onclick=()=>{state.mode=null;state.highlight=[];advanceTurn();render();};}
function editor(){el("workspace").innerHTML=`<div id="board-container"><div id="board"></div></div><aside id="sidebar"><div class="panel"><h3>Editor-Werkzeuge</h3><div class="editor-tools">${["select","floor","wall","water","tree","delete"].map(t=>`<button data-tool="${t}">${t}</button>`).join("")}</div></div><div class="panel"><h3>Einheiten</h3>${Object.values(templates).map(t=>`<button class="wide" data-place="${t.id}">${t.name}</button>`).join("")}<button id="test-map" class="success wide">Karte testen</button><button id="clear-map" class="warning wide">Karte leeren</button></div></aside>`;boardView();document.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{state.tool=b.dataset.tool;render();});document.querySelectorAll("[data-place]").forEach(b=>b.onclick=()=>{state.editorSelected=b.dataset.place;state.tool="unit";render();});el("clear-map").onclick=()=>{setupMap();resetState();render();};el("test-map").onclick=()=>{state.screen="battle";snapshot();startRound();render();};}
function editorClick(x,y){if(state.tool==="unit"){const t=templates[state.editorSelected];if(t&&!anyAt(x,y)){const u=makeUnit({...t,x,y});state.units.push(u);state.selected=u.id;render();}return;}const c=cell(x,y);if(state.tool==="delete"){c.type="floor";c.walk=true;c.los=false;c.cover=0;}else if(["floor","wall","water","tree"].includes(state.tool)){c.type=state.tool;c.walk=state.tool!=="wall";c.los=state.tool==="wall";c.cover=state.tool==="tree"?1:state.tool==="wall"?2:0;}render();}
function render(){const u=current();el("screen-title").textContent=state.screen==="battle"?"Arena Heroes":"Arena Editor";el("screen-status").textContent=state.screen==="battle"?(state.victory?"Sieg":state.defeat?"Niederlage":u?`Runde ${state.round} · ${u.name}`:"Leere Karte"):"Karte bearbeiten";state.screen==="battle"?battle():editor();}

el("battle-button").onclick=()=>{state.screen="battle";render();};el("editor-button").onclick=()=>{state.screen="editor";render();};el("abort-button").onclick=()=>{state.screen="battle";resetState();setupMap();render();};
setupMap(); resetState(); render();
