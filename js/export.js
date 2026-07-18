// js/export.js — Output helpers: download, clipboard, share, print.
// SVG export note: bwip-js's browser build renders to <canvas>. To offer an
// .svg file without a second vector renderer, the raster PNG is embedded
// inside a real SVG wrapper (valid, scalable-container SVG, but the artwork
// itself is a bitmap). This is called out in the UI so it's never a surprise.

const ExportUtil = (() => {
  function dataURLtoBlob(dataURL) {
    const [header, base64] = dataURL.split(",");
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function downloadDataURL(dataURL, filename) {
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    downloadDataURL(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function canvasToSVGWrapper(canvas) {
    const dataURL = canvas.toDataURL("image/png");
    const w = canvas.width;
    const h = canvas.height;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image width="${w}" height="${h}" href="${dataURL}"/>
</svg>`;
  }

  function exportSVG(canvas, filename) {
    const svg = canvasToSVGWrapper(canvas);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    downloadBlob(blob, filename);
  }

  async function exportPDF(canvas, filename, { pageSize = "a4" } = {}) {
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL("image/png");
    const ratio = canvas.width / canvas.height;

    let doc;
    if (pageSize === "label") {
      // Small label page sized to the image itself (in mm, approximated)
      const wmm = Math.max(30, canvas.width / 8);
      const hmm = Math.max(20, canvas.height / 8);
      doc = new jsPDF({ unit: "mm", format: [wmm, hmm] });
      doc.addImage(imgData, "PNG", 2, 2, wmm - 4, hmm - 4);
    } else {
      doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let w = pageW - 40;
      let h = w / ratio;
      if (h > pageH - 40) {
        h = pageH - 40;
        w = h * ratio;
      }
      doc.addImage(imgData, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
    }
    doc.save(filename);
  }

  async function copyToClipboard(canvas) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return { ok: false, error: "Clipboard tidak didukung di perangkat ini." };
    }
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  async function shareCanvas(canvas, { title = "Barcode", text = "" } = {}) {
    if (!navigator.share) return { ok: false, error: "Share API tidak didukung di perangkat ini." };
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const file = new File([blob], "barcode.png", { type: "image/png" });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        return { ok: false, error: "Berbagi file tidak didukung." };
      }
      await navigator.share({ title, text, files: [file] });
      return { ok: true };
    } catch (err) {
      if (err.name === "AbortError") return { ok: false, error: null };
      return { ok: false, error: err.message || String(err) };
    }
  }

  function printCanvases(items, { layout = "a4-grid", perRow = 3 } = {}) {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Popup diblokir. Izinkan popup untuk mencetak.");
      return;
    }
    const pageCSS =
      layout === "thermal"
        ? `@page { size: 58mm auto; margin: 2mm; } .item{ width:100%; margin-bottom:6mm; }`
        : layout === "label"
        ? `@page { size: auto; margin: 4mm; } .grid{ display:flex; flex-wrap:wrap; gap:4mm; } .item{ width:45mm; }`
        : `@page { size: A4; margin: 12mm; } .grid{ display:grid; grid-template-columns: repeat(${perRow}, 1fr); gap:8mm; }`;

    const imgs = items
      .map((c) => `<div class="item"><img src="${c.toDataURL("image/png")}" style="width:100%;height:auto;display:block;"/></div>`)
      .join("");

    win.document.write(`
      <!doctype html><html><head><meta charset="utf-8"><title>Cetak Barcode</title>
      <style>
        body{ font-family: sans-serif; margin:0; }
        .grid{ }
        img{ image-rendering: pixelated; }
        ${pageCSS}
      </style></head>
      <body><div class="grid">${imgs}</div>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`);
    win.document.close();
  }

  return {
    dataURLtoBlob,
    downloadDataURL,
    downloadBlob,
    exportSVG,
    exportPDF,
    copyToClipboard,
    shareCanvas,
    printCanvases,
  };
})();
