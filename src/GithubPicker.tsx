import { useMemo, useState } from "react";
import type { Project } from "./types";
import { ghUser, GH_SAYA, loadRepos, pilihOtomatis, rankRepos, repoToProject, type Repo } from "./lib/github";
import { Btn, Icon, Label } from "./ui";

const TOP = 12;

/** Tarik repo publik GitHub, urutkan sesuai JD, pilih → masuk bagian Proyek di CV. */
export function GithubPicker({
  jd,
  existing,
  defaultUser,
  onAdd,
}: {
  jd: string;
  existing: Project[];
  defaultUser?: string;
  onAdd: (projects: Project[]) => void;
}) {
  const [user, setUser] = useState(() => ghUser(defaultUser ?? "") || GH_SAYA);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forks, setForks] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [stage, setStage] = useState("");

  const dipakai = useMemo(() => new Set(existing.map((p) => p.url)), [existing]);
  const ranked = useMemo(() => (repos ? rankRepos(repos, jd, forks).filter((r) => !dipakai.has(r.repo.html_url)) : []), [repos, jd, forks, dipakai]);
  const shown = ranked.slice(0, TOP);
  const forksTersedia = (repos ?? []).filter((r) => r.fork && !r.archived).length;
  const pilihan = shown.filter((r) => pick.has(r.repo.html_url));

  async function tarik() {
    const u = ghUser(user);
    if (!u) return setErr("Isi username GitHub dulu.");
    setBusy(true);
    setErr("");
    setNote("");
    setStage("Menarik repo + README…");
    try {
      const list = await loadRepos(u);
      setUser(u);
      setRepos(list);
      setPick(new Set(pilihOtomatis(list, jd, forks).filter((r) => !dipakai.has(r.repo.html_url)).map((r) => r.repo.html_url)));
      if (list.length === 0) setErr(`Repo publik "${u}" kosong.`);
    } catch (e) {
      setErr((e as Error).message);
      setRepos(null);
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <>
      <label className="block">
        <Label>Username GitHub</Label>
        <div className="flex gap-2">
          <input
            className="field flex-1"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tarik()}
            placeholder="mis. M4sr"
          />
          <Btn variant="primary" icon={busy ? undefined : "code"} busy={busy} onClick={tarik} className="shrink-0 px-3">
            {busy ? stage || "Menarik…" : "Tarik Repo"}
          </Btn>
        </div>
      </label>

      <p className="mt-2 text-[11px] leading-relaxed text-mute">
        {jd.trim()
          ? "Diurutkan paling nyambung dengan deskripsi lowongan yang kamu tempel."
          : "Tempel dulu Deskripsi lowongan (JD) di tab Lowongan supaya urutannya paling nyambung."}{" "}
        Hanya repo publik + README 10 terbaru; tidak ada kredensial yang disimpan (kuota GitHub 60 tarikan/jam per IP).
      </p>

      {err && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/8 p-2.5 text-xs text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {err}
        </p>
      )}

      {repos && ranked.length === 0 && !err && (
        <p className="mt-3 text-xs text-mute">Tidak ada repo baru yang bisa ditambahkan{forksTersedia ? " — coba centang “Sertakan fork”." : "."}</p>
      )}

      {shown.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-mute">
              {ranked.length} repo cocok dari {repos?.length ?? 0}
            </span>
            {forksTersedia > 0 && (
              <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-mute">
                <input type="checkbox" className="size-4 accent-brand" checked={forks} onChange={(e) => setForks(e.target.checked)} />
                Sertakan fork ({forksTersedia})
              </label>
            )}
          </div>

          <ul className="mt-2 space-y-2">
            {shown.map((r, i) => {
              const on = pick.has(r.repo.html_url);
              return (
                <li key={r.repo.html_url} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <label className={`flex cursor-pointer gap-2.5 rounded-xl border p-2.5 transition ${on ? "border-brand/40 bg-brand/6" : "border-line bg-surface2/60 hover:bg-surface3/60"}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                      checked={on}
                      onChange={(e) =>
                        setPick((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(r.repo.html_url);
                          else next.delete(r.repo.html_url);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold">{r.repo.name}</span>
                        <span
                          className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            r.score >= 20 ? "bg-brand/15 text-brand" : r.score > 0 ? "bg-accent/15 text-accent" : "bg-surface3 text-mute"
                          }`}
                        >
                          {r.score}%
                        </span>
                      </span>
                      {r.repo.description && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-mute">{r.repo.description}</span>}
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {r.repo.language && <span className="rounded-full bg-surface3 px-1.5 py-0.5 text-[10px] text-mute">{r.repo.language}</span>}
                        {r.matched.slice(0, 4).map((m) => (
                          <span key={m} className="rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] text-brand">
                            {m}
                          </span>
                        ))}
                        {r.repo.stargazers_count > 0 && <span className="text-[10px] text-mute">★ {r.repo.stargazers_count}</span>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn
              variant="primary"
              icon="plus"
              disabled={pilihan.length === 0}
              onClick={() => {
                onAdd(pilihan.map((r) => repoToProject(r.repo)));
                setNote(`${pilihan.length} proyek ditambahkan ke CV.`);
                setPick(new Set());
              }}
            >
              Tambahkan ke CV {pilihan.length > 0 ? `(${pilihan.length})` : ""}
            </Btn>
            <button className="cursor-pointer text-[11px] text-mute underline" onClick={() => setPick(new Set(shown.map((r) => r.repo.html_url)))}>
              pilih semua
            </button>
            {note && <span className="text-[11px] text-brand">{note}</span>}
          </div>
        </>
      )}
    </>
  );
}
