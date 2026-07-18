// js/qr-styler.js — Renders a fully-styled QR Code onto a <canvas>.
//
// bwip-js only draws QR modules as plain squares, so it can't provide the
// "professional" styling options requested (dot/rounded modules, styled
// eyes, gradients, centered logo, true "quiet zone" spacing). This module
// gets the raw module matrix from the lightweight `qrcode-generator`
// library (global `qrcode`, loaded via CDN) and draws every module itself.

const QRStyler = (() => {
  // Returns true if (row, col) falls inside any of the 3 finder-pattern
  // ("eye") 7x7 blocks: top-left, top-right, bottom-left.
  function isEyeModule(row, col, count) {
    const inBlock = (r0, c0) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
    return inBlock(0, 0) || inBlock(0, count - 7) || inBlock(count - 7, 0);
  }

  function drawEye(ctx, x, y, moduleSize, style, color) {
    const outer = moduleSize * 7;
    const ringWidth = moduleSize;
    const innerOuterGap = moduleSize; // white ring between outer ring and inner dot
    const inner = moduleSize * 3;
    const innerOffset = moduleSize * 2;

    ctx.fillStyle = color;

    if (style === "dot") {
      // Outer ring as a donut (circle minus smaller circle)
      drawRingCircle(ctx, x + outer / 2, y + outer / 2, outer / 2, outer / 2 - ringWidth);
      // Inner dot
      drawCircle(ctx, x + innerOffset + inner / 2, y + innerOffset + inner / 2, inner / 2);
    } else if (style === "rounded") {
      drawRingRoundedRect(ctx, x, y, outer, outer, ringWidth, moduleSize * 1.6);
      drawRoundedRect(ctx, x + innerOffset, y + innerOffset, inner, inner, moduleSize * 0.9);
    } else {
      // square (classic QR finder pattern look)
      ctx.fillRect(x, y, outer, ringWidth);
      ctx.fillRect(x, y + outer - ringWidth, outer, ringWidth);
      ctx.fillRect(x, y, ringWidth, outer);
      ctx.fillRect(x + outer - ringWidth, y, ringWidth, outer);
      ctx.fillRect(x + innerOffset, y + innerOffset, inner, inner);
    }
  }

  function drawCircle(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRingCircle(ctx, cx, cy, rOuter, rInner) {
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2, false);
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    addRoundedRectSubpath(ctx, x, y, w, h, r);
  }

  function addRoundedRectSubpath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    roundedRectPath(ctx, x, y, w, h, r);
    ctx.fill();
  }

  function drawRingRoundedRect(ctx, x, y, w, h, ringWidth, r) {
    ctx.beginPath();
    addRoundedRectSubpath(ctx, x, y, w, h, r);
    addRoundedRectSubpath(ctx, x + ringWidth, y + ringWidth, w - ringWidth * 2, h - ringWidth * 2, Math.max(0, r - ringWidth));
    ctx.fill("evenodd");
  }

  function drawModule(ctx, x, y, size, style) {
    if (style === "dot") {
      drawCircle(ctx, x + size / 2, y + size / 2, (size * 0.86) / 2);
    } else if (style === "rounded") {
      drawRoundedRect(ctx, x, y, size, size, size * 0.32);
    } else {
      ctx.fillRect(x, y, size, size);
    }
  }

  // opts: see BarcodeEngine.getQRCodeOptions() for shape.
  function render(canvas, opts) {
    if (typeof qrcode === "undefined") {
      throw new Error("Pustaka QR (qrcode-generator) belum dimuat.");
    }
    if (!opts.text) throw new Error("Data tidak boleh kosong.");

    // Auto-upgrade error correction when a logo is present so the code
    // stays scannable once the center is covered.
    let ecc = opts.eccLevel;
    if (opts.logoDataURL && (ecc === "L" || ecc === "M")) ecc = "Q";

    const qr = qrcode(0, ecc);
    qr.addData(opts.text);
    qr.make();
    const count = qr.getModuleCount();

    const moduleSize = opts.scale;
    const quiet = opts.quietZone;
    const size = (count + quiet * 2) * moduleSize;

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    if (!opts.transparentBackground) {
      ctx.fillStyle = "#" + opts.background;
      ctx.fillRect(0, 0, size, size);
    }

    // Draw all modules (data + eyes) onto a solid-color mask canvas first;
    // if a gradient is requested, the gradient is clipped to this mask.
    const mask = document.createElement("canvas");
    mask.width = size;
    mask.height = size;
    const mctx = mask.getContext("2d");
    mctx.fillStyle = "#000000";

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!qr.isDark(row, col)) continue;
        const x = (col + quiet) * moduleSize;
        const y = (row + quiet) * moduleSize;
        if (isEyeModule(row, col, count)) continue; // eyes drawn separately below
        drawModule(mctx, x, y, moduleSize, opts.moduleStyle);
      }
    }
    // Eyes: draw once per corner using the dedicated eye renderer.
    const eyeCorners = [
      [0, 0],
      [0, count - 7],
      [count - 7, 0],
    ];
    eyeCorners.forEach(([r, c]) => {
      drawEye(mctx, (c + quiet) * moduleSize, (r + quiet) * moduleSize, moduleSize, opts.eyeStyle, "#000000");
    });

    if (opts.gradient) {
      const gradCanvas = document.createElement("canvas");
      gradCanvas.width = size;
      gradCanvas.height = size;
      const gctx = gradCanvas.getContext("2d");
      const angle = (opts.gradientAngle * Math.PI) / 180;
      const x1 = size / 2 - (Math.cos(angle) * size) / 2;
      const y1 = size / 2 - (Math.sin(angle) * size) / 2;
      const x2 = size / 2 + (Math.cos(angle) * size) / 2;
      const y2 = size / 2 + (Math.sin(angle) * size) / 2;
      const grad = gctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, "#" + opts.foreground);
      grad.addColorStop(1, "#" + opts.gradientColor2);
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, size, size);
      gctx.globalCompositeOperation = "destination-in";
      gctx.drawImage(mask, 0, 0);
      ctx.drawImage(gradCanvas, 0, 0);
    } else {
      // Recolor the black mask to the foreground color, then draw it.
      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = size;
      colorCanvas.height = size;
      const cctx = colorCanvas.getContext("2d");
      cctx.fillStyle = "#" + opts.foreground;
      cctx.fillRect(0, 0, size, size);
      cctx.globalCompositeOperation = "destination-in";
      cctx.drawImage(mask, 0, 0);
      ctx.drawImage(colorCanvas, 0, 0);
    }

    if (opts.logoDataURL) {
      drawLogo(ctx, opts, size);
    }
  }

  function drawLogo(ctx, opts, size) {
    const img = new Image();
    // Logos are drawn synchronously when possible (data URLs decode
    // instantly in practice); onload covers the general case.
    const draw = () => {
      const logoSize = (size * opts.logoSizePercent) / 100;
      const pad = logoSize * 0.16;
      const cx = (size - logoSize) / 2;
      const cy = (size - logoSize) / 2;
      ctx.save();
      roundedRectPath(ctx, cx - pad / 2, cy - pad / 2, logoSize + pad, logoSize + pad, logoSize * 0.18);
      ctx.fillStyle = "#" + opts.background;
      ctx.fill();
      ctx.restore();
      ctx.drawImage(img, cx, cy, logoSize, logoSize);
    };
    if (img.complete && img.naturalWidth) draw();
    else img.onload = draw;
    img.src = opts.logoDataURL;
  }

  return { render };
})();
