// js/app.js — App shell: navigation between pages, theme/language/font
// application, toast notifications, and startup wiring for every module.

const App = (() => {
  const NAV_PAGES = [
    "dashboard", "generator", "scanner", "history", "favorites",
    "batch", "print", "settings", "about",
  ];

  const STRINGS = {
    id: {
      navDashboard: "Dashboard", navGenerator: "Generator", navScanner: "Scanner",
      navHistory: "Riwayat", navFavorites: "Favorit", navBatch: "Batch Generator",
      navPrint: "Cetak", navSettings: "Pengaturan", navAbout: "Tentang",
    },
    en: {
      navDashboard: "Dashboard", navGenerator: "Generator", navScanner: "Scanner",
      navHistory: "History", navFavorites: "Favorites", navBatch: "Batch Generator",
      navPrint: "Print", navSettings: "Settings", navAbout: "About",
    },
  };

  let currentPage = "dashboard";

  function $(id) { return document.getElementById(id); }

  function init() {
    const settings = Storage.getSettings();
    applyTheme(settings.theme);
    applyLanguage(settings.language);
    applyFontSize(settings.fontSize);

    bindNav();
    navigate(location.hash.replace("#", "") || "dashboard");

    Dashboard.init();
    Generator.init();
    Scanner.init();
    Batch.init();
    Pages.History.init();
    Pages.Favorites.init();
    Pages.Print.init();
    Pages.Settings.init();

    registerServiceWorker();
  }

  function bindNav() {
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.nav));
    });
  }

  function navigate(page) {
    if (!NAV_PAGES.includes(page)) page = "dashboard";
    currentPage = page;
    document.querySelectorAll(".page").forEach((sec) => {
      sec.classList.toggle("visible", sec.dataset.page === page);
    });
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === page);
    });
    location.hash = page;
    // Stop the camera if navigating away from the scanner
    if (page !== "scanner" && window.Scanner) Scanner.stop();
    // Refresh list pages when visited
    if (page === "history" && window.Pages) Pages.History.render();
    if (page === "favorites" && window.Pages) Pages.Favorites.render();
    if (page === "print" && window.Pages) Pages.Print.render();
    if (page === "dashboard" && window.Dashboard) Dashboard.refresh();
    const sidebar = $("sidebar");
    if (sidebar && sidebar.classList.contains("open")) sidebar.classList.remove("open");
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function applyLanguage(lang) {
    document.documentElement.setAttribute("lang", lang);
    const strings = STRINGS[lang] || STRINGS.id;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (strings[key]) el.textContent = strings[key];
    });
  }

  function applyFontSize(size) {
    document.documentElement.setAttribute("data-fontsize", size);
  }

  function toast(msg) {
    const container = $("toast-container");
    if (!container) { alert(msg); return; }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch((err) => {
          console.warn("Service worker registration failed:", err);
        });
      });
    }
  }

  return { init, navigate, applyTheme, applyLanguage, applyFontSize, toast, get currentPage() { return currentPage; } };
})();

document.addEventListener("DOMContentLoaded", App.init);
