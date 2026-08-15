/**
 * "KALAU NAMBAH 20 m² BERAPA?" — pertanyaan pemilik yang paling sering.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUKAN KALKULATOR BIASA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jawaban dari ingatan ("kira-kira 15 juta") masuk ke pembicaraan dengan klien,
 * lalu jadi angka yang dipegang orang. Kalau meleset, yang menanggung bukan
 * yang menyebutkan.
 *
 * Datanya sudah lengkap dan menganggur (diukur 2026-08-16):
 *
 *   assemblies            3.043  ← AHSP: resep satu satuan pekerjaan
 *   assembly_components  17.873  ← koefisien tiap bahan/upah di dalamnya
 *   price_book_entries    2.943  ← harga satuan yang berlaku
 *
 * Rantainya: `volume × Σ(koefisien × harga) × (1 + waste)`. Tiga tabel yang
 * sudah ada, nol perhitungan baru.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KOMPONEN TANPA HARGA DINYATAKAN, TIDAK DIANGGAP NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ini keputusan terpentingnya. Satu bahan yang belum punya harga akan membuat
 * totalnya lebih murah dari yang sebenarnya — dan angka yang lebih murah
 * adalah angka yang paling enak dipercaya.
 *
 * Menganggapnya nol berarti asisten memberi harga penawaran yang terlalu
 * rendah tanpa satu pun tanda. Maka: komponen tak berharga DIHITUNG TERPISAH
 * dan disebutkan jumlahnya, dan hasilnya ditandai "belum lengkap".
 *
 * Pola yang sama dengan `nominalEntitas()` di `ai-setujui.ts`: data yang hilang
 * harus MENAMBAH pengawasan, bukan menguranginya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INI PERKIRAAN, DAN KALIMATNYA HARUS MENYEBUTKAN ITU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang dihitung: biaya LANGSUNG dari AHSP. Yang TIDAK termasuk: overhead,
 * keuntungan, PPN, dan kondisi lapangan. Angka tanpa keterangan itu akan
 * dipakai sebagai harga jual — dan selisihnya persis margin perusahaan.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'

/** Maksimal AHSP yang ditawarkan saat pencarian ambigu. */
const MAKS_PILIHAN = 8

interface BarisKomponen {
  coefficient: unknown
  resources?: { id?: string; name?: string; unit_code?: string } | null
}

export const toolHitungPekerjaan: DefinisiToolAi = {
  nama: 'hitung_pekerjaan',
  label: 'Perkiraan biaya pekerjaan',
  keterangan:
    'Menghitung PERKIRAAN biaya satu jenis pekerjaan dari AHSP + harga satuan perusahaan. ' +
    'Pakai untuk "kalau nambah 20 m2 dinding berapa", "berapa biaya cor 5 m3", atau saat ' +
    'pengguna menanyakan perkiraan sebelum memutuskan. Hasilnya biaya LANGSUNG — belum ' +
    'termasuk overhead, keuntungan, dan PPN. Sampaikan itu apa adanya, jangan disebut ' +
    'sebagai harga jual.',
  izin: 'projects:view',
  skema: {
    type: 'object',
    properties: {
      pekerjaan: {
        type: 'string',
        description:
          'Nama pekerjaan yang dicari di daftar AHSP — mis. "pasang bata", "beton", "plester".',
      },
      volume: {
        type: 'number',
        description: 'Jumlah yang akan dikerjakan, dalam satuan AHSP-nya (m2/m3/kg/…).',
      },
    },
    required: ['pekerjaan'],
  },
  async jalan({ db }, argumen) {
    const cari = typeof argumen.pekerjaan === 'string' ? argumen.pekerjaan.trim() : ''
    if (cari.length < 3) {
      return {
        isi: 'Sebutkan nama pekerjaannya, minimal tiga huruf — mis. "pasang bata".',
        isError: true,
        entitas: [],
      }
    }

    /*
     * Disaring DI BASIS, bukan sesudah ribuan baris dibaca.
     *
     * `assemblies` punya 3.043 baris. Membacanya lalu mencocokkan di memori
     * adalah cacat yang persis sama dengan yang sudah terjadi di tool harga:
     * hasilnya "tak ditemukan" untuk pekerjaan yang jelas ada, dan kalimatnya
     * terdengar seperti fakta.
     */
    /*
     * ── DIKUTIP, bukan dilucuti ────────────────────────────────────────────
     *
     * Dua percobaan gagal sebelum ini, keduanya karena MENGHAPUS karakter:
     *
     *   1. membuang `( )` → hampir semua nama AHSP memuat kurung
     *      ("… (Setara Fc 30 Mpa) …"), jadi pencarian nama LENGKAP → NOL
     *   2. mengganti `,` jadi spasi → nama memuat angka desimal
     *      ("Beton Sc 3,8 Mpa"), jadi polanya tak pernah cocok
     *
     * Keduanya gagal SENYAP: jawabannya bukan galat melainkan "tak ada AHSP
     * yang cocok" — kalimat yang terdengar seperti fakta padahal alat ukurnya
     * yang rusak.
     *
     * Percobaan KETIGA — membungkus nilai dengan tanda kutip ganda — juga
     * gagal: kutipnya ikut jadi bagian pola, dan hasilnya nol untuk kata
     * sesederhana "beton".
     *
     * Yang DIPAKAI dan diukur berhasil: koma diganti `_`, wildcard satu-huruf
     * milik SQL LIKE. Ia mencocokkan koma itu sendiri tanpa pernah sampai ke
     * pengurai filter PostgREST sebagai pemisah. `%` dan `*` tetap dibuang —
     * keduanya wildcard yang tak boleh datang dari kalimat model.
     *
     * Diuji langsung terhadap basis, ketiga bentuknya, sebelum ditulis di
     * sini. Tiga tebakan berturut-turut adalah alasan yang cukup untuk
     * berhenti menebak.
     */
    const aman = cari.replace(/[%*]/g, ' ').replace(/,/g, '_').trim()
    if (aman.length < 3) {
      return { isi: 'Nama pekerjaan tak bisa dipakai. Sebutkan ulang, ya.', isError: true, entitas: [] }
    }

    const { data: asm, error: errAsm } = await db
      .from('assemblies')
      .select('id, name, output_unit_code, waste_factor')
      .eq('status', 'active')
      .ilike('name', `%${aman}%`)
      .limit(60)

    if (errAsm) {
      return { isi: `Gagal membaca AHSP: ${errAsm.message}`, isError: true, entitas: [] }
    }

    const daftar = (asm ?? []) as unknown as Array<{
      id: string; name: string; output_unit_code: string | null; waste_factor: unknown
    }>

    if (daftar.length === 0) {
      return {
        isi: bungkusData(
          'hitung_pekerjaan',
          `Tak ada AHSP aktif yang cocok dengan '${cari}'. ` +
            'JANGAN mengarang angkanya — katakan saja resep pekerjaannya belum terdaftar.',
        ),
        isError: false,
        entitas: [],
      }
    }

    /*
     * AMBIGU dinyatakan, bukan ditebak.
     *
     * "beton" cocok dengan puluhan AHSP yang harganya berbeda jauh — memilih
     * yang pertama berarti memberi angka yang kebetulan, dan angka kebetulan
     * yang terlihat pasti adalah bentuk kesalahan yang paling sulit dibantah.
     */
    if (daftar.length > 1) {
      const { data: tampil, dipotong } = potong(daftar.slice(0, MAKS_PILIHAN))
      return {
        isi: bungkusData(
          'hitung_pekerjaan',
          `Ada ${daftar.length} pekerjaan yang cocok dengan '${cari}'. Minta pengguna memilih:\n` +
            tampil.map((a) => `· ${a.name} (per ${a.output_unit_code ?? '-'})`).join('\n'),
          dipotong,
        ),
        isError: false,
        entitas: tampil.map((a) => a.name),
      }
    }

    const a = daftar[0]

    const { data: komp, error: errKomp } = await db
      .from('assembly_components')
      .select('coefficient, resources!inner(id, name, unit_code)')
      .eq('assembly_id', a.id)
      .limit(200)

    if (errKomp) {
      return { isi: `Gagal membaca komponen: ${errKomp.message}`, isError: true, entitas: [] }
    }

    const komponen = (komp ?? []) as unknown as BarisKomponen[]
    if (komponen.length === 0) {
      return {
        isi: bungkusData('hitung_pekerjaan', `AHSP "${a.name}" belum punya rincian komponen.`),
        isError: true,
        entitas: [a.name],
      }
    }

    // Harga tiap sumber daya — versi tertinggi yang masih berlaku.
    const idRes = komponen.map((k) => k.resources?.id).filter(Boolean) as string[]
    const { data: harga } = await db
      .from('price_book_entries')
      .select('resource_id, amount, version_number, expired_date')
      .eq('status', 'active')
      .in('resource_id', idRes)
      .limit(500)

    const hariIni = new Date().toISOString().slice(0, 10)
    const terbaik = new Map<string, number>()
    const versi = new Map<string, number>()

    for (const h of (harga ?? []) as unknown as Array<{
      resource_id: string; amount: unknown; version_number: number | null; expired_date: string | null
    }>) {
      if (h.expired_date && String(h.expired_date).slice(0, 10) < hariIni) continue
      const v = h.version_number ?? 0
      if ((versi.get(h.resource_id) ?? -1) >= v) continue
      versi.set(h.resource_id, v)
      terbaik.set(h.resource_id, Number(h.amount) || 0)
    }

    let perSatuan = 0
    const tanpaHarga: string[] = []
    const rincian: string[] = []

    for (const k of komponen) {
      const r = k.resources
      const koef = Number(k.coefficient) || 0
      const id = r?.id ?? ''

      if (!terbaik.has(id)) {
        // DINYATAKAN, bukan dianggap nol — lihat kepala berkas.
        tanpaHarga.push(r?.name ?? '(tanpa nama)')
        continue
      }

      const sub = koef * terbaik.get(id)!
      perSatuan += sub
      rincian.push(`· ${r?.name}: ${koef} ${r?.unit_code ?? ''} × ${rupiah(terbaik.get(id)!)} = ${rupiah(sub)}`)
    }

    const waste = Number(a.waste_factor) || 0
    const perSatuanWaste = perSatuan * (1 + waste)

    const vol = Number(argumen.volume)
    const adaVolume = Number.isFinite(vol) && vol > 0

    const bagian: string[] = [
      `${a.name}`,
      `Biaya langsung per ${a.output_unit_code ?? 'satuan'}: ${rupiah(perSatuanWaste)}` +
        (waste > 0 ? ` (termasuk susut ${(waste * 100).toFixed(1)}%)` : ''),
    ]

    if (adaVolume) {
      bagian.push(
        `Untuk ${vol} ${a.output_unit_code ?? ''}: ${rupiah(perSatuanWaste * vol)}`,
      )
    }

    const { data: tampilRincian, dipotong } = potong(rincian)
    bagian.push('', 'Rincian:', ...tampilRincian)

    if (tanpaHarga.length > 0) {
      bagian.push(
        '',
        `⚠ ${tanpaHarga.length} komponen BELUM punya harga dan TIDAK ikut dihitung: ` +
          `${tanpaHarga.slice(0, 6).join(', ')}${tanpaHarga.length > 6 ? ', …' : ''}.`,
        'Angka di atas karena itu LEBIH RENDAH dari biaya sebenarnya. Sampaikan ini.',
      )
    }

    bagian.push(
      '',
      'Ini biaya LANGSUNG dari AHSP — belum termasuk overhead, keuntungan, PPN, dan',
      'kondisi lapangan. Jangan menyebutnya sebagai harga jual.',
    )

    if (!adaVolume) {
      bagian.push('Sebutkan volumenya kalau pengguna ingin total, bukan harga satuan.')
    }

    return {
      isi: bungkusData('hitung_pekerjaan', bagian.join('\n'), dipotong),
      isError: false,
      entitas: [a.name],
    }
  },
}
