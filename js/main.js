import { STATUS, SIZE, MAP_STORAGE_KEY, createState } from "./state.js";
import { makeUnit, createCustomUnit, statusIcons, isBattleUnit } from "./units.js";
import { createEmptyMap, getCell, lineOfSight } from "./board.js";
import { reachable, applyDamage } from "./combat.js";
import { saveMap as persistMap, loadMap as readMap, clone } from "./storage.js";
import { setText, toggle, delegatedClick } from "./ui.js";

const templates = {
  powerkim: { id: "powerkim", name: "Powerkim", short: "P", team: "hero", className: "Nahkampf / Tank", x: 2, y: 17, hp: 180, maxHp: 180, attack: 20, defense: 18, movement: 5, range: 1, damage: 35, knockback: 3, abilityName: "Power-Schlag", abilityType: "stun" },
  visor: { id: "visor", name: "Visor", short: "V", team: "hero", className: "Fernkampf / Taktiker", x: 3, y: 17, hp: 80, maxHp: 80, attack: 22, defense: 10, movement: 6, range: 10, damage: 24, knockback: 1, abilityName: "Markieren", abilityType: "mark" },
  watson: { id: "watson", name: "Watson", short: "W", team: "hero", className: "Heiler / Fliegend", x: 4, y: 17, hp: 100, maxHp: 100, attack: 8, defense: 10, movement: 8, range: 8, heal: 40, abilityName: "Heilstrahl", abilityType: "heal", flying: true },
  nyra: { id: "nyra", name: "Nyra", short: "N", team: "hero", className: "Spionin / Fallen", x: 1, y: 18, hp: 70, maxHp: 70, attack: 15, defense: 12, movement: 9, range: 1, damage: 18, knockback: 2, trapDamage: 30, abilityName: "Mine", abilityType: "trap" },
  drone1: { id: "drone1", name: "Sicherheitsdrohne 1", short: "D", team: "enemy", className: "Fernkampf / Fliegend", x: 16, y: 3, hp: 40, maxHp: 40, attack: 14, defense: 3, movement: 8, range: 7, damage: 14, flying: true },
  drone2: { id: "drone2", name: "Sicherheitsdrohne 2", short: "D", team: "enemy", className: "Fernkampf / Fliegend", x: 17, y: 5, hp: 40, maxHp: 40, attack: 14, defense: 3, movement: 8, range: 7, damage: 14, flying: true },
  bulwark: { id: "bulwark", name: "Bulwark", short: "B", team: "enemy", className: "Schwerer Tank", x: 15, y: 15, hp: 220, maxHp: 220, attack: 26, defense: 20, movement: 3, range: 1, damage: 16, knockback: 3 }
};

let board = createEmptyMap();
let state = createState();
let lastRenderedScreen = null;

function getCurrentUnit() {
  return state.turnOrder[state.turnIndex] || null;
}

function at(x, y) {
  return state.units.find(u => isBattleUnit(u) && u.x === x && u.y === y) || null;
}

function atAny(x, y) {
  return state.units.find(u => u.x === x && u.y === y) || null;
}

function dist(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 18);
}

function hasStatus(entity, statusId) {
  return !!entity?.statuses?.some(item => item.id === statusId);
}

function addStatus(entity, statusId, duration = STATUS[statusId]?.duration || 1) {
  if (!entity || !STATUS[statusId]) return;
  const old = entity.statuses.find(item => item.id === statusId);
  if (old) old.remaining = Math.max(old.remaining, duration);
  else entity.statuses.push({ id: statusId, remaining: duration });
  addLog(`${entity.name}: ${STATUS[statusId].label}.`);
}

function removeStatus(entity, statusId) {
  if (!entity) return;
  entity.statuses = entity.statuses.filter(item => item.id !== statusId);
}

function effectiveDefense(unit) {
  if (!unit) return 0;
  const base = Number(unit.defense || 0);
  return Math.max(0, base - (hasStatus(unit, "marked") ? 5 : 0));
}

function setupMap() {
  board = createEmptyMap();
  board[0][0].type = "wall"; board[0][0].walk = false; board[0][0].los = true; board[0][0].cover = 2;
  // border walls
  for (let i = 0; i < SIZE; i++) {
    const top = getCell(board, i, 0);
    const bottom = getCell(board, i, SIZE - 1);
    const left = getCell(board, 0, i);
    const right = getCell(board, SIZE - 1, i);
    if (top) { top.type = "wall"; top.walk = false; top.los = true; top.cover = 2; }
    if (bottom) { bottom.type = "wall"; bottom.walk = false; bottom.los = true; bottom.cover = 2; }
    if (left) { left.type = "wall"; left.walk = false; left.los = true; left.cover = 2; }
    if (right) { right.type = "wall"; right.walk = false; right.los = true; right.cover = 2; }
  }
}

function startRound() {
  state.turnOrder = state.units.filter(u => isBattleUnit(u)).sort((a, b) => (b.movement || 0) - (a.movement || 0) || Math.random() - 0.5);
  state.turnIndex = 0;
  state.turnOrder.forEach(unit => {
    unit.ap = 2;
    unit.moveLeft = hasStatus(unit, "slowed") ? Math.max(1, (unit.movement || 0) - 2) : (unit.movement || 0);
  });
  skipUnavailable();
}

function skipUnavailable() {
  let attempts = 0;
  while (getCurrentUnit() && attempts < state.turnOrder.length) {
    const unit = getCurrentUnit();
    if (!hasStatus(unit, "stunned")) return;
    addLog(`${unit.name} ist betäubt und setzt aus.`);
    advanceTurn();
    attempts += 1;
  }
}

function tickStatuses(unit) {
  if (!unit) return;
  unit.statuses = unit.statuses.filter(effect => {
    effect.remaining -= 1;
    if (effect.remaining <= 0) {
      addLog(`${unit.name}: ${STATUS[effect.id]?.label || effect.id} endet.`);
      return false;
    }
    return true;
  });
}

function advanceTurn() {
  const unit = getCurrentUnit();
  if (unit) tickStatuses(unit);
  state.turnIndex += 1;
  if (state.turnIndex >= state.turnOrder.length) {
    state.round += 1;
    state.turnIndex = 0;
    startRound();
    return;
  }
  skipUnavailable();
}

function canEnter(unit, x, y) {
  const cell = getCell(board, x, y);
  return !!cell && cell.walk && (cell.type !== "water" || !!unit.flying) && !at(x, y);
}

function resetState() {
  state = createState();
  state.units = [];
  state.traps = [];
  state.log = [];
}

function loadScenario() {
  resetState();
  state.units = Object.values(templates).map(template => makeUnit(template));
  state.traps = [];
  state.battleSnapshot = clone({ board, units: state.units, traps: state.traps, core: state.core });
  startRound();
  render();
}

function snapshotBattle() {
  state.battleSnapshot = clone({ board, units: state.units, traps: state.traps, core: state.core });
}

function renderBoard(element, mode = "battle") {
  const tiles = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const tile = document.createElement("div");
      const currentCell = getCell(board, x, y);
      tile.className = `tile ${currentCell?.type || "floor"}`;
      tile.dataset.x = String(x);
      tile.dataset.y = String(y);

      if (state.highlight.some(item => item.x === x && item.y === y)) {
        if (state.mode === "move") tile.classList.add("move-range");
        else if (state.mode === "ability") tile.classList.add("ability-range");
        else tile.classList.add("attack-range");
      }

      const trap = state.traps.find(item => item.x === x && item.y === y);
      if (trap) {
        const trapNode = document.createElement("span");
        trapNode.className = "trap";
        trapNode.textContent = "✹";
        tile.appendChild(trapNode);
      }

      const unit = atAny(x, y);
      if (unit) {
        const unitNode = document.createElement("div");
        unitNode.className = `unit ${unit.team} ${unit.id === (getCurrentUnit()?.id || "") ? "selected" : ""} ${unit.alive ? "" : "defeated"}`;
        unitNode.dataset.unitId = unit.id;
        unitNode.innerHTML = `
          <div class="unit-core">
            <span class="unit-short">${unit.alive ? unit.short || "?" : "☠"}</span>
            <span class="unit-status">${statusIcons(unit, STATUS)}</span>
          </div>
          <div class="unit-hpbar"><span style="width:${Math.max(0, (unit.hp / (unit.maxHp || 1)) * 100)}%"></span></div>
          <div class="unit-hptext">${unit.hp || 0}/${unit.maxHp || 0}</div>
        `;
        tile.appendChild(unitNode);
      }

      tiles.push(tile);
    }
  }

  element.innerHTML = "";
  for (const tile of tiles) element.appendChild(tile);
}

function renderInitiative() {
  const list = document.getElementById("initiative-list");
  if (!list) return;
  const activeUnits = state.turnOrder.filter(u => u.alive && u.inBattle !== false);
  list.innerHTML = activeUnits.map(unit => `
    <div class="initiative-unit ${unit.id === (getCurrentUnit()?.id || "") ? "active" : ""}">
      <span class="initiative-name">${unit.name}</span>
      <span class="initiative-meta">HP ${unit.hp}/${unit.maxHp} · AP ${unit.ap || 0}</span>
    </div>
  `).join("") || "<div class=\"small\">Keine Figuren.</div>";
}

function renderSelectedUnitCard() {
  const card = document.getElementById("selected-unit-card");
  if (!card) return;
  const unit = getCurrentUnit();
  if (!unit) {
    card.innerHTML = "<div class=\"small\">Keine aktive Figur.</div>";
    return;
  }
  card.innerHTML = `
    <h4>${unit.name}</h4>
    <div class="unit-meta">${unit.team === "hero" ? "Held" : "Gegner"} · ${unit.className || "Einheit"}</div>
    <div class="unit-meta">HP ${unit.hp}/${unit.maxHp}</div>
    <div class="unit-meta">AP ${unit.ap || 0} · Bewegung ${unit.moveLeft || 0}</div>
    <div class="unit-meta">Status: ${statusIcons(unit, STATUS) || "Normal"}</div>
    <div class="unit-meta">Fähigkeit: ${unit.abilityName || "Keine"}</div>
  `;
}

function renderBattleLog() {
  const logNode = document.getElementById("battle-log");
  if (!logNode) return;
  logNode.innerHTML = state.log.map(item => `<div>${item}</div>`).join("") || "<div class=\"small\">Noch keine Ereignisse.</div>";
}

function renderBattleScreen() {
  const battleNode = document.getElementById("battle-screen");
  const editorNode = document.getElementById("editor-screen");
  if (battleNode) battleNode.classList.remove("hidden");
  if (editorNode) editorNode.classList.add("hidden");

  setText("battle-state-title", state.victory ? "Sieg" : state.defeat ? "Niederlage" : "Kampf");
  const current = getCurrentUnit();
  setText("battle-round-label", `Runde ${state.round}${current ? ` · ${current.name}` : ""}`);

  const boardNode = document.getElementById("board");
  if (boardNode) renderBoard(boardNode, "battle");
  renderInitiative();
  renderSelectedUnitCard();
  renderBattleLog();
}

function renderEditorScreen() {
  const battleNode = document.getElementById("battle-screen");
  const editorNode = document.getElementById("editor-screen");
  if (battleNode) battleNode.classList.add("hidden");
  if (editorNode) editorNode.classList.remove("hidden");

  const editorBoard = document.getElementById("editor-board");
  if (editorBoard) renderBoard(editorBoard, "editor");

  const list = document.getElementById("unit-list");
  if (list) {
    list.innerHTML = state.units.length ? state.units.map(unit => `
      <button class="unit-item ${state.formTarget === unit.id ? "selected" : ""}" data-unit-id="${unit.id}">
        <span>${unit.name}</span>
        <small>${unit.team === "hero" ? "Held" : "Gegner"}</small>
      </button>
    `).join("") : "<div class=\"small\">Keine Einheiten.</div>";
  }

  const form = document.getElementById("unit-form");
  const selected = state.units.find(unit => unit.id === state.formTarget);
  if (form) {
    if (!selected) {
      form.innerHTML = "<div class=\"small\">Einheit wählen oder neu erzeugen.</div>";
      return;
    }
    form.innerHTML = `
      <label>Name<input id="unit-name" type="text" value="${selected.name || ""}"></label>
      <label>Icon<input id="unit-short" type="text" value="${selected.short || ""}"></label>
      <label>Farbe<input id="unit-color" type="color" value="${selected.color || "#4daeff"}"></label>
      <label>Team<select id="unit-team"><option value="hero" ${selected.team === "hero" ? "selected" : ""}>Held</option><option value="enemy" ${selected.team === "enemy" ? "selected" : ""}>Gegner</option></select></label>
      <label>HP<input id="unit-hp" type="number" value="${selected.maxHp || selected.hp || 100}"></label>
      <label>Angriff<input id="unit-attack" type="number" value="${selected.attack || 0}"></label>
      <label>Verteidigung<input id="unit-defense" type="number" value="${selected.defense || 0}"></label>
      <label>Bewegung<input id="unit-movement" type="number" value="${selected.movement || 0}"></label>
      <label>Reichweite<input id="unit-range" type="number" value="${selected.range || 1}"></label>
      <label>Schaden<input id="unit-damage" type="number" value="${selected.damage || 0}"></label>
      <label>Heilung<input id="unit-heal" type="number" value="${selected.heal || 0}"></label>
      <label>Fähigkeit<select id="unit-ability-type">
        <option value="none" ${!selected.abilityType ? "selected" : ""}>Keine</option>
        <option value="stun" ${selected.abilityType === "stun" ? "selected" : ""}>Power-Schlag</option>
        <option value="mark" ${selected.abilityType === "mark" ? "selected" : ""}>Markieren</option>
        <option value="heal" ${selected.abilityType === "heal" ? "selected" : ""}>Heilen</option>
        <option value="trap" ${selected.abilityType === "trap" ? "selected" : ""}>Mine</option>
        <option value="pull" ${selected.abilityType === "pull" ? "selected" : ""}>Pull</option>
        <option value="whip" ${selected.abilityType === "whip" ? "selected" : ""}>Whip</option>
      </select></label>
      <label>Fähigkeitsname<input id="unit-ability-name" type="text" value="${selected.abilityName || ""}"></label>
      <button id="save-unit-btn" class="success wide">Einheit speichern</button>
      <button id="delete-unit-btn" class="warning wide">Einheit entfernen</button>
    `;
  }
}

function render() {
  if (state.screen === "battle") renderBattleScreen();
  else renderEditorScreen();
  lastRenderedScreen = state.screen;
}

function saveEditedUnit() {
  const unit = state.units.find(item => item.id === state.formTarget);
  if (!unit) return;
  unit.name = document.getElementById("unit-name")?.value || unit.name;
  unit.short = document.getElementById("unit-short")?.value || unit.short;
  unit.color = document.getElementById("unit-color")?.value || unit.color;
  unit.team = document.getElementById("unit-team")?.value || unit.team;
  unit.maxHp = Number(document.getElementById("unit-hp")?.value || unit.maxHp || unit.hp || 100);
  unit.hp = unit.maxHp;
  unit.attack = Number(document.getElementById("unit-attack")?.value || unit.attack || 0);
  unit.defense = Number(document.getElementById("unit-defense")?.value || unit.defense || 0);
  unit.movement = Number(document.getElementById("unit-movement")?.value || unit.movement || 0);
  unit.range = Number(document.getElementById("unit-range")?.value || unit.range || 1);
  unit.damage = Number(document.getElementById("unit-damage")?.value || unit.damage || 0);
  unit.heal = Number(document.getElementById("unit-heal")?.value || unit.heal || 0);
  unit.abilityType = document.getElementById("unit-ability-type")?.value || unit.abilityType || "none";
  unit.abilityName = document.getElementById("unit-ability-name")?.value || unit.abilityName || "Keine";
  render();
}

function deleteEditedUnit() {
  state.units = state.units.filter(item => item.id !== state.formTarget);
  state.formTarget = null;
  render();
}

function createCustomUnitAtEditor() {
  const unit = createCustomUnit();
  state.units.push(unit);
  state.formTarget = unit.id;
  render();
}

function saveEditableMap() {
  persistMap({ board, units: state.units, traps: state.traps, core: state.core, templates });
  addLog("Karte gespeichert.");
  render();
}

function loadEditableMap() {
  const data = readMap();
  if (!data) {
    alert("Keine gespeicherte Karte gefunden.");
    return;
  }
  board = data.board || board;
  state.units = data.units || [];
  state.traps = data.traps || [];
  state.core = data.core || null;
  state.formTarget = null;
  render();
}

function clearEditableMap() {
  setupMap();
  state.units = [];
  state.traps = [];
  state.formTarget = null;
  render();
}

function endTurn() {
  state.mode = null;
  state.highlight = [];
  advanceTurn();
  render();
}

function activateMode(mode) {
  const current = getCurrentUnit();
  if (!current || current.ap < 1 || hasStatus(current, "stunned")) return;
  state.mode = mode;
  if (mode === "move") {
    state.highlight = reachable(board, state.units, current, getCell);
  } else if (mode === "attack") {
    state.highlight = state.units.filter(unit => unit.alive && unit.team !== current.team && dist(current, unit) <= current.range && lineOfSight(board, current, unit)).map(unit => ({ x: unit.x, y: unit.y }));
  } else if (mode === "ability") {
    if (current.abilityType === "trap") {
      state.highlight = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: current.x + dx, y: current.y + dy })).filter(point => getCell(board, point.x, point.y)?.walk && !atAny(point.x, point.y) && !state.traps.some(trap => trap.x === point.x && trap.y === point.y));
    } else if (current.abilityType === "heal") {
      state.highlight = state.units.filter(unit => unit.alive && unit.team === current.team && unit.hp < unit.maxHp && dist(current, unit) <= current.range && lineOfSight(board, current, unit)).map(unit => ({ x: unit.x, y: unit.y }));
    } else {
      state.highlight = state.units.filter(unit => unit.alive && unit.team !== current.team && dist(current, unit) <= current.range && lineOfSight(board, current, unit)).map(unit => ({ x: unit.x, y: unit.y }));
    }
  }
  render();
}

function executeMove(x, y) {
  const current = getCurrentUnit();
  if (!current || current.ap < 1) return;
  const step = state.highlight.find(item => item.x === x && item.y === y);
  if (!step) return;
  current.x = x;
  current.y = y;
  current.ap -= 1;
  current.moveLeft -= step.d;
  state.highlight = [];
  state.mode = null;
  render();
}

function executeAttack(target) {
  const current = getCurrentUnit();
  if (!current || !target || current.ap < 1) return;
  if (target.team === current.team || dist(current, target) > current.range || !lineOfSight(board, current, target)) return;
  const hitRoll = current.attack + Math.floor(Math.random() * 6) - effectiveDefense(target);
  if (hitRoll > 0) {
    const damage = current.damage || current.attack + 5;
    const dealt = applyDamage(target, damage, effectiveDefense(target));
    addLog(`${current.name} verursacht ${dealt} Schaden an ${target.name}.`);
    if (!target.alive) {
      target.inBattle = false;
      addLog(`${target.name} ist kampfunfähig.`);
    }
  } else {
    addLog(`${current.name} verfehlt ${target.name}.`);
  }
  current.ap -= 1;
  state.mode = null;
  state.highlight = [];
  render();
}

function executeAbility(target, x, y) {
  const current = getCurrentUnit();
  if (!current || current.ap < 1) return;

  if (current.abilityType === "trap") {
    if (!getCell(board, x, y)?.walk || atAny(x, y) || state.traps.some(trap => trap.x === x && trap.y === y) || dist(current, { x, y }) !== 1) return;
    state.traps.push({ x, y, damage: current.trapDamage || 30 });
    addLog(`${current.name} legt eine Mine.`);
  } else if (current.abilityType === "heal") {
    if (!target || target.team !== current.team || dist(current, target) > current.range || !lineOfSight(board, current, target)) return;
    const amount = current.heal || 0;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    addLog(`${current.name} heilt ${target.name} um ${amount}.`);
  } else {
    if (!target || target.team === current.team || dist(current, target) > current.range || !lineOfSight(board, current, target)) return;
    const value = current.damage || 10;
    applyDamage(target, value, effectiveDefense(target));
    if (current.abilityType === "stun") addStatus(target, "stunned");
    if (current.abilityType === "mark") addStatus(target, "marked");
    if (current.abilityType === "pull") {
      // simple push by one cell if free
      if (dist(current, target) === 1) {
        const dx = Math.sign(target.x - current.x);
        const dy = Math.sign(target.y - current.y);
        const nx = target.x + dx; const ny = target.y + dy;
        if (getCell(board, nx, ny)?.walk && !atAny(nx, ny)) {
          target.x = nx;
          target.y = ny;
        }
      }
    }
    if (current.abilityType === "whip") {
      const dx = Math.sign(current.x - target.x);
      const dy = Math.sign(current.y - target.y);
      const nx = target.x + dx; const ny = target.y + dy;
      if (getCell(board, nx, ny)?.walk && !atAny(nx, ny)) {
        target.x = nx; target.y = ny;
      }
    }
  }
  current.ap -= 1;
  state.mode = null;
  state.highlight = [];
  render();
}

function clickBattleTile(x, y) {
  if (state.victory || state.defeat) return;
  const current = getCurrentUnit();
  const target = at(x, y);
  if (!current) return;

  if (state.mode === "move") return executeMove(x, y);
  if (state.mode === "attack") return executeAttack(target);
  if (state.mode === "ability") {
    if (current.abilityType === "trap") return executeAbility(null, x, y);
    return executeAbility(target, x, y);
  }

  if (target && target.team === "hero") {
    state.selected = target.id;
    const index = state.turnOrder.findIndex(u => u.id === target.id);
    if (index >= 0) state.turnIndex = index;
  }
  render();
}

function clickEditorTile(x, y) {
  if (state.tool === "select") {
    const unit = atAny(x, y);
    if (unit) state.formTarget = unit.id;
    return;
  }
  if (state.tool === "unit") {
    const template = templates[state.editorSelected];
    if (!template || atAny(x, y)) return;
    const unit = makeUnit({ ...template, x, y });
    state.units.push(unit);
    state.formTarget = unit.id;
    return;
  }

  const cellData = getCell(board, x, y);
  if (!cellData) return;
  if (state.tool === "delete") {
    cellData.type = "floor"; cellData.walk = true; cellData.los = false; cellData.cover = 0;
  } else if (["floor", "wall", "water", "tree"].includes(state.tool)) {
    cellData.type = state.tool;
    cellData.walk = state.tool !== "wall";
    cellData.los = state.tool === "wall";
    cellData.cover = state.tool === "tree" ? 1 : state.tool === "wall" ? 2 : 0;
  }
}

function buildStaticShell() {
  const workspace = document.getElementById("workspace");
  workspace.innerHTML = `
    <div id="battle-screen" class="screen">
      <div id="board-container"><div id="board"></div></div>
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
      <div id="board-container-editor"><div id="editor-board"></div></div>
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

  delegatedClick(workspace, "[data-action]", (button) => {
    const action = button.dataset.action;
    if (action === "move") activateMode("move");
    if (action === "attack") activateMode("attack");
    if (action === "ability") activateMode("ability");
    if (action === "end-turn") endTurn();
  });

  delegatedClick(workspace, ".tile", (tile) => {
    const x = Number(tile.dataset.x);
    const y = Number(tile.dataset.y);
    if (state.screen === "battle") clickBattleTile(x, y);
    else clickEditorTile(x, y);
    render();
  });

  delegatedClick(workspace, "[data-tool]", (button) => {
    state.tool = button.dataset.tool;
    if (state.tool !== "unit") state.editorSelected = null;
    render();
  });

  delegatedClick(workspace, "[data-unit-id]", (button) => {
    state.formTarget = button.dataset.unitId;
    render();
  });

  delegatedClick(workspace, "#new-unit-btn", () => createCustomUnitAtEditor());
  delegatedClick(workspace, "#save-unit-btn", saveEditedUnit);
  delegatedClick(workspace, "#delete-unit-btn", deleteEditedUnit);
  delegatedClick(workspace, "#save-map-btn", saveEditableMap);
  delegatedClick(workspace, "#load-map-btn", loadEditableMap);
  delegatedClick(workspace, "#clear-map-btn", clearEditableMap);
  delegatedClick(workspace, "#test-map-btn", () => { state.screen = "battle"; startRound(); snapshotBattle(); render(); });
}

function init() {
  buildStaticShell();
  setupMap();
  resetState();
  state.units = Object.values(templates).map(template => makeUnit(template));
  state.turnOrder = [];
  startRound();
  snapshotBattle();
  render();
}

document.addEventListener("DOMContentLoaded", init);
