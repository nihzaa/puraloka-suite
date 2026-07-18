# 28 — Error Handling Standard

> **Maturity:** 🟡 Partial — pola fire-and-forget untuk notifikasi sudah konsisten diterapkan (error di-log, tidak pernah throw ke main request), tapi belum ada strategi error handling terpusat/seragam untuk seluruh 159 endpoint.

**Kedudukan:** Batch 4 — Kualitas & Observability. Melengkapi [03-core-implementation/06-api-engineering-standard.md § Mandatory Rule #4](../03-core-implementation/06-api-engineering-standard.md#4-mandatory-rules) (bentuk response error) dengan strategi penanganan exception di kode. Berhubungan erat dengan [29-logging-standard.md](29-logging-standard.md) — error yang ditangani harus tetap ter-log.

---

## 1. Purpose

Menjaga agar kegagalan satu bagian sistem (notifikasi gagal terkirim, Web Push gagal, satu query di dashboard aggregation gagal) **tidak** menyebabkan seluruh request gagal jika bagian yang gagal itu bukan inti dari operasi yang diminta — prinsip yang sudah diterapkan konsisten untuk notifikasi hari ini, diformalkan di sini agar dipakai sengaja untuk domain lain.

## 2. Background

Sistem notifikasi Puraloka Suite hari ini 100% fire-and-forget: setiap insert notifikasi dibungkus sedemikian rupa sehingga kegagalannya (VAPID tidak dikonfigurasi, database sedang lambat) tidak pernah mem-block atau menggagalkan request utama — hanya di-log. `dashboard.ts` memakai `Promise.allSettled` untuk agregasi data dari banyak sumber, sehingga satu sumber gagal tidak menggagalkan seluruh dashboard. Pola-pola ini sudah baik dan sengaja — file ini menggeneralisasinya menjadi aturan eksplisit, bukan menciptakan pola baru.

## 3. Principles

1. **Bedakan kegagalan inti dari kegagalan pendukung.** Kegagalan menyimpan kasbon (inti) **MUST** menggagalkan request dengan error jelas; kegagalan mengirim notifikasi tentang kasbon tersebut (pendukung) **MUST NOT** menggagalkan request yang sama.
2. **Error yang ditelan (swallowed) tetap harus terlihat.** Fire-and-forget tidak berarti error hilang tanpa jejak — **MUST** tetap di-log dengan detail cukup untuk didiagnosis, hanya tidak mem-block response ke klien.
3. **Pesan error ke klien informatif tapi tidak membocorkan detail internal.** Klien perlu tahu "kasbon gagal disimpan karena saldo tidak cukup," bukan stack trace database atau nama kolom internal.

## 4. Mandatory Rules

1. Operasi pendukung yang bukan inti dari tujuan request (notifikasi, Web Push, logging ke sistem eksternal) **MUST** dibungkus agar kegagalannya tidak menggagalkan response utama — **MUST** tetap di-log sebagai `warn`/`error`, **MUST NOT** benar-benar hilang tanpa jejak.
2. Operasi inti (menyimpan data yang diminta klien) **MUST** mengembalikan error yang jelas ke klien saat gagal — **MUST NOT** mengembalikan response sukses (200) padahal operasi inti gagal sebagian.
3. Endpoint yang melakukan multiple query independen untuk agregasi (dashboard, laporan) **MUST** memakai `Promise.allSettled` (bukan `Promise.all`) saat kegagalan satu sumber data seharusnya tidak menggagalkan keseluruhan response — **MUST NOT** memakai `Promise.all` untuk kasus ini karena satu rejection membatalkan seluruh hasil yang sudah berhasil.
4. Pesan error yang dikembalikan ke klien **MUST NOT** menyertakan detail internal (stack trace, nama tabel/kolom database, query SQL) — **MUST** berupa pesan yang bisa dipahami pengguna atau developer klien tanpa membocorkan struktur internal sistem.
5. Exception yang tidak tertangani (uncaught) di route handler **MUST** ditangkap oleh error handler global Fastify dan dikembalikan sebagai 500 dengan pesan generik — **MUST NOT** menyebabkan proses server crash untuk satu request bermasalah.

## 5. Recommended Rules

1. Operasi finansial yang gagal sebagian (mis. update `rab_items.progress_pct` berhasil tapi bubble-up ke `projects.progress_pct` gagal) **SHOULD** dipertimbangkan sebagai satu transaksi database (`BEGIN`/`COMMIT`/`ROLLBACK`) begitu domain tersebut disentuh untuk pekerjaan Sub-Fase 1A ke atas — mencegah state data yang setengah-konsisten.

## 6. Anti-Pattern

**Silent Failure pada Operasi Inti** — `try { await saveKasbon(data) } catch { /* abaikan */ } return reply.send({ success: true })` — mengembalikan sukses ke klien padahal operasi inti gagal. Klien percaya kasbon tersimpan padahal tidak, ketidaksesuaian data yang sangat sulit dideteksi belakangan.

**Promise.all untuk Agregasi Non-Kritis** — memakai `Promise.all([fetchA(), fetchB(), fetchC()])` untuk dashboard, di mana satu sumber gagal (`fetchB` timeout) membatalkan seluruh dashboard meski `fetchA` dan `fetchC` sudah berhasil — bertentangan Mandatory Rule #3, pola yang sudah dihindari `dashboard.ts` existing tapi perlu diformalkan agar tidak regresi di endpoint baru.

## 7. Example Good

```ts
// Pola fire-and-forget notifikasi (existing, pola nyata)
createNotification({ ... }).catch(err => fastify.log.error({ err, correlation_id: request.id }, 'Gagal kirim notifikasi kasbon'));
// request utama (approve kasbon) tetap lanjut dan return sukses meski notifikasi gagal
```
Konsisten Mandatory Rule #1 — kegagalan pendukung tetap ter-log, tidak menggagalkan operasi inti.

## 8. Example Bad

```ts
// Anti-pattern hipotetis — dicantumkan sebagai pencegahan
try {
  await supabase.from('kasbons').insert(data);
} catch (err) {
  return reply.send({ success: true }); // BUG: menyembunyikan kegagalan operasi inti
}
```
Melanggar Mandatory Rule #2 — operasi inti (insert kasbon) gagal tapi klien diberitahu sukses.

## 9. Migration Strategy

**Untuk Mandatory Rule #1 (fire-and-forget operasi pendukung)** — N/A, sudah 100% konsisten diterapkan untuk sistem notifikasi existing. Berlaku sebagai preseden wajib untuk domain pendukung baru.

**Untuk Mandatory Rule #2, #4, #5 (error handling operasi inti)** — 🟡 Partial, belum diaudit menyeluruh terhadap 159 endpoint. Endpoint baru **MUST** patuh sejak commit pertama; audit endpoint lama **SHOULD** dilakukan bertahap saat file disentuh, bukan proyek retrofit terpisah.

## 10. Checklist

- [ ] Operasi pendukung (notifikasi, dll) dibungkus agar kegagalannya tidak menggagalkan request utama
- [ ] Operasi inti mengembalikan error jelas saat gagal, tidak pernah 200 palsu
- [ ] Agregasi multi-sumber memakai `Promise.allSettled`, bukan `Promise.all`, jika kegagalan parsial dapat diterima
- [ ] Pesan error ke klien tidak membocorkan detail internal

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Endpoint yang mengembalikan 200 padahal operasi inti gagal | 0 | Code review checklist + integration test |
| Kegagalan operasi pendukung yang tidak ter-log | 0 | Audit log sampling |
| Endpoint agregasi memakai `Promise.all` yang seharusnya `allSettled` | 0 | Code review checklist |

## 12. References

- [03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md)
- [29-logging-standard.md](29-logging-standard.md)
- CLAUDE.md § Notification System — Fire-and-forget (internal, sumber pola existing)

---

*File selanjutnya: [29-logging-standard.md](29-logging-standard.md)*
