/**
 * TEMPLATE WBS (F2) — kerangka pekerjaan yang dipakai ulang. PURE, tanpa I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LUBANG YANG DITUTUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: **13 dari 15 proyek punya NOL item RAB**. Dua yang terisi
 * punya 285 dan 88 item — dan 8 dari 16 kategori uniknya IDENTIK kata demi
 * kata: "PEKERJAAN PERSIAPAN", "PEKERJAAN BETON", "PEKERJAAN PASANGAN", dan
 * seterusnya.
 *
 * Struktur yang sama diketik ulang tiap proyek. Yang hilang bukan waktunya
 * saja: proyek yang strukturnya diketik dari ingatan akan MELEWATKAN pos
 * pekerjaan, dan pos yang tak ada di RAB tak pernah dianggarkan.
 *
 * `cbs_templates` + `cbs_nodes` sudah ada untuk persis ini sejak awal. Isinya
 * satu baris smoke test, nol pembaca di seluruh kode.
 *
 * ── Kenapa menerapkan template TIDAK menghapus RAB yang ada
 *
 * Menerapkan template pada proyek ber-RAB adalah kesalahan yang tak bisa
 * dibatalkan: 285 item beserta harga, bobot, dan progresnya hilang karena satu
 * ketukan. Jadi penerapan MENOLAK bila sudah ada isinya, dan pemanggil harus
 * mengosongkannya lebih dulu dengan sadar.
 *
 * ── Kenapa harga TIDAK ikut dari template
 *
 * Template membawa STRUKTUR, bukan angka. Harga satuan berubah tiap proyek
 * (lokasi, waktu, volume), dan template yang membawa harga lama membuat
 * anggaran baru lahir dengan harga tahun lalu — yang terlihat wajar sampai
 * seseorang membandingkannya dengan penawaran.
 */

export type SumberTemplate = 'standard' | 'company' | 'project'
export type StatusTemplate = 'draft' | 'active' | 'superseded'
export type LevelRab = 'category' | 'subcategory' | 'item'

export interface NodeTemplate {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  cost_code_id?: string | null
}

export interface BarisRabBaru {
  level: LevelRab
  name: string
  sort_order: number
  /** Diisi pemanggil sesudah induknya tersimpan — pohon ditulis per-tingkat. */
  parent_kunci: string | null
  /** Kunci node asal, dipakai memetakan parent saat menulis. */
  kunci: string
}

export type HasilSusun =
  | { ok: true; baris: BarisRabBaru[]; jumlahTingkat: number }
  | { ok: false; galat: string }

/**
 * Ubah pohon node template jadi daftar baris RAB, terurut induk-sebelum-anak.
 *
 * ── Kenapa level diturunkan dari KEDALAMAN, bukan disimpan di template
 *
 * `rab_items.level` hanya mengenal tiga tingkat (`category`/`subcategory`/
 * `item`), sementara `cbs_nodes` adalah pohon sedalam apa pun. Menyimpan level
 * di template berarti dua tempat yang bisa berselisih; menurunkannya membuat
 * satu kebenaran.
 *
 * Kedalaman di atas tiga dipadatkan ke `item` — bukan ditolak. Menolaknya
 * berarti template yang sah di dunia CBS (yang memang berjenjang dalam) tak
 * bisa dipakai sama sekali, dan padatan itu tak menghilangkan informasi:
 * hierarkinya tetap terjaga lewat `parent_id`.
 */
export function susunBarisRab(node: readonly NodeTemplate[]): HasilSusun {
  if (node.length === 0) {
    return { ok: false, galat: 'Template ini belum punya satu pun baris struktur.' }
  }

  const perId = new Map<string, NodeTemplate>()
  for (const n of node) perId.set(n.id, n)

  // Induk yang menunjuk node di luar daftar = pohon yang tak lengkap. Ini
  // dijaga trigger basis juga, tapi kalau sampai lolos ke sini, menuliskannya
  // menghasilkan RAB yang cabangnya menggantung tanpa induk.
  for (const n of node) {
    if (n.parent_id !== null && !perId.has(n.parent_id)) {
      return {
        ok: false,
        galat: `Baris "${n.name}" menunjuk induk yang tak ada di template ini.`,
      }
    }
  }

  const kedalaman = new Map<string, number>()
  const hitungKedalaman = (n: NodeTemplate, jejak: Set<string>): number | null => {
    const sudah = kedalaman.get(n.id)
    if (sudah !== undefined) return sudah
    // Lingkaran induk membuat penelusuran tak pernah berhenti. Basis mencegah
    // sebagian lewat `parent_id <> id`, tetapi lingkaran BERTIGA lolos dari
    // CHECK itu — dan hasilnya proses yang menggantung, bukan galat.
    if (jejak.has(n.id)) return null
    jejak.add(n.id)

    let d: number
    if (n.parent_id === null) {
      d = 0
    } else {
      const induk = hitungKedalaman(perId.get(n.parent_id)!, jejak)
      if (induk === null) return null
      d = induk + 1
    }
    jejak.delete(n.id)
    kedalaman.set(n.id, d)
    return d
  }

  for (const n of node) {
    if (hitungKedalaman(n, new Set()) === null) {
      return {
        ok: false,
        galat: 'Struktur template membentuk lingkaran induk — pohonnya tak bisa ditelusuri.',
      }
    }
  }

  const levelDari = (d: number): LevelRab =>
    d === 0 ? 'category' : d === 1 ? 'subcategory' : 'item'

  // Induk SEBELUM anak. Pemanggil menulis per-tingkat dan butuh id induk yang
  // sudah tersimpan; urutan lain memaksanya menulis dua kali.
  const urut = [...node].sort((a, b) => {
    const da = kedalaman.get(a.id)!
    const db = kedalaman.get(b.id)!
    if (da !== db) return da - db
    return a.sort_order - b.sort_order
  })

  return {
    ok: true,
    jumlahTingkat: Math.max(...[...kedalaman.values()]) + 1,
    baris: urut.map((n) => ({
      level: levelDari(kedalaman.get(n.id)!),
      name: n.name,
      sort_order: n.sort_order,
      parent_kunci: n.parent_id,
      kunci: n.id,
    })),
  }
}

export type HasilPeriksaTerap =
  | { boleh: true; peringatan?: string }
  | { boleh: false; sebab: string }

/**
 * Bolehkah template diterapkan ke proyek ini?
 *
 * ── Kenapa RAB yang sudah ada MENOLAK, bukan ditimpa
 *
 * Menimpa berarti 285 item beserta harga, bobot, dan progresnya hilang karena
 * satu ketukan — dan tak ada undo. Yang menolak di sini bukan kehati-hatian
 * berlebihan: `rab_items` menyimpan `progress_pct` yang berasal dari laporan
 * lapangan, dan itu tak bisa dibuat ulang dari mana pun.
 */
export function periksaTerapTemplate(m: {
  statusTemplate: StatusTemplate
  jumlahNode: number
  jumlahRabProyek: number
}): HasilPeriksaTerap {
  if (m.statusTemplate === 'draft') {
    return {
      boleh: false,
      sebab: 'Template masih draf. Aktifkan lebih dulu — draf boleh berubah kapan saja, '
        + 'dan proyek yang dibuat darinya tak punya struktur yang bisa dirujuk.',
    }
  }
  if (m.statusTemplate === 'superseded') {
    return {
      boleh: false,
      sebab: 'Template ini sudah digantikan versi yang lebih baru. Pakai versi terbarunya.',
    }
  }

  if (m.jumlahNode === 0) {
    return { boleh: false, sebab: 'Template ini belum punya satu pun baris struktur.' }
  }

  if (m.jumlahRabProyek > 0) {
    return {
      boleh: false,
      sebab: `Proyek ini sudah punya ${m.jumlahRabProyek} baris RAB. Menerapkan template `
        + 'akan menimpanya, termasuk harga dan progres yang sudah tercatat dari lapangan '
        + '— dan itu tak bisa dibatalkan. Kosongkan RAB-nya lebih dulu bila memang '
        + 'hendak diganti.',
    }
  }

  return { boleh: true }
}

export interface RingkasTemplate {
  id: string
  code: string
  name: string
  source: SumberTemplate
  version_number: number
  status: StatusTemplate
  jumlahNode?: number
}

/**
 * Urutan yang dipakai layar: yang SIAP PAKAI di atas.
 *
 * `active` lebih dulu karena hanya itu yang bisa diterapkan; `draft` menyusul
 * karena ia pekerjaan yang belum selesai; `superseded` paling bawah karena ia
 * riwayat. Di dalam tiap kelompok, versi terbaru di depan.
 */
export function urutkanTemplate(daftar: readonly RingkasTemplate[]): RingkasTemplate[] {
  const bobot: Record<StatusTemplate, number> = { active: 0, draft: 1, superseded: 2 }
  return [...daftar].sort((a, b) => {
    const w = bobot[a.status] - bobot[b.status]
    if (w !== 0) return w
    const c = a.code.localeCompare(b.code)
    if (c !== 0) return c
    return b.version_number - a.version_number
  })
}

/**
 * Nomor versi berikutnya untuk sebuah kode.
 *
 * Mengambil MAKS + 1, bukan jumlah baris: versi yang dihapus tak boleh
 * membuat nomornya lahir kembali — pelajaran yang sama dengan penomoran
 * dokumen (F1), dan alasannya sama (dokumen yang merujuk versi lama).
 */
export function versiBerikutnya(versiAda: readonly number[]): number {
  if (versiAda.length === 0) return 1
  const maks = versiAda.reduce((t, v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > t ? n : t
  }, 0)
  return maks + 1
}
