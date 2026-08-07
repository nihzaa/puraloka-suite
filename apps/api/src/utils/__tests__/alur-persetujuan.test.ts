import { describe, it, expect } from 'vitest'
import { idAlurPersetujuan } from '../approval.js'

// ============================================================================
// F6-1 — `workflow_id`: mengikat langkah-langkah yang tersebar di BANYAK
// request.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI PERLU DIUJI, PADAHAL FUNGSINYA SATU BARIS
// ══════════════════════════════════════════════════════════════════════════
//
// Yang dijaga bukan implementasinya melainkan JANJINYA: dua langkah dari alur
// yang sama harus menghasilkan nilai yang sama, dan dua alur berbeda harus
// menghasilkan nilai berbeda.
//
// Kalau suatu hari seseorang "memperbaikinya" jadi `randomUUID()` — bentuk
// yang terlihat lebih benar untuk sebuah id — janji pertama patah, dan
// seluruh gunanya hilang: tiap langkah dapat workflow-nya sendiri, persis
// keadaan sebelum kolom ini dipakai. Tak ada galat, tak ada gejala; yang
// terjadi hanya jejak yang tak bisa dirunut lagi.
//
// Diukur 2026-08-07 sebelum perubahan: `workflow_id` terisi 0 dari 21.005.
// ============================================================================

const ESTIMASI_A = '4fefd86b-c88f-496a-97c8-054147fde4d8'
const ESTIMASI_B = 'ecb745b3-d7fb-4461-9081-046add058415'

describe('idAlurPersetujuan', () => {
  it('langkah-langkah alur yang SAMA berbagi workflow_id', () => {
    // Tiga event nyata dari satu estimasi: submitted -> approval.level ->
    // approved. Ketiganya request terpisah, jadi correlation_id-nya berbeda —
    // dan justru itu alasan workflow_id ada.
    const submitted = idAlurPersetujuan(ESTIMASI_A)
    const level1 = idAlurPersetujuan(ESTIMASI_A)
    const approved = idAlurPersetujuan(ESTIMASI_A)

    expect(submitted).toBe(level1)
    expect(level1).toBe(approved)
  })

  it('alur BERBEDA tidak tertukar', () => {
    expect(idAlurPersetujuan(ESTIMASI_A)).not.toBe(idAlurPersetujuan(ESTIMASI_B))
  })

  it('hasilnya uuid yang sah — kolomnya bertipe uuid', () => {
    // Nilai non-uuid akan ditolak Postgres, dan `logAuditEvent` menelan
    // galatnya (fire-and-forget). Jejaknya hilang tanpa suara — kelas cacat
    // yang paling sering berulang di repo ini.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(idAlurPersetujuan(ESTIMASI_A)).toMatch(UUID)
  })

  it('pengajuan ulang sesudah ditolak MEMAKAI alur yang sama — disengaja', () => {
    // Bukan cacat: pengajuan ulang adalah kelanjutan alur yang sama, bukan
    // alur baru. Justru itu yang ingin dilihat saat menanyakan "kenapa
    // dokumen ini bolak-balik tiga kali".
    const sebelumDitolak = idAlurPersetujuan(ESTIMASI_A)
    const sesudahDiajukanUlang = idAlurPersetujuan(ESTIMASI_A)
    expect(sesudahDiajukanUlang).toBe(sebelumDitolak)
  })
})
