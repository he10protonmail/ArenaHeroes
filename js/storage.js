import { MAP_STORAGE_KEY } from "./state.js";

export function saveMap(data) {
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(data));
}
export function loadMap() {
  const raw = localStorage.getItem(MAP_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
