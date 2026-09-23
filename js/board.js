import { SIZE } from "./state.js";

export function createEmptyMap() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ type: "floor", walk: true, los: false, cover: 0 })));
}

export function getCell(board, x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? board[y][x] : null;
}

export function lineOfSight(board, a, b) {
  const n = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  for (let i = 1; i <= n; i++) {
    const cx = a.x + Math.round((b.x - a.x) * i / n);
    const cy = a.y + Math.round((b.y - a.y) * i / n);
    const cell = getCell(board, cx, cy);
    if (cell?.los) return false;
  }
  return true;
}
