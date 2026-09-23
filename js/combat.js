export function reachable(board, units, unit, getCell) {
  const result = [];
  const seen = new Map([[`${unit.x},${unit.y}`, 0]]);
  const queue = [{ x: unit.x, y: unit.y, d: 0 }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  const occupied = (x, y) => units.some(u => u.alive && u.x === x && u.y === y);

  while (queue.length) {
    const current = queue.shift();
    if (current.d >= unit.moveLeft) continue;
    for (const [dx, dy] of dirs) {
      const x = current.x + dx;
      const y = current.y + dy;
      const d = current.d + 1;
      const key = `${x},${y}`;
      const cell = getCell(board, x, y);
      if (d > unit.moveLeft || seen.has(key)) continue;
      if (!cell || !cell.walk || occupied(x, y) || (cell.type === "water" && !unit.flying)) continue;
      seen.set(key, d);
      queue.push({ x, y, d });
      result.push({ x, y, d });
    }
  }

  return result;
}

export function applyDamage(target, amount, defense = 0) {
  const value = Math.max(1, amount - defense);
  target.hp = Math.max(0, (target.hp || 0) - value);
  if (!target.hp) {
    target.alive = false;
    target.inBattle = false;
    target.ap = 0;
  }
  return value;
}
