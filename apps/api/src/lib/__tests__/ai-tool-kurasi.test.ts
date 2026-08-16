/**
 * KURASI `tool_aktif` — dan tujuh penumpang gelap yang lolos diam-diam.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KOTAK YANG TAK DICENTANG TETAP TERKIRIM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penyaringan asli di `ai-jalankan.ts` mempersempit IZIN, bukan tool:
 *
 *     izin = izinPengguna.filter(p => ada tool berizin p yang DIPILIH)
 *     katalog = katalogUntuk(izin)          ← seluruh tool berizin itu
 *
 * Akibatnya tool yang TIDAK dipilih tetap ikut asal ia berbagi izin dengan
 * yang dipilih — dan sebagian besar tool berbagi izin (`projects:view`
 * sendirian menaungi 11 tool).
 *
 * Diukur 2026-08-16 pada kurasi `staff` (15 tool dipilih): yang benar-benar
 * terkirim **22**. Tujuh penumpang gelap: `saldo_kas`, `grafik_kurva_s`,
 * `rab`, `change_order`, `hitung_pekerjaan`, `banding_proyek`,
 * `beban_mandor_lintas`.
 *
 * Jadi halaman pengaturan menjanjikan penghematan yang tak pernah terjadi,
 * tanpa satu pun galat. Biayanya nyata: tiap tool berbiaya token di TIAP
 * ronde.
 *
 * ── Yang dibuktikan
 *
 *   1. tool yang TIDAK dipilih benar-benar tak ikut
 *   2. pilihan TIDAK bisa menambah tool yang izinnya tak dimiliki
 *      (urutannya tetap izin dulu — kotak centang bukan jalan naik hak akses)
 *   3. `null` berarti semua yang berizin
 *   4. array kosong berarti nol tool, bukan "semua"
 */
import { describe, it, expect } from 'vitest'
import { KATALOG_TOOL, katalogUntuk } from '../ai-tool.js'

/**
 * Meniru penyaringan `jalankanGiliranAi` — kedua lapisnya.
 *
 * Ditulis ulang di sini alih-alih memanggil fungsi aslinya: yang asli menuntut
 * gerbang biaya, konfigurasi tenant, dan basis. Yang diuji cuma logika
 * saringannya, dan menyalinnya membuat test ini berjalan tanpa satu pun query.
 *
 * Risikonya nyata — salinan bisa menyimpang dari aslinya — karena itu test
 * terakhir di berkas ini memeriksa bentuk saringan di SUMBER.
 */
function saring(izinPengguna: Set<string>, pilihan: string[] | null) {
  const izin =
    pilihan === null
      ? izinPengguna
      : new Set(
          [...izinPengguna].filter((p) =>
            KATALOG_TOOL.some((t) => t.izin === p && pilihan.includes(t.nama)),
          ),
        )
  return katalogUntuk(izin).filter((t) => pilihan === null || pilihan.includes(t.nama))
}

const IZIN_PENUH = new Set(KATALOG_TOOL.map((t) => t.izin))

/** Kurasi `staff` yang benar-benar dipasang di basis 2026-08-16. */
const STAFF = [
  'daftar_proyek', 'progres_lapangan', 'stok_material', 'kasbon', 'status_kasbon',
  'punch_item', 'milestone', 'tukang_cocok', 'beban_mandor', 'harga_satuan',
  'siapkan_tulis', 'perlu_perhatian', 'ingat_percakapan', 'pengingat_saya', 'titip_pengingat',
]

describe('kurasi tool_aktif', () => {
  it('yang TIDAK dipilih benar-benar tak ikut', () => {
    /*
      Inti berkas ini. Sebelum perbaikan: 15 dipilih, 22 terkirim.
    */
    const hasil = saring(IZIN_PENUH, STAFF)
    const nama = hasil.map((t) => t.nama)

    expect(hasil.length, `dipilih ${STAFF.length}, terkirim ${hasil.length}`).toBe(STAFF.length)

    for (const n of nama) {
      expect(STAFF, `tool '${n}' terkirim padahal tak dipilih`).toContain(n)
    }
  })

  it('tujuh penumpang gelap yang DULU lolos kini tertahan', () => {
    /*
      Disebut satu per satu, bukan sekadar dihitung: kalau salah satunya
      kembali lolos, pesannya menyebut namanya — bukan "22 ≠ 15" yang
      memaksa pembacanya mencari sendiri.
    */
    const dulu = [
      'saldo_kas', 'grafik_kurva_s', 'rab', 'change_order',
      'hitung_pekerjaan', 'banding_proyek', 'beban_mandor_lintas',
    ]
    const nama = saring(IZIN_PENUH, STAFF).map((t) => t.nama)

    for (const n of dulu) {
      expect(nama, `penumpang gelap '${n}' lolos lagi — saringan kedua hilang`)
        .not.toContain(n)
    }
  })

  it('pilihan TIDAK bisa menambah tool yang izinnya tak dimiliki', () => {
    /*
      Urutannya load-bearing: izin dulu, baru pilihan. Kalau terbalik, halaman
      pengaturan jadi jalan pintas ke data yang permission-nya sengaja tak
      diberikan — naik hak akses lewat kotak centang.
    */
    const hanyaProyek = new Set(['projects:view'])
    const minta = ['daftar_proyek', 'saldo_kas', 'jejak_audit'] // dua terakhir izin lain
    const nama = saring(hanyaProyek, minta).map((t) => t.nama)

    expect(nama).toContain('daftar_proyek')
    expect(nama, 'saldo_kas lolos padahal cash:view tak dimiliki').not.toContain('saldo_kas')
    expect(nama, 'jejak_audit lolos padahal audit:view tak dimiliki').not.toContain('jejak_audit')
  })

  it('null = semua yang berizin', () => {
    // Belum diatur ≠ nol tool. Tenant baru harus langsung berfungsi.
    expect(saring(IZIN_PENUH, null).length).toBe(KATALOG_TOOL.length)
  })

  it('array KOSONG = nol tool, bukan "semua"', () => {
    /*
      Pilihan sadar "jangan baca apa pun" harus dihormati. Menafsirkannya
      sebagai "semua" membuat tenant yang sengaja mematikan tool justru
      mendapat seluruhnya — kebalikan dari yang ia minta.
    */
    expect(saring(IZIN_PENUH, []).length).toBe(0)
  })

  it('saringan KEDUA masih ada di sumber', () => {
    /*
      `saring()` di atas SALINAN logika aslinya, dan salinan bisa menyimpang.
      Yang diperiksa di sini: bentuk saringannya masih ada di
      `ai-jalankan.ts`, supaya test ini tak hijau sementara produksinya
      kembali mengirim 22 tool.
    */
    const src = readFileSyncSafe(new URL('../ai-jalankan.ts', import.meta.url))
    expect(src, 'saringan kedua hilang — tool tak terpilih akan ikut lagi')
      .toMatch(/\.filter\(\s*\(t\) => pilihan === null \|\| pilihan\.includes\(t\.nama\)/)
  })
})

function readFileSyncSafe(url: URL): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  return readFileSync(url, 'utf8')
}
