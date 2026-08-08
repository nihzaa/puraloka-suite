/**
 * KESEHATAN PORTOFOLIO — skor 0–100 yang DIHITUNG, bukan ditebak.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN KENAPA NAMANYA BUKAN "AI"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menaruh kartu **"AI Project Insights — 78/100 Project Success
 * Probability"** di samping hero. Angka itu karangan: tak ada model di
 * baliknya, dan "probabilitas" menyiratkan ramalan yang tak pernah dihitung.
 *
 * Yang dibangun di sini bentuknya sama (ring skor + satu kalimat kunci),
 * tetapi isinya **aritmetika atas data nyata** — dan karena itu namanya
 * **Kesehatan Portofolio**, bukan AI. Brief §7.2 memberi jalan ini secara
 * eksplisit: apa pun yang bisa dihitung deterministik boleh tampil sekarang,
 * dengan label yang jujur.
 *
 * Saat model AI benar-benar ada (`KEPUTUSAN-SCOPE-ERP-AI.md` §4 — ROADMAP
 * dulu), kartu ini tak perlu dipindah: yang berubah hanya sumber angkanya.
 *
 * ── Empat pengurang, dan kenapa justru ini
 *
 * Skor mulai dari 100 lalu DIKURANGI oleh hal-hal yang benar-benar merugikan.
 * Bukan dijumlahkan dari hal baik — karena "tak ada masalah" memang keadaan
 * normal sebuah portofolio, bukan prestasi.
 *
 *   invoice lewat tempo   uang yang seharusnya sudah masuk, tertahan
 *   milestone telat       pekerjaan meleset dari janji ke klien
 *   proyek mandek         progres 0% padahal sudah berjalan
 *   proyek lewat tenggat  tanggal selesai terlewat, pekerjaan belum 100%
 *
 * Bobotnya sengaja TIDAK sama: satu invoice lewat tempo lebih murah daripada
 * satu proyek yang tenggatnya terlewat, dan skor yang memperlakukannya sama
 * akan menyembunyikan yang berat di balik yang ringan.
 */

export interface MasukanKesehatan {
  invoiceLewatTempo: number
  milestoneTelat: number
  /** Proyek berjalan: butuh `progress_pct` dan `end_date` untuk dua pengurang terakhir. */
  proyek: Array<{ progress_pct: number; end_date: string | null }>
  /** Disuntik di test supaya hasilnya tak bergantung tanggal menjalankan. */
  hariIni?: Date
}

export interface Kesehatan {
  /** 0–100, dibulatkan. */
  skor: number
  nada: 'baik' | 'perhatian' | 'buruk'
  /** Satu kalimat: apa yang paling menekan skor. Kosong bila tak ada masalah. */
  sorotan: string
  rincian: {
    invoiceLewatTempo: number
    milestoneTelat: number
    proyekMandek: number
    proyekLewatTenggat: number
  }
}

/** Bobot per kejadian. Dipisah supaya bisa dibaca dan diuji, bukan angka sihir. */
const BOBOT = {
  invoice: 3,
  milestone: 2,
  mandek: 6,
  lewatTenggat: 8,
} as const

export function hitungKesehatan(m: MasukanKesehatan): Kesehatan {
  const hariIni = m.hariIni ?? new Date()
  const proyek = Array.isArray(m.proyek) ? m.proyek : []

  const angka = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

  const invoiceLewatTempo = Math.max(0, angka(m.invoiceLewatTempo))
  const milestoneTelat = Math.max(0, angka(m.milestoneTelat))

  // Mandek = sudah berjalan tapi progres masih 0%.
  const proyekMandek = proyek.filter((p) => angka(p.progress_pct) <= 0).length

  // Lewat tenggat = tanggal selesai sudah terlewat DAN belum 100%.
  const proyekLewatTenggat = proyek.filter((p) => {
    if (!p.end_date) return false
    const t = new Date(p.end_date)
    if (Number.isNaN(t.getTime())) return false
    return t < hariIni && angka(p.progress_pct) < 100
  }).length

  const potongan =
    invoiceLewatTempo * BOBOT.invoice +
    milestoneTelat * BOBOT.milestone +
    proyekMandek * BOBOT.mandek +
    proyekLewatTenggat * BOBOT.lewatTenggat

  const skor = Math.max(0, Math.min(100, Math.round(100 - potongan)))

  // Sorotan menyebut pengurang TERBESAR — satu kalimat, bukan daftar.
  // Daftar lengkap sudah ada di rail "Perlu keputusan"; mengulanginya di sini
  // membuat dua tempat mengatakan hal sama dengan kata berbeda.
  const semua: Array<{ bobot: number; teks: string }> = [
    { bobot: proyekLewatTenggat * BOBOT.lewatTenggat, teks: `${proyekLewatTenggat} proyek lewat tenggat` },
    { bobot: proyekMandek * BOBOT.mandek, teks: `${proyekMandek} proyek belum bergerak` },
    { bobot: invoiceLewatTempo * BOBOT.invoice, teks: `${invoiceLewatTempo} invoice lewat jatuh tempo` },
    { bobot: milestoneTelat * BOBOT.milestone, teks: `${milestoneTelat} milestone telat` },
  ]
  const kandidat = semua.filter((k) => k.bobot > 0).sort((a, b) => b.bobot - a.bobot)

  return {
    skor,
    nada: skor >= 80 ? 'baik' : skor >= 55 ? 'perhatian' : 'buruk',
    sorotan: kandidat[0]?.teks ?? '',
    rincian: { invoiceLewatTempo, milestoneTelat, proyekMandek, proyekLewatTenggat },
  }
}
