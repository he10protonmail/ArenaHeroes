export function saveMap(data) {
  localStorage.setItem("arena-heroes-map-v2", JSON.stringify(data));
}

export function loadMap() {
  const raw = localStorage.getItem("arena-heroes-map-v2");
  return raw ? JSON.parse(raw) : null;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
