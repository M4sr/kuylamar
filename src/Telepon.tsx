import { useEffect, useMemo, useRef, useState } from "react";
import {
  daftarTelepon,
  kalimatSela,
  laporan as buatLaporan,
  lanjutan,
  namaHrd,
  nilaiJawaban,
  pembuka,
  penutup,
  pilihSuara,
  rataRekap,
  rekapDari,
  tambahRekap,
  transkrip,
  trenRekap,
  MAKS_REKAP,
  type Gender,
  type Giliran,
  type Laporan,
  type Panjang,
  type Rekap,
} from "./lib/telepon";
import { aiCfg, nilaiTelepon } from "./lib/ai";
import type { Tanya } from "./lib/wawancara";
import { Btn, Card, Icon, Segmented, Switch } from "./ui";
import type { Job, Resume } from "./types";

/**
 * Simulasi wawancara telepon: HRD bicara (SpeechSynthesis), kamu menjawab (SpeechRecognition),
 * hasil diumumkan di akhir sesi. Semua di browser — nol backend, nol rekaman yang dikirim keluar.
 * Kalau browser tidak punya pengenal suara (Firefox/Safari), otomatis jatuh ke mode ketik.
 */

type ItemHasil = { 0: { transcript: string }; isFinal: boolean; length: number };
type AcaraSuara = { resultIndex: number; results: { length: number; [i: number]: ItemHasil } };
type Pendengar = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: AcaraSuara) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  /** Instance sudah dibuang — semua handler-nya dimatikan. */
  mati?: boolean;
  /** Berapa kali dihidupkan ulang karena Chrome menutup sendiri sebelum ada suara. */
  ulang?: number;
};
type PabrikPendengar = new () => Pendengar;

const SR: PabrikPendengar | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: PabrikPendengar; webkitSpeechRecognition?: PabrikPendengar }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: PabrikPendengar }).webkitSpeechRecognition);

const TTS = typeof window !== "undefined" && "speechSynthesis" in window;

/** Diam selama ini (detik) setelah ada suara → jawaban dianggap selesai. (Dulu 1,8 dtk — kepotong
 *  saat orang masih mikir sebentar di tengah kalimat.) */
const JEDA_SELESAI = 3;
/** Belum ada suara terdeteksi selama ini (detik) → beri catatan, jangan potong jawaban. */
const BATAS_BISU = 20;
/** Chrome suka menutup sendiri pengenal suara sebelum pemakai sempat bicara — hidupkan ulang. */
const ULANG_DENGAR = 3;
/** Batas maksimal satu jawaban (detik). */
const BATAS_JAWAB = 90;
/** Tempo bicara HRD. */
const LAJU: Record<string, { rate: number; pitch: number }> = {
  pelan: { rate: 0.88, pitch: 1.0 },
  sedang: { rate: 1.02, pitch: 1.05 },
  cepat: { rate: 1.18, pitch: 1.05 },
};
/** Riwayat sesi telepon (localStorage). */
const RK = "lamarkerja.telepon";

function suaraIndonesia(g: Gender): SpeechSynthesisVoice | null {
  return pilihSuara(window.speechSynthesis.getVoices(), g) as SpeechSynthesisVoice | null;
}

function muatRekap(): Rekap[] {
  try {
    const d = JSON.parse(localStorage.getItem(RK) ?? "[]") as unknown;
    return Array.isArray(d) ? (d as Rekap[]).filter((r) => r && typeof r.skor === "number") : [];
  } catch {
    return [];
  }
}

function simpanRekap(list: Rekap[]) {
  try {
    localStorage.setItem(RK, JSON.stringify(list));
  } catch {
    /* storage penuh — riwayat dilewati, bukan error */
  }
}

export default function Telepon({
  resume,
  job,
  daftar,
  dari,
  onTutup,
  onToast,
}: {
  resume: Resume;
  job: Job;
  daftar: Tanya[];
  dari?: { position: string; company: string; description?: string } | null;
  onTutup: () => void;
  onToast: (s: string) => void;
}) {
  const lowongan = useMemo<Job>(
    () => ({
      ...job,
      position: dari?.position || job.position,
      company: dari?.company || job.company,
      description: dari?.description || job.description,
    }),
    [job, dari],
  );

  const [panjang, setPanjang] = useState<Panjang>("5");
  const qt = useMemo(() => daftarTelepon(daftar, panjang), [daftar, panjang]);

  const [fase, setFase] = useState<"siap" | "tanya" | "dengar" | "selesai">("siap");
  const [idx, setIdx] = useState(0);
  const [giliran, setGiliran] = useState<Giliran[]>([]);
  const [tmp, setTmp] = useState("");
  const [detik, setDetik] = useState(0);
  const [hasil, setHasil] = useState<Laporan | null>(null);
  const [ketik, setKetik] = useState(!SR);
  const [suaraHrd, setSuaraHrd] = useState(TTS);
  const [ketikIsi, setKetikIsi] = useState("");
  const [catatanSuara, setCatatanSuara] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>("wanita");
  const [laju, setLaju] = useState<keyof typeof LAJU>("sedang");
  const [galak, setGalak] = useState(false);
  const [pakaiAi, setPakaiAi] = useState(true);
  const [aiSibuk, setAiSibuk] = useState(false);
  const [catatanAi, setCatatanAi] = useState<string | null>(null);
  const [susulanTeks, setSusulanTeks] = useState<string | null>(null);
  const [rekap, setRekap] = useState<Rekap[]>(muatRekap);

  const rec = useRef<Pendengar | null>(null);
  const acc = useRef("");
  /** Sudah ada kata yang dikenali di jawaban ini? (pelindung dari potong-diam & onend dini) */
  const adaSuara = useRef(false);
  /** Potongan final terakhir — Chrome bisa mengirim hasil yang sama dua kali; jangan dobel. */
  const akhir = useRef("");
  const akhirBicara = useRef(0);
  const mulai = useRef(0);
  const jalan = useRef(false);
  /** idx pertanyaan yang jawabannya sudah masuk transkrip — penjaga dari simpan ganda. */
  const sudahSimpan = useRef(-1);
  /**
   * Sumber kebenaran idx & giliran untuk `simpan`. Handler mic (`onresult`/`onend`) dan ticker
   * dijalankan dari closure render lama — `idx`/`giliran` dari state di sana basi, dulu itu bikin
   * jawaban pertanyaan ke-2 dst. dibuang diam-diam (nomor pertanyaan tidak maju).
   */
  const idxRef = useRef(0);
  const giliranRef = useRef<Giliran[]>([]);
  const tanyaLagi = useRef(false);
  const negur = useRef(0);
  const sesiRef = useRef(0);
  const faseRef = useRef(fase);
  faseRef.current = fase;
  giliranRef.current = giliran;

  useEffect(() => {
    if (!TTS) return;
    const segarkan = () => void suaraIndonesia(gender);
    segarkan();
    window.speechSynthesis.addEventListener("voiceschanged", segarkan);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", segarkan);
  }, [gender]);

  useEffect(
    () => () => {
      lepas(rec.current);
      rec.current = null;
      if (TTS) window.speechSynthesis.cancel();
    },
    [],
  );

  /** Ticker: hitung detik jawaban, akhiri saat pemakai diam atau melewati batas. */
  useEffect(() => {
    if (fase !== "dengar" || ketik) return;
    const t = setInterval(() => {
      if (jalan.current) return;
      const kini = Date.now();
      setDetik(Math.round((kini - mulai.current) / 1000));
      const diam = (kini - akhirBicara.current) / 1000;
      // Belum ada satu kata pun yang dikenali: jangan potong jawaban pemakai (dulu ini yang
      // membuat semua jawaban "dilewati" sebelum sempat bicara). Cukup beri tahu.
      if (!adaSuara.current) {
        if (diam > BATAS_BISU) {
          setCatatanSuara("Belum terdengar suara — mikrofon masih menyala, bicara saja. Atau tekan “Lewati”.");
          akhirBicara.current = kini;
        }
        return;
      }
      if (diam > JEDA_SELESAI || (kini - mulai.current) / 1000 > BATAS_JAWAB) selesaikanJawab();
    }, 350);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, ketik, idx]);

  function bicara(teks: string) {
    return new Promise<void>((selesai) => {
      if (!TTS || !suaraHrd) return selesai();
      window.speechSynthesis.cancel();
      const set = LAJU[laju] ?? LAJU.sedang!;
      const u = new SpeechSynthesisUtterance(teks);
      u.lang = "id-ID";
      u.rate = set.rate;
      u.pitch = set.pitch * (gender === "pria" ? 0.86 : 1);
      const v = suaraIndonesia(gender);
      if (v) u.voice = v;
      u.onend = () => selesai();
      u.onerror = () => selesai();
      window.speechSynthesis.speak(u);
      // Jaring pengaman: sebagian browser tidak pernah memanggil onend.
      setTimeout(selesai, Math.max(4000, teks.length * 95));
    });
  }

  async function mulaiSesi() {
    setGiliran([]);
    giliranRef.current = [];
    setHasil(null);
    setTmp("");
    setKetikIsi("");
    setIdx(0);
    idxRef.current = 0;
    setCatatanAi(null);
    setAiSibuk(false);
    tanyaLagi.current = false;
    negur.current = 0;
    sudahSimpan.current = -1;
    setFase("tanya");
    await bicara(pembuka(resume, lowongan, qt.length, namaHrd(gender)));
    void tanyaKe(0);
  }

  async function tanyaKe(i: number) {
    if (i >= qt.length) return selesaikanSesi();
    setIdx(i);
    idxRef.current = i;
    setFase("tanya");
    setTmp("");
    setDetik(0);
    setKetikIsi("");
    tanyaLagi.current = false;
    setSusulanTeks(null);
    await bicara(qt[i]!.q);
    mulai.current = Date.now();
    akhirBicara.current = mulai.current;
    if (ketik || !SR) {
      jalan.current = false;
      setFase("dengar");
    } else dengar();
  }

  /** Buang instance lama: handler dimatikan dulu, jadi `onend` telatnya tidak ikut memotong jawaban baru. */
  function lepas(r: Pendengar | null) {
    if (!r) return;
    r.mati = true;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try {
      r.stop();
    } catch {
      /* sudah berhenti */
    }
  }

  function dengar() {
    if (!SR) return;
    lepas(rec.current);
    jalan.current = false;
    acc.current = "";
    akhir.current = "";
    adaSuara.current = false;
    mulai.current = Date.now();
    akhirBicara.current = Date.now();
    setTmp("");
    setDetik(0);
    setCatatanSuara(null);
    const r = new SR();
    r.lang = "id-ID";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      if (rec.current !== r || r.mati) return;
      let sementara = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) {
          const potong = t.trim();
          if (potong && potong !== akhir.current) {
            acc.current = `${acc.current} ${potong}`.trim();
            akhir.current = potong;
          }
        } else sementara += t;
      }
      adaSuara.current = true;
      // setTmp dengan pembanding: hasil sementara yang sama tidak memicu render ulang (sumber kedip).
      const teks = `${acc.current} ${sementara}`.trim();
      setTmp((lama) => (lama === teks ? lama : teks));
      akhirBicara.current = Date.now();
    };
    r.onerror = (e) => {
      if (rec.current !== r || r.mati) return;
      const kode = e.error ?? "";
      if (kode === "not-allowed" || kode === "service-not-allowed") {
        setCatatanSuara("Mikrofon ditolak browser — pakai mode ketik, atau izinkan mikrofon lalu ulangi.");
        setKetik(true);
      } else if (kode === "no-speech") {
        setCatatanSuara("Belum terdengar suara — coba bicara lebih dekat ke mikrofon.");
      } else if (kode === "network") {
        setCatatanSuara("Pengenal suara butuh internet (layanan browser) — mode ketik tetap jalan.");
      } else if (kode) {
        setCatatanSuara(`Kendala mikrofon: ${kode}.`);
      }
    };
    r.onend = () => {
      if (rec.current !== r || r.mati) return;
      if (faseRef.current !== "dengar" || jalan.current) return;
      // Chrome menutup pengenal sendiri sebelum pemakai sempat bicara → nyalakan lagi,
      // jangan langsung dianggap "dilewati".
      if (!adaSuara.current && (r.ulang ?? 0) < ULANG_DENGAR) {
        r.ulang = (r.ulang ?? 0) + 1;
        try {
          r.start();
          return;
        } catch {
          /* gagal nyala ulang → lanjut ke penyelesaian di bawah */
        }
      }
      selesaikanJawab();
    };
    rec.current = r;
    setFase("dengar");
    try {
      r.start();
    } catch {
      setCatatanSuara("Mikrofon gagal dinyalakan — pakai mode ketik.");
      setKetik(true);
    }
  }

  function selesaikanJawab() {
    if (jalan.current) return;
    jalan.current = true;
    lepas(rec.current);
    rec.current = null;
    // Keluar dari fase "dengar" SEBELUM TTS lanjutan berbunyi: ticker ikut mati, jadi jawaban
    // yang sudah tersimpan tidak tersimpan lagi selama HRD bicara (penyebab transkrip dobel +
    // pertanyaan terakhir diulang-ulang). `jalan` baru dibuka lagi saat mulai mendengar.
    setFase("tanya");
    const jawaban = acc.current.trim();
    setTimeout(() => simpan(jawaban), 0);
  }

  function simpan(jawaban: string) {
    const pakaiDetik = () => Math.max(1, Math.round((Date.now() - mulai.current) / 1000));

    // Jawaban kedua untuk pertanyaan yang sama = jawaban susulan (HRD galak) → digabung ke giliran terakhir.
    if (tanyaLagi.current) {
      tanyaLagi.current = false;
      const arr = [...giliranRef.current];
      const i = arr.length - 1;
      const last = arr[i];
      if (last && jawaban.trim()) arr[i] = { ...last, jawaban: `${last.jawaban} ${jawaban}`.trim(), detik: last.detik + pakaiDetik(), susulan: last.susulan ?? susulanTeks ?? undefined };
      setGiliran(arr);
      setTmp("");
      if (arr.length >= qt.length) return void selesaikanSesi(arr);
      void (async () => {
        await bicara(kalimatSela(arr.length));
        if (faseRef.current !== "selesai") void tanyaKe(arr.length);
      })();
      return;
    }

    // Satu pertanyaan = satu jawaban di transkrip. Ticker/onend bisa memanggil simpan lagi
    // setelah jawaban masuk (dulu ini bikin teks jawaban dobel & pertanyaan terakhir diulang).
    const kini = idxRef.current;
    if (kini === sudahSimpan.current) return;
    sudahSimpan.current = kini;

    const g: Giliran = {
      q: qt[kini]?.q ?? "",
      jawaban,
      detik: pakaiDetik(),
      kunci: qt[kini]?.kunci ?? [],
    };
    const daftarBaru = [...giliranRef.current, g];
    setGiliran(daftarBaru);
    setTmp("");

    // HRD galak: satu pertanyaan susulan per pertanyaan, hanya kalau jawabannya kurang isi.
    const susulan = galak ? lanjutan(g, nilaiJawaban(g), negur.current) : null;
    if (susulan) {
      negur.current++;
      tanyaLagi.current = true;
      setSusulanTeks(susulan);
      void (async () => {
        await bicara(susulan);
        if (faseRef.current === "selesai") return;
        mulai.current = Date.now();
        akhirBicara.current = mulai.current;
        setTmp("");
        setDetik(0);
        setKetikIsi("");
        if (ketik || !SR) {
          jalan.current = false;
          setFase("dengar");
        } else dengar();
      })();
      return;
    }

    if (daftarBaru.length >= qt.length) return void selesaikanSesi(daftarBaru);
    void (async () => {
      await bicara(kalimatSela(daftarBaru.length));
      if (faseRef.current !== "selesai") void tanyaKe(daftarBaru.length);
    })();
  }

  async function selesaikanSesi(daftarGiliran?: Giliran[]) {
    const semua = daftarGiliran ?? giliran;
    const h = buatLaporan(semua, resume.basics.name.split(" ")[0] ?? "");
    setFase("selesai");
    setHasil(h);
    sesiRef.current++;
    const r = rekapDari(h, lowongan.position, lowongan.company, Date.now(), `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
    const baru = tambahRekap(rekap, r, MAKS_REKAP);
    setRekap(baru);
    simpanRekap(baru);
    void bicara(penutup(h));
    if (pakaiAi) void nilaiAi(h, semua, r.id);
  }

  /** Penilaian AI atas transkrip. Laporan lokal sudah tampil; ini hanya menimpanya kalau AI menjawab masuk akal. */
  async function nilaiAi(lokal: Laporan, semua: Giliran[], id: string) {
    const sesi = sesiRef.current;
    setAiSibuk(true);
    setCatatanAi(null);
    try {
      const ai = await nilaiTelepon(lowongan, semua, semua.map((g) => nilaiJawaban(g)), lokal, aiCfg());
      if (sesi !== sesiRef.current) return;
      setHasil(ai);
      setCatatanAi("Skor, putusan, dan catatan di bawah dinilai AI dari transkripmu.");
      setRekap((list) => {
        const ubah = list.map((x) => (x.id === id ? { ...x, skor: ai.skor, nada: ai.nada, ai: true } : x));
        simpanRekap(ubah);
        return ubah;
      });
    } catch (e) {
      if (sesi !== sesiRef.current) return;
      setCatatanAi(`${(e as Error).message} Angka di bawah dari penilai lokal.`);
    } finally {
      if (sesi === sesiRef.current) setAiSibuk(false);
    }
  }

  function jawabKetik() {
    const isi = ketikIsi.trim();
    if (!isi) return onToast("Tulis dulu jawabanmu, atau tekan Lewati.");
    setKetikIsi("");
    simpan(isi);
  }

  async function salin() {
    if (!hasil) return;
    try {
      await navigator.clipboard.writeText(transkrip(giliran, hasil));
      onToast("Transkrip + simpanan hasil tersalin.");
    } catch {
      onToast("Clipboard diblokir browser — blok teksnya lalu salin manual.");
    }
  }

  const nilaiKini = useMemo(() => giliran.map((g) => nilaiJawaban(g)), [giliran]);
  const warna = hasil?.nada === "lolos" ? "text-brand" : hasil?.nada === "pertimbang" ? "text-accent" : "text-danger";

  return (
    <div className="no-print fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-surface">
      <div className="mx-auto w-full max-w-2xl p-3 pb-24 lg:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${fase === "selesai" ? "bg-surface2 text-mute" : "bg-brand text-white"}`}>
            <Icon name="mic" className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold">Panggilan wawancara — {lowongan.company || "perusahaan"}</h2>
            <p className="text-[11px] text-mute">
              {fase === "siap" ? "Belum tersambung" : fase === "selesai" ? "Panggilan berakhir" : `Pertanyaan ${idx + 1} dari ${qt.length}`}
            </p>
          </div>
          <Btn icon="x" variant="ghost" onClick={onTutup}>
            Tutup
          </Btn>
        </div>

        {fase === "siap" ? (
          <Card icon="info" title="Mulai simulasi telepon" desc="HRD bicara lewat speaker, kamu jawab lewat suara — seperti wawancara sungguhan.">
            <div className="mb-3">
              <Segmented
                value={panjang}
                onChange={setPanjang}
                items={[
                  { value: "3", label: "Cepat (3)" },
                  { value: "5", label: "Standar (5)" },
                  { value: "semua", label: `Semua (${daftar.length})` },
                ]}
              />
            </div>
            <div className="mb-3 space-y-2">
              <Switch checked={suaraHrd} onChange={setSuaraHrd} label={TTS ? "Suara HRD dibacakan" : "Browser ini tidak punya pembaca suara"} />
              <Switch checked={ketik} onChange={setKetik} label={SR ? "Mode ketik (tanpa mikrofon)" : "Mode ketik — browser ini tidak punya pengenal suara"} />
              <Switch checked={galak} onChange={setGalak} label="HRD galak — tanya susulan kalau jawaban kurang isi" />
              <Switch checked={pakaiAi} onChange={setPakaiAi} label="Nilai pakai AI setelah sesi (tanpa AI → penilai lokal)" />
            </div>

            {TTS && suaraHrd ? (
              <div className="mb-3 grid gap-2 min-[420px]:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-mute">Pengawancara</p>
                  <Segmented
                    value={gender}
                    onChange={setGender}
                    items={[
                      { value: "wanita", label: "Bu Rina" },
                      { value: "pria", label: "Pak Andika" },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-mute">Tempo bicara</p>
                  <Segmented
                    value={laju}
                    onChange={(v) => setLaju(v as keyof typeof LAJU)}
                    items={[
                      { value: "pelan", label: "Pelan" },
                      { value: "sedang", label: "Sedang" },
                      { value: "cepat", label: "Cepat" },
                    ]}
                  />
                </div>
              </div>
            ) : null}

            <ul className="mb-3 space-y-1 text-[11px] text-mute">
              <li>• Pakai headphone biar suara HRD tidak tertangkap mikrofon kamu sendiri.</li>
              <li>• Jawab 1–2 menit; selesai otomatis saat kamu diam {JEDA_SELESAI} detik, atau tekan “Selesai jawab”.</li>
              <li>• Pengenal suara memakai layanan browser (perlu internet & izin mikrofon); tidak ada rekaman yang dikirim ke server kami.</li>
              <li>• Hasil, skor, dan catatan diumumkan di akhir sesi.</li>
            </ul>
            <Btn icon="mic" variant="primary" onClick={mulaiSesi} disabled={qt.length === 0}>
              Mulai panggilan ({qt.length} pertanyaan)
            </Btn>

            {rekap.length > 0 ? (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-mute">
                    <Icon name="clock" className="size-3" /> Riwayat sesi ({rekap.length})
                  </p>
                  <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-mute tabular-nums">
                    rata-rata {rataRekap(rekap) ?? 0}
                  </span>
                  {trenRekap(rekap) !== null ? (
                    <span className={`text-[11px] font-semibold tabular-nums ${trenRekap(rekap)! >= 0 ? "text-brand" : "text-danger"}`}>
                      {trenRekap(rekap)! >= 0 ? "+" : ""}
                      {trenRekap(rekap)} dari sesi sebelumnya
                    </span>
                  ) : null}
                  <Btn
                    icon="trash"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      setRekap([]);
                      simpanRekap([]);
                      onToast("Riwayat sesi telepon dihapus.");
                    }}
                  >
                    Hapus riwayat
                  </Btn>
                </div>
                <ul className="space-y-1">
                  {rekap.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-xl bg-surface2 px-2.5 py-1.5 text-[11px]">
                      <span className={`font-bold tabular-nums ${r.nada === "lolos" ? "text-brand" : r.nada === "pertimbang" ? "text-accent" : "text-danger"}`}>
                        {r.skor}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {r.posisi || "posisi ini"}
                        {r.perusahaan ? ` — ${r.perusahaan}` : ""}
                      </span>
                      {r.ai ? <span className="rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand">AI</span> : null}
                      <span className="shrink-0 text-mute tabular-nums">
                        {r.tanya} tanya{r.kosong ? ` · ${r.kosong} lewat` : ""} ·{" "}
                        {new Date(r.waktu).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-mute">Disimpan di browser ini saja (localStorage), maksimal {MAKS_REKAP} sesi terakhir.</p>
              </div>
            ) : null}
          </Card>
        ) : null}

        {fase !== "siap" && !hasil ? (
          <div className="space-y-2">
            {giliran.map((g, i) => (
              <div key={`${i}-${g.q}`} className="space-y-2">
                <Bubble siapa="hrd" teks={g.q} />
                <Bubble
                  siapa="saya"
                  teks={g.jawaban || "(dilewati)"}
                  label={`skor ${nilaiKini[i]?.skor ?? 0}/100 · ${nilaiKini[i]?.kata ?? 0} kata · ${g.detik}s`}
                />
              </div>
            ))}

            {fase === "tanya" ? <Bubble siapa="hrd" teks={qt[idx]?.q ?? ""} hidup /> : null}
            {fase === "dengar" && idx >= giliran.length ? <Bubble siapa="hrd" teks={qt[idx]?.q ?? ""} /> : null}
            {susulanTeks && fase === "dengar" ? <Bubble siapa="hrd" teks={susulanTeks} /> : null}
            {fase === "dengar" ? (
              <Bubble
                siapa="saya"
                teks={tmp || (ketik ? "" : "…")}
                hidup
                label={ketik ? undefined : detik ? `merekam ${detik}s` : "merekam"}
              />
            ) : null}
            {fase === "tanya" && ketik ? <Bubble siapa="hrd" teks="(mode ketik) tulis jawabanmu di bawah." /> : null}
            {catatanSuara ? <p className="rounded-xl bg-surface2 px-3 py-2 text-[11px] text-mute">ℹ️ {catatanSuara}</p> : null}
          </div>
        ) : null}

        {hasil ? (
          <Card icon="target" title="Hasil wawancara" desc={hasil.ringkas}>
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-surface2 p-3">
              <div className={`grid size-16 shrink-0 place-items-center rounded-full bg-surface ${warna}`}>
                <span className="text-xl font-bold tabular-nums">{hasil.skor}</span>
                <span className="text-[9px] text-mute">dari 100</span>
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold ${warna}`}>{hasil.putusan}</p>
                <p className="text-[11px] text-mute">
                  {hasil.perGiliran.length} pertanyaan dijawab{hasil.kosong ? `, ${hasil.kosong} dilewati` : ""} ·{" "}
                  {hasil.dinilaiAi
                    ? "dinilai AI dari transkripmu."
                    : "nilai lokal dari panjang jawaban, kecocokan kunci, tempo, dan kata pengisi."}
                </p>
              </div>
            </div>

            {aiSibuk ? (
              <p className="mb-3 flex items-center gap-2 rounded-xl bg-surface2 px-3 py-2 text-[11px] text-mute">
                <Icon name="loader" className="size-3.5 animate-spin-slow" />
                Menilai ulang jawabanmu pakai AI…
              </p>
            ) : null}
            {catatanAi && !aiSibuk ? (
              <p className={`mb-3 rounded-xl px-3 py-2 text-[11px] ${hasil.dinilaiAi ? "bg-brand/12 text-ink" : "bg-surface2 text-mute"}`}>
                {hasil.dinilaiAi ? "✨ " : "ℹ️ "}
                {catatanAi}
              </p>
            ) : null}

            {hasil.kuat.length > 0 && (
              <ul className="mb-3 space-y-1">
                {hasil.kuat.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-[11px] text-ink">
                    <Icon name="check" className="mt-[2px] size-3 shrink-0 text-brand" />
                    {k}
                  </li>
                ))}
              </ul>
            )}
            {hasil.perbaiki.length > 0 && (
              <ul className="mb-3 space-y-1">
                {hasil.perbaiki.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-[11px] text-ink">
                    <Icon name="alert" className="mt-[2px] size-3 shrink-0 text-brand" />
                    {k}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-line pt-3">
              {hasil.perGiliran.map((p, i) => (
                <details key={`${i}-${p.q}`} className="rounded-xl bg-surface2 p-2">
                  <summary className="cursor-pointer list-none text-xs font-semibold">
                    {i + 1}. {p.q} — <span className="text-mute">skor {p.skor}</span>
                  </summary>
                  <p className="mt-1 text-[11px] text-mute">“{giliran[i]?.jawaban || "(dilewati)"}”</p>
                  <ul className="mt-1 space-y-1">
                    {p.catatan.map((c, j) => (
                      <li key={`${j}-${c}`} className="text-[11px] text-mute">• {c}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn icon="copy" onClick={salin}>Salin transkrip</Btn>
              <Btn icon="mic" onClick={mulaiSesi}>Ulangi sesi</Btn>
              <Btn icon="x" variant="ghost" onClick={onTutup}>Tutup</Btn>
            </div>
          </Card>
        ) : null}

        {fase === "dengar" && !hasil ? (
          <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-3">
            <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
              {ketik ? (
                <>
                  <textarea
                    value={ketikIsi}
                    onChange={(e) => setKetikIsi(e.target.value)}
                    rows={2}
                    placeholder="Tulis jawabanmu seperti kamu menjawab lisan…"
                    className="min-h-11 min-w-[12rem] flex-1 resize-y rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-brand focus-visible:outline-2"
                  />
                  <Btn icon="check" variant="primary" onClick={jawabKetik}>Kirim jawaban</Btn>
                </>
              ) : (
                <span className="flex items-center gap-2 text-[11px] text-mute">
                  <span className="size-2 animate-pulse rounded-full bg-danger" />
                  Mendengarkan… bicara saja, selesai otomatis saat kamu diam.
                </span>
              )}
              {!ketik ? <Btn icon="check" onClick={selesaikanJawab}>Selesai jawab</Btn> : null}
              <Btn
                icon="x"
                variant="ghost"
                onClick={() => {
                  lepas(rec.current);
                  rec.current = null;
                  simpan("");
                }}
              >
                Lewati
              </Btn>
              <IconToggle ketik={ketik} setKetik={setKetik} adaSr={Boolean(SR)} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Bubble({ siapa, teks, hidup, label }: { siapa: "hrd" | "saya"; teks: string; hidup?: boolean; label?: string }) {
  const hrd = siapa === "hrd";
  return (
    <div className={`flex ${hrd ? "" : "justify-end"}`}>
      <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${hrd ? "bg-surface2 text-ink" : "bg-brand/12 text-ink"}`}>
        <p className="text-[10px] font-semibold tracking-wide text-mute uppercase">{hrd ? "HRD" : "Kamu"}</p>
        <p className="whitespace-pre-wrap">
          {teks}
          {hidup ? <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-brand align-middle" /> : null}
        </p>
        {label ? <p className="mt-1 text-[10px] text-mute">{label}</p> : null}
      </div>
    </div>
  );
}

function IconToggle({ ketik, setKetik, adaSr }: { ketik: boolean; setKetik: (v: boolean) => void; adaSr: boolean }) {
  if (!adaSr) return null;
  return (
    <Btn icon="pen" variant="ghost" onClick={() => setKetik(!ketik)} title="Ganti mode suara/ketik">
      {ketik ? "Pakai suara" : "Pakai ketik"}
    </Btn>
  );
}
