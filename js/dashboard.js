// js/dashboard.js — Dashboard stats, shortcuts, and recent items strip.

const Dashboard = (() => {
  let els = {};

  function $(id) { return document.getElementById(id); }

  function init() {
    els = {
      totalCount: $("dash-total"),
      count1d: $("dash-1d"),
      count2d: $("dash-2d"),
      favCount: $("dash-fav"),
      recentList: $("dash-recent"),
      shortcutNew: $("dash-shortcut-new"),
      shortcutScan: $("dash-shortcut-scan"),
      shortcutBatch: $("dash-shortcut-batch"),
    };
    if (!els.totalCount) return;

    if (els.shortcutNew) els.shortcutNew.addEventListener("click", () => App.navigate("generator"));
    if (els.shortcutScan) els.shortcutScan.addEventListener("click", () => App.navigate("scanner"));
    if (els.shortcutBatch) els.shortcutBatch.addEventListener("click", () => App.navigate("batch"));

    refresh();
  }

  function refresh() {
    if (!els.totalCount) return;
    const stats = Storage.getStats();
    els.totalCount.textContent = stats.total;
    els.count1d.textContent = stats.barcodes1d;
    els.count2d.textContent = stats.barcodes2d;
    els.favCount.textContent = stats.favorites;
    renderRecent(stats.recent);
  }

  function renderRecent(items) {
    if (!els.recentList) return;
    if (items.length === 0) {
      els.recentList.innerHTML = `<div class="empty-state">Belum ada barcode dibuat. Mulai dari tombol "Barcode Baru".</div>`;
      return;
    }
    els.recentList.innerHTML = items
      .map(
        (h) => `
      <div class="recent-card">
        <canvas class="recent-thumb" data-history-id="${h.id}" width="140" height="70"></canvas>
        <div class="recent-name">${escapeHtml(h.name)}</div>
        <div class="recent-sub">${h.typeLabel}</div>
      </div>`
      )
      .join("");
    items.forEach((h) => {
      const canvas = els.recentList.querySelector(`canvas[data-history-id="${h.id}"]`);
      if (canvas) BarcodeEngine.renderToCanvas(canvas, h.type, h.data, h.options || {});
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { init, refresh };
})();
