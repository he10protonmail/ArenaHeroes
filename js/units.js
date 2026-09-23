export function makeUnit(template, overrides = {}) {
  const unit = { ...template, ...overrides };
  return {
    ...unit,
    id: unit.id?.includes("-") ? unit.id : `${unit.id}-${Math.random().toString(36).slice(2, 8)}`,
    alive: true,
    ap: 2,
    moveLeft: unit.movement || 0,
    statuses: [],
    inBattle: unit.inBattle !== false
  };
}

export function isBattleUnit(unit) {
  return !!unit && unit.alive && unit.inBattle !== false;
}

export function statusIcons(unit, statuses) {
  return (unit?.statuses || []).map(item => statuses[item.id]?.icon || "?").join("");
}

export function createCustomUnit(id = `custom-${Math.random().toString(36).slice(2, 8)}`) {
  return makeUnit({
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
    color: "#4daeff"
  });
}
