// js/scanner.js — Camera-based barcode/QR scanning via the html5-qrcode
// library (loaded from CDN). Supports QR + most common 1D symbologies.

const Scanner = (() => {
  let html5Qr = null;
  let running = false;
  let els = {};

  function $(id) { return document.getElementById(id); }

  function init() {
    els = {
      startBtn: $("scan-start"),
      stopBtn: $("scan-stop"),
      torchBtn: $("scan-torch"),
      zoom: $("scan-zoom"),
      container: $("scan-reader"),
      result: $("scan-result"),
      resultText: $("scan-result-text"),
      historyList: $("scan-history-list"),
      vibrate: $("scan-vibrate"),
      sound: $("scan-sound"),
    };
    if (!els.container) return; // Scanner page not present

    els.startBtn.addEventListener("click", start);
    els.stopBtn.addEventListener("click", stop);
    if (els.torchBtn) els.torchBtn.addEventListener("click", toggleTorch);
    if (els.zoom) els.zoom.addEventListener("input", applyZoom);

    renderHistory();
  }

  async function start() {
    if (running) return;
    if (typeof Html5Qrcode === "undefined") {
      els.result.textContent = "Pustaka pemindai belum dimuat. Periksa koneksi internet saat pertama kali membuka aplikasi.";
      return;
    }
    html5Qr = new Html5Qrcode(els.container.id, { verbose: false });
    const config = { fps: 12, qrbox: { width: 260, height: 260 } };

    try {
      await html5Qr.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        () => {} // ignore per-frame decode failures
      );
      running = true;
      els.startBtn.disabled = true;
      els.stopBtn.disabled = false;
    } catch (err) {
      els.result.textContent = "Tidak bisa mengakses kamera: " + (err.message || err);
    }
  }

  async function stop() {
    if (!running || !html5Qr) return;
    try {
      await html5Qr.stop();
      html5Qr.clear();
    } catch (e) { /* noop */ }
    running = false;
    els.startBtn.disabled = false;
    els.stopBtn.disabled = true;
  }

  function onScanSuccess(decodedText, decodedResult) {
    const format = decodedResult?.result?.format?.formatName || "Tidak diketahui";
    els.resultText.textContent = decodedText;
    els.result.dataset.format = format;
    els.result.classList.add("flash");
    setTimeout(() => els.result.classList.remove("flash"), 400);

    if (els.vibrate && els.vibrate.checked && navigator.vibrate) navigator.vibrate(120);
    if (els.sound && els.sound.checked) playBeep();

    Storage.addScanHistory({ text: decodedText, format });
    renderHistory();
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) { /* audio not available */ }
  }

  async function toggleTorch() {
    if (!html5Qr || !running) return;
    try {
      const capabilities = html5Qr.getRunningTrackCapabilities();
      if (!capabilities.torch) {
        toast("Perangkat ini tidak mendukung flash.");
        return;
      }
      const settings = html5Qr.getRunningTrackSettings();
      await html5Qr.applyVideoConstraints({ advanced: [{ torch: !settings.torch }] });
    } catch (e) {
      toast("Gagal mengubah flash.");
    }
  }

  async function applyZoom() {
    if (!html5Qr || !running || !els.zoom) return;
    try {
      await html5Qr.applyVideoConstraints({ advanced: [{ zoom: Number(els.zoom.value) }] });
    } catch (e) { /* zoom not supported on this device */ }
  }

  function renderHistory() {
    if (!els.historyList) return;
    const list = Storage.getScanHistory();
    if (list.length === 0) {
      els.historyList.innerHTML = `<div class="empty-state">Belum ada riwayat pemindaian.</div>`;
      return;
    }
    els.historyList.innerHTML = list
      .slice(0, 30)
      .map(
        (item) => `
      <div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(item.text)}</div>
          <div class="list-row-sub">${item.format} · ${new Date(item.scannedAt).toLocaleString("id-ID")}</div>
        </div>
      </div>`
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(msg) {
    if (window.App && App.toast) App.toast(msg);
  }

  return { init, stop };
})();
