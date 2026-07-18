# 16 — Definition of Ready

> **Maturity:** 🔵 Designed — belum ada proses formal "siap dikerjakan" hari ini (backlog informal, dikerjakan langsung berdasarkan prioritas percakapan). Kontrak masa depan, semakin bernilai begitu tim bertambah dan pekerjaan tidak lagi bisa dikoordinasikan lewat percakapan langsung semata.

**Kedudukan:** Batch 5 — Proses Tim. Pasangan dari [17-definition-of-done.md](17-definition-of-done.md) — file ini mendefinisikan kapan sebuah task **boleh mulai dikerjakan**, bukan kapan selesai.

---

## 1. Purpose

Mencegah waktu terbuang mengerjakan task yang requirement-nya belum jelas — terutama untuk task yang menyentuh domain finansial-kritis, di mana asumsi yang salah tentang scope bisa berarti implementasi ulang signifikan.

## 2. Background

Puraloka Suite hari ini dikembangkan lewat percakapan langsung antara Nizar dan Claude Code — requirement diklarifikasi real-time, task besar (seperti Engineering Constitution ini sendiri) sering melalui AskUserQuestion untuk konfirmasi scope sebelum eksekusi. Pola ini bekerja baik untuk solo developer + AI pairing, tapi tidak terskalakan begitu ada kontributor manusia lain yang tidak hadir di setiap percakapan klarifikasi.

## 3. Principles

1. **Ambiguitas requirement diselesaikan sebelum coding dimulai, bukan ditemukan di tengah implementasi.** Menemukan bahwa scope salah setelah setengah jalan menulis kode jauh lebih mahal daripada menghabiskan 10 menit klarifikasi di awal.
2. **"Ready" bukan berarti "sempurna terdefinisi."** Task boleh punya area abu-abu yang sengaja diputuskan saat implementasi (judgment call developer) — Definition of Ready memastikan *inti* requirement jelas, bukan menuntut spesifikasi lengkap setiap detail.

## 4. Mandatory Rules

1. Task yang menyentuh domain finansial-kritis **MUST** punya deskripsi perilaku yang diharapkan (input → output atau before → after) sebelum implementasi dimulai — **MUST NOT** dikerjakan hanya berdasarkan judul task singkat tanpa konteks perilaku yang diharapkan.
2. Task yang berpotensi mengubah skema database **MUST** menyatakan tabel/kolom yang terdampak sebelum migration ditulis — **MUST NOT** ditulis migration eksploratif tanpa desain skema yang sudah disepakati.
3. Task yang scope-nya ambigu antara dua interpretasi berbeda (mis. "perbaiki kasbon" bisa berarti banyak hal) **MUST** diklarifikasi dulu (lewat pertanyaan eksplisit) sebelum coding dimulai — **MUST NOT** diasumsikan sepihak interpretasi mana yang benar untuk perubahan finansial-kritis atau berdampak luas.

## 5. Recommended Rules

1. Task besar (lebih dari beberapa file terdampak) **SHOULD** dipecah dulu menjadi sub-task lebih kecil sebelum dimulai — memudahkan tracking progress dan review bertahap.

## 6. Anti-Pattern

**Coding Sambil Menebak Requirement** — memulai implementasi domain finansial berdasarkan asumsi requirement tanpa konfirmasi, dengan harapan "kalau salah nanti diperbaiki." Untuk domain finansial, ini berisiko: implementasi yang salah bisa sempat berjalan di data nyata sebelum ketahuan.

## 7. Example Good

Preseden dari sesi ini sendiri: sebelum menulis 10 dokumen Phase 1 Planning, klarifikasi eksplisit diminta soal scope Phase 1 (sempit sesuai doc 04 asli, atau diperluas ke sub-fase 1A-1D) — keputusan dikonfirmasi user sebelum penulisan dimulai, mencegah kerja ulang besar.

## 8. Example Bad

*(Hipotetis)*: memulai menulis migration untuk "redesign sistem kasbon" tanpa mengonfirmasi dulu apakah yang dimaksud adalah perubahan skema, perubahan UI, atau perubahan business logic — ketiganya butuh pendekatan sangat berbeda.

## 9. Migration Strategy

🔵 Designed — N/A untuk migrasi mundur, tidak ada proses DoR formal existing untuk dimigrasikan. Berlaku sebagai praktik yang **SHOULD** mulai diterapkan segera untuk task finansial-kritis (nilainya berlaku bahkan untuk solo developer + AI pairing), **MUST** begitu kontributor manusia kedua bergabung.

## 10. Checklist

- [ ] Task finansial-kritis punya deskripsi perilaku diharapkan sebelum coding dimulai
- [ ] Task perubahan skema database punya desain tabel/kolom yang disepakati
- [ ] Ambiguitas scope diklarifikasi sebelum implementasi, tidak diasumsikan sepihak

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Task finansial-kritis yang di-revert/diulang karena scope salah | Menurun dari baseline (belum ada data historis) | Tracking manual |

## 12. References

- [17-definition-of-done.md](17-definition-of-done.md)
- [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md)

---

*File selanjutnya: [17-definition-of-done.md](17-definition-of-done.md)*
