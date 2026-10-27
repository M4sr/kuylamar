import { useState } from "react";
import type { Letter } from "./lib/cover";
import type { Surel } from "./lib/email";
import { labelPaket, namaBerkas, paketLamaran } from "./lib/paket";
import type { Lamaran } from "./lib/pelacak";
import { zip } from "./lib/zip";
import { Btn, Card, Icon } from "./ui";
import type { Job, Resume } from "./types";

const KEY_PELACAK = "lamarkerja.lamaran";

function pelacakTersimpan(): Lamaran[] {
  try {
    const d = JSON.parse(localStorage.getItem(KEY_PELACAK) ?? "[]") as Lamaran[];
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Paket lamaran: satu ZIP berisi email, surat, data lowongan, dan cadangan data. */
export default function Paket({ resume, job, letter, surel, onToast }: { resume: Resume; job: Job; letter: Letter; surel: Surel | null; onToast: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const label = labelPaket(resume, job);

  function unduh() {
    setBusy(true);
    try {
      const blob = zip(paketLamaran({ resume, job, letter, surel, pelacak: pelacakTersimpan() }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${namaBerkas(label)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      onToast("Paket ZIP diunduh — cek folder Unduhan.");
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon="download"
      title="Paket lamaran (ZIP)"
      desc="Satu berkas berisi email, surat, data lowongan, dan cadangan data."
      right={<span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-semibold text-mute">.zip</span>}
    >
      <Btn variant="primary" icon="download" busy={busy} onClick={unduh} className="w-full" disabled={!job.position.trim() && !job.company.trim()}>
        Unduh paket lamaran
      </Btn>

      <ul className="mt-3 space-y-1.5 text-[11px] text-mute">
        {["email.txt — subjek + isi terbaru dari tab ini", "surat.txt — isi surat lamaran", "lowongan.txt — data lowongan + JD", "data.json — cadangan profil, lowongan, dan pelacak", "PETUNJUK.txt — langkah kirim + nama berkas PDF"].map((x) => (
          <li key={x} className="flex items-start gap-1.5">
            <Icon name="file" className="mt-0.5 size-3.5 shrink-0" />
            {x}
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[11px] text-mute">
        <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
        PDF CV & surat tetap dibuat lewat tombol Cetak (browser yang menulis filenya) — nama berkasnya disarankan di PETUNJUK.txt.
      </p>
    </Card>
  );
}
