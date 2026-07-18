# 20 — Checklist Before Merge

> **Maturity:** 🔵 Designed — belum ada gate merge formal hari ini (push langsung/self-merge tanpa checklist eksplisit). Kontrak yang mengikat proses merge begitu branch protection aktif ([14-git-workflow-standard.md](14-git-workflow-standard.md)).

**Kedudukan:** Batch 5 — Proses Tim. Titik verifikasi terakhir sebelum kode masuk `main` — mengagregasi [15-code-review-checklist.md](15-code-review-checklist.md) (gate manual) dan [11-devsecops-standard.md](11-devsecops-standard.md) (gate otomatis) menjadi satu keputusan go/no-go.

---

## 1. Purpose

Memberikan titik keputusan tunggal dan tegas — PR ini boleh di-merge atau tidak — dengan kriteria yang sudah didefinisikan di file lain, bukan penilaian ad-hoc saat itu juga.

## 2. Background

File ini adalah agregat akhir: [15-code-review-checklist.md](15-code-review-checklist.md) mendefinisikan apa yang direview manusia, [11-devsecops-standard.md](11-devsecops-standard.md) mendefinisikan apa yang diverifikasi mesin. "Checklist Before Merge" adalah irisan keduanya di titik keputusan — jika salah satu gagal, merge **MUST NOT** terjadi.

## 3. Principles

1. **Merge adalah keputusan biner berdasarkan kriteria eksplisit, bukan judgment call di titik tekanan waktu.** Deadline tidak mengubah kriteria merge — kriteria yang longgar di bawah tekanan adalah kriteria yang tidak pernah benar-benar berlaku.
2. **Setiap MUST rule yang dilanggar memblokir merge tanpa pengecualian implisit.** Pengecualian yang valid **MUST** eksplisit dan terdokumentasi (mis. hotfix darurat dengan justifikasi tertulis), bukan diam-diam dilewati.

## 4. Mandatory Rules

1. PR **MUST NOT** di-merge jika status check CI ([11-devsecops-standard.md](11-devsecops-standard.md)) gagal — **MUST NOT** ada override tanpa justifikasi tertulis di PR.
2. PR **MUST NOT** di-merge jika [15-code-review-checklist.md § Checklist Umum](15-code-review-checklist.md#5-checklist-umum-setiap-pr) belum terverifikasi lengkap.
3. PR yang menyentuh domain finansial-kritis **MUST NOT** di-merge tanpa review dari pihak selain penulis begitu kontributor kedua tersedia — konsisten [15-code-review-checklist.md Mandatory Rule #3](15-code-review-checklist.md#4-mandatory-rules).
4. PR **MUST NOT** di-merge jika mengandung perubahan yang tidak berhubungan dengan tujuan PR (scope creep) tanpa penjelasan eksplisit di deskripsi PR kenapa digabung.

## 5. Recommended Rules

1. PR **SHOULD** di-squash-merge untuk riwayat `main` yang bersih, kecuali PR tersebut sengaja berisi beberapa commit logis terpisah yang bernilai dipertahankan individual.

## 6. Anti-Pattern

**Merge dengan CI Merah "Karena Buru-buru"** — melewati status check gagal dengan alasan urgensi tanpa justifikasi tertulis. Ini persis skenario yang dijelaskan Principle #1 — tekanan waktu adalah kondisi paling umum di mana gate dilanggar, karena itu gate ini **MUST** tetap tegak di kondisi tersebut, bukan justru dilonggarkan.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode — lihat Bagian 4 sebagai kriteria go/no-go konkret.

## 9. Migration Strategy

🔵 Designed — N/A untuk migrasi mundur. Berlaku penuh begitu branch protection aktif ([14-git-workflow-standard.md Mandatory Rule #4](14-git-workflow-standard.md#4-mandatory-rules)); sebelum itu, checklist ini **SHOULD** tetap dipakai sebagai self-check solo developer meski tidak ada enforcement teknis.

## 10. Checklist

- [ ] Status check CI lolos (atau override terjustifikasi tertulis)
- [ ] [15-code-review-checklist.md](15-code-review-checklist.md) Checklist Umum terverifikasi lengkap
- [ ] Review dari pihak lain untuk domain finansial-kritis (jika kontributor kedua tersedia)
- [ ] Scope PR fokus, tanpa perubahan tidak berhubungan tanpa penjelasan

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Merge dengan CI gagal tanpa justifikasi tertulis | 0 | Audit riwayat PR |
| PR scope creep tanpa penjelasan | 0 | Audit riwayat PR |

## 12. References

- [15-code-review-checklist.md](15-code-review-checklist.md)
- [11-devsecops-standard.md](11-devsecops-standard.md)
- [14-git-workflow-standard.md](14-git-workflow-standard.md)
- [21-checklist-before-release.md](21-checklist-before-release.md)

---

*File selanjutnya: [21-checklist-before-release.md](21-checklist-before-release.md)*
