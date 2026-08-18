# Peta Worktree — apa yang sudah tampil di UI, apa yang belum

> Diukur 2026-08-19 menjawab pertanyaan founder: *"dari seluruh worktree ini
> sudah tampil di UI belum? apakah sudah di-merge ke direktori utama? dan
> kalau belum, apakah kenyataan di direktori utama itu lebih baik?"*
>
> Cara mengukur ulang ada di §5. **Jangan percaya angka di sini tanpa
> menjalankannya** — jumlah commit berubah tiap hari.

---

## 1. Jawaban singkat

| Pertanyaan | Jawaban |
|---|---|
| Sudah di-merge ke `main`? | **Belum, satu pun tidak.** 18 cabang, nol ter-merge |
| Tapi apakah kerjanya HILANG? | **Tidak.** 13 dari 18 seluruhnya sudah ada di direktori utama |
| Direktori utama lebih baik? | **Ya, telak** — dan angkanya di §3 |
| Ada yang benar-benar tertinggal? | **Ya, satu**: `/estimasi/struktur` (16 menit lalu) |

**Yang penting dipahami:** "belum di-merge ke `main`" ≠ "belum tampil di UI".
`main` sudah lama bukan tempat kerja di repo ini — yang Anda buka sehari-hari
adalah `feat/sumbu-ui-roadmap` (direktori utama `E:\Project\puraloka-suite`).
Pertanyaan yang benar bukan "sudah masuk `main`?" melainkan **"sudah ada di
cabang yang saya pakai?"**

---

## 2. Ke-18 cabang terhadap direktori utama

Diukur dengan `git rev-list --count <utama>..<cabang>` — berapa commit cabang
itu yang **belum** ada di direktori utama.

### Sudah TERKANDUNG SELURUHNYA (13 cabang) — nol commit unik

    f42/inti · f42/set · f42/ops · f42/sisa · f42/mutu
    f42/proyek · f42/portal · f42/mandor · f42/procurement
    feat/cecep-ui-rombak · feat/ui-tombol-mepet
    worktree-otomasi-ai-gateway · feat/sumbu-ui-roadmap (ini sendiri)

Semua kerjanya **sudah tampil di UI**. Worktree-nya boleh dihapus kapan saja
tanpa kehilangan apa pun — isinya bukan kerja yang hilang, melainkan salinan
lama dari kerja yang sudah masuk.

⚠ `feat/ui-tombol-mepet` dan `feat/cecep-ui-rombak` terlihat "aktif" (commit
83 menit & 2 hari lalu) tetapi commit uniknya **nol** — artinya kerjanya sudah
mengalir masuk. Aktif ≠ tertinggal.

### Punya sesuatu yang belum ada di sini (5 cabang)

| Cabang | Commit unik | Umur | Layak diambil? |
|---|---:|---|---|
| `feat/struktur-analisa` | 3 | 16 menit | **YA** — §4 |
| `feat/kematangan-modul` | 28 | 2 hari | perlu diperiksa satu per satu |
| `feature/warm-clay-design-system` | 121 | 5 minggu | **tidak** — §3 |
| `feat/ui-lanjutan` | 4 | 12 hari | **tidak** — §3 |
| `docs/protokol-sesi` | 4 | 3 minggu | dokumen saja |

---

## 3. Apakah direktori utama lebih baik? — ya, dan ini angkanya

    cabang                           halaman UI   entri peta   modul hidup
    ─────────────────────────────────────────────────────────────────────
    feat/sumbu-ui-roadmap (UTAMA)       178          253          225
    feat/struktur-analisa               179          253          225
    feat/kematangan-modul               165          251          219
    feat/ui-lanjutan                    102          223           81
    feature/warm-clay-design-system      41            0            0

**`feature/warm-clay-design-system`** — 121 commit unik terdengar banyak, tapi
ia bercabang 5 minggu lalu dan hanya punya **41 halaman** dari 178. `peta-menu.ts`
bahkan belum ada di sana. Mengambilnya bukan menambah, melainkan mundur.

**`feat/ui-lanjutan`** — punya 4 halaman yang tak ada di sini:

    /estimasi/cashflow · /estimasi/harga · /estimasi/katalog · /estimasi/komposer

Terdengar seperti kerugian, sampai diukur: **`peta-menu.ts` di cabang itu tak
memuat satu pun tautan ke keempatnya.** Nol entri `'/estimasi/...'`. Jadi
halaman-halaman itu **tak bisa dibuka siapa pun bahkan di cabangnya sendiri** —
tak ada menu yang menunjuk ke sana. Ditambah ia 531 commit di belakang, dan
modul hidupnya 81 lawan 225.

Ini contoh persis kenapa pertanyaan "yang mana lebih baik" harus diukur, bukan
ditebak dari nama cabang atau jumlah commit: cabang bernama "ui-lanjutan"
justru yang UI-nya paling tertinggal.

---

## 4. Satu-satunya yang benar-benar tertinggal

**`feat/struktur-analisa`** — 3 commit, 51 berkas, halaman
`/estimasi/struktur`. Ini kerja sesi lain yang masih berjalan (commit terakhir
16 menit sebelum pengukuran ini).

Buktinya bukan dari membaca daftar cabang melainkan dari **penjaga CI yang
merah di direktori utama**:

    audit-nav-yatim  ❌ LINK MATI — nav menunjuk halaman yang tak ada: 1
                        /estimasi/struktur   (sidebar/DB)

Menu-nya sudah masuk ke sini, halamannya belum. Siapa pun yang mengkliknya
sekarang mendapat 404. Penjaga yang sama juga menerangkan `audit-peta-menu-vs-db`
yang merah (`hanyaDb naik 124 → 125`).

**Jadi kedua penjaga merah itu bukan kerusakan — mereka justru bekerja persis
sebagaimana dirancang: menandai bahwa satu halaman masih di tangan sesi lain.**
Keduanya akan hijau sendiri begitu cabang itu masuk. Jangan "diperbaiki"
dengan menghapus entri menunya.

---

## 5. Cara mengukur ulang

```bash
# Berapa commit tiap cabang yang BELUM ada di cabang yang sedang dipakai
SAYA=$(git branch --show-current)
git worktree list | while read -r d h br; do
  b=$(echo "$br" | tr -d '[]'); [ "$b" = detached ] && continue
  echo "$(git rev-list --count "$SAYA".."$b" 2>/dev/null)  $b"
done | sort -rn

# Halaman UI yang ada di cabang lain tapi tak ada di sini
git diff --name-status "$SAYA".."<cabang>" -- 'apps/web/app/**/page.tsx' | grep '^A'

# Kekayaan tiap cabang — halaman, entri peta, modul hidup
for b in <cabang...>; do
  echo "$b $(git ls-tree -r --name-only $b | grep -c 'apps/web/app/.*page\.tsx$')" \
       "$(git show $b:apps/web/lib/peta-menu.ts 2>/dev/null | grep -c "status: 'hidup'")"
done
```

⚠ **Jangan memakai `git rev-list --count main..<cabang>`** untuk menjawab
"sudah masuk belum". Ia memulangkan ratusan untuk SEMUA cabang — termasuk yang
isinya sudah 100% ada di direktori utama — karena `main` sendiri yang
tertinggal jauh. Angka itu benar tetapi menjawab pertanyaan yang salah, dan
membacanya sebagai "18 cabang penuh kerja yang belum masuk" adalah kesimpulan
yang persis terbalik dari kenyataannya.

Bandingkan terhadap **cabang yang sedang dipakai**, bukan terhadap `main`.
