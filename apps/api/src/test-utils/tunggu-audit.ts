import type { Client } from 'pg'

/**
 * TUNGGU AUDIT — menunggu jejak audit muncul, bukan mengasumsikannya
 * sudah ada.
 *
 * ── Kenapa perlu
 *
 * `logAuditEvent` dipanggil `void`, bukan `await` — 71 dari 106
 * pemanggilan di repo ini. Itu DISENGAJA dan benar: insert audit tak
 * boleh membuat permintaan pemakai gagal (lihat header `utils/audit.ts`).
 * Konsekuensinya, endpoint bisa mengembalikan 201 SEBELUM baris auditnya
 * masuk.
 *
 * Test yang langsung query `audit_logs` sesudah endpoint kembali sedang
 * berlomba dengan insert itu. Di mesin lokal yang cepat ia hampir selalu
 * menang; di CI yang lebih lambat dan berbagi database dengan lima shard
 * lain, ia kalah.
 *
 * Gejalanya paling menyesatkan: **hijau lokal, merah di CI, dan yang
 * merah berpindah-pindah tiap jalan**. Mudah sekali disimpulkan sebagai
 * "CI-nya rewel" lalu di-retry sampai kebetulan hijau — dan test yang
 * di-retry sampai lolos berhenti menguji apa pun.
 *
 * ── Kenapa menunggu, bukan `await logAuditEvent`
 *
 * Mengubah `void` jadi `await` akan membuat permintaan pemakai menunggu
 * insert audit, dan bila audit gagal permintaannya ikut gagal. Itu
 * membalik keputusan yang benar demi kenyamanan test. Yang harus
 * menyesuaikan adalah test-nya.
 *
 * ── Kenapa polling, bukan `sleep` tetap
 *
 * `sleep(500)` menambah setengah detik ke SETIAP test yang memakainya,
 * dan tetap gagal saat CI sedang lambat. Polling berhenti begitu barisnya
 * muncul — biasanya <50ms — dan hanya menunggu lama saat memang perlu.
 */
/** Satu baris `audit_logs`, dengan kolom JSON yang sering diperiksa test. */
export interface BarisAudit {
  new_values: Record<string, unknown>
  old_values: Record<string, unknown> | null
  action: string
  severity: string
  [kolom: string]: unknown
}

export async function tungguAudit(
  client: Client,
  opsi: {
    tabel: string
    recordId: string
    action?: string
    /** Berapa baris yang ditunggu. Default 1. */
    minimal?: number
    /** Batas tunggu total, ms. Default 5000. */
    batasMs?: number
  },
): Promise<BarisAudit[]> {
  const { tabel, recordId, action, minimal = 1, batasMs = 5000 } = opsi

  const syarat = action
    ? `table_name = $1 AND record_id = $2 AND action = $3`
    : `table_name = $1 AND record_id = $2`
  const params = action ? [tabel, recordId, action] : [tabel, recordId]

  const mulai = Date.now()
  let jeda = 25

  for (;;) {
    const { rows } = await client.query(
      `SELECT * FROM audit_logs WHERE ${syarat} ORDER BY created_at DESC`,
      params,
    )
    if (rows.length >= minimal) return rows as BarisAudit[]

    if (Date.now() - mulai > batasMs) {
      // Kembalikan apa adanya, JANGAN lempar. Assertion di test yang
      // memutuskan — pesannya jauh lebih berguna daripada galat generik
      // dari helper ini, dan test yang memeriksa "audit TIDAK ada" juga
      // memakai fungsi ini.
      return rows as BarisAudit[]
    }
    await new Promise((r) => setTimeout(r, jeda))
    jeda = Math.min(jeda * 2, 400)          // backoff, batas 400ms
  }
}
