import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, zip, type Berkas } from "./zip.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function baca(data: Uint8Array, nama: string): string | null {
  for (let i = 0; i < data.length - 4; i++) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x03 && data[i + 3] === 0x04) {
      const v = new DataView(data.buffer, data.byteOffset + i);
      const ukuran = v.getUint32(18, true);
      const panjangNama = v.getUint16(26, true);
      const kepala = 30 + panjangNama;
      const nm = dec.decode(data.subarray(i + 30, i + kepala));
      if (nm === nama) return dec.decode(data.subarray(i + kepala, i + kepala + ukuran));
      i += kepala + ukuran - 1;
    }
  }
  return null;
}

test("crc32 cocok dengan nilai rujukan", () => {
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(enc.encode("")), 0);
});

test("zip: isi berkas bisa dibaca kembali apa adanya", async () => {
  const berkas: Berkas[] = [
    { nama: "email.txt", isi: "Subjek: Lamaran Frontend\n\nHalo," },
    { nama: "PETUNJUK.txt", isi: "Langkah kirim:\n1. Baca ulang" },
  ];
  const data = new Uint8Array(await zip(berkas).arrayBuffer());

  assert.equal(baca(data, "email.txt"), berkas[0].isi);
  assert.equal(baca(data, "PETUNJUK.txt"), berkas[1].isi);

  // EOCD: jumlah entri & offset direktori pusat harus konsisten
  const eocd = data.length - 22;
  const v = new DataView(data.buffer, data.byteOffset + eocd);
  assert.equal(v.getUint32(0, true), 0x06054b50);
  assert.equal(v.getUint16(10, true), berkas.length);
  assert.ok(v.getUint32(16, true) < eocd, "offset direktori pusat harus sebelum EOCD");
});

test("zip: isi kosong tetap menghasilkan arsip valid", async () => {
  const data = new Uint8Array(await zip([]).arrayBuffer());
  const v = new DataView(data.buffer);
  assert.equal(data.length, 22);
  assert.equal(v.getUint16(10, true), 0);
});
