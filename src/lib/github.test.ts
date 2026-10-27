import assert from "node:assert/strict";
import test from "node:test";
import { dariReadme, gantiOtomatis, ghUser, mergeProjects, pilihOtomatis, rankRepos, repoToProject, type Repo } from "./github.ts";
import { rapiTautan } from "./tautan.ts";

const repo = (p: Partial<Repo> & { name: string }): Repo => ({
  description: null,
  html_url: `https://github.com/u/${p.name}`,
  homepage: null,
  language: null,
  topics: [],
  fork: false,
  archived: false,
  stargazers_count: 0,
  pushed_at: "2026-01-01T00:00:00Z",
  ...p,
});

const JD = "Kami butuh Frontend Developer menguasai React, Next.js, TypeScript, dan Tailwind CSS untuk membangun UI.";

test("ghUser: terima @user, URL, dan nama polos", () => {
  assert.equal(ghUser("@M4sr"), "M4sr");
  assert.equal(ghUser("https://github.com/M4sr/lamarkerja"), "M4sr");
  assert.equal(ghUser("  M4sr  "), "M4sr");
  assert.equal(ghUser("https://github.com/M4sr/"), "M4sr");
});

test("rankRepos: repo relevan naik, tidak relevan di bawah", () => {
  const ranked = rankRepos(
    [repo({ name: "sistem-akuntansi", description: "Aplikasi desktop payroll" }), repo({ name: "landing-next", description: "Frontend React dan Next.js dengan Tailwind CSS", language: "TypeScript" })],
    JD,
  );
  assert.equal(ranked[0].repo.name, "landing-next");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].matched.includes("tailwind") || ranked[0].matched.includes("frontend"));
  assert.equal(ranked[1].score, 0);
});

test("rankRepos: fork & arsip disembunyikan, muncul jika diminta", () => {
  const fork = repo({ name: "awesome-selfhosted", fork: true });
  const arch = repo({ name: "react", archived: true });
  assert.equal(rankRepos([fork, arch], JD).length, 0);
  assert.equal(rankRepos([fork, arch], JD, true).length, 1);
});

test("rankRepos: tanpa JD tetap mengembalikan semua repo (urut terbaru)", () => {
  const r = rankRepos([repo({ name: "a", pushed_at: "2026-01-01T00:00:00Z" }), repo({ name: "b", pushed_at: "2026-05-01T00:00:00Z" })], "");
  assert.deepEqual(r.map((x) => x.repo.name), ["b", "a"]);
  assert.equal(r[0].score, 0);
});

test("repoToProject: nama dirapikan, topik jadi teknologi", () => {
  const p = repoToProject(repo({ name: "lamar-kerja", description: "  Buat CV cepat  ", language: "TypeScript", topics: ["react", "tailwind"] }));
  assert.equal(p.name, "Lamar Kerja");
  assert.equal(p.description, "Buat CV cepat");
  assert.equal(p.url, "github.com/u/lamar-kerja");
  assert.deepEqual(p.highlights, ["Teknologi: TypeScript · react · tailwind"]);
});

test("rankRepos: README ikut dihitung, nama ber-tanda-hubung dipecah", () => {
  const ranked = rankRepos(
    [
      repo({ name: "sistem-spk-beasiswa", readme: "PHP native + MySQL, metode Simple Additive Weighting." }),
      repo({ name: "sistem-hotel-administrasi", readme: "Dibangun dengan Next.js, TypeScript, dan Tailwind CSS. UI responsive." }),
    ],
    JD,
  );
  assert.equal(ranked[0].repo.name, "sistem-hotel-administrasi");
  assert.ok(ranked[0].score > 10, `skor ${ranked[0].score} harus > 10`);
});

test("pilihOtomatis: tanpa JD ambil yang paling layak pamer, repo gundul dibuang", () => {
  const top = pilihOtomatis([repo({ name: "sepi" }), repo({ name: "lengkap", description: "Kasir UMKM", homepage: "https://kasirku.web.app", readme: "Aplikasi kasir untuk UMKM dengan laporan harian otomatis." })], "");
  assert.deepEqual(top.map((r) => r.repo.name), ["lengkap"]);
  assert.ok(top[0].score > 0);
});

test("pilihOtomatis: repo tak nyambung tidak ikut terpilih", () => {
  const top = pilihOtomatis([repo({ name: "sistem-akuntansi", readme: "Payroll gaji karyawan pabrik." }), repo({ name: "landing-next", readme: "React + Next.js + Tailwind." })], JD);
  assert.equal(top.length, 1);
  assert.equal(top[0].repo.name, "landing-next");
});

test("gantiOtomatis: auto lama dibuang, proyek manual tetap utuh", () => {
  const manual = { name: "Manual", url: "https://github.com/u/manual", description: "x" };
  const a1 = { name: "A", url: "https://github.com/u/a", description: "x" };
  const a2 = { name: "B", url: "https://github.com/u/b", description: "x" };
  const satu = gantiOtomatis([manual], [], [a1]);
  assert.deepEqual(satu.projects.map((p) => p.name), ["A", "Manual"]);
  const dua = gantiOtomatis(satu.projects, satu.urls, [a2]);
  assert.deepEqual(dua.projects.map((p) => p.name), ["B", "Manual"]);
  assert.deepEqual(gantiOtomatis(dua.projects, dua.urls, []).projects.map((p) => p.name), ["Manual"]);
});

test("dariReadme: kalimat pertama yang layak, badge & judul dibuang", () => {
  const d = dariReadme("![badge](https://img.shields.io/x)\n# Kasirku\n\nAplikasi kasir untuk UMKM dengan laporan harian otomatis.\n");
  assert.match(d, /^Aplikasi kasir/);
  assert.equal(repoToProject(repo({ name: "kasirku", readme: "Aplikasi kasir untuk UMKM dengan laporan harian otomatis." })).description, "Aplikasi kasir untuk UMKM dengan laporan harian otomatis.");
});

test("dariReadme: HTML/gambar dibuang, README profil tidak ikut terpilih", () => {
  assert.equal(dariReadme('<img src="https://capsule-render.vercel.app/api?text=X" />'), "");
  const profil: Repo = repo({ name: "M4sr", owner: { login: "M4sr" }, description: "Profil", readme: "Halo, saya M4sr, full-stack developer dari Indonesia." });
  const proyek = repo({ name: "kasirku", owner: { login: "M4sr" }, readme: "Aplikasi kasir untuk UMKM dengan laporan harian otomatis." });
  const top = pilihOtomatis([profil, proyek], "aplikasi kasir", false, 3);
  assert.deepEqual(top.map((r) => r.repo.name), ["kasirku"]);
});

test("mergeProjects: URL sama tidak digandakan", () => {
  const a = { name: "A", url: "https://github.com/u/a", description: "x" };
  const b = { name: "B", url: "https://github.com/u/b", description: "y" };
  assert.deepEqual(mergeProjects([a], [a, b]), [a, b]);
});

test("tautan: skema https & garis miring ujung dibuang", () => {
  assert.equal(rapiTautan("https://github.com/namakun/kasirku"), "github.com/namakun/kasirku");
  assert.equal(rapiTautan("http://github.com/u/x/"), "github.com/u/x");
  assert.equal(rapiTautan(undefined), "");
});

test("ghUser: tetap dapat username walau skema sudah dibuang", () => {
  assert.equal(ghUser("github.com/namakun"), "namakun");
  assert.equal(ghUser("https://github.com/namakun/kasirku"), "namakun");
  assert.equal(ghUser("@namakun"), "namakun");
});

test("repoToProject: url GitHub tanpa skema", () => {
  assert.equal(repoToProject(repo({ name: "kasirku" })).url, "github.com/u/kasirku");
});
