// Guard UUID untuk kolom bertipe uuid (Sub-Fase 1C/1D fix).
//
// correlation_id di audit_logs bertipe UUID. request.id
// (Fastify) TIDAK dijamin UUID: bila ada header `request-id` dari proxy/klien,
// Fastify memakainya apa adanya. Menulis non-UUID ke kolom uuid → insert GAGAL
// (22P02) → write hilang / divergensi. Guard ini menormalkan: UUID valid dipakai,
// selain itu null (write tetap sukses, korelasi degradasi — bukan gagal-tulis).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Kembalikan nilai bila UUID valid, selain itu null. */
export function asUuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}
