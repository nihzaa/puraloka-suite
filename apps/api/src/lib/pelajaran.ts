/**
 * PELAJARAN (lessons learned) — aturannya, tanpa basis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Kenapa berkas ini ada, diukur 2026-08-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Modul lessons-learned punya tabel, empat trigger (immutable, no-delete,
 * transisi status, touch), fungsi propagasi atomik, alur persetujuan lewat
 * engine ADR-007, dan lima test. Tetapi rutenya hanya punya TIGA PATCH —
 * submit, approve, reject.
 *
 * Tak ada GET. Tak ada POST. Nol menu, nol halaman, nol entri Peta Modul.
 *
 * Artinya pelajaran tak bisa dibuat maupun dilihat lewat aplikasi; ia hanya
 * bisa disetujui, kalau ada yang menyisipkannya lewat SQL. Modul yang matang
 * di lapisan basis, dan tak terjangkau dari mana pun di atasnya.
 *
 * ── Kenapa ini penting untuk CAPA
 *
 * Taksonomi menandai `qc-capa` "sebagian": yang hidup baru sisi KOREKTIF —
 * memperbaiki cacat yang sudah terjadi, lewat NCR. Sisi PREVENTIF — mengubah
 * angka yang dipakai MERENCANAKAN supaya kesalahan sejenis tak terulang —
 * justru ada di sini, lengkap dengan propagasi ke price book dan productivity.
 * Ia hanya tak punya pintu.
 *
 * ── Aturan yang dijaga di sini
 *
 * Pelajaran tanpa USULAN tak mengubah apa pun saat disetujui — approve-nya
 * berhasil dan knowledge base tetap sama. Pelajaran tanpa AKAR MASALAH adalah
 * keluhan, bukan pelajaran: "biayanya membengkak" tidak memberitahu siapa pun
 * apa yang harus berbeda lain kali.
 */

export type TargetPropagasi = 'productivity' | 'price_book'

export const TARGET_PROPAGASI: readonly TargetPropagasi[] =
  ['productivity', 'price_book'] as const

export type MasukanPelajaran = {
  project_id?: string
  title?: string
  summary?: string
  planned_amount?: number | string
  actual_amount?: number | string
  akar?: Array<{ description?: string; category?: string }>
  usulan?: Array<{
    target_type?: string
    resource_id?: string
    cost_code_id?: string
    proposed_value?: number | string
  }>
}

export type NilaiPelajaran = {
  project_id: string
  title: string
  summary: string | null
  planned_amount: number
  actual_amount: number
  akar: Array<{ description: string; category: string | null }>
  usulan: Array<{
    target_type: TargetPropagasi
    resource_id: string
    cost_code_id: string | null
    proposed_value: number
  }>
}

export type HasilValidasi =
  | { ok: true; nilai: NilaiPelajaran }
  | { ok: false; galat: string }

/** Nominal wajib ADA, bukan sekadar terbaca sebagai angka. */
function nominal(v: unknown, nama: string): { ok: true; n: number } | { ok: false; galat: string } {
  // `Number('') === 0` — kalau kosong lolos jadi nol, varians dihitung dari
  // angka yang tak pernah dimasukkan siapa pun, dan hasilnya terlihat wajar.
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
    return { ok: false, galat: `${nama} wajib diisi.` }
  }
  const n = Number(v)
  if (!Number.isFinite(n)) return { ok: false, galat: `${nama} harus berupa angka.` }
  if (n < 0) return { ok: false, galat: `${nama} tidak boleh negatif.` }
  return { ok: true, n }
}

export function validasiPelajaran(b: MasukanPelajaran): HasilValidasi {
  if (!b.project_id) return { ok: false, galat: 'project_id wajib diisi.' }

  const title = (b.title ?? '').trim()
  if (!title) return { ok: false, galat: 'Judul pelajaran wajib diisi.' }
  if (title.length < 8) {
    return {
      ok: false,
      galat: 'Judul terlalu pendek untuk bisa ditemukan kembali. Tulis apa yang '
        + 'berbeda dari rencana, bukan sekadar nama pekerjaannya.',
    }
  }

  const pl = nominal(b.planned_amount, 'Nilai rencana')
  if (!pl.ok) return { ok: false, galat: pl.galat }
  const ac = nominal(b.actual_amount, 'Nilai aktual')
  if (!ac.ok) return { ok: false, galat: ac.galat }

  // ── Akar masalah: minimal satu, dan tak boleh kosong isinya
  const akarMasuk = b.akar ?? []
  const akar = akarMasuk
    .map((a) => ({
      description: (a.description ?? '').trim(),
      category: (a.category ?? '').trim() || null,
    }))
    .filter((a) => a.description !== '')

  if (akar.length === 0) {
    return {
      ok: false,
      galat: 'Sebutkan minimal satu akar masalah. Pelajaran tanpa akar masalah '
        + 'adalah keluhan — "biayanya membengkak" tak memberitahu siapa pun apa '
        + 'yang harus berbeda lain kali.',
    }
  }

  // ── Usulan propagasi: inti modulnya
  const usulanMasuk = b.usulan ?? []
  const usulan: NilaiPelajaran['usulan'] = []

  for (const [i, u] of usulanMasuk.entries()) {
    const t = (u.target_type ?? '').trim()
    if (!(TARGET_PROPAGASI as readonly string[]).includes(t)) {
      return {
        ok: false,
        galat: `Usulan ke-${i + 1}: target "${t || '(kosong)'}" tidak dikenali. `
          + `Pilih salah satu: ${TARGET_PROPAGASI.join(', ')}.`,
      }
    }
    if (!u.resource_id) {
      return { ok: false, galat: `Usulan ke-${i + 1}: resource wajib ditunjuk.` }
    }
    // `productivity` menempel pada cost code — tanpanya, angka produktivitas
    // baru tak punya tempat jatuh.
    if (t === 'productivity' && !u.cost_code_id) {
      return {
        ok: false,
        galat: `Usulan ke-${i + 1}: usulan produktivitas wajib menunjuk cost code.`,
      }
    }
    const nv = nominal(u.proposed_value, `Usulan ke-${i + 1}: nilai usulan`)
    if (!nv.ok) return { ok: false, galat: nv.galat }
    if (nv.n === 0) {
      return {
        ok: false,
        galat: `Usulan ke-${i + 1}: nilai nol tak mengubah apa pun saat disetujui.`,
      }
    }

    usulan.push({
      target_type: t as TargetPropagasi,
      resource_id: u.resource_id,
      cost_code_id: t === 'productivity' ? u.cost_code_id! : (u.cost_code_id ?? null),
      proposed_value: nv.n,
    })
  }

  if (usulan.length === 0) {
    return {
      ok: false,
      galat: 'Sebutkan minimal satu usulan perubahan. Pelajaran tanpa usulan tak '
        + 'mengubah apa pun saat disetujui — approve-nya berhasil dan angka yang '
        + 'dipakai merencanakan tetap sama seperti sebelumnya.',
    }
  }

  // Satu resource tak boleh diusulkan dua kali untuk target yang sama: yang
  // terakhir menang tanpa ada yang tahu usulan pertama pernah ada.
  const kunci = new Set<string>()
  for (const u of usulan) {
    const k = `${u.target_type}|${u.resource_id}|${u.cost_code_id ?? ''}`
    if (kunci.has(k)) {
      return {
        ok: false,
        galat: 'Ada dua usulan untuk resource dan target yang sama. Gabungkan jadi '
          + 'satu — kalau tidak, yang terakhir menang tanpa ada yang tahu usulan '
          + 'pertama pernah ada.',
      }
    }
    kunci.add(k)
  }

  return {
    ok: true,
    nilai: {
      project_id: b.project_id,
      title,
      summary: (b.summary ?? '').trim() || null,
      planned_amount: pl.n,
      actual_amount: ac.n,
      akar,
      usulan,
    },
  }
}

/**
 * Varians pelajaran: aktual − rencana.
 *
 * Positif = lebih mahal dari rencana (yang justru paling layak jadi pelajaran).
 * Dihitung di sini juga, meski basis punya kolomnya, supaya UI bisa
 * menampilkannya sebelum menyimpan.
 */
export function hitungVarians(rencana: number | string, aktual: number | string): {
  selisih: number
  persen: number | null
  arah: 'lebih_mahal' | 'lebih_murah' | 'sama'
} {
  const r = Number(rencana)
  const a = Number(aktual)
  if (!Number.isFinite(r) || !Number.isFinite(a)) {
    return { selisih: 0, persen: null, arah: 'sama' }
  }

  const selisih = Math.round((a - r) * 100) / 100
  return {
    selisih,
    // Pembagi nol dijaga: rencana 0 berarti tak ada pembanding, bukan
    // "menyimpang tak terhingga persen".
    persen: r > 0 ? Math.round((selisih / r) * 1000) / 10 : null,
    arah: selisih > 0 ? 'lebih_mahal' : selisih < 0 ? 'lebih_murah' : 'sama',
  }
}
