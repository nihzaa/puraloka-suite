# CECEP — Architecture Derivation Constitution

**Kedudukan:** Lapisan governance BARU, berbeda tujuan dari [`30-cecep-constitution.md`](30-cecep-constitution.md). Bukan revisi `30`, bukan penggantinya — keduanya berdiri berdampingan, mengatur pertanyaan yang berbeda:

| Dokumen | Mengatur |
|---|---|
| `30` — CECEP Constitution | **APA yang boleh masuk roadmap CECEP** (batas domain — Article 2/4/8: capability apa yang sah, vocabulary apa yang dilarang) |
| `40` (dokumen ini) — Architecture Derivation Constitution | **BAGAIMANA keputusan desain boleh lahir** (proses — begitu sesuatu sudah sah masuk scope CECEP, dari mana asalnya harus bisa ditelusuri) |

**Kenapa dua dokumen, bukan satu:** `30` menjawab pertanyaan Fase 1-3 ("apakah AI Estimation bagian dari CECEP?"). `40` menjawab pertanyaan Fase 4-12 ("kenapa struktur hasil derivasi ini berbentuk begini, bukan bentuk lain?"). Mencampur keduanya akan mengaburkan bahwa satu adalah filter SCOPE, satu lagi adalah filter PROSES — dua kegagalan yang berbeda kalau dilanggar (`30` dilanggar → CECEP jadi framework generik lagi seperti G-K; `40` dilanggar → CECEP tetap dalam scope yang benar tapi desainnya jadi tebakan tak tertelusuri, ATAU — risiko yang baru ditemukan, lihat § Perbaikan Urutan Fase 6 — proses derivasinya sendiri diam-diam jadi template baru yang dipaksakan ke semua domain).
**Berlaku:** Fase 4 sampai Fase 12, sejalan dengan [`39-phase-transition-notice-discovery-closed.md`](39-phase-transition-notice-discovery-closed.md) yang menutup Discovery.

---

## Lima Aturan

### Rule 1 — Every Design Must Be Derived. Never Invented.

Tidak ada keputusan desain (Aggregate Root, Entity, field, relasi) yang lahir dari "menurut saya ini masuk akal". Setiap keputusan harus punya asal yang bisa ditunjuk di dokumen Frozen sebelumnya.

### Rule 2 — Every Entity Must Trace Back Through the Full Chain

```
Mission → Capability → Interaction → Business Need
```

Bukan cukup menyebut satu titik ("ini dari Capability X") — rantai penuh harus utuh sampai ke Mission. Kalau satu mata rantai hilang, entity itu belum layak disebut derived. **Rantai empat elemen ini diperinci jadi 10 level bernomor, dengan mekanisme perhitungan Trace Status per level, di [`41-evidence-hierarchy.md`](41-evidence-hierarchy.md)** — dokumen ini menetapkan PRINSIP-nya, `41` menyediakan MEKANISME pengecekannya.

### Rule 3 — If a Design Cannot Be Derived, Stop. Create ADR. Never Guess.

Kegagalan menemukan rantai derivasi BUKAN alasan untuk menebak lalu melanjutkan. Itu sinyal berhenti. Jalur yang sah: ajukan ADR (pola `31`/ACR-004 di `04a`), tunggu keputusan eksplisit, baru lanjut. Menebak-lalu-jalan-terus adalah persis pola yang melahirkan drift G-K.

### Rule 4 — Implementation Convenience Must Never Override Business Architecture

Alasan "supaya lebih gampang dikoding" atau "supaya query-nya lebih cepat" TIDAK PERNAH cukup untuk mengubah bentuk Aggregate Root/Entity yang sudah diderivasi dari Capability/Interaction. Kalau ada konflik antara kemudahan implementasi dan hasil derivasi, derivasi menang — kalau tim build menemukan derivasi itu genuinely tidak bisa diimplementasikan, itu jadi ADR (Rule 3), bukan override diam-diam di level desain.

### Rule 5 — One Source of Truth. No Duplicated Concepts.

Kalau sebuah konsep sudah punya nama dan bentuk di layer manapun (Capability `35`, Domain `03b`, Interaction `37`), ia tidak boleh muncul lagi dengan nama berbeda di layer bawahnya seolah-olah konsep baru. Ini penerapan langsung Foundational Principle Keempat (`02`, Everything is Derived Nothing is Re-entered) ke level dokumentasi arsitektur itu sendiri, bukan hanya ke data runtime.

---

## Perubahan Cara Review

Mulai Fase 4, pertanyaan review BUKAN "bagus tidak desainnya", tapi:

> **Derived from where?**

Jawaban yang diterima: rantai eksplisit (`Mission → Capability → Interaction → ...`). Jawaban yang ditolak otomatis: "menurut saya...", "ini pola umum...", "biasanya begini..." — tanpa rantai konkret.

---

## Trace Status — Klasifikasi Wajib per Keputusan Desain

Setiap Aggregate Root/Entity/Value Object yang muncul di dokumen Fase 4+ WAJIB diberi salah satu dari tiga status berikut (diterapkan sebagai kolom di Derivation Trace, lihat pembaruan [`34`](34-roadmap-definition-of-done.md)):

| Status | Arti | Tindakan |
|---|---|---|
| ✓ **Fully Derived** | Rantai lengkap Mission→Capability→Interaction→Business Need bisa ditunjuk penuh | Lanjut tanpa syarat |
| ⚠️ **Requires ADR** | Ada kebutuhan nyata, tapi satu mata rantai belum diputuskan (pola sama seperti RAP Risk Register, `03b` § B.3) | Dicatat eksplisit, ADR diajukan, TIDAK memblokir bagian lain dokumen yang sudah Fully Derived |
| ❌ **Invented** | Tidak ada rantai sama sekali — murni preferensi/asumsi | **DILARANG masuk dokumen final.** Kalau ditemukan saat penulisan, dihapus atau diubah jadi ⚠️ dengan ADR diajukan, tidak pernah dibiarkan sebagai ❌ di versi Freeze |

**Contoh penerapan (ilustratif, bukan hasil Fase 6 sesungguhnya):**
```
Estimate Version    → ✓ Fully Derived  (Tender Estimation/RAP Builder → 37 → 03b §A.9b)
Risk Register        → ⚠️ Requires ADR  (RAP Builder butuh, tapi bentuk domain belum
                                          diputuskan — 03b §B.3, sudah tercatat di 38)
AI Knowledge Graph   → ❌ Invented       (tidak ada di Capability manapun yang Frozen;
                                          kalau muncul, berarti scope melebar diam-diam)
```

---

## Perbaikan Urutan Fase 6 — Business Responsibility Sebagai Langkah Wajib

Founder mengidentifikasi risiko: Domain Model sering gagal karena melompat langsung dari Capability ke Entity, melewatkan langkah yang membuktikan struktur hasil benar-benar lahir dari tanggung jawab bisnis, bukan dari daftar tabel yang "kelihatannya perlu".

**Urutan LAMA (implisit, berisiko lompat):**
```
Capability → Entity
```

**⚠️ KOREKSI (ditemukan founder setelah `44` selesai — versi rantai di bawah ini SEBELUMNYA salah, dipertahankan di sini sebagai jejak, bukan dihapus):**

```
SALAH (versi awal — mengunci "Aggregate Root" sebagai titik tetap):
Capability → Interaction → Business Responsibility → Aggregate Root → Entity → Value Object
```

**Kenapa ini salah, dibuktikan konkret:** Rantai di atas MEMAKSA setiap Business Responsibility berujung ke kolom "Aggregate Root" — begitu format punya kolom tetap, isi yang bukan Aggregate Root tetap dipaksa masuk kolom itu dengan keterangan tambahan. Bukti nyata dari `44` sendiri: baris "Conversion Rule" ditulis *"Aggregate Root: Conversion Rule **(Value Object, bukan Entity)**"* — kontradiksi terminologi langsung (Value Object secara definisi TIDAK PUNYA identitas, sedangkan Aggregate Root secara definisi WAJIB punya identitas sebagai pintu masuk perubahan). Baris "Formula Definition" punya masalah sama: *"Aggregate Root: Formula Definition (**Domain Service** generik...)"* — Domain Service dan Aggregate Root adalah kategori DDD berbeda, dipaksa satu kolom. Ini BUKAN kesalahan tulis di satu-dua baris — ini bukti bahwa formatnya sendiri (kolom "Aggregate Root" sebagai keharusan) sudah jadi template yang dipaksakan, persis pola invention yang `40` seharusnya mencegah.

**Urutan BENAR, berlaku mulai sekarang (revisi kedua — lihat catatan di bawah):**
```
Capability → Interaction → Business Responsibility → Required Business Mechanism
```

**Kenapa "Required Business Mechanism", bukan "Derived Structure" (koreksi atas revisi pertama):** Percobaan pertama mengganti "Aggregate Root" dengan "Derived Structure" plus tabel tujuh kemungkinan bentuk (Aggregate Root/Domain Service/Value Object/Policy/Domain Event/Process/Nothing). Founder menemukan itu MASIH bermasalah — tujuh baris itu, meski diberi disclaimer "bukan daftar wajib", akan lambat laun dibaca sebagai checklist "pilih salah satu dari tujuh". Nama kolom "Derived Structure" pun tetap mengarahkan perhatian ke STRUKTUR sebagai target, padahal targetnya seharusnya KEBUTUHAN. Tabel tujuh baris itu **dihapus total** — bukan diperluas, dihapus, karena daftar resmi bentuk apa pun (tujuh, sepuluh, berapa pun) berisiko jadi dogma baru begitu ada domain yang butuh bentuk di luar daftar (Constraint, Specification, ACL Mapping, Projection — bentuk apa pun yang genuinely dibutuhkan bisnis dan lolos derivasi).

**Kompas tunggal yang menggantikan tabel (dipegang sebagai satu kalimat, bukan checklist):**

> **Architecture is not derived to produce structures. It is derived to satisfy business responsibilities with the minimum necessary business mechanism.**

**Aturan operasional:**
- Hasil derivasi boleh berbentuk APA PUN — Aggregate Root, Entity, Value Object, Domain Service, Policy, Domain Event, Process, Constraint, Specification, ACL Mapping, Projection, kombinasi domain yang SUDAH ADA tanpa perlu struktur baru, atau **Nothing** — selama ia (1) mekanisme bisnis MINIMUM yang diperlukan (bukan yang paling lengkap/paling "benar secara DDD"), dan (2) bisa ditelusuri ke evidence lewat Evidence Hierarchy (`41`).
- **Tidak ada daftar bentuk resmi di CECEP.** Setiap kali sebuah bentuk dituliskan sebagai hasil (apa pun namanya), ia dinilai HANYA dari kompas di atas — bukan dicocokkan ke tabel kategori mana pun.
- **Uji wajib sebelum menulis hasil apa pun:** *"Am I naming the mechanism the business genuinely needs, or am I filling a template — DDD atau bukan?"* Kalau jawabannya "saya sedang mengisi template", berhenti, tanyakan ulang Business Responsibility-nya sampai bentuknya jelas dari kebutuhan, bukan dari kolom yang harus diisi.

**Business Responsibility** tetap langkah antara wajib, menjawab: *"Tanggung jawab bisnis APA yang membuat satu kelompok data/perilaku harus dijaga konsisten?"* — bukan "field apa yang perlu disimpan", dan bukan "bentuk DDD apa yang cocok". Contoh dari `03b` yang SUDAH (secara implisit) mengikuti pola ini dengan benar: Estimate Version adalah Aggregate Root BUKAN karena "kelihatannya butuh tabel sendiri", tapi karena tanggung jawab bisnis "total biaya, status approval, dan validasi konsistensi Estimate Item di dalamnya harus dijaga bersama" (`03b` § Aggregate Root, kosakata DDD) — DAN Estimate Version genuinely butuh identitas+lifecycle, jadi Aggregate Root memang mekanisme minimum yang tepat untuknya, BUKAN karena kolom formatnya menuntut Aggregate Root. Bandingkan dengan Conversion Rule (Business Responsibility: "rasio matematis stabil, tidak butuh riwayat sendiri") — mekanisme minimumnya adalah Value Object, karena Aggregate Root di sana justru BERLEBIH dari yang dibutuhkan.

**Dampak ke `44` (Fase 6, sudah Frozen):** Label kolom di `44` tidak diubah retroaktif (fase itu tetap Derived & Frozen sebagaimana adanya) — tapi kedua koreksi (`40` versi ini, dan sebelumnya) WAJIB dibaca bersamaan dengan `44`. Setiap fase BARU (Fase 7 ke atas, atau revisi domain baru di masa depan) WAJIB memakai kolom **"Required Business Mechanism"**, TIDAK memakai "Aggregate Root" maupun "Derived Structure" sebagai nama kolom tetap, dan TIDAK mencocokkan hasilnya ke tabel kategori resmi apa pun.

---

## Tiga Istilah Status Baku — Wajib Dipakai Konsisten

**Ditambahkan setelah founder mengoreksi kesalahan konkret**: dokumen roadmap sempat menyebut Fase 6 "✅ Selesai (fondasi dari `03b`)" — kalimat ini keliru secara filosofis, bukan cuma gaya bahasa. `03b` adalah Discovery Material (INPUT untuk derivasi), bukan Derived Domain Model (OUTPUT derivasi). Menyebut suatu fase "selesai karena `03b` ada" menyiratkan `03b` adalah Authority (hasil akhir yang tinggal dipakai) padahal seharusnya Evidence (bahan yang harus diturunkan ulang secara eksplisit lewat rantai Capability→Interaction→Business Responsibility). Untuk mencegah pola ini berulang, tiga istilah status berikut WAJIB dipakai — tidak ada istilah status lain yang sah dipakai di dokumen Fase 4-12:

| Istilah | Dipakai untuk | Arti |
|---|---|---|
| **Discovery Complete** | Dokumen sumber Discovery (`01`/`02`/`03`/`03b`) | Materinya sudah lengkap dan Frozen sebagai EVIDENCE — belum berarti derivasi ke fase manapun sudah dikerjakan |
| **Ready for Derivation** | Fase yang punya seluruh bahan (Capability Frozen + Discovery Material relevan tersedia) tapi BELUM diturunkan lewat rantai `40`/Trace Status | Bahan lengkap, pekerjaan derivasi eksplisit belum dimulai/belum selesai |
| **Derived & Frozen** | Fase yang SUDAH dikerjakan penuh mengikuti Constitution (`30`), Derivation Constitution (`40`), DoD (`34`), dengan Trace Status ✓ Fully Derived di seluruh keputusan | Selesai sungguhan — hanya status ini yang setara "✅ Selesai" pada fase-fase lama |

**Larangan eksplisit:** Kalimat berbentuk "Fase X selesai karena dokumen Y (Discovery) sudah ada" TIDAK PERNAH sah. Ganti dengan "Fase X derived using evidence from Y" HANYA setelah derivasi eksplisit (Business Responsibility → Derived Structure, dengan Trace Status) benar-benar dikerjakan — sebelum itu, statusnya "Ready for Derivation", bukan "Derived".

---

## Rule 6 (Baru, Revisi Final) — Absence Is a Valid Architectural Outcome

**Riwayat koreksi berlapis (dipertahankan penuh sebagai jejak — bukan aib, tapi bukti bahwa akar masalahnya baru ditemukan di percobaan ketiga):**

1. **Percobaan 1:** "Aggregate Root" sebagai kolom wajib di rantai derivasi Fase 6. **Gagal** — memaksa Conversion Rule dan Formula Definition masuk label yang menyangkal isinya sendiri (`44`, ditemukan founder).
2. **Percobaan 2:** Ganti nama jadi "Derived Structure" + tabel tujuh kategori DDD (Aggregate Root/Domain Service/Value Object/Policy/Event/Process/Nothing). **Gagal** — tabel itu sendiri berisiko dibaca sebagai checklist "pilih satu dari tujuh", dan nama "Derived Structure" tetap mengarahkan perhatian ke STRUKTUR (ditemukan founder, revisi kedua).
3. **Percobaan 3:** Ganti nama jadi "Required Business Mechanism", hapus tabel, kompas satu kalimat. **Masih gagal** — diterapkan di `45` § D sebagai "isi Contract 11-elemen sejauh relevan, boleh jawab N/A untuk yang tidak berlaku". "Boleh N/A" TETAP mengasumsikan formulir itu harus muncul untuk setiap domain, hanya isinya dikosongkan (ditemukan founder, revisi ketiga).

**Akar masalah sesungguhnya, baru terlihat jelas di percobaan ketiga:** Kesalahannya bukan pada NAMA kolom (Aggregate Root/Derived Structure/Required Business Mechanism semuanya nama yang berbeda untuk masalah yang sama). Kesalahannya adalah **kebiasaan menganggap setiap Business Responsibility harus berujung pada SESUATU yang ditulis** — entah nama itu apa. Begitu satu pola terbukti berguna di satu tempat (Contract 11-elemen berguna untuk Price Book), muncul dorongan "kalau ini bagus, semua domain harus punya" — padahal pertanyaan yang benar bukan "elemen mana yang relevan", tapi **apakah problem yang mendasari pola itu genuinely ADA di domain ini.**

**Kompas final (tidak diganti nama lagi — kalimat ini dipertahankan permanen):**

> **The smallest architecture that fully satisfies the business is always preferable to a more complete architecture.**
> **Absence is a valid architectural outcome.**

Urutan pertanyaan yang benar, dan TIDAK BOLEH dipendekkan:
```
Problem → Need → Mechanism
```
Bukan langsung "Mechanism apa yang cocok" (itu yang menghasilkan tiga percobaan gagal di atas). Kalau jawaban "Problem" tidak ditemukan (problem yang mendasari sebuah pola/Contract/struktur genuinely tidak terjadi di domain ini), rantai BERHENTI DI SITU — tidak berlanjut ke "maka Mechanism-nya kosong/N/A". Tidak ada Aggregate, tidak ada Service, tidak ada Contract, tidak ada Event, tidak ada dokumen apa pun untuk domain itu — dan itu bukan kekurangan yang perlu ditandai, itu hasil yang benar.

**Tiga pengawasan wajib setiap review:**

1. **Jangan ada istilah baru tanpa kebutuhan bisnis.** Begitu muncul istilah generik (Resolver/Coordinator/Dispatcher/Executor/Planner/Selector/Manager, dst) — tanya: *"Masalah bisnis apa yang HILANG kalau istilah ini tidak ada?"* Kalau jawabannya tidak konkret, hapus — tidak peduli secantik apa namanya.
2. **Jangan ada pola desain yang dianggap wajib untuk semua.** "Semua domain punya Aggregate Root", "semua Aggregate Root punya Contract", "semua capability punya Strategy" — SEMUA klaim seperti ini salah kalau ditulis sebagai default. Benar hanya sebagai kesimpulan PER-DOMAIN, dan kesimpulan itu boleh "tidak ada" untuk sebagian domain tanpa itu dianggap celah.
3. **Jangan berhenti di "bentuk minimum" — pertimbangkan "tidak ada bentuk sama sekali" sebagai jawaban pertama yang diuji, bukan jawaban terakhir.** Sebelum menulis Value Object/Policy/Service apa pun, tanya dulu: apakah tanggung jawab ini sudah terpenuhi oleh mekanisme yang SUDAH ADA (fungsi murni, kombinasi domain existing), sehingga tidak butuh artefak baru sama sekali?

**Larangan eksplisit terhadap bahasa yang menyembunyikan ketidakpastian:** Kesimpulan audit/review TIDAK BOLEH ditulis "bersih" atau "tidak ditemukan masalah" secara mutlak — tulis **"berdasarkan audit saat ini, belum ditemukan evidence pola [X]"**. Kata "bersih" menciptakan rasa selesai; arsitektur tidak pernah selesai, hanya belum terbukti salah pada titik pemeriksaan tertentu. Ini berlaku untuk SEMUA kesimpulan Fase 4-12 ke depan, termasuk kesimpulan Rule 6 ini sendiri — belum tentu tidak akan ada percobaan keempat.

---

## Hubungan dengan Dokumen Lain

- Tidak menggantikan `30` (batas scope) atau `39` (notice penutupan Discovery) — melengkapi keduanya dengan mekanisme OPERASIONAL (6 aturan + Trace Status + urutan Business Responsibility → Required Business Mechanism).
- `34` (DoD) diperbarui untuk memuat kolom Trace Status sebagai bagian Derivation Trace — lihat `34` versi terbaru.
- `32` (Roadmap) Fase 6 diperbarui untuk mencantumkan urutan Business Responsibility secara eksplisit.

---

## 🔒 STATUS: EFEKTIF SEGERA

Berlaku mulai Fase 4, mengikat sampai Fase 12. Perubahan pada enam aturan ini butuh keputusan eksplisit founder, setara level mengubah `30`.
