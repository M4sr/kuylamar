import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

const P = {
  file: ["M15 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6z", "M15 2v4h4", "M9 13h6", "M9 17h4"],
  link: ["M9 17H7A5 5 0 0 1 7 7h2", "M15 7h2a5 5 0 0 1 0 10h-2", "M8 12h8"],
  print: ["M6 9V3h12v6", "M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2", "M6 14h12v7H6z"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M4 21h16"],
  upload: ["M12 21V9", "M7 14l5-5 5 5", "M4 3h16"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  sun: ["M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  plus: ["M12 5v14", "M5 12h14"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 14h10l1-14"],
  check: ["M20 6 9 17l-5-5"],
  alert: ["M12 3l9 16H3z", "M12 9v5", "M12 17h.01"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5", "M12 8h.01"],
  briefcase: ["M4 7h16v13H4z", "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  target: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z", "M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"],
  spark: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", "M19 16l.7 1.8L21.5 19l-1.8.7L19 21.5l-.7-1.8L16.5 19l1.8-.7z"],
  loader: ["M21 12a9 9 0 1 1-6.2-8.6"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  code: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6", "M14 4l-4 16"],
  pen: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  copy: ["M8 8h11v12H8z", "M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"],
  mail: ["M3 6h18v12H3z", "m3 6 9 7 9-7"],
  logout: ["M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4", "M10 17l-5-5 5-5", "M14.5 12H4"],
  mic: ["M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z", "M19 11a7 7 0 0 1-14 0", "M12 18v3", "M8 21h8"],
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {P[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

type Variant = "primary" | "soft" | "ghost" | "danger";

const V: Record<Variant, string> = {
  primary: "orn-btn-primary bg-brand text-brandink hover:brightness-110",
  soft: "bg-surface2 text-ink hover:bg-surface3 border border-line hover:border-brand/40",
  ghost: "text-mute hover:bg-surface2 hover:text-ink",
  danger: "text-danger hover:bg-danger/10",
};

/** Logo Kuylamar — pesawat kertas + jejak kirim. Ganti ikon brand di satu tempat. */
export function Logo({ className = "size-9" }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Kuylamar">
      <defs>
        <linearGradient id="klg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22c55e" />
          <stop offset="1" stopColor="#0f7a3d" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="28" fill="url(#klg)" />
      <path d="M60 10C77 30 86 52 86 74H34C34 52 43 30 60 10Z" fill="#fff" />
      <path d="M34 76 16 100 40 92Z" fill="#fff" fillOpacity=".72" />
      <path d="M86 76 104 100 80 92Z" fill="#fff" fillOpacity=".72" />
      <circle cx="60" cy="44" r="9" fill="#0f7a3d" />
      <path d="M50 94C56 104 60 112 60 112 60 112 64 104 70 94Z" fill="#f59e0b" />
    </svg>
  );
}

export function Btn({
  variant = "soft",
  icon,
  busy,
  compact,
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; busy?: boolean; compact?: boolean; size?: "md" | "sm" }) {
  // Ukuran selalu dipilih di sini, bukan ditimpa lewat className — `min-h-11` & `min-h-9` konflik
  // (properti sama, spesifisitas sama) dan pemenangnya ditentukan urutan CSS, bukan urutan string.
  const ukuran = size === "sm" ? "min-h-9 px-2 text-[11px]" : compact ? "min-h-11 px-2 text-xs lg:min-h-9" : "min-h-11 px-3 text-sm lg:min-h-9";
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl ${ukuran} font-semibold transition duration-200 outline-offset-2 outline-brand focus-visible:outline-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${V[variant]} ${className}`}
    >
      {busy ? <Icon name="loader" className="size-4 animate-spin-slow" /> : icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </button>
  );
}

export function IconBtn({
  name,
  label,
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { name: IconName; label: string; size?: "md" | "sm" }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`grid ${
        size === "sm" ? "size-9" : "size-11 lg:size-9"
      } shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-surface2 text-mute transition duration-200 hover:border-brand/40 hover:text-brand hover:shadow-[0_10px_22px_-16px_var(--glow)] active:scale-95 disabled:opacity-50 ${className}`}
    >
      <Icon name={name} className="size-[18px]" />
    </button>
  );
}

export function Card({
  icon,
  title,
  desc,
  right,
  rightClassName = "",
  children,
  className = "",
}: {
  icon?: IconName;
  title?: string;
  desc?: string;
  right?: ReactNode;
  rightClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`orn-card animate-fade-up rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {icon ? (
            <span className="orn-tile grid size-8 shrink-0 place-items-center rounded-lg">
              <Icon name={icon} className="size-[18px]" />
            </span>
          ) : null}
          <div className="min-w-[7rem] flex-1">
            <h2 className="text-sm font-bold tracking-tight">{title}</h2>
            {desc ? <p className="text-xs text-mute">{desc}</p> : null}
          </div>
          <div className={`ml-auto shrink-0 ${rightClassName}`}>{right}</div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; icon?: IconName }[];
  className?: string;
}) {
  return (
    <div className={`flex gap-1 rounded-2xl border border-line bg-surface2 p-1 ${className}`} role="tablist">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.value)}
            className={`inline-flex min-h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-1.5 text-xs font-semibold transition duration-200 active:scale-[0.97] max-[379px]:px-0.5 min-[400px]:px-2.5 ${
              on ? "orn-on bg-linear-to-b from-surface to-surface2 text-brand" : "text-mute hover:text-ink"
            }`}
          >
            {it.icon ? <Icon name={it.icon} className="hidden size-4 shrink-0 min-[400px]:block" /> : null}
            <span className="truncate">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-[11px] font-semibold tracking-wide text-mute uppercase">{children}</span>;
}

/**
 * Saklar on/off kecil (checkbox asli, jadi tetap bisa dioperasi keyboard & pembaca layar).
 * Teks label WAJIB kelihatan di samping saklar — tanpa ini deretan saklar jadi misteri
 * (4 saklar polos tanpa keterangan di layar Panggilan).
 */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-left select-none">
      <input type="checkbox" role="switch" aria-label={label} title={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative block h-6 w-11 shrink-0 rounded-full bg-surface3 transition duration-200 outline-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-brand peer-checked:bg-brand peer-checked:[&>span]:translate-x-5">
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition duration-200" />
      </span>
      <span className="text-sm leading-snug text-ink/85">{label}</span>
    </label>
  );
}

/**
 * Input berbentuk label (chips): ketik lalu Enter/Tab/koma untuk menempel, ada saran dari <datalist>.
 * Tetap input teks asli — bisa diketik, ditempel, dan dioperasi keyboard.
 * `katalog` = tab kategori keahlian di bawah input: klik chip → masuk ke input, klik lagi (atau × di input) → balik ke katalog.
 */
export function Tags({
  value,
  onChange,
  saran = [],
  katalog,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  saran?: string[];
  katalog?: Record<string, string[]>;
  placeholder?: string;
}) {
  const [teks, setTeks] = useState("");
  const [tab, setTab] = useState("");
  const id = useId();
  const kategori = Object.keys(katalog ?? {});
  const aktif = tab || kategori[0] || "";

  const tambah = (t: string) => {
    const v = t.replace(/[,\s]+$/g, "").trim();
    setTeks("");
    if (!v || value.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...value, v]);
  };

  const ada = (k: string) => value.some((x) => x.toLowerCase() === k.toLowerCase());
  const pilih = (k: string) => (ada(k) ? onChange(value.filter((x) => x.toLowerCase() !== k.toLowerCase())) : tambah(k));

  // saat mengetik, cari di semua kategori sekaligus
  const cari = teks.trim().toLowerCase();
  const tampil = katalog
    ? cari
      ? Object.values(katalog).flat().filter((k) => k.toLowerCase().includes(cari) && !ada(k)).slice(0, 24)
      : (katalog[aktif] ?? [])
    : [];

  return (
    <div>
      <div className="field flex flex-wrap items-center gap-1.5 py-1.5">
        {value.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2.5 py-1 text-[11px] font-medium text-brand">
            {k}
            <button type="button" aria-label={`Hapus ${k}`} onClick={() => onChange(value.filter((x) => x !== k))} className="cursor-pointer rounded-full transition hover:bg-brand/20">
              <Icon name="x" className="size-3" />
            </button>
          </span>
        ))}
        <input
          list={id}
          value={teks}
          aria-label="Tambah keahlian"
          onChange={(e) => (e.target.value.includes(",") ? tambah(e.target.value) : setTeks(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
              e.preventDefault();
              tambah(teks);
            } else if (e.key === "Backspace" && !teks && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => tambah(teks)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-28 flex-1 bg-transparent text-sm text-ink outline-none"
        />
        <datalist id={id}>
          {saran.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      {katalog && (
        <div className="mt-2">
          <div role="tablist" aria-label="Kategori keahlian" className="flex flex-wrap gap-1.5">
            {kategori.map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={aktif === k}
                onClick={() => {
                  setTab(k);
                  setTeks("");
                }}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  aktif === k && !cari ? "bg-brand text-white shadow-sm" : "bg-surface2 text-mute hover:bg-brand/12 hover:text-brand"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tampil.map((k) => {
              const on = ada(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pilih(k)}
                  title={on ? `Keluarkan ${k}` : `Tambah ${k}`}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
                    on ? "border-brand bg-brand/12 text-brand" : "border-line bg-surface text-mute hover:border-brand/50 hover:text-brand"
                  }`}
                >
                  {k}
                  <Icon name={on ? "check" : "plus"} className="size-3 opacity-70" />
                </button>
              );
            })}
            {!tampil.length && <span className="text-[11px] text-mute">Keahlian lain — ketik di atas lalu Enter.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dialog konfirmasi milik sendiri — pengganti `window.confirm` yang tampilannya
 * tak bisa ditata, memblokir seluruh tab, dan di HP muncul sebagai popup sistem.
 * Bottom-sheet di HP, modal di desktop. Esc / klik latar = batal.
 */
export function Konfirmasi({
  judul,
  pesan,
  ya = "Lanjut",
  batal = "Batal",
  icon = "alert",
  bahaya = false,
  onYa,
  onBatal,
}: {
  judul: string;
  pesan?: string;
  ya?: string;
  batal?: string;
  icon?: IconName;
  bahaya?: boolean;
  onYa: () => void;
  onBatal: () => void;
}) {
  const id = useId();
  const kartu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fokus ke kontainer, bukan ke tombol: tanpa ring fokus yang menutupi tombol,
    // dan Tab mulai dari "Batal" — aksi destruktif tak kena Enter tak sengaja.
    kartu.current?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBatal();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onBatal]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onClick={onBatal}
      className="no-print fixed inset-0 z-50 grid place-items-end overflow-y-auto overscroll-contain bg-black/45 p-3 backdrop-blur-sm sm:place-items-center"
    >
      <div
        ref={kartu}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="orn-card animate-fade-up w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl outline-none"
      >
        <div className="flex items-start gap-2.5">
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${bahaya ? "bg-danger/12 text-danger" : "bg-brand/12 text-brand"}`}>
            <Icon name={icon} className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={id} className="text-sm font-bold tracking-tight">
              {judul}
            </h2>
            {pesan ? <p className="mt-0.5 text-xs leading-relaxed text-mute">{pesan}</p> : null}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Btn className="flex-1" onClick={onBatal}>
            {batal}
          </Btn>
          <Btn variant={bahaya ? "danger" : "primary"} className="flex-1" onClick={onYa}>
            {ya}
          </Btn>
        </div>
      </div>
    </div>
  );
}

