# 12 — UI Engineering Standard

> **Maturity:** 🟡 Partial — Warm Clay design system dan token dasar sudah diterapkan konsisten, tapi struktur 3-layer token (Primitive/Semantic/Component) belum lengkap dan library evaluation belum diadopsi lintas produk (baru command palette sebagai pilot). v1.1: aksesibilitas (WCAG) ditambahkan sebagai Mandatory Rule baru — **standar WCAG sudah didesain lengkap** di [05-design-system-and-ui-ux-architecture.md § Accessibility Standards](../../05-design-system-and-ui-ux-architecture.md#accessibility-standards) dan [§ Keyboard Navigation Standards](../../05-design-system-and-ui-ux-architecture.md#keyboard-navigation-standards) (ditemukan saat audit v1.1 — tidak ada di 07 sebelumnya karena gap ada di level *penegakan kode*, bukan di level *desain standar*); file ini hanya menjadikannya Mandatory Rule mengikat, tidak mendefinisikan ulang. 🔵 Designed murni untuk penegakan — doc05 sendiri mencatat nol audit WCAG formal pernah dilakukan.

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
4. **Aksesibilitas adalah kualitas produk, bukan fitur opsional untuk pelanggan enterprise nanti.** Standar WCAG 2.1 AA sudah didesain penuh di [05 § Accessibility Standards](../../05-design-system-and-ui-ux-architecture.md#accessibility-standards) sejak dokumen itu ditulis — gap yang ditutup file ini bukan "standarnya belum ada," tapi "standarnya belum jadi Mandatory Rule yang mengikat setiap komponen baru." Warna/font Warm Clay yang gagal kontras minimum, atau komponen yang tidak bisa dinavigasi keyboard, adalah bug sejak commit itu ditulis — bukan gap yang hanya relevan begitu ada pelanggan yang mensyaratkannya secara kontraktual ([Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md](../../Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md) untuk konteks kapan ini jadi syarat procurement formal, bukan syarat teknis untuk mulai menegakkannya).

## 4. Mandatory Rules

1. Komponen UI baru **MUST** memakai token warna/font yang sudah didefinisikan Warm Clay (`--primary`, `--surface`, dst., Bricolage Grotesque/Plus Jakarta Sans) — **MUST NOT** hardcode nilai warna/font baru yang menyimpang tanpa justifikasi desain eksplisit.
2. Primitive UI baru (button, card, badge, tanpa logic domain) **MUST** ditempatkan di `apps/web/components/ui/` — konsisten [01-foundations/02-folder-architecture.md Mandatory Rule #2](../01-foundations/02-folder-architecture.md#4-mandatory-rules).
3. Library UI baru yang berdampak luas **MUST** melalui pilot pada satu area terisolasi dulu sebelum adopsi lintas produk — konsisten [06-governance/32-library-selection-policy.md Mandatory Rule #3](../06-governance/32-library-selection-policy.md#4-mandatory-rules).
4. Perubahan visual besar (mengganti skema warna primer, mengganti font utama) **MUST** melalui ADR — **MUST NOT** diubah ad-hoc di satu halaman tanpa mempertimbangkan konsistensi lintas produk.
5. Komponen baru **MUST** diverifikasi berjalan benar di kedua mode (light/dark, jika aplikasi mendukung keduanya) dan responsif (mobile web minimal, mengingat akses HP/LAN sudah jadi fitur aktif) sebelum dianggap selesai.
6. Komponen baru **MUST** memenuhi seluruh baris tabel [05 § Accessibility Standards](../../05-design-system-and-ui-ux-architecture.md#accessibility-standards) yang relevan dengan komponen tersebut (kontras warna 4.5:1 teks normal/3:1 teks besar-UI non-teks, focus ring selalu visible, alt-text/aria-label untuk ikon aksi, `prefers-reduced-motion` dihormati, tabel data alternatif untuk chart finansial) — **MUST NOT** menambah token warna baru ke Warm Clay tanpa verifikasi kontras terhadap kombinasi background yang akan dipakai (rasio persis: lihat tabel di doc05, tidak diduplikasi di sini).
7. Komponen interaktif baru **MUST** memenuhi minimal Level 1 [05 § Keyboard Navigation Standards](../../05-design-system-and-ui-ux-architecture.md#keyboard-navigation-standards) (tab order mengikuti urutan visual, semua aksi terjangkau tanpa mouse) — **MUST NOT** ada aksi yang hanya bisa dipicu lewat mouse/sentuhan. Level 2-3 (shortcut kontekstual, global "go to") mengikuti Now/Next/Later doc05, bukan wajib serentak untuk setiap komponen baru.
8. Elemen non-teks yang menyampaikan informasi (icon status, badge warna) **MUST** disertai indikator non-warna (teks, ikon berbeda, pola) — **MUST NOT** mengandalkan warna sebagai satu-satunya pembeda makna (mis. badge merah vs hijau tanpa label teks), karena tidak bisa dibedakan pengguna buta warna. *(Item ini tidak eksplisit di tabel doc05 — ditambahkan sebagai kontribusi baru EC, konsisten prinsip WCAG 1.4.1 yang menjadi dasar seluruh tabel doc05.)*

## 5. Recommended Rules

1. Component Token layer (Layer 3) **SHOULD** mulai diperkenalkan begitu library ber-gaya shadcn/ui benar-benar diadopsi luas — bukan dibangun preventif sebelum kebutuhan nyata muncul (selaras YAGNI, [05 § 31. Design Token Architecture](../../05-design-system-and-ui-ux-architecture.md#31-design-token-architecture)).

## 6. Anti-Pattern

**Warna/Font Hardcode Menyimpang Token** — menulis `color: #1a1a1a` langsung di komponen baru alih-alih memakai `var(--text-primary)` — terlihat sama di layar developer tapi memutus konsistensi begitu token diubah terpusat (mis. penyesuaian kontras aksesibilitas).

**Library UI Diadopsi Langsung Lintas Produk Tanpa Pilot** — mengganti seluruh sistem tabel di 5 halaman berbeda dengan library baru dalam satu PR, tanpa pilot terisolasi terlebih dulu — risiko tinggi jika library ternyata tidak kompatibel dengan pola data kompleks yang sudah ada (kasbon, procurement, audit).

**Warna Sebagai Satu-Satunya Indikator Status** — badge status kasbon (pending/approved/rejected) yang hanya dibedakan lewat warna kuning/hijau/merah tanpa label teks — pengguna buta warna (perkiraan ~8% populasi pria) tidak bisa membedakan status tanpa mengklik untuk detail, memperlambat kerja yang seharusnya bisa dipindai sekilas.

## 7. Example Good / 8. Example Bad

Lihat [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md) untuk contoh konkret pattern per komponen (command palette, data table, dst.) — tidak diduplikasi di sini untuk menghindari dua sumber kebenaran desain.

## 9. Migration Strategy

**Untuk Mandatory Rule #1, #2** — 🟢 sudah konsisten diterapkan di komponen existing. **Untuk Mandatory Rule #3 (pilot library)** — 🟡 Partial, preseden command palette sudah ada, belum jadi kebijakan wajib diterapkan konsisten untuk library berikutnya. **Untuk Mandatory Rule #4, #5** — 🔵 Designed, belum pernah diuji karena belum ada perubahan visual besar atau audit dark mode/responsif menyeluruh.

**Untuk Mandatory Rule #6-7 (WCAG kontras/motion/alt-text, keyboard Level 1)** — 🟡 Partial, mengikuti Now/Next/Later yang sudah ditetapkan doc05: audit kontras Warm Clay dark mode dan aria-label ikon aksi = **Now** (murah, pakai skill `a11y-audit` yang sudah ada di project — [05 § Accessibility Standards](../../05-design-system-and-ui-ux-architecture.md#accessibility-standards)); Level 1 keyboard = **Now**, tidak terpisahkan dari Accessibility Standards; full audit otomatis terintegrasi CI = **Next**, menunggu CI/CD dasar Phase 1 selesai ([Engineering-Constitution/05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)). **MUST NOT** ditunda ke Later — komponen existing belum diaudit bukan berarti boleh dibiarkan, hanya belum diverifikasi.

**Untuk Mandatory Rule #8 (indikator non-warna)** — 🔵 Designed, kontribusi EC yang tidak eksplisit di doc05 — N/A migrasi mundur, berlaku penuh untuk komponen baru sejak commit pertama; audit retroaktif komponen existing (badge status kasbon/CO/procurement) **SHOULD** dilakukan bertahap saat komponen tersebut disentuh untuk pekerjaan lain.

## 10. Checklist

- [ ] Komponen baru memakai token Warm Clay, bukan nilai hardcode
- [ ] Primitive UI di `components/ui/`, domain-spesifik di `components/` root
- [ ] Library UI berdampak luas melalui pilot dulu
- [ ] Perubahan visual besar disertai ADR
- [ ] Kombinasi warna teks/background memenuhi kontras WCAG AA (4.5:1 teks normal, 3:1 teks besar/non-teks)
- [ ] Komponen interaktif bisa dioperasikan penuh lewat keyboard
- [ ] Informasi berbasis warna disertai indikator non-warna (teks/ikon/pola)

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Komponen baru dengan warna/font hardcode menyimpang token | 0 | Code review checklist |
| Library UI besar diadopsi tanpa pilot | 0 | Code review checklist |
| Komponen baru gagal kontras WCAG AA | 0 | Code review checklist + audit tools (mis. axe DevTools) begitu tersedia |
| Informasi status yang hanya dibedakan lewat warna | 0 | Code review checklist |

## 12. References

- [2026-07-15-warm-clay-redesign-design.md](../../../2026-07-15-warm-clay-redesign-design.md)
- [05-design-system-and-ui-ux-architecture.md](../../05-design-system-and-ui-ux-architecture.md)
- [05-design-system-and-ui-ux-architecture.md § Accessibility Standards](../../05-design-system-and-ui-ux-architecture.md#accessibility-standards)
- [05-design-system-and-ui-ux-architecture.md § Keyboard Navigation Standards](../../05-design-system-and-ui-ux-architecture.md#keyboard-navigation-standards)
- [06-governance/32-library-selection-policy.md](../06-governance/32-library-selection-policy.md)
- [01-foundations/02-folder-architecture.md](../01-foundations/02-folder-architecture.md)
- [Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md](../../Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md)

---

*File selanjutnya: [26-feature-flag-standard.md](26-feature-flag-standard.md)*
