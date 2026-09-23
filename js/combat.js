import { isDiagonalCornerBlocked } from "./board.js";

export function reachable(board, units, unit, getCell) {
  const result = [];
  const max = Math.max(0, Number(unit.moveLeft ?? unit.movement ?? 0));
  const seen = new Map([[`${unit.x},${unit.y}`, 0]]);
  const queue = [{ x: unit.x, y: unit.y, d: 0 }];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const occupied = (x, y) => units.some(u => u.alive && u.x === x && u.y === y && u.id !== unit.id);

  while (queue.length) {
    const current = queue.shift();
    if (current.d >= max) continue;
    for (const [dx, dy] of dirs) {
      const x = current.x + dx, y = current.y + dy, d = current.d + 1;
      const key = `${x},${y}`, cell = getCell(board, x, y);
      if (d > max || seen.has(key) || !cell || !cell.walk || occupied(x,y)) continue;
      if (cell.type === "water" && !unit.flying) continue;
      if (isDiagonalCornerBlocked(board, current, {x,y})) continue;
      seen.set(key, d);
      queue.push({x,y,d});
      result.push({x,y,d});
    }
  }
  return result;
}

export function applyDamage(target, amount, defense = 0) {
  const value = Math.max(1, Math.round(Number(amount || 0) - Number(defense || 0)));
  target.hp = Math.max(0, Number(target.hp || 0) - value);
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.inBattle = false;
    target.ap = 0;
    target.moveLeft = 0;
  }
  return value;
}

export function rollHit(attacker, defender, defense) {
  return Number(attacker.attack || 0) + Math.floor(Math.random() * 6) - Number(defense || 0) > 0;
}
