export const SIZE = 20;
export const MAP_STORAGE_KEY = "arena-heroes-map-v3";

export const ABILITIES = Object.freeze({
  none: { label: "Keine" },
  stun: { label: "Betäuben" },
  mark: { label: "Markieren" },
  heal: { label: "Heilen" },
  trap: { label: "Mine" },
  push: { label: "Push" },
  pull: { label: "Pull" }
});

export const STATUS = Object.freeze({
  burning: { label: "Brennend", icon: "🔥", duration: 2 },
  stunned: { label: "Betäubt", icon: "⚡", duration: 1 },
  slowed: { label: "Verkrüppelt", icon: "❄", duration: 2 },
  marked: { label: "Markiert", icon: "🎯", duration: 1 },
  knocked_down: { label: "Am Boden", icon: "💫", duration: 1 },
  shielded: { label: "Geschützt", icon: "🛡", duration: 1 }
});

export function createState() {
  return {
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
    editorTerrain: null,
    formTarget: null,
    traps: [],
    battleSnapshot: null,
    mission: { type: "destroy_core", coreHp: 100, coreMaxHp: 100 }
  };
}
