import type { FastifyRequest } from 'fastify'

// ============================================================
// GERBANG KEPEMILIKAN PROYEK — dipakai handler ber-`:projectId`.
//
// Sebagian besar endpoint per-proyek menyaring tabel kategori C dengan
// `project_id` yang datang dari URL. Tanpa memeriksa apakah proyek itu MILIK
// tenant, siapa pun bisa membaca isinya hanya dengan mengetahui id-nya —
// termasuk RAB, progress, kurva-S, milestone, dan change order perusahaan lain.
//
// Diperiksa SEKALI di awal handler, bukan diulang di tiap query. Alasannya
// bukan kerapian: handler seperti `reports/project` menjalankan 14 query, dan
// pola "ulang per-query" berarti satu kelupaan sudah cukup membuat seluruh
// gerbang tak berguna.
// ============================================================

/** True bila `projectId` milik company aktif request ini. */
export async function proyekMilikTenant(
  request: FastifyRequest,
  projectId: string
): Promise<boolean> {
  if (!projectId) return false
  return (await request.db!.projectIds()).includes(projectId)
}

/**
 * Daftar proyek yang boleh dibaca. `null` bila `projectId` diberikan tapi bukan
 * milik tenant — pemanggil membalas 404 (bukan 403: menjawab "tidak ditemukan"
 * tak membocorkan bahwa proyek itu ADA di perusahaan lain).
 *
 * Tanpa `projectId`, mengembalikan SELURUH proyek tenant — dipakai layar
 * lintas-proyek (dashboard, laporan) di mana filter bersifat opsional.
 */
export async function proyekBolehDibaca(
  request: FastifyRequest,
  projectId?: string | null
): Promise<string[] | null> {
  const milikTenant = await request.db!.projectIds()
  if (!projectId) return milikTenant
  return milikTenant.includes(projectId) ? [projectId] : null
}
