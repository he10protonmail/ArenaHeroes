import { SIZE } from "./state.js";

export const DEFAULT_TERRAIN = Object.freeze({
  floor: { label: "Boden", walk: true, los: false, cover: 0 },
  wall: { label: "Wand", walk: false, los: true, cover: 2 },
  water: { label: "Wasser", walk: false, los: false, cover: 0 },
  tree: { label: "Baum", walk: false, los: true, cover: 1 },
  container: { label: "Container", walk: false, los: true, cover: 2 },
  vehicle: { label: "Fahrzeug", walk: false, los: true, cover: 2 },
  core: { label: "Energiekern", walk: false, los: true, cover: 2 }
});

export function makeTerrain(type = "floor", image = "") {
  const base = DEFAULT_TERRAIN[type] || DEFAULT_TERRAIN.floor;
  return { type, walk: !!base.walk, los: !!base.los, cover: Number(base.cover || 0), image: image || "" };
}

export function createEmptyMap() {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => makeTerrain("floor"))
  );
}

export function getCell(board, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE
    ? board[y][x] : null;
}

export function lineOfSight(board, a, b) {
  const n = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  if (!n) return true;
  for (let i = 1; i <= n; i++) {
    const cx = a.x + Math.round((b.x - a.x) * i / n);
    const cy = a.y + Math.round((b.y - a.y) * i / n);
    const cell = getCell(board, cx, cy);
    if (cell?.los && !(cx === b.x && cy === b.y)) return false;
  }
  return true;
}

export function isDiagonalCornerBlocked(board, from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (!dx || !dy) return false;
  const a = getCell(board, from.x + dx, from.y);
  const b = getCell(board, from.x, from.y + dy);
  return !a?.walk || !b?.walk;
}
