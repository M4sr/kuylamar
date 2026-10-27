/**
 * Jalur cadangan untuk situs berpelindung bot: ambil HTML lewat Brave yang sudah terpasang
 * (headless + CDP). Tanpa dependensi baru — WebSocket dan fetch sudah bawaan Node 22+.
 * Node-only: jangan diimpor functions/ (Cloudflare tidak punya child_process).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9333;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

let proc: ChildProcess | undefined;
let idle: NodeJS.Timeout | undefined;

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hidup(): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok;
  } catch {
    return false;
  }
}

/** Nyalakan Brave headless sekali, pakai ulang untuk permintaan berikutnya. */
async function pastikan(): Promise<boolean> {
  if (await hidup()) return true;
  proc ??= spawn(
    "/usr/bin/brave-browser",
    [
      // Sebagian situs (Indeed) menolak mode headless. LM_TAMPIL=1 → jendela asli di luar layar.
      ...(process.env.LM_TAMPIL === "1" ? ["--window-position=-2400,0"] : ["--headless=new"]),
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(tmpdir(), "lamarkerja-brave")}`,
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      `--user-agent=${UA}`,
      "--lang=id-ID",
      "about:blank",
    ],
    { stdio: "ignore" },
  ).on("exit", () => {
    proc = undefined;
  });
  for (let i = 0; i < 40; i++) {
    if (await hidup()) return true;
    await tidur(250);
  }
  return false;
}

/** Tutup browser kalau 3 menit tidak dipakai lagi — laptop ini RAM-nya terbatas. */
function jadwalkanMati() {
  clearTimeout(idle);
  idle = setTimeout(() => {
    proc?.kill();
    proc = undefined;
  }, 180_000);
}

// Jalankan evaluasi di tab sampai halaman dianggap siap: tantangan bot selesai, ukuran HTML
// berhenti berubah selama ~1,2 detik, dan minimal 2,5 detik berlalu (SPA masih menarik data).
const CEK_SIAP = `(() => {
  const t = document.title || "";
  const h = document.documentElement ? document.documentElement.outerHTML : "";
  const st = (window.__lm ??= { t0: Date.now(), n: 0, sama: 0 });
  st.sama = h.length === st.n ? st.sama + 1 : 0;
  st.n = h.length;
  const tantangan = /just a moment|attention required|checking your browser|verify you are human|mohon tunggu|memeriksa/i.test(t);
  // Halaman yang terus berubah (iklan/animasi) tidak akan pernah "tenang" → anggap siap setelah 12 detik,
  // sisanya diserahkan ke tunggu() di dalam skrip panen.
  const tenang = (st.sama >= 2 && Date.now() - st.t0 > 2500) || Date.now() - st.t0 > 12000;
  return !tantangan && tenang && h.length > 2000 ? h : "";
})()`;

function baca(wsUrl: string, tungguMs: number, skrip = CEK_SIAP): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    let terbaik: unknown = "";
    let galat = "";
    let tutup = false;
    const batas = Date.now() + tungguMs;
    const selesai = (fn: () => void) => {
      tutup = true;
      clearInterval(jaga);
      try {
        ws.close();
      } catch {
        /* sudah tertutup */
      }
      fn();
    };
    const jaga = setInterval(() => {
      if (Date.now() > batas && !tutup)
        selesai(() => (terbaik ? resolve(terbaik) : reject(new Error(`halaman tidak selesai dimuat${galat ? ` (${galat})` : ""}`))));
    }, 500);
    // Kirim evaluasi SATU-SATUNYA setelah yang sebelumnya balas: banyak evaluasi paralel membuat
    // halaman berat (tiap salinan menjalankan tunggu()/scroll sendiri) sampai tidak pernah selesai.
    const kirim = () => {
      if (tutup) return;
      ws.send(JSON.stringify({ id: ++id, method: "Runtime.evaluate", params: { expression: skrip, returnByValue: true, awaitPromise: true } }));
    };
    ws.onopen = kirim;
    ws.onerror = () => selesai(() => reject(new Error("sambungan CDP gagal")));
    ws.onclose = () => !tutup && selesai(() => (terbaik ? resolve(terbaik) : reject(new Error("sambungan CDP ditutup"))));
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as {
        result?: { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string } } };
      };
      const v = m.result?.result?.value;
      if (typeof v === "string" && v) {
        terbaik = v;
        if (skrip === CEK_SIAP) return selesai(() => resolve(v));
      } else if (skrip !== CEK_SIAP && v !== undefined && v !== null) {
        return selesai(() => resolve(v)); // hasil apa pun (termasuk array kosong) dianggap jawaban
      } else if (!galat) {
        galat = (m.result?.exceptionDetails?.exception?.description ?? "").split("\n")[0].slice(0, 160);
      }
      setTimeout(kirim, 600);
    };
  });
}

/** Nilai balikan skrip setelah halaman siap — dipakai untuk memanen data terstruktur. */
export async function evalBrowser<T = unknown>(url: string, skrip: string, tungguMs = 20_000): Promise<T> {
  if (!(await pastikan())) throw new Error("browser tidak bisa dijalankan");
  const buka = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!buka.ok) throw new Error(`tab gagal dibuka (HTTP ${buka.status})`);
  const tab = (await buka.json()) as { id: string; webSocketDebuggerUrl: string };
  try {
    // Gerbang "halaman siap" boleh gagal (mis. Cloudflare menahan halaman): panen tetap dijalankan,
    // skrip di dalam halaman sudah punya tunggu() sendiri.
    try {
      await baca(tab.webSocketDebuggerUrl, tungguMs);
    } catch {
      /* lanjut saja */
    }
    // Skrip menentukan sendiri kapan selesai; batas ini hanya jaring pengaman.
    return (await baca(tab.webSocketDebuggerUrl, 60_000, skrip)) as T;
  } finally {
    void fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
    jadwalkanMati();
  }
}

/** HTML halaman setelah JavaScript dijalankan. Melempar kalau browser tidak bisa dipakai. */
export async function htmlBrowser(url: string, tungguMs = 20_000): Promise<string> {
  if (!(await pastikan())) throw new Error("browser tidak bisa dijalankan");
  const buka = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!buka.ok) throw new Error(`tab gagal dibuka (HTTP ${buka.status})`);
  const tab = (await buka.json()) as { id: string; webSocketDebuggerUrl: string };
  try {
    return ((await baca(tab.webSocketDebuggerUrl, tungguMs)) as string).slice(0, 3_000_000);
  } finally {
    void fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
    jadwalkanMati();
  }
}
