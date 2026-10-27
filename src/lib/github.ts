import type { Project } from "../types";
import { extractTerms, tokens } from "./ats.ts";
import { rapiTautan } from "./tautan.ts";

/** Username GitHub pemilik aplikasi — dipakai sebagai isian awal kolom username. */
export const GH_SAYA = "M4sr";

/** Subset respons /users/{user}/repos. */
export type Repo = {
  name: string;
  /** login pemilik — dipakai untuk membuang repo README profil. */
  owner?: { login: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  pushed_at: string;
  /** Diisi belakangan lewat enrichReadmes(). */
  readme?: string;
};

export type RankedRepo = { repo: Repo; score: number; matched: string[] };

const API = "https://api.github.com";

/** Terima "@user", URL profil, atau nama user saja. */
export function ghUser(input: string): string {
  return input
    .trim()
    .replace(/^@/, "")
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\/.*$/, "");
}

/** Repo publik user. Tanpa token: kuota GitHub 60 permintaan/jam per IP. */
export async function fetchRepos(user: string, signal?: AbortSignal): Promise<Repo[]> {
  const res = await fetch(`${API}/users/${encodeURIComponent(user)}/repos?sort=pushed&per_page=100`, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (res.status === 404) throw new Error(`Akun GitHub "${user}" tidak ditemukan.`);
  if (res.status === 403) throw new Error("Kuota GitHub API habis (60/jam per IP). Coba lagi nanti.");
  if (!res.ok) throw new Error(`GitHub menolak permintaan (HTTP ${res.status}).`);
  return (await res.json()) as Repo[];
}

/** Teks repo yang boleh dibaca mesin — nama, deskripsi, topik, bahasa, alamat demo, README. */
function repoText(r: Repo): string {
  return [r.name.replace(/[-_.]+/g, " "), r.description ?? "", r.language ?? "", ...r.topics, r.homepage ?? "", r.readme ?? ""].join(" ");
}

const README_LIMIT = 10;

async function fetchReadme(user: string, name: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(`${API}/repos/${encodeURIComponent(user)}/${encodeURIComponent(name)}/readme`, { headers: { Accept: "application/vnd.github.raw" }, signal });
    return res.ok ? (await res.text()).slice(0, 3000) : "";
  } catch {
    return "";
  }
}

/**
 * Baca README 10 repo terbaru — metadata repo sering kosong, README-nya yang menyebut stack.
 * Kuota anonim 60/jam per IP, jadi dibatasi & 4 permintaan sekaligus.
 */
export async function enrichReadmes(user: string, repos: Repo[], limit = README_LIMIT, signal?: AbortSignal): Promise<Repo[]> {
  const target = repos.filter((r) => !r.fork && !r.archived).slice(0, limit);
  const isi = new Map<string, string>();
  for (let i = 0; i < target.length; i += 4) {
    const batch = target.slice(i, i + 4);
    const teks = await Promise.all(batch.map((r) => fetchReadme(user, r.name, signal)));
    batch.forEach((r, j) => isi.set(r.name, teks[j]));
  }
  return repos.map((r) => (isi.has(r.name) ? { ...r, readme: isi.get(r.name) } : r));
}

/** Skor 0-100: cakupan istilah JD pada metadata repo. Angka segaris dengan skor ATS, jadi bisa dibandingkan. */
export function rankRepos(repos: Repo[], jd: string, includeForks = false): RankedRepo[] {
  const bag = extractTerms(jd);
  const total = [...bag.values()].reduce((a, b) => a + b, 0) || 1;
  return repos
    .filter((r) => (includeForks || !r.fork) && !r.archived && !bukanProyek(r))
    .map((repo) => {
      const text = ` ${tokens(repoText(repo)).join(" ")} `;
      let hit = 0;
      const matched: string[] = [];
      for (const [term, w] of bag) {
        if (term.includes(" ")) continue;
        if (text.includes(` ${term} `)) {
          hit += w;
          matched.push(term);
        }
      }
      return { repo, score: Math.round((hit / total) * 100), matched };
    })
    .sort((a, b) => b.score - a.score || b.repo.pushed_at.localeCompare(a.repo.pushed_at));
}

/** Kalimat pertama README yang layak dipakai jadi deskripsi CV. */
export function dariReadme(readme?: string): string {
  if (!readme) return "";
  const baris = readme
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .split("\n")
    .map((b) =>
      b
        .replace(/^#+\s*/, "")
        .replace(/[`*>_|]/g, "")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((b) => b.length > 25 && !/^[-=\s]+$/.test(b) && !/shields\.io|badge|^https?:/i.test(b));
  return baris[0]?.slice(0, 180) ?? "";
}

/** Repo README profil ("user/user") atau repo meta — tak layak masuk CV. */
function bukanProyek(r: Repo): boolean {
  return /^\.github$/i.test(r.name) || r.name.toLowerCase() === (r.owner?.login ?? "").toLowerCase();
}

/** Repo → entri bagian Proyek/CV. ponytail: metadata + README, bukan isi commit. */
export function repoToProject(repo: Repo): Project {
  const name = repo.name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const tech = [repo.language, ...repo.topics].filter(Boolean) as string[];
  return {
    name,
    url: rapiTautan(repo.html_url),
    description: repo.description?.trim() || dariReadme(repo.readme) || `${name} — proyek pribadi.`,
    highlights: tech.length ? [`Teknologi: ${tech.slice(0, 6).join(" · ")}`] : undefined,
  };
}

/** Buang proyek yang URL-nya sudah ada di CV. */
export function mergeProjects(existing: Project[], add: Project[]): Project[] {
  const seen = new Set(existing.map((p) => p.url));
  return [...existing, ...add.filter((p) => !seen.has(p.url))];
}

const cache = new Map<string, Promise<Repo[]>>();

/** Repo + README, disimpan per sesi: ganti-ganti JD tidak menghajar kuota GitHub. */
export function loadRepos(user: string): Promise<Repo[]> {
  let p = cache.get(user);
  if (!p) cache.set(user, (p = fetchRepos(user).then((list) => enrichReadmes(user, list))));
  return p;
}

/** Ambang "cukup nyambung" dan jumlah proyek otomatis maksimum. */
export const MIN_SKOR = 8;
export const MAKS_AUTO = 3;

/** Skor "layak dipamerkan" saat JD kosong: README ada, deskripsi, demo, bintang, masih dirawat. */
function bobotTampil(r: Repo): number {
  const bulan = (Date.now() - Date.parse(r.pushed_at)) / 2.592e9;
  return (r.readme ? 3 : 0) + (r.description ? 1 : 0) + (r.homepage ? 1 : 0) + (r.topics.length ? 1 : 0) + Math.min(r.stargazers_count, 20) / 10 - Math.min(Math.max(bulan, 0), 24) / 12;
}

/** Proyek paling direkomendasikan: paling cocok dengan JD, atau paling layak pamer kalau JD kosong. */
export function pilihOtomatis(repos: Repo[], jd: string, forks = false, limit = MAKS_AUTO): RankedRepo[] {
  const calon = repos.filter((r) => (forks || !r.fork) && !r.archived && !bukanProyek(r));
  if (!jd.trim()) {
    return calon
      .map((repo) => ({ repo, score: Math.round(bobotTampil(repo) * 10), matched: [] }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  return rankRepos(calon, jd).filter((r) => r.score >= MIN_SKOR).slice(0, limit);
}

/** Pasang hasil otomatis yang baru, buang yang lama — proyek manual tidak pernah disentuh. */
export function gantiOtomatis(projects: Project[], lama: string[], baru: Project[]): { projects: Project[]; urls: string[] } {
  const sisa = projects.filter((p) => !p.url || !lama.includes(p.url));
  const ada = new Set(sisa.map((p) => p.url));
  const tambah = baru.filter((p) => !p.url || !ada.has(p.url));
  return { projects: [...tambah, ...sisa], urls: tambah.map((p) => p.url ?? "") };
}
