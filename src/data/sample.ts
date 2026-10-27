import type { Job, Resume } from "../types";

/** Data awal — diisi otomatis di tab Profil. Lengkapi lewat form. */
export const sampleResume: Resume = {
  basics: {
    name: "Abdul Rahman",
    label: "Frontend Developer",
    email: "",
    phone: "",
    city: "Jakarta, Indonesia",
    github: "github.com/M4sr",
    linkedin: "",
    summary:
      "Frontend developer dengan 4 tahun pengalaman membangun aplikasi web berbasis React dan Next.js. Terbiasa menangani aplikasi produksi dengan ribuan pengguna, integrasi API, dan optimasi performa halaman.",
  },
  work: [
    {
      company: "PT Nusantara Digital",
      position: "Frontend Developer",
      start: "2023-02",
      end: "sekarang",
      location: "Jakarta",
      highlights: [
        "Membangun dashboard internal dengan Next.js 15 dan TypeScript yang dipakai 1.200 karyawan harian.",
        "Memangkas waktu muat halaman utama 4,1 detik menjadi 1,3 detik lewat code splitting dan caching.",
        "Menangani integrasi REST API dan autentikasi berbasis token untuk 30+ endpoint.",
      ],
    },
  ],
  education: [
    { school: "Universitas Teknologi Indonesia", degree: "S1 Teknik Informatika", start: "2017", end: "2021", note: "3,45" },
  ],
  projects: [
    {
      name: "Kasirku",
      url: "github.com/M4sr/kasirku",
      description: "Aplikasi kasir web untuk kedai kopi, dengan laporan penjualan harian dan ekspor CSV.",
      highlights: ["Dipakai 8 kedai, 300+ transaksi per hari."],
    },
  ],
  skills: [
    { name: "Bahasa", keywords: ["TypeScript", "JavaScript", "HTML", "CSS", "SQL"] },
    { name: "Framework", keywords: ["React", "Next.js", "Tailwind CSS", "Node.js"] },
    { name: "Alat", keywords: ["Git", "Figma", "Vite", "Supabase"] },
  ],
};

export const emptyJob: Job = {
  position: "",
  company: "",
  source: "JobStreet",
  url: "",
  description: "",
};
