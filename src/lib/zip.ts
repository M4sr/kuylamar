/**
 * ZIP seadanya (metode "store", tanpa kompresi) — cukup untuk paket lamaran beberapa KB,
 * jadi tidak perlu menambah dependensi. ponytail: kalau isinya sampai ratusan KB, ganti ke
 * deflate lewat CompressionStream("deflate-raw").
 */
export type Berkas = { nama: string; isi: string };

const TABEL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = TABEL[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Waktu DOS: tanggal ZIP tidak boleh sebelum 1980. */
function waktuDos(d: Date): { jam: number; tanggal: number } {
  const th = Math.max(0, d.getFullYear() - 1980);
  return {
    jam: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    tanggal: (th << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zip(berkas: Berkas[], sekarang = new Date()): Blob {
  const enc = new TextEncoder();
  const { jam, tanggal } = waktuDos(sekarang);
  const bagian: BlobPart[] = [];
  const pusat: BlobPart[] = [];
  let offset = 0;

  const kepala = (ukuran: number) => {
    const b = new Uint8Array(ukuran);
    return { b, v: new DataView(b.buffer) };
  };

  for (const f of berkas) {
    const nama = enc.encode(f.nama);
    const data = enc.encode(f.isi);
    const crc = crc32(data);

    const l = kepala(30);
    l.v.setUint32(0, 0x04034b50, true);
    l.v.setUint16(4, 20, true);
    l.v.setUint16(6, 0x0800, true); // nama berkas UTF-8
    l.v.setUint16(8, 0, true); // store
    l.v.setUint16(10, jam, true);
    l.v.setUint16(12, tanggal, true);
    l.v.setUint32(14, crc, true);
    l.v.setUint32(18, data.length, true);
    l.v.setUint32(22, data.length, true);
    l.v.setUint16(26, nama.length, true);
    l.v.setUint16(28, 0, true);
    bagian.push(l.b, nama, data);

    const c = kepala(46);
    c.v.setUint32(0, 0x02014b50, true);
    c.v.setUint16(4, 20, true);
    c.v.setUint16(6, 20, true);
    c.v.setUint16(8, 0x0800, true);
    c.v.setUint16(10, 0, true);
    c.v.setUint16(12, jam, true);
    c.v.setUint16(14, tanggal, true);
    c.v.setUint32(16, crc, true);
    c.v.setUint32(20, data.length, true);
    c.v.setUint32(24, data.length, true);
    c.v.setUint16(28, nama.length, true);
    c.v.setUint32(42, offset, true);
    pusat.push(c.b, nama);

    offset += l.b.length + nama.length + data.length;
  }

  const ukuranPusat = pusat.reduce((n, p) => n + (p as Uint8Array).length, 0);
  const e = kepala(22);
  e.v.setUint32(0, 0x06054b50, true);
  e.v.setUint16(8, berkas.length, true);
  e.v.setUint16(10, berkas.length, true);
  e.v.setUint32(12, ukuranPusat, true);
  e.v.setUint32(16, offset, true);

  return new Blob([...bagian, ...pusat, e.b], { type: "application/zip" });
}
