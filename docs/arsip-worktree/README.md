# Arsip worktree — kerja belum-ter-commit yang diselamatkan sebelum worktree dihapus

> Dibuat 2026-08-19 saat merapikan 18 worktree (lihat
> `docs/execution/PETA-WORKTREE.md`).

## Kenapa berkas ini ada

Menghapus worktree yang punya perubahan belum-ter-commit **menghancurkan
kerja tanpa satu pun galat** — `git worktree remove` menolak, tapi
`--force` tidak, dan itu justru bendera yang dipakai orang saat sedang
buru-buru merapikan.

CLAUDE.md §8a.1 menyebutnya kondisi berhenti #2. Jadi yang belum ter-commit
**diselamatkan lebih dulu sebagai patch**, baru worktree-nya dilepas.

## Isi

### `kematangan-modul-belum-commit.patch`

25 berkas dari `feat/kematangan-modul`, tak tersentuh 2 hari saat diarsipkan.
Isinya perapian a11y/kerapatan lintas 21 halaman + `globals.css` +
`a11y-ratchet.mjs` + `kerapatan-lantai.json`.

**Cabangnya TIDAK dihapus** — 28 commit uniknya masih utuh di
`feat/kematangan-modul`. Yang dilepas hanya direktori worktree-nya.

Memulihkan:

```bash
git worktree add .claude/worktrees/kematangan-modul feat/kematangan-modul
cd .claude/worktrees/kematangan-modul
git apply ../../../docs/arsip-worktree/kematangan-modul-belum-commit.patch
# node_modules pnpm di Windows butuh JUNCTION, bukan symlink:
cmd //c "mklink /J <worktree>\node_modules E:\Project\puraloka-suite\node_modules"
```

⚠ Patch ini menyimpan **selisihnya**, bukan berkas utuhnya. Ia hanya bisa
diterapkan di atas commit yang sama (`0ee9022f`). Menerapkannya di atas
direktori utama akan bentrok — 24 dari 25 berkas itu sudah berbeda di sana,
dan bedanya ke DUA arah (sebagian lebih panjang di worktree, sebagian lebih
pendek), jadi ia bukan sekadar versi lama.
