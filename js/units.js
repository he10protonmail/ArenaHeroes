export function makeUnit(template, overrides = {}) {
  const unit = { ...template, ...overrides };
  return {
    id: unit.id?.includes("-") ? unit.id : `${unit.id || "unit"}-${Math.random().toString(36).slice(2,8)}`,
    name: unit.name || "Neue Figur",
    short: unit.short || "?",
    team: unit.team || "hero",
    className: unit.className || "Eigene Einheit",
    x: Number(unit.x ?? 0),
    y: Number(unit.y ?? 0),
    hp: Number(unit.hp ?? 100),
    maxHp: Number(unit.maxHp ?? unit.hp ?? 100),
    attack: Number(unit.attack ?? 10),
    defense: Number(unit.defense ?? 5),
    movement: Number(unit.movement ?? 4),
    range: Number(unit.range ?? 1),
    damage: Number(unit.damage ?? 10),
    heal: Number(unit.heal ?? 0),
    knockback: Number(unit.knockback ?? 0),
    stability: Number(unit.stability ?? 10),
    trapDamage: Number(unit.trapDamage ?? 30),
    abilityType: unit.abilityType || "none",
    abilityName: unit.abilityName || "Keine",
    flying: !!unit.flying,
    color: unit.color || "#4daeff",
    image: unit.image || "",
    alive: unit.alive !== false,
    inBattle: unit.inBattle !== false,
    ap: Number(unit.ap ?? 2),
    moveLeft: Number(unit.moveLeft ?? unit.movement ?? 4),
    statuses: Array.isArray(unit.statuses) ? unit.statuses : []
  };
}

export function isBattleUnit(unit) {
  return !!unit && unit.alive && unit.inBattle !== false;
}

export function statusIcons(unit, statuses) {
  return (unit?.statuses || []).map(item => statuses[item.id]?.icon || "?").join("");
}

export function createCustomUnit(id = `custom-${Math.random().toString(36).slice(2,8)}`) {
  return makeUnit({
    id, name: "Neue Figur", short: "N", team: "hero", className: "Eigene Einheit",
    x: 3, y: 3, hp: 100, maxHp: 100, attack: 10, defense: 5,
    movement: 4, range: 1, damage: 12, heal: 0, knockback: 0, stability: 10,
    abilityType: "none", abilityName: "Keine", color: "#4daeff", image: ""
  });
}
