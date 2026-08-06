// ════════════════════════════════════════════════════════════════════════════
// SATU-SATUNYA tempat tenant ditentukan di aplikasi ini.
//
// Hari ini isinya satu baris: membaca env. Sistem berisi tepat satu company,
// dan gerbang mutlak (STATUS.md) melarang tenant kedua sebelum Tahap 4 & 5
// selesai.
//
// Fungsi ini tetap ada meski isinya sepele karena saat multi-tenant tiba, yang
// berubah HANYA di sini — resolusi dari hostname permintaan — bukan satu pun
// pemanggilnya. Alternatifnya (membaca env langsung di tiap tempat yang butuh)
// menyebarkan keputusan tenancy ke puluhan berkas, dan itu persis retrofit yang
// sedang menyita Fase 0 di modul lain.
// ════════════════════════════════════════════════════════════════════════════

export function resolveTenant(): string {
  const id = process.env.SITUS_COMPANY_ID?.trim()
  if (!id) {
    throw new Error(
      'SITUS_COMPANY_ID belum diset. Situs publik tidak tahu konten milik siapa.',
    )
  }
  return id
}
