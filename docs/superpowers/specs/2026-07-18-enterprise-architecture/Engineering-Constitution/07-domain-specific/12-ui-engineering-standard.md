# 12 — UI Engineering Standard

> **Maturity:** 🟡 Partial — Warm Clay design system dan token dasar sudah diterapkan konsisten, tapi struktur 3-layer token (Primitive/Semantic/Component) belum lengkap dan library evaluation belum diadopsi lintas produk (baru command palette sebagai pilot).

**Kedudukan:** Batch 7 — Domain Spesifik. Mengoperasionalkan [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md) menjadi aturan kode. Melengkapi [06-governance/32-library-selection-policy.md](../06-governance/32-library-selection-policy.md) (evaluasi library UI) dan [01-foundations/02-folder-architecture.md](../01-foundations/02-folder-architecture.md) (lokasi komponen).

---

## 1. Purpose

Menjaga konsistensi visual dan interaksi lintas seluruh dashboard, portal client/mandor, dan (nanti) mobile app — supaya Warm Clay tetap menjadi satu bahasa desain koheren, bukan terfragmentasi tiap developer menerapkan interpretasi berbeda.

## 2. Background

Warm Clay ([2026-07-15-warm-clay-redesign-design.md](../../../2026-07-15-warm-clay-redesign-design.md)) adalah design system yang sudah disetujui dan diterapkan — [05-design-system-and-ui-ux-architecture.md § Hubungan dengan Warm Clay](../../05-design-system-and-ui-ux-architecture.md) secara eksplisit menyatakan doc 05 **tidak** menggantikannya, hanya menambah lapisan interaction model (command palette, data table pattern, dst.) di atasnya. Gap token 3-layer ([05 § 31. Design Token Architecture](../../05-design-system-and-ui-ux-architecture.md#31-design-token-architecture)) dicatat jujur: token semantik (`--primary`) sudah ada, tapi primitive layer di baliknya belum, dan component-level token baru relevan begitu shadcn/ui-style library diadopsi.

## 3. Principles

1. **Warm Clay adalah identitas visual yang tidak dinegosiasikan ulang per fitur.** Warna, font (Bricolage Grotesque + Plus Jakarta Sans), dan prinsip claymorphism-lite **MUST** dipertahankan — perubahan besar butuh ADR, bukan keputusan sepihak per komponen.
2. **Komponen primitive di satu lokasi kanonik, komponen domain-spesifik di lokasi lain** — sudah ditetapkan [01-foundations/02-folder-architecture.md Mandatory Rule #2](../01-foundations/02-folder-architecture.md#4-mandatory-rules), dirujuk ulang di sini sebagai konteks UI.
3. **Library baru diadopsi lewat pilot terisolasi, bukan langsung lintas produk** — preseden `cmdk` untuk command palette ([06-governance/32-library-selection-policy.md Principle #3](../06-governance/32-library-selection-policy.md#3-principles)).

## 4. Mandatory Rules

1. Komponen UI baru **MUST** memakai token warna/font yang sudah didefinisikan Warm Clay (`--primary`, `--surface`, dst., Bricolage Grotesque/Plus Jakarta Sans) — **MUST NOT** hardcode nilai warna/font baru yang menyimpang tanpa justifikasi desain eksplisit.
2. Primitive UI baru (button, card, badge, tanpa logic domain) **MUST** ditempatkan di `apps/web/components/ui/` — konsisten [01-foundations/02-folder-architecture.md Mandatory Rule #2](../01-foundations/02-folder-architecture.md#4-mandatory-rules).
3. Library UI baru yang berdampak luas **MUST** melalui pilot pada satu area terisolasi dulu sebelum adopsi lintas produk — konsisten [06-governance/32-library-selection-policy.md Mandatory Rule #3](../06-governance/32-library-selection-policy.md#4-mandatory-rules).
4. Perubahan visual besar (mengganti skema warna primer, mengganti font utama) **MUST** melalui ADR — **MUST NOT** diubah ad-hoc di satu halaman tanpa mempertimbangkan konsistensi lintas produk.
5. Komponen baru **MUST** diverifikasi berjalan benar di kedua mode (light/dark, jika aplikasi mendukung keduanya) dan responsif (mobile web minimal, mengingat akses HP/LAN sudah jadi fitur aktif) sebelum dianggap selesai.

## 5. Recommended Rules

1. Component Token layer (Layer 3) **SHOULD** mulai diperkenalkan begitu library ber-gaya shadcn/ui benar-benar diadopsi luas — bukan dibangun preventif sebelum kebutuhan nyata muncul (selaras YAGNI, [05 § 31. Design Token Architecture](../../05-design-system-and-ui-ux-architecture.md#31-design-token-architecture)).

## 6. Anti-Pattern

**Warna/Font Hardcode Menyimpang Token** — menulis `color: #1a1a1a` langsung di komponen baru alih-alih memakai `var(--text-primary)` — terlihat sama di layar developer tapi memutus konsistensi begitu token diubah terpusat (mis. penyesuaian kontras aksesibilitas).

**Library UI Diadopsi Langsung Lintas Produk Tanpa Pilot** — mengganti seluruh sistem tabel di 5 halaman berbeda dengan library baru dalam satu PR, tanpa pilot terisolasi terlebih dulu — risiko tinggi jika library ternyata tidak kompatibel dengan pola data kompleks yang sudah ada (kasbon, procurement, audit).

## 7. Example Good / 8. Example Bad

Lihat [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md) untuk contoh konkret pattern per komponen (command palette, data table, dst.) — tidak diduplikasi di sini untuk menghindari dua sumber kebenaran desain.

## 9. Migration Strategy

**Untuk Mandatory Rule #1, #2** — 🟢 sudah konsisten diterapkan di komponen existing. **Untuk Mandatory Rule #3 (pilot library)** — 🟡 Partial, preseden command palette sudah ada, belum jadi kebijakan wajib diterapkan konsisten untuk library berikutnya. **Untuk Mandatory Rule #4, #5** — 🔵 Designed, belum pernah diuji karena belum ada perubahan visual besar atau audit dark mode/responsif menyeluruh.

## 10. Checklist

- [ ] Komponen baru memakai token Warm Clay, bukan nilai hardcode
- [ ] Primitive UI di `components/ui/`, domain-spesifik di `components/` root
- [ ] Library UI berdampak luas melalui pilot dulu
- [ ] Perubahan visual besar disertai ADR

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Komponen baru dengan warna/font hardcode menyimpang token | 0 | Code review checklist |
| Library UI besar diadopsi tanpa pilot | 0 | Code review checklist |

## 12. References

- [2026-07-15-warm-clay-redesign-design.md](../../../2026-07-15-warm-clay-redesign-design.md)
- [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md)
- [06-governance/32-library-selection-policy.md](../06-governance/32-library-selection-policy.md)
- [01-foundations/02-folder-architecture.md](../01-foundations/02-folder-architecture.md)

---

*File selanjutnya: [26-feature-flag-standard.md](26-feature-flag-standard.md)*
