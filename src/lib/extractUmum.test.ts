import assert from "node:assert/strict";
import { test } from "node:test";
import { hostPrivat, parseEmbeddedJob, parseJsonLdJob, parseJobAny, sumberDariUrl } from "./extract.ts";

// ---- JSON-LD (pola Lever / situs karier perusahaan) ----
const LEVER = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer","datePosted":"2026-10-01",
"hiringOrganization":{"@type":"Organization","name":"PT Contoh Digital"},
"jobLocation":{"@type":"Place","address":{"addressLocality":"Jakarta Selatan","addressRegion":"DKI Jakarta"}},
"description":"<p>Kami mencari backend engineer.</p><ul><li>Menguasai Node.js dan PostgreSQL</li><li>Terbiasa dengan CI/CD</li></ul>"}
</script></head><body>halaman</body></html>`;

test("parseJsonLdJob: ambil judul, perusahaan, lokasi, dan JD", () => {
  const j = parseJsonLdJob(LEVER, "Lever", "https://jobs.lever.co/x/y");
  assert.equal(j?.position, "Backend Engineer");
  assert.equal(j?.company, "PT Contoh Digital");
  assert.equal(j?.source, "Lever");
  assert.match(j?.description ?? "", /Node\.js dan PostgreSQL/);
  assert.match(j?.description ?? "", /Jakarta Selatan/);
});

test("parseJsonLdJob: @graph dan array @type ikut terbaca", () => {
  const html = `<script type="application/ld+json">
  {"@graph":[{"@type":["WebPage","JobPosting"],"title":"Data Analyst","hiringOrganization":{"name":"Toko ABC"},"description":"<p>Analisis data penjualan harian dengan SQL dan Python untuk laporan mingguan manajemen.</p>"}]}
  </script>`;
  const j = parseJsonLdJob(html);
  assert.equal(j?.position, "Data Analyst");
  assert.equal(j?.company, "Toko ABC");
});

// ---- JSON tertanam: Next.js __NEXT_DATA__ (pola Kalibrr) + kamus i18n sebagai pengganggu ----
const I18N = { homepageJobs: { tips: { createCv: { title: "Tips CV", description: "Buat CV menarik agar dilirik rekruter dan lolos sistem ATS modern." } } } };
const NEXT_DATA = {
  props: {
    pageProps: {
      i18n: I18N,
      jobs: [
        {
          id: 273253,
          name: "Network Engineer CCNA",
          companyName: "PT Mastersystem Infotama",
          description:
            "<ul><li>Handle implementation dan maintenance proyek jaringan Cisco untuk klien perbankan, termasuk konfigurasi router dan switch.</li><li>Melakukan troubleshooting insiden jaringan bersama tim NOC.</li></ul>",
          qualifications:
            "<ul><li>Sarjana Teknik Informatika atau setara, paham routing &amp; switching, bersedia onsite di Jakarta.</li><li>Punya sertifikasi CCNA menjadi nilai tambah.</li></ul>",
          googleLocation: { addressComponents: { city: "Kota Jakarta Pusat", country: "Indonesia" } },
          tenure: "Full time",
        },
        {
          id: 1,
          name: "Guru Matematika",
          companyName: "SMA Nusantara",
          description: "<p>Mengajar matematika kelas 10-12 dengan kurikulum merdeka, menyusun modul ajar.</p>",
          qualifications: "<p>S1 Pendidikan Matematika, sabar menghadapi siswa, komunikatif.</p>",
        },
      ],
    },
  },
};

test("parseEmbeddedJob: pilih lowongan dengan JD terpanjang, abaikan kamus i18n", () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(NEXT_DATA)}</script>`;
  const j = parseEmbeddedJob(html, "Kalibrr");
  assert.equal(j?.position, "Network Engineer CCNA");
  assert.equal(j?.company, "PT Mastersystem Infotama");
  assert.match(j?.description ?? "", /routing & switching/);
  assert.match(j?.description ?? "", /Teknik Informatika/);
});

test("parseEmbeddedJob: struktur react-query (pola Dealls) ikut kebaca", () => {
  const data = {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [
            {
              state: {
                data: {
                  title: "Senior Software Programmer",
                  company: { name: "PT Reemotely", description: "Perusahaan teknologi yang membangun produk SaaS untuk pasar Asia Tenggara." },
                  responsibilities:
                    "<p>Membangun dan merawat layanan backend Node.js untuk produk SaaS, menulis pengujian otomatis, memantau performa produksi, serta berkolaborasi dengan tim produk dan QA setiap sprint.</p>",
                  requirements:
                    "<p>Minimal 4 tahun pengalaman sebagai software engineer, menguasai TypeScript, Node.js, PostgreSQL, Docker, dan terbiasa bekerja dengan Git serta code review.</p>",
                  city: "Jakarta",
                },
              },
            },
          ],
        },
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  const j = parseEmbeddedJob(html, "Dealls");
  assert.equal(j?.position, "Senior Software Programmer");
  assert.equal(j?.company, "PT Reemotely");
  assert.match(j?.description ?? "", /TypeScript, Node\.js, PostgreSQL, Docker/);
});

test("parseEmbeddedJob: halaman tanpa data lowongan → null", () => {
  const html = `<html><body><script type="application/json">{"foo":{"title":"Beranda","description":"Selamat datang di situs kami."}}</script></body></html>`;
  assert.equal(parseEmbeddedJob(html, "Situs"), null);
});

test("parseJobAny: LinkedIn tetap pakai parser khusus, situs lain lewat JSON-LD", () => {
  const lk = `<h1 class="topcard__title">Frontend Engineer</h1><a class="topcard__org-name-link" href="#">Traveloka</a>
  <span class="topcard__flavor topcard__flavor--bullet">Jakarta</span>
  <div class="show-more-less-html__markup">Kembangkan UI dengan React dan TypeScript.</div>
  <div class="description__job-criteria-list">x</div>`;
  assert.equal(parseJobAny(lk, "LinkedIn").company, "Traveloka");
  assert.equal(parseJobAny(LEVER, "Lever").position, "Backend Engineer");
});

test("sumberDariUrl: label yang dikenal + hostname lain apa adanya", () => {
  assert.equal(sumberDariUrl("https://www.kalibrr.id/id-ID/jobs/1/x"), "Kalibrr");
  assert.equal(sumberDariUrl("https://glints.com/id/opportunities/jobs/x/y"), "Glints");
  assert.equal(sumberDariUrl("https://id.indeed.com/viewjob?jk=1"), "Indeed");
  assert.equal(sumberDariUrl("https://karier.perusahaan.co.id/lowongan/1"), "karier.perusahaan.co.id");
});

test("hostPrivat: tolak loopback dan jaringan lokal, izinkan host publik", () => {
  for (const u of ["http://localhost:5177/", "http://127.0.0.1/", "http://192.168.1.10/x", "http://169.254.169.254/", "http://10.0.0.5/", "http://[::1]/", "http://router.local/"]) {
    assert.equal(hostPrivat(u), true, u);
  }
  for (const u of ["https://glints.com/x", "https://8.8.8.8/"]) assert.equal(hostPrivat(u), false, u);
});
