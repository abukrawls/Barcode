// js/batch.js — Batch generation from CSV/Excel/JSON, plus bulk import/export
// of the app's own history data. Uses PapaParse for CSV, SheetJS for Excel,
// and JSZip for packaging mass PNG output.

const Batch = (() => {
  let rows = []; // [{ name, type, data, category }]
  let els = {};

  function $(id) { return document.getElementById(id); }

  function init() {
    els = {
      fileInput: $("batch-file"),
      dropZone: $("batch-drop"),
      table: $("batch-table"),
      typeDefault: $("batch-type-default"),
      generateBtn: $("batch-generate"),
      downloadZip: $("batch-download-zip"),
      downloadPdf: $("batch-download-pdf"),
      progress: $("batch-progress"),
      exportHistoryCsv: $("export-history-csv"),
      exportHistoryJson: $("export-history-json"),
      importDataFile: $("import-data-file"),
      importStatus: $("import-status"),
    };
    if (!els.fileInput && !els.exportHistoryCsv) return;

    if (els.fileInput) {
      els.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
      if (els.dropZone) {
        els.dropZone.addEventListener("dragover", (e) => e.preventDefault());
        els.dropZone.addEventListener("drop", (e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        });
      }
      els.generateBtn.addEventListener("click", generateAll);
      els.downloadZip.addEventListener("click", downloadZip);
      els.downloadPdf.addEventListener("click", downloadPdf);
    }

    if (els.exportHistoryCsv) els.exportHistoryCsv.addEventListener("click", exportHistoryCSV);
    if (els.exportHistoryJson) els.exportHistoryJson.addEventListener("click", exportHistoryJSON);
    if (els.importDataFile) els.importDataFile.addEventListener("change", (e) => importDataFile(e.target.files[0]));
  }

  function handleFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => setRows(res.data),
      });
    } else if (ext === "json") {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          setRows(Array.isArray(parsed) ? parsed : []);
        } catch {
          alert("File JSON tidak valid.");
        }
      };
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = () => {
        const wb = XLSX.read(reader.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        setRows(json);
      };
      reader.readAsBinaryString(file);
    } else {
      alert("Format file tidak didukung. Gunakan CSV, Excel, JSON, atau TXT.");
    }
  }

  function setRows(data) {
    rows = data
      .map((r) => ({
        name: r.name || r.Name || r.nama || "",
        type: (r.type || r.Type || r.jenis || "").toString().toLowerCase() || null,
        data: r.data || r.Data || r.isi || r.value || "",
        category: r.category || r.Category || r.kategori || "Lainnya",
      }))
      .filter((r) => r.data);
    renderTable();
  }

  function renderTable() {
    if (!els.table) return;
    if (rows.length === 0) {
      els.table.innerHTML = `<div class="empty-state">Belum ada data. Unggah file CSV, Excel, JSON, atau TXT.</div>`;
      return;
    }
    els.table.innerHTML = `
      <div class="batch-table-head">
        <span>Nama</span><span>Jenis</span><span>Data</span><span>Kategori</span>
      </div>
      ${rows
        .slice(0, 200)
        .map(
          (r) => `<div class="batch-table-row">
            <span>${escapeHtml(r.name || "-")}</span>
            <span>${escapeHtml(r.type || "(default)")}</span>
            <span class="truncate">${escapeHtml(r.data)}</span>
            <span>${escapeHtml(r.category)}</span>
          </div>`
        )
        .join("")}
      ${rows.length > 200 ? `<div class="empty-state">+${rows.length - 200} baris lainnya akan tetap diproses saat digenerate.</div>` : ""}
    `;
  }

  let generatedCanvases = [];

  function generateAll() {
    if (rows.length === 0) {
      alert("Impor data terlebih dahulu.");
      return;
    }
    const defaultType = els.typeDefault.value;
    generatedCanvases = [];
    let ok = 0, failed = 0;

    rows.forEach((r, i) => {
      const typeId = r.type && BarcodeEngine.getType(r.type) ? r.type : defaultType;
      const canvas = document.createElement("canvas");
      const result = BarcodeEngine.renderToCanvas(canvas, typeId, r.data, {});
      if (result.ok) {
        generatedCanvases.push({ canvas, name: r.name || `barcode_${i + 1}`, row: r });
        const type = BarcodeEngine.getType(typeId);
        Storage.addHistory({
          kind: type.kind,
          type: typeId,
          typeLabel: type.label,
          category: r.category,
          name: r.name || type.label,
          data: r.data,
          options: {},
        });
        ok++;
      } else {
        failed++;
      }
    });

    els.progress.textContent = `Selesai: ${ok} berhasil, ${failed} gagal dari ${rows.length} baris.`;
    els.downloadZip.disabled = generatedCanvases.length === 0;
    els.downloadPdf.disabled = generatedCanvases.length === 0;
    if (window.Dashboard) Dashboard.refresh();
  }

  async function downloadZip() {
    if (generatedCanvases.length === 0) return;
    const zip = new JSZip();
    generatedCanvases.forEach(({ canvas, name }) => {
      const dataURL = canvas.toDataURL("image/png");
      const base64 = dataURL.split(",")[1];
      zip.file(`${sanitize(name)}.png`, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    ExportUtil.downloadBlob(blob, "batch-barcodes.zip");
  }

  async function downloadPdf() {
    if (generatedCanvases.length === 0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const cols = 3, rows_ = 6;
    const cellW = (pageW - 20) / cols;
    const cellH = (pageH - 20) / rows_;
    let x = 10, y = 10, col = 0, row = 0;

    generatedCanvases.forEach(({ canvas }, i) => {
      if (i > 0 && i % (cols * rows_) === 0) {
        doc.addPage();
        col = 0; row = 0; x = 10; y = 10;
      }
      const imgData = canvas.toDataURL("image/png");
      const ratio = canvas.width / canvas.height;
      let w = cellW - 6, h = w / ratio;
      if (h > cellH - 6) { h = cellH - 6; w = h * ratio; }
      doc.addImage(imgData, "PNG", x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
      col++;
      if (col >= cols) { col = 0; row++; x = 10; y = 10 + row * cellH; }
      else { x = 10 + col * cellW; }
    });
    doc.save("batch-barcodes.pdf");
  }

  // ---------- History import/export ----------
  function exportHistoryCSV() {
    const data = Storage.getHistory();
    const csv = Papa.unparse(
      data.map((h) => ({ nama: h.name, jenis: h.typeLabel, kategori: h.category, data: h.data, tanggal: h.createdAt }))
    );
    ExportUtil.downloadBlob(new Blob([csv], { type: "text/csv" }), "riwayat-barcode.csv");
  }

  function exportHistoryJSON() {
    const data = Storage.getHistory();
    ExportUtil.downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "riwayat-barcode.json");
  }

  function importDataFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let items = [];
        if (ext === "json") {
          items = JSON.parse(reader.result);
        } else {
          const res = Papa.parse(reader.result, { header: true, skipEmptyLines: true });
          items = res.data.map((r) => ({
            name: r.nama || r.name,
            typeLabel: r.jenis || r.type,
            type: (r.jenis || r.type || "").toLowerCase(),
            category: r.kategori || r.category || "Lainnya",
            data: r.data,
          }));
        }
        let count = 0;
        items.forEach((it) => {
          if (!it.data) return;
          const typeId = BarcodeEngine.getType(it.type) ? it.type : "code128";
          const type = BarcodeEngine.getType(typeId);
          Storage.addHistory({
            kind: type.kind,
            type: typeId,
            typeLabel: type.label,
            category: it.category || "Lainnya",
            name: it.name || type.label,
            data: it.data,
            options: {},
          });
          count++;
        });
        els.importStatus.textContent = `${count} data berhasil diimpor ke riwayat.`;
        if (window.Dashboard) Dashboard.refresh();
      } catch (e) {
        els.importStatus.textContent = "Gagal mengimpor file: " + e.message;
      }
    };
    reader.readAsText(file);
  }

  function sanitize(s) { return String(s).replace(/[^a-z0-9-_]+/gi, "_"); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { init };
})();
