// js/barcode-engine.js — Encoding registry + render pipeline.
//
// Design goals of this refactor:
//  - Never send an undefined/null/NaN/empty-string parameter to bwip-js.
//  - Only send parameters a given symbology actually supports.
//  - Validate the input DATA (format/length) before attempting to render.
//  - Keep 1D, "simple" 2D (bwip-driven), and QR (custom-styled) rendering
//    in separate, single-purpose functions so new symbologies are easy to add.
//
// Rendering engines used:
//  - bwip-js: all 1D symbologies + Data Matrix / PDF417 / Aztec / MaxiCode / Micro QR.
//  - qrcode-generator (global `qrcode`): full QR Code only, because the
//    requested styling options (dot/rounded modules, custom eye style,
//    gradients, logo overlay, true "quiet zone" terminology) need direct
//    access to the module matrix, which bwip-js's canvas renderer doesn't
//    expose. See js/qr-styler.js for that renderer.

const BarcodeEngine = (() => {
  // type id -> { label, kind, bcid, settingsMode }
  // settingsMode drives which settings panel the Generator UI shows:
  //   "1d"        -> full 1D panel (height, text, font, border, ...)
  //   "qr"        -> full QR styling panel (quiet zone, ECC, logo, ...)
  //   "2d-simple" -> minimal 2D panel (scale, quiet zone, ECC where applicable)
  const TYPES = {
    // ---- 1D ----
    code128:   { label: "Code128",   kind: "1d", bcid: "code128",             settingsMode: "1d" },
    code39:    { label: "Code39",    kind: "1d", bcid: "code39",              settingsMode: "1d" },
    ean8:      { label: "EAN-8",     kind: "1d", bcid: "ean8",                settingsMode: "1d" },
    ean13:     { label: "EAN-13",    kind: "1d", bcid: "ean13",               settingsMode: "1d" },
    upca:      { label: "UPC-A",     kind: "1d", bcid: "upca",                settingsMode: "1d" },
    upce:      { label: "UPC-E",     kind: "1d", bcid: "upce",                settingsMode: "1d" },
    itf:       { label: "ITF",       kind: "1d", bcid: "interleaved2of5",     settingsMode: "1d" },
    codabar:   { label: "Codabar",   kind: "1d", bcid: "rationalizedCodabar", settingsMode: "1d" },
    msi:       { label: "MSI",       kind: "1d", bcid: "msi",                settingsMode: "1d" },
    pharmacode:{ label: "Pharmacode",kind: "1d", bcid: "pharmacode",          settingsMode: "1d" },
    code93:    { label: "Code93",    kind: "1d", bcid: "code93",              settingsMode: "1d" },
    gs1_128:   { label: "GS1-128",   kind: "1d", bcid: "gs1-128",             settingsMode: "1d" },
    isbn:      { label: "ISBN",      kind: "1d", bcid: "isbn",                settingsMode: "1d" },
    issn:      { label: "ISSN",      kind: "1d", bcid: "issn",                settingsMode: "1d" },
    pzn:       { label: "PZN",       kind: "1d", bcid: "pzn",                 settingsMode: "1d" },

    // ---- 2D ----
    qrcode:    { label: "QR Code",    kind: "2d", bcid: "qrcode",       settingsMode: "qr" },
    datamatrix:{ label: "Data Matrix",kind: "2d", bcid: "datamatrix",   settingsMode: "2d-simple" },
    pdf417:    { label: "PDF417",     kind: "2d", bcid: "pdf417",       settingsMode: "2d-simple" },
    azteccode: { label: "Aztec",      kind: "2d", bcid: "azteccode",    settingsMode: "2d-simple" },
    maxicode:  { label: "MaxiCode",   kind: "2d", bcid: "maxicode",     settingsMode: "2d-simple" },
    microqr:   { label: "Micro QR",   kind: "2d", bcid: "microqrcode", settingsMode: "2d-simple" },
  };

  function listTypes(kind) {
    return Object.entries(TYPES)
      .filter(([, v]) => !kind || v.kind === kind)
      .map(([id, v]) => ({ id, ...v }));
  }

  function getType(id) {
    return TYPES[id];
  }

  // ---------- Structured input builders (for QR/2D "smart" inputs) ----------
  const Builders = {
    url(v) {
      if (!/^https?:\/\//i.test(v)) return "https://" + v;
      return v;
    },
    email({ address, subject = "", body = "" }) {
      const params = [];
      if (subject) params.push("subject=" + encodeURIComponent(subject));
      if (body) params.push("body=" + encodeURIComponent(body));
      return `mailto:${address}${params.length ? "?" + params.join("&") : ""}`;
    },
    phone(v) {
      return `tel:${v.replace(/[^\d+]/g, "")}`;
    },
    sms({ number, message = "" }) {
      const clean = number.replace(/[^\d+]/g, "");
      return message ? `SMSTO:${clean}:${message}` : `sms:${clean}`;
    },
    wifi({ ssid, password = "", encryption = "WPA", hidden = false }) {
      const esc = (s) => String(s).replace(/([\\;,:"])/g, "\\$1");
      return `WIFI:T:${encryption};S:${esc(ssid)};P:${esc(password)};H:${hidden ? "true" : "false"};;`;
    },
    contact({ name = "", phone = "", email = "", org = "", title = "" }) {
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        name ? `FN:${name}` : "",
        org ? `ORG:${org}` : "",
        title ? `TITLE:${title}` : "",
        phone ? `TEL:${phone}` : "",
        email ? `EMAIL:${email}` : "",
        "END:VCARD",
      ].filter(Boolean);
      return lines.join("\n");
    },
    location({ lat, lng }) {
      return `geo:${lat},${lng}`;
    },
  };

  // =========================================================================
  // VALIDATION
  // =========================================================================

  // Small numeric helper: returns `fallback` for undefined/null/NaN/"".
  function num(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  // Sanitizes a hex color string; falls back if empty/invalid.
  function hex(value, fallback) {
    const v = (value || "").toString().trim();
    return /^#?[0-9a-fA-F]{3,8}$/.test(v) ? v.replace("#", "") : fallback;
  }

  // validateInput(): format/length rules per symbology. Returns {ok, error}.
  function validateInput(typeId, rawData) {
    const type = getType(typeId);
    if (!type) return { ok: false, error: "Jenis barcode tidak dikenal." };

    const data = (rawData ?? "").toString().trim();
    if (!data) return { ok: false, error: "Data tidak boleh kosong." };

    const digitsOnly = /^\d+$/;

    switch (typeId) {
      case "ean13":
        if (!digitsOnly.test(data) || data.length !== 13)
          return { ok: false, error: "EAN-13 harus berupa 13 digit angka." };
        break;
      case "ean8":
        if (!digitsOnly.test(data) || data.length !== 8)
          return { ok: false, error: "EAN-8 harus berupa 8 digit angka." };
        break;
      case "upca":
        if (!digitsOnly.test(data) || data.length !== 12)
          return { ok: false, error: "UPC-A harus berupa 12 digit angka." };
        break;
      case "upce":
        if (!digitsOnly.test(data) || (data.length !== 6 && data.length !== 7 && data.length !== 8))
          return { ok: false, error: "UPC-E harus berupa 6-8 digit angka." };
        break;
      case "isbn":
        if (!digitsOnly.test(data) || (data.length !== 10 && data.length !== 13))
          return { ok: false, error: "ISBN harus berupa 10 atau 13 digit angka." };
        break;
      case "issn":
        if (!digitsOnly.test(data) || data.length !== 8)
          return { ok: false, error: "ISSN harus berupa 8 digit angka." };
        break;
      case "itf":
        if (!digitsOnly.test(data) || data.length % 2 !== 0)
          return { ok: false, error: "ITF harus berupa angka dengan jumlah digit genap." };
        break;
      case "pzn":
        if (!digitsOnly.test(data) || (data.length !== 6 && data.length !== 7 && data.length !== 8))
          return { ok: false, error: "PZN harus berupa 6-8 digit angka." };
        break;
      case "pharmacode":
        if (!digitsOnly.test(data) || Number(data) < 3 || Number(data) > 131070)
          return { ok: false, error: "Pharmacode harus berupa angka antara 3 dan 131070." };
        break;
      case "msi":
        if (!digitsOnly.test(data))
          return { ok: false, error: "MSI hanya boleh berisi angka." };
        break;
      case "codabar":
        if (!/^[A-Da-d]?[0-9\-$:/.+]+[A-Da-d]?$/.test(data))
          return { ok: false, error: "Codabar hanya boleh berisi angka dan simbol - $ : / . +" };
        break;
      // Code128 / Code39 / Code93 / GS1-128 / QR / Data Matrix / PDF417 /
      // Aztec / MaxiCode / Micro QR: free-form text, no extra length rule.
      default:
        break;
    }
    return { ok: true };
  }

  // =========================================================================
  // OPTION BUILDERS — every key is added conditionally; nothing undefined
  // ever reaches bwip-js.
  // =========================================================================

  // Builds a bwip-js options object for a 1D symbology. Only 1D-relevant
  // keys are ever included.
  function getBarcodeOptions(typeId, data, style = {}) {
    const type = getType(typeId);
    const opts = {
      bcid: type.bcid,
      text: String(data),
    };

    opts.scale = num(style.scale, 3);
    opts.height = num(style.height, 12);
    opts.paddingwidth = num(style.padding, 8);
    opts.paddingheight = num(style.padding, 8);

    const showText = style.showText !== false;
    opts.includetext = showText && (style.textPosition || "below") === "below";
    if (opts.includetext) {
      opts.textxalign = "center";
      opts.textsize = num(style.fontSize, 10);
      if (style.font) opts.textfont = String(style.font);
      opts.textcolor = hex(style.textColor || style.foreground, "1A1D23");
    }

    opts.backgroundcolor = hex(style.background, "FFFFFF");
    opts.barcolor = hex(style.foreground, "1A1D23");

    const rotation = ["N", "R", "I", "L"].includes(style.rotation) ? style.rotation : "N";
    opts.rotate = rotation;

    return opts;
  }

  // Builds a bwip-js options object for the "simple" 2D symbologies
  // (Data Matrix, PDF417, Aztec, MaxiCode, Micro QR). No height/text options
  // are ever included since these formats don't use them.
  function get2DSimpleOptions(typeId, data, style = {}) {
    const type = getType(typeId);
    const opts = {
      bcid: type.bcid,
      text: String(data),
      scale: num(style.scale, 3),
    };

    const quietZone = num(style.quietZone, 4);
    opts.paddingwidth = quietZone;
    opts.paddingheight = quietZone;

    if (!style.transparentBackground) {
      opts.backgroundcolor = hex(style.background, "FFFFFF");
    }
    opts.barcolor = hex(style.foreground, "1A1D23");

    if (["L", "M", "Q", "H"].includes(style.eccLevel) && (typeId === "microqr" || typeId === "azteccode")) {
      opts.eclevel = style.eccLevel;
    }

    return opts;
  }

  // Builds the options object consumed by QRStyler (js/qr-styler.js).
  function getQRCodeOptions(data, style = {}) {
    return {
      text: String(data),
      scale: num(style.scale, 8),
      quietZone: num(style.quietZone, 4),
      eccLevel: ["L", "M", "Q", "H"].includes(style.eccLevel) ? style.eccLevel : "M",
      foreground: hex(style.foreground, "1A1D23"),
      background: hex(style.background, "FFFFFF"),
      transparentBackground: !!style.transparentBackground,
      moduleStyle: ["square", "dot", "rounded"].includes(style.moduleStyle) ? style.moduleStyle : "square",
      eyeStyle: ["square", "dot", "rounded"].includes(style.eyeStyle) ? style.eyeStyle : "square",
      gradient: !!style.gradient,
      gradientColor2: hex(style.gradientColor2, "6B6F7A"),
      gradientAngle: num(style.gradientAngle, 45),
      logoDataURL: style.logoDataURL || null,
      logoSizePercent: Math.min(30, Math.max(10, num(style.logoSizePercent, 20))),
    };
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  // Renders a 1D symbology onto `canvas` via bwip-js, then applies the
  // border / rounded-corner / above-text post-processing that bwip-js
  // itself can't do.
  function renderBarcode(canvas, typeId, data, style = {}) {
    const opts = getBarcodeOptions(typeId, data, style);
    const work = document.createElement("canvas");
    try {
      bwipjs.toCanvas(work, opts);
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }

    const textAbove = style.showText !== false && (style.textPosition || "below") === "above";
    const borderWidth = num(style.borderWidth, 0);
    const borderRadius = num(style.borderRadius, 0);

    if (!textAbove && borderWidth <= 0 && borderRadius <= 0) {
      copyCanvas(work, canvas);
      return { ok: true };
    }

    const font = style.font || "sans-serif";
    const fontSize = num(style.fontSize, 10);
    const textColor = "#" + hex(style.textColor || style.foreground, "1A1D23");
    const bg = "#" + hex(style.background, "FFFFFF");

    const textHeight = textAbove ? fontSize + 10 : 0;
    const totalW = work.width + borderWidth * 2;
    const totalH = work.height + textHeight + borderWidth * 2;

    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalW, totalH);

    // Background + rounded clip
    ctx.save();
    roundedRectPath(ctx, 0, 0, totalW, totalH, borderRadius);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, totalW, totalH);

    if (textAbove) {
      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(data), totalW / 2, borderWidth + 2);
    }

    ctx.drawImage(work, borderWidth, borderWidth + textHeight);
    ctx.restore();

    if (borderWidth > 0) {
      ctx.save();
      ctx.strokeStyle = "#" + hex(style.borderColor || style.foreground, "1A1D23");
      ctx.lineWidth = borderWidth;
      roundedRectPath(ctx, borderWidth / 2, borderWidth / 2, totalW - borderWidth, totalH - borderWidth, borderRadius);
      ctx.stroke();
      ctx.restore();
    }

    return { ok: true };
  }

  // Renders one of the "simple" 2D symbologies via bwip-js directly.
  function render2DSimple(canvas, typeId, data, style = {}) {
    const opts = get2DSimpleOptions(typeId, data, style);
    try {
      bwipjs.toCanvas(canvas, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // Renders a fully-styled QR Code via QRStyler (js/qr-styler.js).
  function renderQRCode(canvas, data, style = {}) {
    if (typeof QRStyler === "undefined") {
      return { ok: false, error: "Modul styling QR belum dimuat." };
    }
    const opts = getQRCodeOptions(data, style);
    try {
      QRStyler.render(canvas, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // Single entry point used by the rest of the app. Validates input first,
  // then dispatches to the right renderer based on settingsMode — this is
  // the only place that needs to know the three render paths exist.
  function renderToCanvas(canvas, typeId, data, style = {}) {
    const type = getType(typeId);
    if (!type) return { ok: false, error: "Jenis barcode tidak dikenal." };

    const validation = validateInput(typeId, data);
    if (!validation.ok) return validation;

    if (type.settingsMode === "1d") return renderBarcode(canvas, typeId, data, style);
    if (type.settingsMode === "qr") return renderQRCode(canvas, data, style);
    return render2DSimple(canvas, typeId, data, style);
  }

  // Renders to an off-screen canvas and returns a data URL (png/jpeg/webp).
  function renderToDataURL(typeId, data, style = {}, format = "png") {
    const canvas = document.createElement("canvas");
    const result = renderToCanvas(canvas, typeId, data, style);
    if (!result.ok) return { ok: false, error: result.error };
    const mime = format === "jpg" || format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    return { ok: true, dataURL: canvas.toDataURL(mime, 0.95), canvas };
  }

  // ---------- small canvas helpers ----------
  function copyCanvas(src, dest) {
    dest.width = src.width;
    dest.height = src.height;
    dest.getContext("2d").drawImage(src, 0, 0);
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  return {
    TYPES,
    listTypes,
    getType,
    Builders,
    validateInput,
    getBarcodeOptions,
    get2DSimpleOptions,
    getQRCodeOptions,
    renderBarcode,
    render2DSimple,
    renderQRCode,
    renderToCanvas,
    renderToDataURL,
  };
})();
