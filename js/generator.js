// js/generator.js — Controller for the "Generator" page.
//
// Refactor notes: the settings panel is now driven entirely by
// BarcodeEngine.getType(type).settingsMode ("1d" | "qr" | "2d-simple").
// updateSettingsPanel() shows exactly one panel and never leaves a stale
// parameter from a previously-selected barcode type in `state.style` —
// switching type/kind resets style back to sensible defaults for the
// newly active panel so nothing incompatible ever reaches BarcodeEngine.

const Generator = (() => {
  const DEFAULT_STYLE = {
    // shared
    scale: 3,
    foreground: "#1A1D23",
    background: "#FFFFFF",
    // 1D-only
    height: 12,
    padding: 8,
    rotation: "N",
    showText: true,
    font: "sans-serif",
    fontSize: 10,
    textPosition: "below",
    textColor: "#1A1D23",
    borderWidth: 0,
    borderRadius: 0,
    // QR-only
    quietZone: 4,
    eccLevel: "M",
    logoDataURL: null,
    logoSizePercent: 20,
    moduleStyle: "square",
    eyeStyle: "square",
    gradient: false,
    gradientColor2: "#6B6F7A",
    gradientAngle: 45,
    transparentBackground: false,
  };

  let state = {
    kind: "1d",
    type: "code128",
    inputMode: "text", // text|url|email|phone|sms|wifi|contact|location
    data: "",
    name: "",
    category: "Lainnya",
    style: { ...DEFAULT_STYLE },
  };

  let els = {};
  let lastCanvas = null;
  let lastHistoryId = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    els = {
      kindTabs: document.querySelectorAll("[data-gen-kind]"),
      typeSelect: $("gen-type"),
      inputModeField: $("gen-input-mode-field"),
      inputModeSelect: $("gen-input-mode"),
      smartFields: $("gen-smart-fields"),
      dataText: $("gen-data-text"),
      nameInput: $("gen-name"),
      categorySelect: $("gen-category"),
      preview: $("gen-preview"),
      error: $("gen-error"),

      // common
      scale: $("gen-scale"),
      fgColor: $("gen-fg"),
      bgColor: $("gen-bg"),

      // panels
      panel1d: $("panel-1d"),
      panelQr: $("panel-qr"),
      panel2d: $("panel-2d"),

      // 1D fields
      height: $("gen1d-height"),
      padding: $("gen1d-padding"),
      rotation: $("gen1d-rotation"),
      showText: $("gen1d-showtext"),
      font: $("gen1d-font"),
      fontSize: $("gen1d-fontsize"),
      textPosition: $("gen1d-textposition"),
      borderWidth: $("gen1d-borderwidth"),
      borderRadius: $("gen1d-borderradius"),
      textOptionsRow: $("gen1d-textoptions"),

      // QR fields
      qrQuietZone: $("genqr-quietzone"),
      qrEcc: $("genqr-ecc"),
      qrLogo: $("genqr-logo"),
      qrLogoClear: $("genqr-logo-clear"),
      qrLogoSize: $("genqr-logosize"),
      qrLogoSizeRow: $("genqr-logosize-row"),
      qrModuleStyle: $("genqr-modulestyle"),
      qrEyeStyle: $("genqr-eyestyle"),
      qrGradient: $("genqr-gradient"),
      qrGradientFields: $("genqr-gradient-fields"),
      qrGradientColor2: $("genqr-gradientcolor2"),
      qrGradientAngle: $("genqr-gradientangle"),
      qrTransparentBg: $("genqr-transparentbg"),

      // 2D-simple fields
      d2QuietZone: $("gen2d-quietzone"),
      d2EccRow: $("gen2d-ecc-row"),
      d2Ecc: $("gen2d-ecc"),

      saveBtn: $("gen-save"),
      favBtn: $("gen-fav"),
      exportPng: $("gen-export-png"),
      exportJpg: $("gen-export-jpg"),
      exportWebp: $("gen-export-webp"),
      exportSvg: $("gen-export-svg"),
      exportPdf: $("gen-export-pdf"),
      copyBtn: $("gen-copy"),
      shareBtn: $("gen-share"),
    };

    if (!els.typeSelect) return; // Generator page not present on this view

    populateTypeSelect();
    bindEvents();
    updateSettingsPanel();
    updateSmartFields();
    render();
  }

  function currentSettingsMode() {
    const type = BarcodeEngine.getType(state.type);
    return type ? type.settingsMode : "1d";
  }

  function populateTypeSelect() {
    const types = BarcodeEngine.listTypes(state.kind);
    els.typeSelect.innerHTML = types.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
    if (!types.find((t) => t.id === state.type)) state.type = types[0].id;
    els.typeSelect.value = state.type;
  }

  // Shows exactly one settings panel for the active type and resets any
  // style keys that the newly active panel doesn't use, so a stale value
  // (e.g. height from a previous Code128 selection) never leaks into a
  // QR render call.
  function updateSettingsPanel() {
    const mode = currentSettingsMode();

    if (els.panel1d) els.panel1d.style.display = mode === "1d" ? "" : "none";
    if (els.panelQr) els.panelQr.style.display = mode === "qr" ? "" : "none";
    if (els.panel2d) els.panel2d.style.display = mode === "2d-simple" ? "" : "none";

    // Show the "input mode" smart-data selector only for symbologies that
    // can meaningfully carry structured data (QR + other 2D codes).
    if (els.inputModeField) els.inputModeField.style.display = mode === "1d" ? "none" : "";

    // ECC row inside the 2D-simple panel only makes sense for Micro QR / Aztec.
    if (els.d2EccRow) {
      els.d2EccRow.style.display = state.type === "microqr" || state.type === "azteccode" ? "" : "none";
    }

    syncFieldsFromState();
  }

  function syncFieldsFromState() {
    const s = state.style;
    if (els.scale) els.scale.value = s.scale;
    if (els.fgColor) els.fgColor.value = s.foreground;
    if (els.bgColor) els.bgColor.value = s.background;

    if (els.height) els.height.value = s.height;
    if (els.padding) els.padding.value = s.padding;
    if (els.rotation) els.rotation.value = s.rotation;
    if (els.showText) els.showText.checked = s.showText;
    if (els.font) els.font.value = s.font;
    if (els.fontSize) els.fontSize.value = s.fontSize;
    if (els.textPosition) els.textPosition.value = s.textPosition;
    if (els.borderWidth) els.borderWidth.value = s.borderWidth;
    if (els.borderRadius) els.borderRadius.value = s.borderRadius;
    if (els.textOptionsRow) els.textOptionsRow.style.display = s.showText ? "" : "none";

    if (els.qrQuietZone) els.qrQuietZone.value = s.quietZone;
    if (els.qrEcc) els.qrEcc.value = s.eccLevel;
    if (els.qrLogoSize) els.qrLogoSize.value = s.logoSizePercent;
    if (els.qrLogoSizeRow) els.qrLogoSizeRow.style.display = s.logoDataURL ? "" : "none";
    if (els.qrModuleStyle) els.qrModuleStyle.value = s.moduleStyle;
    if (els.qrEyeStyle) els.qrEyeStyle.value = s.eyeStyle;
    if (els.qrGradient) els.qrGradient.checked = s.gradient;
    if (els.qrGradientFields) els.qrGradientFields.style.display = s.gradient ? "" : "none";
    if (els.qrGradientColor2) els.qrGradientColor2.value = s.gradientColor2;
    if (els.qrGradientAngle) els.qrGradientAngle.value = s.gradientAngle;
    if (els.qrTransparentBg) els.qrTransparentBg.checked = s.transparentBackground;

    if (els.d2QuietZone) els.d2QuietZone.value = s.quietZone;
    if (els.d2Ecc) els.d2Ecc.value = s.eccLevel;
  }

  function bindEvents() {
    els.kindTabs.forEach((btn) =>
      btn.addEventListener("click", () => {
        state.kind = btn.dataset.genKind;
        els.kindTabs.forEach((b) => b.classList.toggle("active", b === btn));
        populateTypeSelect();
        updateSettingsPanel();
        updateSmartFields();
        render();
      })
    );

    els.typeSelect.addEventListener("change", () => {
      state.type = els.typeSelect.value;
      updateSettingsPanel();
      updateSmartFields();
      render();
    });

    if (els.inputModeSelect) {
      els.inputModeSelect.addEventListener("change", () => {
        state.inputMode = els.inputModeSelect.value;
        updateSmartFields();
        render();
      });
    }

    els.dataText.addEventListener("input", () => {
      state.data = els.dataText.value;
      render();
    });

    els.nameInput.addEventListener("input", () => (state.name = els.nameInput.value));
    els.categorySelect.addEventListener("change", () => (state.category = els.categorySelect.value));

    // ---- generic style-field bindings (id -> style key -> caster) ----
    const bindings = [
      [els.scale, "scale", Number],
      [els.fgColor, "foreground", String],
      [els.bgColor, "background", String],
      [els.height, "height", Number],
      [els.padding, "padding", Number],
      [els.rotation, "rotation", String],
      [els.font, "font", String],
      [els.fontSize, "fontSize", Number],
      [els.textPosition, "textPosition", String],
      [els.borderWidth, "borderWidth", Number],
      [els.borderRadius, "borderRadius", Number],
      [els.qrQuietZone, "quietZone", Number],
      [els.qrEcc, "eccLevel", String],
      [els.qrLogoSize, "logoSizePercent", Number],
      [els.qrModuleStyle, "moduleStyle", String],
      [els.qrEyeStyle, "eyeStyle", String],
      [els.qrGradientColor2, "gradientColor2", String],
      [els.qrGradientAngle, "gradientAngle", Number],
      [els.d2QuietZone, "quietZone", Number],
      [els.d2Ecc, "eccLevel", String],
    ];
    bindings.forEach(([el, key, cast]) => {
      if (!el) return;
      el.addEventListener("input", () => {
        state.style[key] = cast(el.value);
        render();
      });
    });

    if (els.showText) {
      els.showText.addEventListener("change", () => {
        state.style.showText = els.showText.checked;
        if (els.textOptionsRow) els.textOptionsRow.style.display = state.style.showText ? "" : "none";
        render();
      });
    }

    if (els.qrGradient) {
      els.qrGradient.addEventListener("change", () => {
        state.style.gradient = els.qrGradient.checked;
        if (els.qrGradientFields) els.qrGradientFields.style.display = state.style.gradient ? "" : "none";
        render();
      });
    }

    if (els.qrTransparentBg) {
      els.qrTransparentBg.addEventListener("change", () => {
        state.style.transparentBackground = els.qrTransparentBg.checked;
        render();
      });
    }

    if (els.qrLogo) {
      els.qrLogo.addEventListener("change", () => {
        const file = els.qrLogo.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          state.style.logoDataURL = reader.result;
          if (els.qrLogoSizeRow) els.qrLogoSizeRow.style.display = "";
          render();
        };
        reader.readAsDataURL(file);
      });
    }
    if (els.qrLogoClear) {
      els.qrLogoClear.addEventListener("click", () => {
        state.style.logoDataURL = null;
        if (els.qrLogo) els.qrLogo.value = "";
        if (els.qrLogoSizeRow) els.qrLogoSizeRow.style.display = "none";
        render();
      });
    }

    els.saveBtn.addEventListener("click", saveToHistory);
    els.favBtn.addEventListener("click", toggleFavorite);
    els.exportPng.addEventListener("click", () => exportAs("png"));
    els.exportJpg.addEventListener("click", () => exportAs("jpg"));
    els.exportWebp.addEventListener("click", () => exportAs("webp"));
    els.exportSvg.addEventListener("click", () => {
      if (!lastCanvas) return;
      ExportUtil.exportSVG(lastCanvas, fileName("svg"));
    });
    els.exportPdf.addEventListener("click", () => {
      if (!lastCanvas) return;
      ExportUtil.exportPDF(lastCanvas, fileName("pdf"));
    });
    els.copyBtn.addEventListener("click", async () => {
      if (!lastCanvas) return;
      const r = await ExportUtil.copyToClipboard(lastCanvas);
      toast(r.ok ? "Disalin ke clipboard." : r.error || "Gagal menyalin.");
    });
    els.shareBtn.addEventListener("click", async () => {
      if (!lastCanvas) return;
      const r = await ExportUtil.shareCanvas(lastCanvas, { title: state.name || "Barcode" });
      if (r.error) toast(r.error);
    });
  }

  // Smart input builders for 2D "meaningful" data types
  const SMART_FORMS = {
    text: () => `<textarea id="sf-text" class="input" rows="3" placeholder="Masukkan teks bebas..."></textarea>`,
    url: () => `<input id="sf-url" class="input" placeholder="https://contoh.com" />`,
    email: () => `
      <input id="sf-email-addr" class="input" placeholder="Alamat email" />
      <input id="sf-email-subj" class="input" placeholder="Subjek (opsional)" />`,
    phone: () => `<input id="sf-phone" class="input" placeholder="+62..." />`,
    sms: () => `
      <input id="sf-sms-num" class="input" placeholder="Nomor tujuan" />
      <input id="sf-sms-msg" class="input" placeholder="Pesan (opsional)" />`,
    wifi: () => `
      <input id="sf-wifi-ssid" class="input" placeholder="Nama WiFi (SSID)" />
      <input id="sf-wifi-pass" class="input" placeholder="Kata sandi" />
      <select id="sf-wifi-enc" class="input">
        <option value="WPA">WPA/WPA2</option>
        <option value="WEP">WEP</option>
        <option value="nopass">Tanpa kata sandi</option>
      </select>`,
    contact: () => `
      <input id="sf-c-name" class="input" placeholder="Nama" />
      <input id="sf-c-org" class="input" placeholder="Perusahaan (opsional)" />
      <input id="sf-c-phone" class="input" placeholder="Telepon" />
      <input id="sf-c-email" class="input" placeholder="Email" />`,
    location: () => `
      <input id="sf-loc-lat" class="input" placeholder="Latitude" />
      <input id="sf-loc-lng" class="input" placeholder="Longitude" />`,
  };

  function updateSmartFields() {
    if (!els.smartFields) return;
    const mode = currentSettingsMode();
    const isSmart = mode !== "1d" && state.inputMode !== "text";
    els.dataText.style.display = isSmart ? "none" : "";
    if (!isSmart) {
      els.smartFields.innerHTML = "";
      return;
    }
    els.smartFields.innerHTML = SMART_FORMS[state.inputMode]();
    els.smartFields.querySelectorAll("input, select, textarea").forEach((el) => {
      el.addEventListener("input", () => {
        state.data = buildSmartData();
        render();
      });
      el.addEventListener("change", () => {
        state.data = buildSmartData();
        render();
      });
    });
    state.data = buildSmartData();
  }

  function buildSmartData() {
    const v = (id) => (document.getElementById(id) ? document.getElementById(id).value : "");
    switch (state.inputMode) {
      case "url": return v("sf-url") ? BarcodeEngine.Builders.url(v("sf-url")) : "";
      case "email": return v("sf-email-addr") ? BarcodeEngine.Builders.email({ address: v("sf-email-addr"), subject: v("sf-email-subj") }) : "";
      case "phone": return v("sf-phone") ? BarcodeEngine.Builders.phone(v("sf-phone")) : "";
      case "sms": return v("sf-sms-num") ? BarcodeEngine.Builders.sms({ number: v("sf-sms-num"), message: v("sf-sms-msg") }) : "";
      case "wifi": return v("sf-wifi-ssid") ? BarcodeEngine.Builders.wifi({ ssid: v("sf-wifi-ssid"), password: v("sf-wifi-pass"), encryption: v("sf-wifi-enc") }) : "";
      case "contact": return v("sf-c-name") ? BarcodeEngine.Builders.contact({ name: v("sf-c-name"), org: v("sf-c-org"), phone: v("sf-c-phone"), email: v("sf-c-email") }) : "";
      case "location": return (v("sf-loc-lat") && v("sf-loc-lng")) ? BarcodeEngine.Builders.location({ lat: v("sf-loc-lat"), lng: v("sf-loc-lng") }) : "";
      default: return "";
    }
  }

  function render() {
    if (!els.preview) return;
    const mode = currentSettingsMode();
    const data = mode !== "1d" && state.inputMode !== "text" ? state.data : els.dataText.value;
    state.data = data;
    const result = BarcodeEngine.renderToCanvas(els.preview, state.type, data, state.style);
    if (!result.ok) {
      els.error.textContent = data ? result.error : "";
      lastCanvas = null;
    } else {
      els.error.textContent = "";
      lastCanvas = els.preview;
    }
    updateFavButton();
  }

  function fileName(ext) {
    const base = (state.name || state.type).replace(/[^a-z0-9-_]+/gi, "_");
    return `${base}.${ext}`;
  }

  function exportAs(format) {
    if (!lastCanvas) return;
    const dataURL = lastCanvas.toDataURL(format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png", 0.95);
    ExportUtil.downloadDataURL(dataURL, fileName(format));
  }

  function saveToHistory() {
    if (!lastCanvas || !state.data) {
      toast("Isi data terlebih dahulu sebelum menyimpan.");
      return;
    }
    const type = BarcodeEngine.getType(state.type);
    const entry = Storage.addHistory({
      kind: type.kind,
      type: state.type,
      typeLabel: type.label,
      category: state.category,
      name: state.name || type.label,
      data: state.data,
      options: { ...state.style },
    });
    lastHistoryId = entry.id;
    updateFavButton();
    toast("Tersimpan ke riwayat.");
    if (window.Dashboard) Dashboard.refresh();
  }

  function toggleFavorite() {
    if (!lastHistoryId) {
      saveToHistory();
      if (!lastHistoryId) return;
    }
    const isFav = Storage.toggleFavorite(lastHistoryId);
    updateFavButton(isFav);
  }

  function updateFavButton(forced) {
    if (!els.favBtn) return;
    const fav = forced !== undefined ? forced : lastHistoryId && Storage.isFavorite(lastHistoryId);
    els.favBtn.classList.toggle("active", !!fav);
    els.favBtn.textContent = fav ? "★ Favorit" : "☆ Tambah Favorit";
  }

  function toast(msg) {
    if (window.App && App.toast) App.toast(msg);
    else alert(msg);
  }

  // Load an existing history entry back into the generator (used by History/Favorites "Edit").
  // Resets to DEFAULT_STYLE first so no stale key from a differently-typed
  // entry (or the current in-progress edit) leaks through.
  function loadEntry(entry) {
    state.kind = entry.kind;
    state.type = entry.type;
    state.data = entry.data;
    state.name = entry.name;
    state.category = entry.category;
    state.style = { ...DEFAULT_STYLE, ...entry.options };
    lastHistoryId = entry.id;

    populateTypeSelect();
    els.typeSelect.value = state.type;
    els.nameInput.value = state.name;
    els.categorySelect.value = state.category;

    updateSettingsPanel();

    const mode = currentSettingsMode();
    els.dataText.value = mode === "1d" || state.inputMode === "text" ? state.data : "";
    updateSmartFields();
    render();
  }

  return { init, render, loadEntry, get state() { return state; } };
})();
