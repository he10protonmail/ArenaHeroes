"use strict";

const SIZE = 20;
let board = [];

const state = {
  screen: "battle",
  round: 1,
  units: [],
  selected: null,
  turnOrder: [],
  turnIndex: 0,
  mode: null,
  highlight: [],
  log: [],
  victory: false,
  defeat: false,
  core: null,
  tool: "select",
  editorSelected: null,
  traps: [],
  formTarget: null,
  battleSnapshot: null,
  mapStorageKey: "arena-heroes-map-v2",
  inEditorMode: false
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
  powerkim: { id: "powerkim", name: "Powerkim", short: "P", team: "hero", className: "Nahkampf / Tank", x: 2, y: 17, hp: 180, maxHp: 180, attack: 20, defense: 18, stability: 25, movement: 5, range: 1, damage: 35, knockback: 3, abilityName: "Power-Schlag", abilityType: "stun" },
  visor: { id: "visor", name: "Visor", short: "V", team: "hero", className: "Fernkampf / Taktiker", x: 3, y: 17, hp: 80, maxHp: 80, attack: 22, defense: 10, stability: 15, movement: 6, range: 10, damage: 24, knockback: 1, abilityName: "Markieren", abilityType: "mark" },
  watson: { id: "watson", name: "Watson", short: "W", team: "hero", className: "Heiler / Fliegend", x: 4, y: 17, hp: 100, maxHp: 100, attack: 8, defense: 10, stability: 20, movement: 8, range: 8, heal: 40, abilityName: "Heilstrahl", abilityType: "heal", flying: true },
  nyra: { id: "nyra", name: "Nyra", short: "N", team: "hero", className: "Spionin / Fallen", x: 1, y: 18, hp: 70, maxHp: 70, attack: 15, defense: 12, stability: 15, movement: 9, range: 1, damage: 18, knockback: 2, trapDamage: 30, abilityName: "Mine", abilityType: "trap" },
  drone1: { id: "drone1", name: "Sicherheitsdrohne 1", short: "D", team: "enemy", className: "Fernkampf / Fliegend", x: 16, y: 3, hp: 40, maxHp: 40, attack: 14, defense: 3, movement: 8, range: 7, damage: 14, flying: true },
  drone2: { id: "drone2", name: "Sicherheitsdrohne 2", short: "D", team: "enemy", className: "Fernkampf / Fliegend", x: 17, y: 5, hp: 40, maxHp: 40, attack: 14, defense: 3, movement: 8, range: 7, damage: 14, flying: true },
  bulwark: { id: "bulwark", name: "Bulwark", short: "B", team: "enemy", className: "Schwerer Tank", x: 15, y: 15, hp: 220, maxHp: 220, attack: 26, defense: 20, movement: 3, range: 1, damage: 16, knockback: 3 }
};

const cell = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE ? board[y][x] : null;
const getCurrentUnit = () => state.turnOrder[state.turnIndex] || null;
const at = (x, y) => state.units.find(u => u.alive && u.x === x && u.y === y);
const atAny = (x, y) => state.units.find(u => u.x === x && u.y === y);
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function log(msg) {
  state.log.unshift(msg);
  state.log = state.log.slice(0, 18);
}

function hasStatus(u, id) {
  return !!u?.statuses?.some(s => s.id === id);
}

function addStatus(u, id, duration = STATUS[id]?.duration || 1) {
  if (!u || !STATUS[id]) return;
  const old = u.statuses.find(s => s.id === id);
  if (old) old.remaining = Math.max(old.remaining, duration);
  else u.statuses.push({ id, remaining: duration });
  log(`${u.name}: ${STATUS[id].label}.`);
}

function removeStatus(u, id) {
  if (!u) return;
  u.statuses = u.statuses.filter(s => s.id !== id);
}

function statusIcons(u) {
  return (u?.statuses || []).map(s => STATUS[s.id]?.icon || "?").join("");
}

function makeUnit(t) {
  return {
    ...t,
    id: `${t.id}-${Math.random().toString(36).slice(2, 8)}`,
    alive: true,
    ap: 2,
    moveLeft: t.movement || 0,
    statuses: [],
    inBattle: true,
    x: t.x,
    y: t.y
  };
}

function setupMap() {
  board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ type: "floor", walk: true, los: false, cover: 0 })));
  state.core = null;
  state.traps = [];
}

function resetState() {
  state.units = [];
  state.selected = null;
  state.turnOrder = [];
  state.turnIndex = 0;
  state.mode = null;
  state.highlight = [];
  state.traps = [];
  state.victory = false;
  state.defeat = false;
  state.log = [];
  state.formTarget = null;
}

function resetBattleState() {
  state.round = 1;
  state.mode = null;
  state.highlight = [];
  state.victory = false;
  state.defeat = false;
  state.turnOrder = [];
  state.turnIndex = 0;
  state.log = [];
  state.selected = null;
}

function isValidBattleUnit(u) {
  return !!u && u.alive && u.inBattle !== false;
}

function getBattleUnits() {
  return state.units.filter(u => isValidBattleUnit(u));
}

function startRound() {
  const alive = getBattleUnits();
  state.turnOrder = alive.sort((a, b) => (b.movement || 0) - (a.movement || 0) || Math.random() - 0.5);
  state.turnIndex = 0;
  state.turnOrder.forEach(u => {
    u.ap = 2;
    u.moveLeft = hasStatus(u, "slowed") ? Math.max(1, (u.movement || 0) - 2) : (u.movement || 0);
  });
  skipUnavailable();
}

function skipUnavailable() {
  let attempts = 0;
  while (getCurrentUnit() && attempts++ < state.turnOrder.length) {
    const u = getCurrentUnit();
    if (!hasStatus(u, "stunned")) return;
    log(`${u.name} ist betäubt und setzt aus.`);
    advanceTurn();
  }
}

function tickStatuses(u) {
  if (!u) return;
  u.statuses = u.statuses.filter(s => {
    s.remaining -= 1;
    if (s.remaining <= 0) {
      log(`${u.name}: ${STATUS[s.id]?.label || s.id} endet.`);
      return false;
    }
    return true;
  });
}

function advanceTurn() {
  const u = getCurrentUnit();
  if (u) tickStatuses(u);
  state.turnIndex += 1;

  if (state.turnIndex >= state.turnOrder.length) {
    state.round += 1;
    state.turnIndex = 0;
    startRound();
    return;
  }

  skipUnavailable();
}

function isValidCell(x, y) {
  const c = cell(x, y);
  return !!c && c.walk;
}

function canEnter(u, x, y) {
  const c = cell(x, y);
  return !!c && c.walk && (c.type !== "water" || !!u.flying) && !at(x, y);
}

function reachable(u) {
  if (!u) return [];
  const result = [];
  const seen = new Map([[`${u.x},${u.y}`, 0]]);
  const queue = [{ x: u.x, y: u.y, d: 0 }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  while (queue.length) {
    const p = queue.shift();
    if (p.d >= (u.moveLeft || 0)) continue;
    for (const [dx, dy] of dirs) {
      const x = p.x + dx;
      const y = p.y + dy;
      const d = p.d + 1;
      const key = `${x},${y}`;
      if (d > (u.moveLeft || 0)) continue;
      if (seen.has(key) && seen.get(key) <= d) continue;
      if (!canEnter(u, x, y)) continue;
      seen.set(key, d);
      queue.push({ x, y, d });
      result.push({ x, y, d });
    }
  }

  return result;
}

function los(a, b) {
  const n = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  for (let i = 1; i <= n; i++) {
    const cx = a.x + Math.round((b.x - a.x) * i / n);
    const cy = a.y + Math.round((b.y - a.y) * i / n);
    const c = cell(cx, cy);
    if (c?.los) return false;
  }
  return true;
}

function effectiveDefense(u) {
  const base = Number(u?.defense || 0);
  return Math.max(0, base - (hasStatus(u, "marked") ? 5 : 0));
}

function damage(source, target, amount) {
  if (!target || !target.alive) return;
  const value = Math.max(1, Number(amount || 0) - effectiveDefense(target));
  target.hp = Math.max(0, (target.hp || 0) - value);
  target.lastDamage = value;
  log(`${source.name} verursacht ${value} Schaden an ${target.name}.`);
  if (!target.hp) {
    target.alive = false;
    target.ap = 0;
    target.inBattle = false;
    log(`${target.name} ist kampfunfähig.`);
  }
}

function triggerTrap(u) {
  if (!u || !u.alive) return;
  const idx = state.traps.findIndex(t => t.x === u.x && t.y === u.y);
  if (idx < 0) return;
  const trap = state.traps.splice(idx, 1)[0];
  log(`${u.name} berührt eine Mine.`);
  damage({ name: "Mine" }, u, trap.damage || 30);
}

function pushUnit(target, source, direction, fields = 1) {
  if (!target || !source || !target.alive) return;
  const dx = Math.sign(target.x - source.x);
  const dy = Math.sign(target.y - source.y);
  const s = direction === "toward" ? -1 : 1;
  for (let i = 0; i < fields && target.alive; i++) {
    const nextX = target.x + dx * s;
    const nextY = target.y + dy * s;
    const c = cell(nextX, nextY);
    const occupant = atAny(nextX, nextY);
    if (!c || !c.walk || occupant) break;
    target.x = nextX;
    target.y = nextY;
    triggerTrap(target);
  }
}

function applyAbilityToTarget(unit, target, abilityType) {
  if (!unit || !target) return;

  if (abilityType === "stun") addStatus(target, "stunned", 1);
  if (abilityType === "mark") addStatus(target, "marked", 1);
  if (abilityType === "slowed") addStatus(target, "slowed", 2);
  if (abilityType === "pull") pushUnit(target, unit, "away", 1);
  if (abilityType === "whip") pushUnit(target, unit, "toward", 1);

  if (abilityType === "trap") {
    const x = target.x;
    const y = target.y;
    if (cell(x, y)?.walk && !atAny(x, y) && !state.traps.some(t => t.x === x && t.y === y)) {
      state.traps.push({ x, y, damage: unit.trapDamage || 30 });
      log(`${unit.name} legt eine Mine.`);
    }
  }
}

function attack(target, ability = false) {
  const a = getCurrentUnit();
  if (!a || !target || a.ap < 1) return;
  if (target.team === a.team || dist(a, target) > a.range || !los(a, target) || hasStatus(a, "knocked_down")) return;

  const hitValue = a.attack + Math.floor(Math.random() * 6) - effectiveDefense(target);
  if (hitValue <= 0) {
    log(`${a.name} verfehlt ${target.name}.`);
  } else {
    const dmg = ability ? (a.damage || 10) : (a.attack + 5);
    damage(a, target, dmg);
    if (target.alive && a.knockback) pushUnit(target, a, "away", a.knockback);
  }

  a.ap -= 1;
  finishAction();
}

function useAbility(target, x, y) {
  const a = getCurrentUnit();
  if (!a || a.ap < 1) return;

  if (a.abilityType === "trap") {
    if (!cell(x, y)?.walk || atAny(x, y) || state.traps.some(t => t.x === x && t.y === y) || dist(a, { x, y }) !== 1) return;
    state.traps.push({ x, y, damage: a.trapDamage || 30 });
    log(`${a.name} legt eine Mine.`);
  } else if (a.abilityType === "heal") {
    if (!target || target.team !== a.team || dist(a, target) > a.range || !los(a, target)) return;
    target.hp = Math.min(target.maxHp, (target.hp || 0) + (a.heal || 0));
    log(`${a.name} heilt ${target.name} um ${(a.heal || 0)}.`);
  } else {
    if (!target || target.team === a.team || dist(a, target) > a.range || !los(a, target)) return;
    damage(a, target, a.damage || 10);
    applyAbilityToTarget(a, target, a.abilityType);
  }

  a.ap -= 1;
  finishAction();
}

function moveTo(x, y) {
  const u = getCurrentUnit();
  if (!u || u.ap < 1) return;
  const target = state.highlight.find(p => p.x === x && p.y === y);
  if (!target) return;

  u.x = x;
  u.y = y;
  u.moveLeft -= target.d;
  triggerTrap(u);
  u.ap -= 1;
  state.highlight = reachable(u);
  render();
}

function finishAction() {
  state.mode = null;
  state.highlight = [];
  checkBattleState();
  render();
}

function checkBattleState() {
  if (state.units.length && !state.units.some(u => u.alive && u.team === "hero")) state.defeat = true;
  if (state.units.length && !state.units.some(u => u.alive && u.team === "enemy")) state.victory = true;
}

function openBattleMode(mode) {
  const u = getCurrentUnit();
  if (!u || u.ap < 1 || hasStatus(u, "stunned")) return;
  state.mode = mode;

  if (mode === "move") {
    state.highlight = reachable(u);
  } else if (mode === "attack") {
    state.highlight = state.units
      .filter(t => t.alive && t.team !== u.team && dist(u, t) <= u.range && los(u, t))
      .map(t => ({ x: t.x, y: t.y }));
  } else if (mode === "ability") {
    if (u.abilityType === "trap") {
      state.highlight = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy }))
        .filter(p => cell(p.x, p.y)?.walk && !atAny(p.x, p.y) && !state.traps.some(t => t.x === p.x && t.y === p.y));
    } else if (u.abilityType === "heal") {
      state.highlight = state.units
        .filter(t => t.alive && t.team === u.team && t.hp < t.maxHp && dist(u, t) <= u.range && los(u, t))
        .map(t => ({ x: t.x, y: t.y }));
    } else {
      state.highlight = state.units
        .filter(t => t.alive && t.team !== u.team && dist(u, t) <= u.range && los(u, t))
        .map(t => ({ x: t.x, y: t.y }));
    }
  }

  render();
}

function clickBattleTile(x, y) {
  if (state.victory || state.defeat) return;
  const u = getCurrentUnit();
  const target = at(x, y);
  if (!u) return;

  if (state.mode === "move") return moveTo(x, y);
  if (state.mode === "attack") return attack(target, false);
  if (state.mode === "ability") {
    if (u.abilityType === "trap") return useAbility(null, x, y);
    return useAbility(target, x, y);
  }

  if (target && target.team === "hero") {
    state.selected = target.id;
    state.turnIndex = Math.max(0, state.turnOrder.findIndex(unit => unit.id === target.id));
  }
  render();
}

function renderBoard(boardElement, kind = "battle") {
  const boardNodes = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const tile = document.createElement("div");
      const cellData = cell(x, y);
      tile.className = `tile ${cellData?.type || "floor"}`;
      tile.dataset.x = String(x);
      tile.dataset.y = String(y);

      if (state.highlight.some(p => p.x === x && p.y === y)) {
        if (state.mode === "move") tile.classList.add("move-range");
        else if (state.mode === "ability") tile.classList.add("ability-range");
        else tile.classList.add("attack-range");
      }

      if (state.traps.some(t => t.x === x && t.y === y)) {
        const trap = document.createElement("span");
        trap.className = "trap";
        trap.textContent = "✹";
        tile.appendChild(trap);
      }

      const u = atAny(x, y);
      if (u) {
        const q = document.createElement("div");
        q.className = `unit ${u.team} ${u.alive ? "" : "defeated"} ${u.id === (getCurrentUnit()?.id || "") ? "selected" : ""} ${hasStatus(u, "marked") ? "marked" : ""}`;
        if (!u.alive) q.classList.add("dead");
        q.dataset.unitId = u.id;
        q.innerHTML = `
          <div class="unit-core">
            <span class="unit-short">${u.alive ? (u.short || "?") : "☠"}</span>
            <span class="unit-status">${statusIcons(u)}</span>
          </div>
          <div class="unit-hpbar"><span style="width:${Math.max(0, (u.hp || 0) / (u.maxHp || 1) * 100)}%"></span></div>
          <div class="unit-hptext">${u.hp || 0}/${u.maxHp || 0}</div>
        `;
        tile.appendChild(q);
      }

      boardNodes.push(tile);
    }
  }

  boardElement.innerHTML = "";
  for (const node of boardNodes) boardElement.appendChild(node);
}

function renderInitiativeList() {
  const list = document.getElementById("initiative-list");
  if (!list) return;

  const currentTurnOrder = state.turnOrder.filter(u => u.alive && u.inBattle !== false);
  list.innerHTML = currentTurnOrder.map(u => `
    <div class="initiative-unit ${u.id === (getCurrentUnit()?.id || "") ? "active" : ""} ${!u.alive ? "dead" : ""}">
      <span class="initiative-name">${u.name}</span>
      <span class="initiative-meta">HP ${u.hp}/${u.maxHp} · AP ${u.ap || 0}</span>
    </div>
  `).join("") || "<div class=small>Keine Figuren im Kampf.</div>";
}

function renderSelectedUnitCard() {
  const card = document.getElementById("selected-unit-card");
  if (!card) return;
  const u = getCurrentUnit();
  if (!u) {
    card.innerHTML = `<div class="small">Keine aktive Figur.</div>`;
    return;
  }

  card.innerHTML = `
    <h4>${u.name}</h4>
    <div class="unit-meta">${u.team === "hero" ? "Held" : "Gegner"} · ${u.className || "Einheit"}</div>
    <div class="unit-meta">HP ${u.hp}/${u.maxHp}</div>
    <div class="unit-meta">AP ${u.ap || 0} · Bewegung ${u.moveLeft || 0}</div>
    <div class="unit-meta">Status ${statusIcons(u) || "Normal"}</div>
    <div class="unit-meta">Fähigkeit ${u.abilityName || "Keine"}</div>
  `;
}

function renderBattleLog() {
  const el = document.getElementById("battle-log");
  if (!el) return;
  el.innerHTML = state.log.map(line => `<div>${line}</div>`).join("") || "<div class=small>Noch keine Ereignisse.</div>";
}

function renderBattleScreen() {
  const battleBox = document.getElementById("battle-screen");
  const editorBox = document.getElementById("editor-screen");
  if (battleBox) battleBox.classList.remove("hidden");
  if (editorBox) editorBox.classList.add("hidden");

  const battleTitle = document.getElementById("battle-state-title");
  if (battleTitle) battleTitle.textContent = state.victory ? "Sieg" : state.defeat ? "Niederlage" : "Kampf";
  const battleRound = document.getElementById("battle-round-label");
  if (battleRound) battleRound.textContent = `Runde ${state.round}${getCurrentUnit() ? ` · ${getCurrentUnit().name}` : ""}`;

  const boardElement = document.getElementById("board");
  if (boardElement) renderBoard(boardElement, "battle");
  renderInitiativeList();
  renderSelectedUnitCard();
  renderBattleLog();
}

function renderEditorScreen() {
  const battleBox = document.getElementById("battle-screen");
  const editorBox = document.getElementById("editor-screen");
  if (battleBox) battleBox.classList.add("hidden");
  if (editorBox) editorBox.classList.remove("hidden");

  const boardElement = document.getElementById("editor-board");
  if (boardElement) renderBoard(boardElement, "editor");
  renderEditorUnitList();
  renderEditorForm();
}

function renderEditorUnitList() {
  const list = document.getElementById("unit-list");
  if (!list) return;

  const html = state.units.map(u => `
    <button class="unit-item ${state.formTarget === u.id ? "selected" : ""}" data-unit-id="${u.id}">
      <span>${u.name}</span>
      <small>${u.team === "hero" ? "Held" : "Gegner"}</small>
    </button>
  `).join("") || "<div class=small>Keine Einheiten auf der Karte.</div>";

  list.innerHTML = html;
}

function renderEditorForm() {
  const form = document.getElementById("unit-form");
  if (!form) return;

  const u = state.units.find(unit => unit.id === state.formTarget);
  if (!u) {
    form.innerHTML = "<div class=small>Einheit auswählen oder neu erstellen.</div>";
    return;
  }

  form.innerHTML = `
    <label>Name<input id="unit-name" type="text" value="${u.name || ""}"></label>
    <label>Icon / Kürzel<input id="unit-short" type="text" value="${u.short || ""}"></label>
    <label>Farbe<input id="unit-color" type="color" value="${u.color || "#4daeff"}"></label>
    <label>Team<select id="unit-team"><option value="hero" ${u.team === "hero" ? "selected" : ""}>Held</option><option value="enemy" ${u.team === "enemy" ? "selected" : ""}>Gegner</option></select></label>
    <label>HP<input id="unit-hp" type="number" value="${u.maxHp || u.hp || 100}"></label>
    <label>Angriff<input id="unit-attack" type="number" value="${u.attack || 0}"></label>
    <label>Verteidigung<input id="unit-defense" type="number" value="${u.defense || 0}"></label>
    <label>Bewegung<input id="unit-movement" type="number" value="${u.movement || 0}"></label>
    <label>Reichweite<input id="unit-range" type="number" value="${u.range || 1}"></label>
    <label>Schaden<input id="unit-damage" type="number" value="${u.damage || 0}"></label>
    <label>Heilung<input id="unit-heal" type="number" value="${u.heal || 0}"></label>
    <label>Fähigkeit<select id="unit-ability-type">
      <option value="none" ${!u.abilityType ? "selected" : ""}>Keine</option>
      <option value="stun" ${u.abilityType === "stun" ? "selected" : ""}>Power-Schlag (Stun)</option>
      <option value="mark" ${u.abilityType === "mark" ? "selected" : ""}>Markieren</option>
      <option value="heal" ${u.abilityType === "heal" ? "selected" : ""}>Heilen</option>
      <option value="trap" ${u.abilityType === "trap" ? "selected" : ""}>Mine</option>
      <option value="pull" ${u.abilityType === "pull" ? "selected" : ""}>Pull</option>
      <option value="whip" ${u.abilityType === "whip" ? "selected" : ""}>Whip</option>
    </select></label>
    <label>Fähigkeitsname<input id="unit-ability-name" type="text" value="${u.abilityName || ""}"></label>
    <button id="save-unit-btn" class="success wide">Einheit speichern</button>
    <button id="delete-unit-btn" class="warning wide">Einheit entfernen</button>
  `;
}

function saveMap() {
  const payload = {
    board,
    units: state.units,
    traps: state.traps,
    core: state.core,
    templates
  };
  localStorage.setItem(state.mapStorageKey, JSON.stringify(payload));
  log("Karte gespeichert.");
  alert("Karte wurde gespeichert.");
}

function loadMap() {
  const raw = localStorage.getItem(state.mapStorageKey);
  if (!raw) {
    alert("Keine gespeicherte Karte gefunden.");
    return;
  }

  const data = JSON.parse(raw);
  board = data.board || board;
  state.units = data.units || [];
  state.traps = data.traps || [];
  state.core = data.core || null;
  state.formTarget = null;
  render();
}

function createCustomUnit() {
  const id = `custom-${Math.random().toString(36).slice(2, 8)}`;
  const unit = {
    id,
    name: "Neue Figur",
    short: "N",
    team: "hero",
    className: "Eigene Einheit",
    x: 3,
    y: 3,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    movement: 4,
    range: 1,
    damage: 12,
    heal: 0,
    abilityType: "none",
    abilityName: "Keine",
    alive: true,
    ap: 2,
    moveLeft: 4,
    statuses: [],
    inBattle: true,
    color: "#4daeff"
  };
  state.units.push(unit);
  state.formTarget = unit.id;
  render();
}

function saveEditedUnit() {
  const u = state.units.find(unit => unit.id === state.formTarget);
  if (!u) return;

  u.name = document.getElementById("unit-name")?.value || u.name;
  u.short = document.getElementById("unit-short")?.value || u.short;
  u.color = document.getElementById("unit-color")?.value || u.color;
  u.team = document.getElementById("unit-team")?.value || u.team;
  u.hp = Number(document.getElementById("unit-hp")?.value || u.hp);
  u.maxHp = Math.max(u.hp, Number(document.getElementById("unit-hp")?.value || u.hp));
  u.attack = Number(document.getElementById("unit-attack")?.value || u.attack);
  u.defense = Number(document.getElementById("unit-defense")?.value || u.defense);
  u.movement = Number(document.getElementById("unit-movement")?.value || u.movement);
  u.range = Number(document.getElementById("unit-range")?.value || u.range);
  u.damage = Number(document.getElementById("unit-damage")?.value || u.damage);
  u.heal = Number(document.getElementById("unit-heal")?.value || u.heal);
  u.abilityType = document.getElementById("unit-ability-type")?.value || "none";
  u.abilityName = document.getElementById("unit-ability-name")?.value || u.abilityName || "Keine";

  render();
}

function deleteEditedUnit() {
  state.units = state.units.filter(unit => unit.id !== state.formTarget);
  state.formTarget = null;
  render();
}

function render() {
  const battleScreen = document.getElementById("battle-screen");
  const editorScreen = document.getElementById("editor-screen");
  if (!battleScreen || !editorScreen) return;

  if (state.screen === "battle") {
    renderBattleScreen();
  } else {
    renderEditorScreen();
  }
}

function loadScenario() {
  resetBattleState();
  resetState();
  state.units = Object.values(templates).map(makeUnit);
  state.turnOrder = [];
  state.selected = state.units[0]?.id || null;
  state.formTarget = null;
  state.traps = [];
  log("Szenario geladen.");
  startRound();
  render();
}

function bindEventDelegation() {
  const workspace = document.getElementById("workspace");

  workspace.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === "move") openBattleMode("move");
      if (action === "attack") openBattleMode("attack");
      if (action === "ability") openBattleMode("ability");
      if (action === "end-turn") {
        state.mode = null;
        state.highlight = [];
        advanceTurn();
        render();
      }
      return;
    }

    const tile = event.target.closest(".tile");
    if (tile && state.screen === "battle") {
      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);
      clickBattleTile(x, y);
      return;
    }

    if (tile && state.screen === "editor") {
      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);
      if (state.tool === "select") {
        const u = atAny(x, y);
        if (u) state.formTarget = u.id;
      } else if (state.tool === "unit") {
        const t = templates[state.editorSelected];
        if (t && !atAny(x, y)) {
          const unit = makeUnit({ ...t, x, y });
          state.units.push(unit);
          state.formTarget = unit.id;
        }
      } else {
        const c = cell(x, y);
        if (!c) return;
        if (state.tool === "delete") {
          c.type = "floor";
          c.walk = true;
          c.los = false;
          c.cover = 0;
        } else if (["floor", "wall", "water", "tree"].includes(state.tool)) {
          c.type = state.tool;
          c.walk = state.tool !== "wall";
          c.los = state.tool === "wall";
          c.cover = state.tool === "tree" ? 1 : state.tool === "wall" ? 2 : 0;
        }
      }
      render();
      return;
    }

    const unitBtn = event.target.closest("[data-unit-id]");
    if (unitBtn && state.screen === "editor") {
      state.formTarget = unitBtn.dataset.unitId;
      render();
      return;
    }

    const placeBtn = event.target.closest("[data-place]");
    if (placeBtn && state.screen === "editor") {
      state.editorSelected = placeBtn.dataset.place;
      state.tool = "unit";
      render();
      return;
    }

    const toolBtn = event.target.closest("[data-tool]");
    if (toolBtn && state.screen === "editor") {
      state.tool = toolBtn.dataset.tool;
      render();
      return;
    }

    const saveBtn = event.target.closest("#save-unit-btn");
    if (saveBtn) {
      saveEditedUnit();
      return;
    }

    const deleteBtn = event.target.closest("#delete-unit-btn");
    if (deleteBtn) {
      deleteEditedUnit();
      return;
    }

    const newUnitBtn = event.target.closest("#new-unit-btn");
    if (newUnitBtn) {
      createCustomUnit();
      return;
    }

    const saveMapBtn = event.target.closest("#save-map-btn");
    if (saveMapBtn) {
      saveMap();
      return;
    }

    const loadMapBtn = event.target.closest("#load-map-btn");
    if (loadMapBtn) {
      loadMap();
      return;
    }

    const clearMapBtn = event.target.closest("#clear-map-btn");
    if (clearMapBtn) {
      setupMap();
      resetState();
      render();
      return;
    }

    const testMapBtn = event.target.closest("#test-map-btn");
    if (testMapBtn) {
      state.screen = "battle";
      startRound();
      snapshotBattle();
      render();
      return;
    }

    const loadScenarioBtn = event.target.closest("#load-scenario-btn");
    if (loadScenarioBtn) {
      loadScenario();
    }

    const resetBattleBtn = event.target.closest("#reset-battle-btn");
    if (resetBattleBtn) {
      if (state.battleSnapshot) {
        const snap = JSON.parse(JSON.stringify(state.battleSnapshot));
        board = snap.board;
        state.units = snap.units;
        state.traps = snap.traps || [];
        state.core = snap.core;
      }
      resetBattleState();
      startRound();
      render();
    }
  });
}

function snapshotBattle() {
  state.battleSnapshot = JSON.parse(JSON.stringify({ board, units: state.units, traps: state.traps, core: state.core }));
}

function buildStaticShell() {
  const workspace = document.getElementById("workspace");
  workspace.innerHTML = `
    <div id="battle-screen" class="screen active">
      <div id="board-container">
        <div id="board"></div>
      </div>
      <aside id="sidebar">
        <div class="panel">
          <h3 id="battle-state-title">Kampf</h3>
          <p id="battle-round-label">Runde 1</p>
          <div id="selected-unit-card"></div>
        </div>
        <div class="panel">
          <h3>Aktionen</h3>
          <button class="action-btn" data-action="move">Bewegen</button>
          <button class="action-btn" data-action="attack">Angriff</button>
          <button class="action-btn" data-action="ability">Fähigkeit</button>
          <button class="action-btn success" data-action="end-turn">Zug beenden</button>
        </div>
        <div class="panel">
          <h3>Initiative</h3>
          <div id="initiative-list"></div>
        </div>
        <div class="panel">
          <h3>Log</h3>
          <div id="battle-log"></div>
        </div>
      </aside>
    </div>

    <div id="editor-screen" class="screen hidden">
      <div id="board-container-editor">
        <div id="editor-board"></div>
      </div>
      <aside id="sidebar-editor">
        <div class="panel">
          <h3>Editor-Werkzeuge</h3>
          <div class="editor-tools">
            <button data-tool="select">select</button>
            <button data-tool="floor">floor</button>
            <button data-tool="wall">wall</button>
            <button data-tool="water">water</button>
            <button data-tool="tree">tree</button>
            <button data-tool="delete">delete</button>
          </div>
        </div>
        <div class="panel">
          <h3>Einheiten</h3>
          <div id="unit-list"></div>
          <button id="new-unit-btn" class="wide success">Neue Einheit</button>
        </div>
        <div class="panel">
          <h3>Einheit bearbeiten</h3>
          <div id="unit-form"></div>
        </div>
        <div class="panel">
          <h3>Karte</h3>
          <button id="save-map-btn" class="wide success">Karte speichern</button>
          <button id="load-map-btn" class="wide">Karte laden</button>
          <button id="clear-map-btn" class="wide warning">Karte leeren</button>
          <button id="test-map-btn" class="wide">Karte testen</button>
        </div>
      </aside>
    </div>
  `;

  const battleButton = document.getElementById("battle-button");
  const editorButton = document.getElementById("editor-button");
  const abortButton = document.getElementById("abort-button");

  if (battleButton) battleButton.onclick = () => { state.screen = "battle"; render(); };
  if (editorButton) editorButton.onclick = () => { state.screen = "editor"; render(); };
  if (abortButton) abortButton.onclick = () => { state.screen = "battle"; resetState(); setupMap(); render(); };

  const loadScenarioBtn = document.getElementById("load-scenario-btn");
  if (loadScenarioBtn) loadScenarioBtn.onclick = loadScenario;

  const resetBattleBtn = document.getElementById("reset-battle-btn");
  if (resetBattleBtn) resetBattleBtn.onclick = () => {
    if (state.battleSnapshot) {
      const snap = JSON.parse(JSON.stringify(state.battleSnapshot));
      board = snap.board;
      state.units = snap.units;
      state.traps = snap.traps || [];
      state.core = snap.core;
    }
    resetBattleState();
    startRound();
    render();
  };

  bindEventDelegation();
}

function init() {
  buildStaticShell();
  setupMap();
  resetState();
  snapshotBattle();
  render();
}

document.addEventListener("DOMContentLoaded", init);
