/**
 * FOKUS — mengurai `rincian` dari `/api/v1/dashboard/fokus` jadi baris siap tampil.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Endpoint `/api/v1/dashboard/fokus` sudah mengirim LIMA angka terpisah:
 *
 *     invoice_jatuh_tempo · klaim_lewat_batas · instruksi_belum_dikonfirmasi
 *     kasbon_menunggu     · penagihan_menunggu
 *
 * tetapi `SidebarFokus` hanya memakai dua total (`lewat`, `menunggu`) —
 * rinciannya dibuang. Bukan karena salah: sidebar selebar ~196px memang tak
 * muat lima baris, dan memaksakannya membuat sesak.
 *
 * Rail kanan punya ~300px, jadi di sanalah rincian itu akhirnya terpakai.
 * Satu sumber data, dua tingkat kerincian sesuai ruang yang tersedia.
 *
 * ── Kenapa di `lib/`, bukan di dalam komponen
 *
 * Urutan dan penggolongan baris adalah KEPUTUSAN, bukan tampilan: mana yang
 * mendesak, mana yang masih dalam kendali, ke mana orang dikirim. Keputusan
 * yang tak bisa dites akan bergeser diam-diam tiap kali komponennya disunting.
 *
 * ── Aturan yang dijaga di sini
 *
 * 1. **Baris bernilai NOL tidak ditampilkan.** Daftar yang penuh "0" membuat
 *    yang benar-benar menunggu tenggelam. Nol bukan informasi di sini — ia
 *    ketiadaan pekerjaan.
 * 2. **Lewat tenggat SELALU di atas yang sekadar menunggu.** Keduanya "belum
 *    selesai", tapi yang satu sudah merugikan. Mengurutkannya menurut jumlah
 *    saja akan menaruh "12 kasbon menunggu" di atas "1 invoice jatuh tempo" —
 *    dan yang mendesak hilang di bawah.
 * 3. **Tiap baris punya tautannya sendiri.** Inilah bedanya dengan versi
 *    sidebar yang mengirim semua orang ke satu tempat lalu menyuruh mencari.
 */

/** Bentuk `rincian` dari `GET /api/v1/dashboard/fokus`. */
export interface RincianFokus {
  invoice_jatuh_tempo?: number
  klaim_lewat_batas?: number
  instruksi_belum_dikonfirmasi?: number
  kasbon_menunggu?: number
  penagihan_menunggu?: number
}

export type NadaFokus = 'lewat' | 'menunggu'

export interface BarisFokus {
  kunci: string
  label: string
  jumlah: number
  /** `lewat` = sudah merugikan · `menunggu` = masih dalam kendali. */
  nada: NadaFokus
  href: string
}

/**
 * Definisi baris — urutan di sini adalah urutan tampil DALAM satu nada.
 *
 * Ditulis sebagai daftar, bukan rangkaian `if`, supaya menambah jenis antrean
 * baru berarti menambah satu baris data — bukan menyunting logika yang sudah
 * diuji.
 */
const DEFINISI: Array<{
  kunci: keyof RincianFokus
  label: string
  nada: NadaFokus
  href: string
}> = [
  { kunci: 'invoice_jatuh_tempo', label: 'Invoice jatuh tempo', nada: 'lewat', href: '/keuangan/invoice' },
  // Klaim & instruksi TIDAK punya rute sendiri — keduanya hidup di dalam
  // halaman induknya. Diperiksa 2026-08-08: `/kontrak/klaim` dan
  // `/lapangan/instruksi` tak ada di disk. Menautkan ke rute tebakan berarti
  // mengirim orang ke 404 dari widget yang justru dibuat untuk mempercepat.
  { kunci: 'klaim_lewat_batas', label: 'Klaim lewat batas', nada: 'lewat', href: '/kontrak' },
  { kunci: 'instruksi_belum_dikonfirmasi', label: 'Instruksi belum dikonfirmasi', nada: 'lewat', href: '/lapangan' },
  { kunci: 'kasbon_menunggu', label: 'Kasbon menunggu persetujuan', nada: 'menunggu', href: '/mandor/kasbon' },
  { kunci: 'penagihan_menunggu', label: 'Penagihan menunggu', nada: 'menunggu', href: '/mandor/penagihan' },
]

/**
 * Ubah `rincian` jadi daftar baris siap tampil.
 *
 * Baris nol dibuang; yang lewat tenggat naik ke atas. Lihat aturan 1–3 di
 * kepala berkas.
 */
export function barisFokus(rincian: RincianFokus | null | undefined): BarisFokus[] {
  if (!rincian) return []

  const baris: BarisFokus[] = []
  for (const d of DEFINISI) {
    const n = rincian[d.kunci]
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue
    baris.push({ kunci: d.kunci, label: d.label, jumlah: n, nada: d.nada, href: d.href })
  }

  // Stabil: `lewat` dulu, sisanya mengikuti urutan DEFINISI.
  return baris.sort((a, b) => (a.nada === b.nada ? 0 : a.nada === 'lewat' ? -1 : 1))
}

/** Total untuk label ringkas — dihitung dari baris, bukan dipercaya dari server. */
export function totalFokus(baris: BarisFokus[]): { lewat: number; menunggu: number } {
  return baris.reduce(
    (t, b) => {
      if (b.nada === 'lewat') t.lewat += b.jumlah
      else t.menunggu += b.jumlah
      return t
    },
    { lewat: 0, menunggu: 0 },
  )
}
