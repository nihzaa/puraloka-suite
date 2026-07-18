# 32 — Library Selection Policy

> **Maturity:** 🟡 Partial — pola evaluasi sistematis sudah dipakai untuk keputusan besar (Library & Technology Evaluation di [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md), 11 library dievaluasi dengan kriteria eksplisit), tapi belum ada kebijakan formal yang mengikat *semua* penambahan dependency baru.

**Kedudukan:** Batch 6 — Governance. Kriteria evaluasi *sebelum* dependency ditambahkan. Melengkapi [23-dependency-management.md](23-dependency-management.md) (memelihara yang sudah ada) dan [33-package-approval-policy.md](33-package-approval-policy.md) (proses approval formal).

---

## 1. Purpose

Menjamin dependency baru dipilih berdasarkan kriteria konsisten (kompatibilitas arsitektur, maintenance burden, kematangan proyek) — bukan sekadar "yang lagi populer" atau "yang pertama muncul di pencarian" — mengurangi risiko harus mengganti library beberapa bulan kemudian karena pilihan tidak dipertimbangkan matang.

## 2. Background

[05-design-system-and-ui-ux-architecture.md § Library & Technology Evaluation](../../05-design-system-and-ui-ux-architecture.md#library--technology-evaluation) sudah menetapkan preseden nyata: 11 kandidat library (shadcn/ui, Tailwind v4, Origin UI, Magic UI, Aceternity UI, cmdk, TanStack Table, React Flow, TipTap, Motion, Tremor) dievaluasi dengan kriteria eksplisit (headless vs styled, kompatibilitas token Warm Clay, bundle size, maintenance activity) sebelum direkomendasikan. File ini menggeneralisasi pola evaluasi tersebut ke semua domain, bukan hanya UI.

## 3. Principles

1. **Headless/unstyled lebih disukai untuk UI library** ketika kompatibel dengan design system existing (Warm Clay) — library yang memaksa styling sendiri butuh override berlebihan atau konflik visual.
2. **Kematangan proyek (maintenance aktif, komunitas, dokumentasi) adalah kriteria wajib, bukan opsional.** Library yang terlihat menjanjikan tapi jarang di-update berisiko menjadi debt lebih cepat daripada manfaatnya.
3. **Pilot kecil sebelum adopsi luas.** Preseden [05-design-system-and-ui-ux-architecture.md § 3](../../05-design-system-and-ui-ux-architecture.md#library--technology-evaluation): command palette sebagai pilot pertama `cmdk` (area terisolasi, risiko rendah) sebelum dipakai lintas produk — pola Strangler-Fig diterapkan ke adopsi library.

## 4. Mandatory Rules

1. Dependency baru yang berdampak arsitektural (UI component library, ORM, testing framework, state management) **MUST** dievaluasi terhadap minimal: (a) kompatibilitas dengan arsitektur/design system existing, (b) aktivitas maintenance upstream (commit/release terkini), (c) ukuran bundle jika frontend, (d) alternatif yang dipertimbangkan dan kenapa ditolak — **MUST NOT** ditambahkan hanya berdasarkan preferensi personal tanpa evaluasi ini.
2. Library UI baru **MUST** diverifikasi kompatibel dengan token Warm Clay ([05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md)) sebelum diadopsi — **MUST NOT** dipilih karena stylingnya sendiri terlihat bagus jika bertentangan dengan design system yang sudah disetujui.
3. Library baru yang berdampak luas (dipakai lintas banyak halaman/domain) **MUST** melalui implementasi pilot pada satu area terisolasi terlebih dulu — **MUST NOT** langsung diadopsi lintas seluruh produk pada PR pertama.
4. Dependency yang duplikat fungsinya dengan dependency existing (mis. dua library date-formatting berbeda) **MUST NOT** ditambahkan — **MUST** memakai yang sudah ada kecuali ada alasan kuat terdokumentasi untuk migrasi penuh.

## 5. Recommended Rules

1. Evaluasi library **SHOULD** didokumentasikan singkat di PR description (bukan dokumen terpisah untuk setiap dependency kecil) — kecuali keputusan besar yang layak ADR ([19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)).

## 6. Anti-Pattern

**Dependency Ditambahkan Tanpa Evaluasi** — `pnpm add <library-populer-minggu-ini>` untuk menyelesaikan masalah kecil yang sebenarnya bisa diselesaikan dengan beberapa baris kode sendiri — menambah maintenance burden jangka panjang untuk manfaat jangka pendek yang kecil.

**Duplikasi Library untuk Fungsi Sama** — menambahkan library baru untuk formatting tanggal padahal sudah ada library serupa dipakai di tempat lain, karena developer tidak mengecek dulu apa yang sudah ada — bertentangan Mandatory Rule #4.

## 7. Example Good

Preseden [05-design-system-and-ui-ux-architecture.md § Library Evaluation](../../05-design-system-and-ui-ux-architecture.md#library--technology-evaluation): `cmdk` dipilih untuk command palette karena headless (kompatibel Warm Clay), fuzzy-match out-of-the-box, dan diverifikasi lewat pilot command palette sebelum dipertimbangkan area lain — konsisten Mandatory Rule #1-3.

## 8. Example Bad

*(Hipotetis)*: menambahkan component library ber-styling penuh (bukan headless) untuk satu form spesifik, yang stylingnya bentrok dengan token Warm Clay dan butuh override CSS ekstensif untuk terlihat konsisten — biaya override tersembunyi yang seharusnya terlihat saat evaluasi awal.

## 9. Migration Strategy

**Untuk domain UI** — 🟡 Partial, sudah ada preseden [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md) tapi belum diterapkan sebagai kebijakan mengikat semua dependency (baru UI). **Untuk domain lain (backend, testing, dst.)** — 🔵 Designed, N/A untuk migrasi mundur karena dependency existing (Fastify, Supabase client, dst.) sudah dipilih sebelum kebijakan ini ada — tidak dievaluasi ulang retroaktif kecuali ada alasan kuat untuk mengganti.

## 10. Checklist

- [ ] Dependency arsitektural baru dievaluasi (kompatibilitas, maintenance, bundle size, alternatif)
- [ ] Library UI baru kompatibel token Warm Clay
- [ ] Library berdampak luas melalui pilot terisolasi dulu
- [ ] Tidak duplikasi fungsi dengan dependency existing

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Dependency baru tanpa evaluasi terdokumentasi | 0 | Code review checklist |
| Library duplikat fungsi ditambahkan | 0 | Review `package.json` diff |

## 12. References

- [05-design-system-and-ui-ux-architecture.md § Library & Technology Evaluation](../../05-design-system-and-ui-ux-architecture.md#library--technology-evaluation)
- [23-dependency-management.md](23-dependency-management.md)
- [33-package-approval-policy.md](33-package-approval-policy.md)
- [19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)

---

*File selanjutnya: [33-package-approval-policy.md](33-package-approval-policy.md)*
