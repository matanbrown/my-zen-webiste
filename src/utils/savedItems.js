// src/utils/savedItems.js
// Shared localStorage helper for the "save for later" feature.

const STORAGE_KEY = "zen:saved-items";

export function getSavedItems() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isSaved(collection, id) {
  return getSavedItems().some((i) => i.collection === collection && i.id === id);
}

export function toggleSaved(collection, id) {
  const items = getSavedItems();
  const idx = items.findIndex((i) => i.collection === collection && i.id === id);
  if (idx >= 0) {
    items.splice(idx, 1);
  } else {
    items.push({ collection, id, savedAt: Date.now() });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("zen:saved-changed", { detail: items }));
  return idx < 0;
}

export function removeSaved(collection, id) {
  const items = getSavedItems().filter((i) => !(i.collection === collection && i.id === id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("zen:saved-changed", { detail: items }));
}
