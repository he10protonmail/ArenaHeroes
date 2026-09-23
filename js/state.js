export const SIZE = 20;
export const MAP_STORAGE_KEY = "arena-heroes-map-v2";
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
    traps: [],
    formTarget: null,
    battleSnapshot: null
  };
}
