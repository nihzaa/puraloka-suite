/**
 * HARGA SATUAN — 2.943 harga aktif yang asisten tak pernah bisa lihat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG PALING SERING, DAN PALING SERING TAK TERJAWAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Semen sekarang berapa?" · "Upah tukang batu berapa sehari?" · "Bekisting
 * per m² berapa?" — pertanyaan yang dijawab orang lapangan dari ingatan, dan
 * ingatan yang salah masuk ke penawaran.
 *
 * Diukur 2026-08-16: `price_book_entries` 3.212 baris (2.943 aktif, 188
 * kedaluwarsa, 81 draf). Asisten buta terhadap seluruhnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HANYA YANG BERLAKU — DAN ITU BUKAN SEKADAR SARINGAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tabelnya BERVERSI: satu sumber daya bisa punya beberapa baris dengan
 * `version_number` dan `effective_date` berbeda, plus `expired_date`.
 *
 * Mengembalikan semuanya berarti asisten menyebut dua harga untuk satu barang
 * — dan yang membacanya akan memilih yang lebih murah, karena itu yang enak
 * didengar. Yang dipakai di sini: `status='active'` DAN belum kedaluwarsa,
 * lalu versi TERTINGGI per sumber daya.
 *
 * `confidence_level` ikut ditampilkan. Harga bertingkat `low` yang disebut
 * tanpa keterangan akan dipakai untuk menawar — dan selisihnya baru terlihat
 * saat pekerjaan sudah jalan.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'

interface BarisHarga {
  amount: unknown
  effective_date: string | null
  expired_date: string | null
  version_number: number | null
  confidence_level: string | null
  supplier: string | null
  resources?: { name?: string; unit_code?: string; category?: string } | null
}

export const toolHargaSatuan: DefinisiToolAi = {
  nama: 'harga_satuan',
  label: 'Harga satuan',
  keterangan:
    'Harga satuan material, upah, dan alat dari buku harga perusahaan. Pakai untuk ' +
    '"berapa harga semen", "upah tukang berapa", "harga bekisting per m2", atau saat ' +
    'menyusun perkiraan biaya. Sebutkan nama barangnya di `cari`. Harga yang dikembalikan ' +
    'HANYA yang masih berlaku — jangan mengarang harga yang tak ada di daftar.',
  izin: 'projects:view',
  skema: {
    type: 'object',
    properties: {
      cari: {
        type: 'string',
        description: 'Nama material/upah/alat (sebagian nama boleh) — mis. "semen", "tukang batu".',
      },
    },
    required: ['cari'],
  },
  async jalan({ db }, argumen) {
    const cari = typeof argumen.cari === 'string' ? argumen.cari.trim() : ''
    if (cari.length < 2) {
      return {
        isi: 'Sebutkan nama barang/upah yang dicari, minimal dua huruf.',
        isError: true,
        entitas: [],
      }
    }

    /*
     * ── Disaring DI BASIS, bukan sesudah 1.500 baris dibaca ──────────────────
     *
     * Versi pertama membaca `.limit(1500)` lalu mencocokkan nama di memori.
     * Itu SALAH secara senyap: buku harga punya 2.943 baris aktif, jadi
     * pencarian "Upah Pasang" mengembalikan NOL — barangnya ada, tetapi
     * barisnya tak pernah ikut terbaca karena terpotong di 1.500.
     *
     * Yang membuatnya berbahaya: jawabannya bukan galat melainkan "tak ada
     * harga aktif untuk itu", kalimat yang terdengar seperti fakta. Persis
     * kelas cacat yang `audit-baca-tak-terpotong.mjs` ada untuk menahan — dan
     * penjaga itu DILEWATI di mesin tanpa DATABASE_URL, jadi ia tak menolong
     * saat ditulis.
     *
     * ── Karakter yang DIBUANG vs yang DIGANTI ────────────────────────────
     *
     * `%` dan `*` dibuang: keduanya wildcard, dan pola yang datang dari
     * kalimat model tak boleh menyusun pencariannya sendiri.
     *
     * `,` DIGANTI `_` (wildcard satu-huruf SQL), bukan dibuang. PostgREST
     * memperlakukan koma sebagai pemisah filter, jadi meneruskannya membuat
     * query salah urai — tetapi MENGHAPUSNYA juga salah: nama di basis ini
     * banyak yang memuat desimal ("Beton Sc 3,8 Mpa"), dan pencarian nama
     * lengkapnya lalu mengembalikan NOL.
     *
     * Kurung `( )` DIBIARKAN — ia bagian sah dari nama
     * ("Septictank ( Biotec  Kap : 2  m³ )") dan tak punya arti khusus.
     *
     * Ketiganya diuji langsung ke basis sebelum ditulis di sini; tiga tebakan
     * berturut-turut adalah alasan yang cukup untuk berhenti menebak.
     */
    const aman = cari.replace(/[%*]/g, ' ').replace(/,/g, '_').trim()
    if (aman.length < 2) {
      return { isi: 'Nama yang dicari tak bisa dipakai. Sebutkan nama barangnya.', isError: true, entitas: [] }
    }

    const { data, error } = await db
      .from('price_book_entries')
      .select(
        'amount, effective_date, expired_date, version_number, confidence_level, supplier, ' +
          'resources!inner(name, unit_code, category)',
      )
      .eq('status', 'active')
      .ilike('resources.name', `%${aman}%`)
      .limit(200)

    if (error) {
      return { isi: `Gagal membaca buku harga: ${error.message}`, isError: true, entitas: [] }
    }

    const kunci = cari.toLowerCase()
    const hariIni = new Date().toISOString().slice(0, 10)

    /*
     * Pencocokan di APLIKASI, bukan `.ilike()` — nama yang model karang bisa
     * memuat karakter yang jadi wildcard PostgREST. Pola yang sama dengan
     * `idProyek()`.
     */
    const cocok = ((data ?? []) as unknown as BarisHarga[]).filter((b) => {
      const nama = b.resources?.name ?? ''
      if (!nama.toLowerCase().includes(kunci)) return false
      // Kedaluwarsa DIBUANG meski statusnya masih 'active' — dua penanda yang
      // bisa berselisih, dan yang lebih ketat yang menang.
      if (b.expired_date && String(b.expired_date).slice(0, 10) < hariIni) return false
      return true
    })

    if (cocok.length === 0) {
      return {
        isi: bungkusData(
          'harga_satuan',
          `Tak ada harga aktif untuk '${cari}' di buku harga. ` +
            'JANGAN mengarang angkanya — katakan saja belum terdaftar.',
        ),
        isError: false,
        entitas: [],
      }
    }

    /*
     * Satu harga per SUMBER DAYA — versi tertinggi.
     *
     * Tanpa ini, satu barang muncul beberapa kali dengan angka berbeda, dan
     * yang membacanya memilih yang paling murah karena itu yang enak didengar.
     */
    const terbaik = new Map<string, BarisHarga>()
    for (const b of cocok) {
      const nama = b.resources?.name ?? ''
      const ada = terbaik.get(nama)
      if (!ada || (b.version_number ?? 0) > (ada.version_number ?? 0)) terbaik.set(nama, b)
    }

    const daftar = [...terbaik.values()].sort((a, b) =>
      (a.resources?.name ?? '').localeCompare(b.resources?.name ?? ''),
    )
    const { data: tampil, dipotong } = potong(daftar)

    return {
      isi: bungkusData(
        'harga_satuan',
        `${daftar.length} harga aktif cocok dengan '${cari}':\n` +
          tampil
            .map((b) => {
              const r = b.resources
              return (
                `${r?.name ?? '-'}: ${rupiah(Number(b.amount) || 0)}` +
                (r?.unit_code ? ` /${r.unit_code}` : '') +
                (b.confidence_level && b.confidence_level !== 'high'
                  ? ` · keyakinan ${b.confidence_level}`
                  : '') +
                (b.supplier ? ` · ${b.supplier}` : '') +
                (b.effective_date ? ` · berlaku ${String(b.effective_date).slice(0, 10)}` : '')
              )
            })
            .join('\n'),
        dipotong,
      ),
      isError: false,
      entitas: tampil.map((b) => b.resources?.name ?? '').filter(Boolean),
    }
  },
}
