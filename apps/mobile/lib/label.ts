/**
 * Label manusia untuk kunci basis — SATU sumber, dipakai lintas layar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ditemukan dari MEMOTRET layar Persetujuan yang baru dibangun
 * (2026-09-11). Kartunya berbunyi:
 *
 *     Kasbon                                    86 hari
 *     gaji_tukang
 *     Rp 2.000.000
 *
 * `gaji_tukang` — kunci mentah dengan garis bawah, di layar tempat orang
 * memutuskan pengeluaran dua juta rupiah.
 *
 * Peta labelnya SUDAH ADA di `kasbon/index.tsx` sejak lama. Yang salah
 * bukan ketiadaannya melainkan tempatnya: ia konstanta lokal di satu
 * layar, jadi layar kedua yang menampilkan entitas yang sama tak bisa
 * memakainya tanpa menyalin.
 *
 * Dan menyalin adalah cacat yang lebih mahal daripada kunci mentah: dua
 * peta yang menyimpang membuat "Gaji Tukang" di satu layar dan "Upah
 * Tukang" di layar lain, untuk baris basis yang sama persis — tanpa satu
 * pun galat, dan tak seorang pun tahu mana yang benar.
 *
 * ── Kenapa jatuhannya menampilkan kunci APA ADANYA
 *
 * `LABEL[k] ?? k`, bukan `?? '—'`.
 *
 * Nilai baru yang belum dipetakan harus TERLIHAT supaya bisa ditambahkan.
 * Tanda hubung menyembunyikannya: layarnya terlihat rapi, dan tak ada yang
 * bisa menelusuri nilai apa yang sebenarnya ada di sana.
 *
 * Itu pelajaran yang sama dengan `audit-status-mobile-berlabel.mjs`, yang
 * lahir sesudah lencana berbunyi "submitted" di layar mandor: peta yang
 * memakai `?? status` GAGAL TERLIHAT, bukan gagal berjalan.
 */

/**
 * Keperluan kasbon.
 *
 * ⚠ Diukur ke basis 2026-09-11 — kolom `kasbons.purpose` memuat kunci
 * ber-underscore DAN kalimat bebas dari data uji ("[UJI] Kasbon PM uji —
 * sewa alat bor & genset"). Yang kedua lolos jatuhan apa adanya, dan itu
 * memang yang diinginkan: kalimat bebas sudah terbaca manusia.
 */
export const LABEL_KEPERLUAN: Record<string, string> = {
  gaji_tukang: 'Gaji Tukang',
  uang_makan: 'Uang Makan',
  pembelian_alat: 'Pembelian Alat',
  pembelian_material: 'Pembelian Material',
  operasional: 'Operasional',
  transport: 'Transport',
  lain_lain: 'Lain-lain',
};

/**
 * Ubah kunci ber-underscore jadi teks yang bisa dibaca.
 *
 * Dipakai sebagai jatuhan TERAKHIR, sesudah peta bernama dicoba: kunci
 * yang belum terdaftar setidaknya tampil sebagai "Gaji Tukang" alih-alih
 * "gaji_tukang", dan tetap bisa dikenali untuk ditambahkan ke peta.
 *
 * ⚠ Ini BUKAN pengganti peta. Ia tak tahu singkatan ("ppn" → "Ppn"),
 * tak tahu istilah yang punya nama resmi berbeda, dan tak bisa
 * menerjemahkan istilah Inggris. Peta yang eksplisit tetap yang benar.
 */
export function daruratRapikan(kunci: string): string {
  return kunci
    .split(/[_-]+/)
    .filter(Boolean)
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(' ');
}

/** Label keperluan kasbon; kunci tak terdaftar dirapikan, bukan disembunyikan. */
export function labelKeperluan(kunci: string | null | undefined): string {
  if (!kunci) return '—';
  const nama = LABEL_KEPERLUAN[kunci];
  if (nama) return nama;
  /*
    Kalimat bebas (mengandung spasi) dibiarkan UTUH — merapikannya akan
    mengubah "sewa alat bor & genset" jadi "Sewa Alat Bor & Genset", yang
    bukan salah tetapi bukan pula tulisan orang yang mengisinya.
  */
  if (/\s/.test(kunci)) return kunci;
  return daruratRapikan(kunci);
}
