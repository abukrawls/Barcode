// js/pages.js — Controllers for History, Favorites, Print, and Settings pages.
// Grouped together since each is comparatively simple list/settings UI built
// on top of Storage + BarcodeEngine + ExportUtil.

const Pages = (() => {
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ============ HISTORY ============
  const History = (() => {
    let els = {};
    function init() {
      els = {
        list: $("history-list"),
        search: $("history-search"),
        category: $("history-category"),
        sort: $("history-sort"),
        clearBtn: $("history-clear"),
      };
      if (!els.list) return;
      [els.search, els.category, els.sort].forEach((el) => el && el.addEventListener("input", render));
      if (els.clearBtn) {
        els.clearBtn.addEventListener("click", () => {
          if (confirm("Hapus semua riwayat? Tindakan ini tidak bisa dibatalkan.")) {
            Storage.clearHistory();
            render();
            if (window.Dashboard) Dashboard.refresh();
          }
        });
      }
      render();
    }

    function render() {
      if (!els.list) return;
      let items = Storage.getHistory();
      const q = (els.search?.value || "").toLowerCase().trim();
      const cat = els.category?.value || "";
      if (q) items = items.filter((h) => h.name.toLowerCase().includes(q) || h.data.toLowerCase().includes(q));
      if (cat) items = items.filter((h) => h.category === cat);

      const sort = els.sort?.value || "newest";
      if (sort === "oldest") items = [...items].reverse();
      if (sort === "name") items = [...items].sort((a, b) => a.name.localeCompare(b.name));

      renderList(els.list, items, { showEdit: true, showDuplicate: true, showDelete: true });
    }

    return { init, render };
  })();

  // ============ FAVORITES ============
  const Favorites = (() => {
    let els = {};
    function init() {
      els = { list: $("favorites-list") };
      if (!els.list) return;
      render();
    }
    function render() {
      if (!els.list) return;
      renderList(els.list, Storage.getFavorites(), { showEdit: true, showDuplicate: true, showDelete: false, showUnfav: true });
    }
    return { init, render };
  })();

  // Shared list renderer used by History + Favorites
  function renderList(container, items, opts) {
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">Tidak ada data untuk ditampilkan.</div>`;
      return;
    }
    container.innerHTML = items
      .map(
        (h) => `
      <div class="list-row" data-id="${h.id}">
        <canvas class="list-thumb" width="120" height="60" data-thumb="${h.id}"></canvas>
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(h.name)}</div>
          <div class="list-row-sub">${h.typeLabel} · ${h.category} · ${new Date(h.createdAt).toLocaleDateString("id-ID")}</div>
        </div>
        <div class="list-row-actions">
          <label class="chk"><input type="checkbox" class="print-select" data-print-id="${h.id}" /> Cetak</label>
          ${opts.showEdit ? `<button class="btn-icon" data-action="edit" title="Edit">✎</button>` : ""}
          ${opts.showDuplicate ? `<button class="btn-icon" data-action="dup" title="Duplikat">⧉</button>` : ""}
          <button class="btn-icon" data-action="fav" title="Favorit">${Storage.isFavorite(h.id) ? "★" : "☆"}</button>
          ${opts.showDelete ? `<button class="btn-icon danger" data-action="del" title="Hapus">🗑</button>` : ""}
        </div>
      </div>`
      )
      .join("");

    items.forEach((h) => {
      const c = container.querySelector(`canvas[data-thumb="${h.id}"]`);
      if (c) BarcodeEngine.renderToCanvas(c, h.type, h.data, h.options || {});
    });

    container.querySelectorAll("[data-action]").forEach((btn) => {
      const row = btn.closest("[data-id]");
      const id = row.dataset.id;
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const entry = Storage.getHistory().find((x) => x.id === id) || Storage.getFavorites().find((x) => x.id === id);
        if (action === "edit" && entry) {
          App.navigate("generator");
          setTimeout(() => Generator.loadEntry(entry), 50);
        } else if (action === "dup") {
          Storage.duplicateHistory(id);
          History.render();
          Favorites.render();
        } else if (action === "fav") {
          Storage.toggleFavorite(id);
          History.render();
          Favorites.render();
        } else if (action === "del") {
          Storage.removeHistory(id);
          History.render();
          Favorites.render();
          if (window.Dashboard) Dashboard.refresh();
        }
      });
    });
  }

  // ============ PRINT ============
  const Print = (() => {
    let els = {};
    function init() {
      els = {
        list: $("print-list"),
        layout: $("print-layout"),
        perRow: $("print-perrow"),
        printBtn: $("print-go"),
        selectAll: $("print-select-all"),
      };
      if (!els.list) return;
      render();
      els.printBtn.addEventListener("click", doPrint);
      if (els.selectAll) {
        els.selectAll.addEventListener("change", () => {
          els.list.querySelectorAll(".print-select").forEach((c) => (c.checked = els.selectAll.checked));
        });
      }
    }
    function render() {
      renderList(els.list, Storage.getHistory(), { showEdit: false, showDuplicate: false, showDelete: false });
    }
    function doPrint() {
      const ids = [...els.list.querySelectorAll(".print-select:checked")].map((c) => c.dataset.printId);
      if (ids.length === 0) {
        alert("Pilih minimal satu barcode untuk dicetak.");
        return;
      }
      const history = Storage.getHistory();
      const canvases = ids.map((id) => {
        const h = history.find((x) => x.id === id);
        const c = document.createElement("canvas");
        BarcodeEngine.renderToCanvas(c, h.type, h.data, h.options || {});
        return c;
      });
      ExportUtil.printCanvases(canvases, { layout: els.layout.value, perRow: Number(els.perRow.value) || 3 });
    }
    return { init, render };
  })();

  // ============ SETTINGS ============
  const Settings = (() => {
    let els = {};
    function init() {
      els = {
        themeToggle: $("settings-theme"),
        language: $("settings-language"),
        fontSize: $("settings-fontsize"),
        backupBtn: $("settings-backup"),
        restoreInput: $("settings-restore"),
        clearHistoryBtn: $("settings-clear-history"),
        resetBtn: $("settings-reset"),
        status: $("settings-status"),
      };
      if (!els.themeToggle) return;

      const settings = Storage.getSettings();
      els.themeToggle.checked = settings.theme === "light";
      els.language.value = settings.language;
      els.fontSize.value = settings.fontSize;

      els.themeToggle.addEventListener("change", () => {
        const theme = els.themeToggle.checked ? "light" : "dark";
        Storage.saveSettings({ theme });
        App.applyTheme(theme);
      });
      els.language.addEventListener("change", () => {
        Storage.saveSettings({ language: els.language.value });
        App.applyLanguage(els.language.value);
      });
      els.fontSize.addEventListener("change", () => {
        Storage.saveSettings({ fontSize: els.fontSize.value });
        App.applyFontSize(els.fontSize.value);
      });
      els.backupBtn.addEventListener("click", backup);
      els.restoreInput.addEventListener("change", (e) => restore(e.target.files[0]));
      els.clearHistoryBtn.addEventListener("click", () => {
        if (confirm("Hapus seluruh riwayat & favorit?")) {
          Storage.clearHistory();
          if (window.Dashboard) Dashboard.refresh();
          els.status.textContent = "Riwayat dihapus.";
        }
      });
      els.resetBtn.addEventListener("click", () => {
        const s = Storage.resetSettings();
        els.themeToggle.checked = s.theme === "light";
        els.language.value = s.language;
        els.fontSize.value = s.fontSize;
        App.applyTheme(s.theme);
        App.applyLanguage(s.language);
        App.applyFontSize(s.fontSize);
        els.status.textContent = "Pengaturan direset ke default.";
      });
    }

    function backup() {
      const payload = {
        history: Storage.getHistory(),
        favorites: Storage.getFavoriteIds(),
        settings: Storage.getSettings(),
        exportedAt: new Date().toISOString(),
      };
      ExportUtil.downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        "backup-barcode-pro.json"
      );
    }

    function restore(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          if (Array.isArray(payload.history)) localStorage.setItem("bcp_history", JSON.stringify(payload.history));
          if (Array.isArray(payload.favorites)) localStorage.setItem("bcp_favorites", JSON.stringify(payload.favorites));
          if (payload.settings) localStorage.setItem("bcp_settings", JSON.stringify(payload.settings));
          els.status.textContent = "Backup berhasil dipulihkan. Memuat ulang...";
          setTimeout(() => location.reload(), 800);
        } catch (e) {
          els.status.textContent = "Gagal memulihkan: file tidak valid.";
        }
      };
      reader.readAsText(file);
    }

    return { init };
  })();

  return { History, Favorites, Print, Settings, renderList };
})();
