// Change order mana yang boleh jadi SUMBER penarikan cadangan.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Ditemukan 2026-08-08 oleh `audit-kolom-tak-tersambung.mjs` — penjaga yang
// baru dipasang beberapa jam sebelumnya, dan temuan pertamanya persis pola
// yang melahirkannya:
//
//   `penggunaan_contingency.sumber_change_order_id` diterima di body
//   `POST /contingency/:id/penggunaan` dan LANGSUNG di-insert tanpa
//   diperiksa. UI tak punya cara mengirimnya.
//
// Bedanya dengan `rfq.mr_id` yang ditutup beberapa jam sebelumnya: **ini uang.**
//
// ── Kenapa hanya CO yang DISETUJUI
//
// Penarikan cadangan yang mengaku bersumber dari CO yang DITOLAK adalah jejak
// audit yang berbohong — dan itu lebih buruk daripada tak ada jejak sama
// sekali, karena ia dipercaya.
//
// Diukur pada data nyata: CO-001 `approved`, CO-002 `rejected`, keduanya di
// proyek yang sama. Tanpa aturan ini, keduanya sama-sama bisa dipilih.
//
// ── Kenapa TIDAK menghitung sisa CO di sini
//
// Satu CO bisa jadi sumber beberapa penarikan — pekerjaan tambah yang
// dikerjakan bertahap. Membatasi "sekali pakai" akan salah. Yang dijaga di
// sini adalah KELAYAKAN sumbernya; kecukupan pagu dijaga pos cadangan itu
// sendiri, dan itu invarian yang berbeda (`contingency.ts` sudah menolak
// penarikan pada pos berstatus `ditutup`).

/**
 * Status CO yang boleh jadi sumber.
 *
 * Daftar PUTIH, bukan daftar hitam. Daftar hitam akan meloloskan apa pun yang
 * lupa ditambahkan — dan yang lolos di sini adalah pembenaran palsu untuk
 * uang yang keluar. Gagal-tertutup, sesuai Ember [C] (CLAUDE.md §5.3).
 */
const STATUS_BOLEH = new Set(['approved'])

export interface ChangeOrderRingkas {
  id: string
  co_number: string
  status: string
  project_id: string
  title?: string | null
  description?: string | null
  total_amount_delta?: number | string | null
}

export interface KelayakanCo {
  id: string
  co_number: string
  status: string
  layak: boolean
  /** Alasan TIDAK layak, dalam bahasa yang bisa ditampilkan apa adanya. */
  sebab: string | null
  judul: string | null
  nilai: number | null
}

/** Postgres `numeric` tiba sebagai string; yang tak terbaca jadi null, bukan NaN. */
function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Apakah satu CO boleh jadi sumber penarikan di proyek tertentu.
 *
 * INVARIAN yang diuji:
 *  - CO ditolak → tidak layak, dengan sebab yang MENYEBUT penolakannya
 *    (bukan pesan generik "belum disetujui" — dua keadaan berbeda)
 *  - CO proyek lain → tidak layak meski disetujui
 *  - status tak dikenal → tidak layak (gagal-tertutup)
 *  - null → tidak layak, tidak melempar
 */
export function coLayakJadiSumber(
  co: ChangeOrderRingkas | null | undefined,
  projectId: string,
): KelayakanCo {
  const kosong = { judul: null, nilai: null }

  if (!co) {
    return {
      id: '', co_number: '', status: '', layak: false, ...kosong,
      sebab: 'Change order tidak ditemukan',
    }
  }

  const dasar = {
    id: co.id, co_number: co.co_number, status: co.status,
    judul: co.title ?? co.description ?? null,
    nilai: angka(co.total_amount_delta),
  }

  // Proyek diperiksa LEBIH DULU: CO milik proyek lain tak perlu dinilai
  // statusnya sama sekali, dan menyebut statusnya justru membocorkan
  // keadaan data tenant/proyek lain.
  if (co.project_id !== projectId) {
    return { ...dasar, layak: false, sebab: 'Change order milik proyek lain' }
  }

  if (!STATUS_BOLEH.has(co.status)) {
    return {
      ...dasar, layak: false,
      // "Ditolak" dan "belum disetujui" adalah dua keadaan berlawanan.
      // Memberi pesan yang sama untuk keduanya membuat orang menunggu
      // persetujuan yang tak akan pernah datang.
      sebab: co.status === 'rejected'
        ? 'Change order ini DITOLAK — tidak bisa jadi dasar penarikan cadangan'
        : 'Change order belum disetujui',
    }
  }

  return { ...dasar, layak: true, sebab: null }
}

/**
 * Ringkas daftar CO jadi "yang bisa dipilih" + "berapa yang tidak".
 *
 * Yang tak layak TIDAK dihilangkan diam-diam, hanya dihitung — daftar yang
 * menyusut tanpa penjelasan membuat orang bertanya "CO saya ke mana".
 */
export function ringkasCoSumber(
  daftar: ChangeOrderRingkas[],
  projectId: string,
): { layak: KelayakanCo[]; tak_layak: number } {
  const nilai = daftar.map((c) => coLayakJadiSumber(c, projectId))
  return {
    layak: nilai.filter((k) => k.layak),
    tak_layak: nilai.filter((k) => !k.layak).length,
  }
}
