/** Subset JSON Resume (jsonresume.org) — sengaja pakai standar biar bisa impor/ekspor & ganti tema. */
export type Basics = {
  name: string;
  label: string;
  email: string;
  phone: string;
  city: string;
  url?: string;
  linkedin?: string;
  github?: string;
  summary: string;
};

export type Work = {
  company: string;
  position: string;
  start: string;
  end: string;
  location?: string;
  highlights: string[];
};

export type Education = { school: string; degree: string; start: string; end: string; note?: string };
export type Project = { name: string; url?: string; description: string; highlights?: string[] };
export type Skill = { name: string; keywords: string[] };

export type Resume = {
  basics: Basics;
  work: Work[];
  education: Education[];
  projects: Project[];
  skills: Skill[];
};

/** Lowongan yang sedang dilamar. */
export type Job = {
  position: string;
  company: string;
  source: string;
  url?: string;
  /** Teks deskripsi lowongan (JD). Tempel manual di MVP; nanti diambil dari link. */
  description: string;
};
