/**
 * 1.15 — PORTOFOLIO LINTAS BADAN USAHA ("bagaimana performa semua PT saya?").
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA TOOL YANG SENGAJA MELIHAT LEBIH DARI SATU TENANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Seluruh tool lain di katalog ini terkurung pada satu `companyId`, dan itu
 * pertahanan paling mendasar sistem multi-tenant. Tool ini melanggarnya
 * dengan sengaja — jadi batasnya harus dinyatakan setajam mungkin, bukan
 * disamarkan.
 *
 * ── Yang MENENTUKAN batas: keanggotaan, bukan silsilah
 *
 * Godaan terbesarnya membaca `parent_company_id` lalu menampilkan seluruh
 * anak perusahaan. Itu SALAH, dan salahnya berbahaya: pemilik grup bisa
 * punya PT yang direkturnya bukan dia, dan seorang staf yang kebetulan
 * bekerja di satu anak perusahaan tak boleh melihat angka anak lainnya.
 *
 * Yang dipakai `company_members` — daftar PT tempat PENANYA benar-benar
 * terdaftar sebagai anggota aktif. Persis aturan yang sudah dipakai
 * `plugins/auth.ts` saat memilih tenant aktif: "user MEMINTA company yang
 * bukan haknya" dijawab 403, bukan dilayani.
 *
 * Hasilnya: tool ini tak pernah memperlihatkan satu baris pun yang tak bisa
 * dibuka penanya lewat UI biasa dengan berpindah tenant. Ia menghemat
 * langkah, bukan membuka pintu.
 *
 * ── Kenapa `unsafe()` dan bukan pembungkus biasa
 *
 * `db.from()` mengunci ke satu tenant — itu memang gunanya. Tool ini butuh
 * beberapa, jadi ia memakai `unsafe()` dengan saringan `.in()` atas daftar
 * yang SUDAH dibatasi keanggotaan. Alasannya tercatat di tiap panggilan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIBANGUN SEKARANG PADAHAL PURALOKA CUMA SATU PT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keputusan founder 2026-08-16: produk ini dijual sebagai SaaS, dan satu
 * pemilik dengan beberapa PT adalah bentuk lazim kontraktor Indonesia.
 * Membangunnya setelah ada pelanggan berarti membangunnya di bawah tekanan,
 * pada data sungguhan, tanpa ruang salah.
 *
 * I-1: hanya SELECT.
 */

import type { TenantDb } from '../utils/tenant-db.js'

const BATAS = 900

export interface BarisBadanUsaha {
  nama: string
  ini: boolean
  jumlahProyek: number
  proyekBerjalan: number
  nilaiKontrak: number
}

export interface HasilPortofolioGrup {
  badanUsaha: BarisBadanUsaha[]
  totalNilaiKontrak: number
  totalProyek: number
  catatan?: string
}

/**
 * Portofolio seluruh badan usaha yang PENANYA jadi anggotanya.
 *
 * `companyIni` dipakai menandai mana tenant yang sedang aktif — tanpa itu,
 * pembaca tak tahu angka mana yang sedang ia lihat di layar.
 */
export async function ringkasPortofolioGrup(
  db: TenantDb,
  userId: string,
  companyIni: string,
): Promise<HasilPortofolioGrup | { galat: string }> {
  /*
   * Langkah 1 — daftar PT tempat penanya BENAR-BENAR anggota.
   *
   * Inilah gerbangnya. Semua langkah berikutnya menyaring ke daftar ini, jadi
   * tak ada jalan bagi baris di luar keanggotaan untuk ikut terbaca.
   */
  const { data: anggota, error: e1 } = await db
    .unsafe(
      'company_members',
      'tool baca AI 1.15: portofolio lintas badan usaha — DISARING user_id = ' +
        'penanya sendiri, jadi hanya PT tempat ia terdaftar anggota aktif yang ' +
        'bisa terbaca. Bukan silsilah induk-anak.',
    )
    .select('company_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(BATAS)

  if (e1) return { galat: 'Gagal membaca daftar badan usaha Anda.' }

  const idPt = [
    ...new Set(
      ((anggota ?? []) as { company_id: string }[])
        .map((r) => r.company_id)
        .filter(Boolean),
    ),
  ]

  if (idPt.length <= 1) {
    /*
     * Satu PT bukan galat, dan bukan pula "portofolio dengan satu baris".
     * Menjawabnya dengan tabel satu baris membuat penanya menyangka ia punya
     * grup usaha padahal tidak. Dinyatakan apa adanya.
     */
    return {
      badanUsaha: [],
      totalNilaiKontrak: 0,
      totalProyek: 0,
      catatan:
        'Anda hanya terdaftar di satu badan usaha, jadi tidak ada portofolio ' +
        'lintas-PT untuk dibandingkan. Pertanyaan tentang perusahaan ini bisa ' +
        'dijawab tool biasa.',
    }
  }

  const { data: pt, error: e2 } = await db
    .unsafe(
      'companies',
      'tool baca AI 1.15: nama badan usaha — DISARING id ∈ daftar keanggotaan ' +
        'penanya yang sudah dibatasi di langkah sebelumnya.',
    )
    .select('id, name')
    .in('id', idPt)
    .limit(BATAS)

  if (e2) return { galat: 'Gagal membaca nama badan usaha.' }

  const { data: proyek, error: e3 } = await db
    .unsafe(
      'projects',
      'tool baca AI 1.15: proyek lintas badan usaha — DISARING company_id ∈ ' +
        'daftar keanggotaan penanya. Tak ada tenant di luar itu yang terbaca.',
    )
    .select('company_id, contract_value, status')
    .in('company_id', idPt)
    .eq('is_deleted', false)
    .limit(BATAS)

  if (e3) return { galat: 'Gagal membaca proyek badan usaha.' }

  const barisProyek = (proyek ?? []) as {
    company_id: string
    contract_value: string | number | null
    status: string | null
  }[]

  /*
   * Pemotongan senyap: kalau bacaan menyentuh batas, totalnya SUDAH kurang
   * dan tak ada galat yang mengatakannya. Angka portofolio yang kurang lebih
   * buruk daripada penolakan — ia dipakai mengambil keputusan.
   */
  if (barisProyek.length >= BATAS) {
    return {
      galat:
        'Proyek pada grup ini terlalu banyak untuk diringkas sekaligus. ' +
        'Tanyakan per badan usaha.',
    }
  }

  const kum = new Map<string, { n: number; jalan: number; nilai: number }>()
  for (const p of barisProyek) {
    let k = kum.get(p.company_id)
    if (!k) { k = { n: 0, jalan: 0, nilai: 0 }; kum.set(p.company_id, k) }
    k.n += 1
    if (p.status === 'active') k.jalan += 1
    const v = Number(p.contract_value ?? 0)
    if (Number.isFinite(v)) k.nilai += v
  }

  const nama = new Map(
    ((pt ?? []) as { id: string; name: string | null }[]).map((r) => [
      r.id,
      r.name ?? '(tanpa nama)',
    ]),
  )

  const badanUsaha: BarisBadanUsaha[] = idPt
    .map((id) => {
      const k = kum.get(id) ?? { n: 0, jalan: 0, nilai: 0 }
      return {
        nama: nama.get(id) ?? '(tanpa nama)',
        ini: id === companyIni,
        jumlahProyek: k.n,
        proyekBerjalan: k.jalan,
        nilaiKontrak: Math.round(k.nilai),
      }
    })
    .sort((a, b) => b.nilaiKontrak - a.nilaiKontrak)

  return {
    badanUsaha,
    totalNilaiKontrak: badanUsaha.reduce((s, b) => s + b.nilaiKontrak, 0),
    totalProyek: badanUsaha.reduce((s, b) => s + b.jumlahProyek, 0),
  }
}
