// js/storage.js — Local persistence layer (LocalStorage-backed).
// Keeps all app data on-device. No backend, no network calls.

const Storage = (() => {
  const KEYS = {
    HISTORY: "bcp_history",
    FAVORITES: "bcp_favorites",
    SETTINGS: "bcp_settings",
    SCAN_HISTORY: "bcp_scan_history",
  };

  const DEFAULT_SETTINGS = {
    theme: "dark",       // "dark" | "light"
    language: "id",      // "id" | "en"
    fontSize: "md",      // "sm" | "md" | "lg"
  };

  function _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error("Storage read error for", key, e);
      return fallback;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write error for", key, e);
      return false;
    }
  }

  function uid() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Settings ----------
  function getSettings() {
    return { ...DEFAULT_SETTINGS, ..._read(KEYS.SETTINGS, {}) };
  }

  function saveSettings(partial) {
    const merged = { ...getSettings(), ...partial };
    _write(KEYS.SETTINGS, merged);
    return merged;
  }

  function resetSettings() {
    _write(KEYS.SETTINGS, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  // ---------- History ----------
  // Each item: { id, kind: '1d'|'2d', type, category, name, data, options, createdAt }
  function getHistory() {
    return _read(KEYS.HISTORY, []);
  }

  function addHistory(item) {
    const list = getHistory();
    const entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      ...item,
    };
    list.unshift(entry);
    // Cap history to keep localStorage lean
    if (list.length > 2000) list.length = 2000;
    _write(KEYS.HISTORY, list);
    return entry;
  }

  function updateHistory(id, partial) {
    const list = getHistory();
    const idx = list.findIndex((h) => h.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...partial };
    _write(KEYS.HISTORY, list);
    return list[idx];
  }

  function removeHistory(id) {
    const list = getHistory().filter((h) => h.id !== id);
    _write(KEYS.HISTORY, list);
    // Also clean up any favorite pointing to this id
    removeFavorite(id);
  }

  function clearHistory() {
    _write(KEYS.HISTORY, []);
  }

  function duplicateHistory(id) {
    const list = getHistory();
    const original = list.find((h) => h.id === id);
    if (!original) return null;
    const copy = { ...original, id: uid(), createdAt: new Date().toISOString(), name: original.name + " (salinan)" };
    list.unshift(copy);
    _write(KEYS.HISTORY, list);
    return copy;
  }

  // ---------- Favorites ----------
  // Stores an array of history ids
  function getFavoriteIds() {
    return _read(KEYS.FAVORITES, []);
  }

  function isFavorite(id) {
    return getFavoriteIds().includes(id);
  }

  function addFavorite(id) {
    const ids = getFavoriteIds();
    if (!ids.includes(id)) {
      ids.push(id);
      _write(KEYS.FAVORITES, ids);
    }
  }

  function removeFavorite(id) {
    const ids = getFavoriteIds().filter((f) => f !== id);
    _write(KEYS.FAVORITES, ids);
  }

  function toggleFavorite(id) {
    if (isFavorite(id)) {
      removeFavorite(id);
      return false;
    }
    addFavorite(id);
    return true;
  }

  function getFavorites() {
    const ids = new Set(getFavoriteIds());
    return getHistory().filter((h) => ids.has(h.id));
  }

  // ---------- Scan history (from camera scans) ----------
  function getScanHistory() {
    return _read(KEYS.SCAN_HISTORY, []);
  }

  function addScanHistory(item) {
    const list = getScanHistory();
    const entry = { id: uid(), scannedAt: new Date().toISOString(), ...item };
    list.unshift(entry);
    if (list.length > 500) list.length = 500;
    _write(KEYS.SCAN_HISTORY, list);
    return entry;
  }

  function clearScanHistory() {
    _write(KEYS.SCAN_HISTORY, []);
  }

  // ---------- Stats ----------
  function getStats() {
    const history = getHistory();
    const barcodes1d = history.filter((h) => h.kind === "1d").length;
    const barcodes2d = history.filter((h) => h.kind === "2d").length;
    const favorites = getFavoriteIds().length;
    const recent = history.slice(0, 5);
    return { total: history.length, barcodes1d, barcodes2d, favorites, recent };
  }

  return {
    getSettings,
    saveSettings,
    resetSettings,
    getHistory,
    addHistory,
    updateHistory,
    removeHistory,
    clearHistory,
    duplicateHistory,
    getFavoriteIds,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    getFavorites,
    getScanHistory,
    addScanHistory,
    clearScanHistory,
    getStats,
    uid,
  };
})();
