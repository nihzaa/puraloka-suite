#!/bin/sh
# ============================================================================
# Perbarui Puraloka Suite di VPS — satu perintah
# ============================================================================
#   ssh root@187.52.124.41 "/srv/puraloka-suite/infra/perbarui-vps.sh"
#
# Menarik kode terbaru, membangun ulang, lalu MEMBUKTIKAN hasilnya. Berhenti
# di langkah pertama yang gagal — build setengah jadi yang diteruskan
# menghasilkan container hidup yang menyajikan kode campuran.
#
# ── Kenapa `git pull`, bukan scp
#
# Deploy pertama admin-saas memakai `git archive` + `scp`. Itu jalan, tetapi
# server tak punya riwayat: tak ada cara menjawab "versi mana yang sedang
# jalan?" selain menebak dari tanggal berkas.
#
# Dengan git, `git log -1` menjawabnya persis, dan mundur satu versi cukup
# `git checkout <commit> && docker compose up -d --build`.
#
# ── Kunci BACA-SAJA
#
# VPS memakai deploy key read-only (~/.ssh/id_ed25519_deploy, host alias
# `github-puraloka`). Diuji 2026-08-30: `git push` dari VPS DITOLAK GitHub.
# Itu disengaja — server produksi tak boleh bisa mengubah sumber kebenaran.
#
# ⚠ `.env` TIDAK ikut git (ter-gitignore). Ia tinggal di server dan tak
# tertimpa oleh pembaruan apa pun.
# ============================================================================
set -e

AKAR=/srv/puraloka-suite
cd "$AKAR"

echo "== 1. Tarik kode terbaru =================================="
SEBELUM=$(git rev-parse --short HEAD)
git fetch --all --prune
git pull --ff-only
SESUDAH=$(git rev-parse --short HEAD)

if [ "$SEBELUM" = "$SESUDAH" ]; then
  echo "   Tak ada perubahan ($SESUDAH). Tetap dibangun ulang untuk memastikan."
else
  echo "   $SEBELUM -> $SESUDAH"
  git log --oneline "$SEBELUM..$SESUDAH" | head -10
fi

echo ""
echo "== 2. Env wajib ada ======================================="
if [ ! -f "$AKAR/.env" ]; then
  echo "   GAGAL: $AKAR/.env tak ada."
  echo "   Salin dari .env.deploy.example lalu isi. Tanpa itu compose berhenti"
  echo "   dengan menyebut variabel yang kosong — dan itu memang yang diinginkan."
  exit 1
fi
KOSONG=$(grep -cE '^[A-Z_]+=$' "$AKAR/.env" || true)
if [ "$KOSONG" != "0" ]; then
  echo "   GAGAL: $KOSONG variabel masih kosong di .env:"
  grep -nE '^[A-Z_]+=$' "$AKAR/.env" | head -10
  exit 1
fi
echo "   Semua variabel terisi."

echo ""
echo "== 3. Bangun & jalankan ==================================="
docker compose up -d --build

echo ""
echo "== 4. Tunggu sehat ========================================"
# Healthcheck menembak rute NYATA (/health dan /login), bukan `/` yang
# memulangkan 404/307 — dan 307 bukan bukti aplikasinya merender.
i=0
while [ $i -lt 30 ]; do
  API=$(docker inspect --format '{{.State.Health.Status}}' puraloka-api 2>/dev/null || echo none)
  WEB=$(docker inspect --format '{{.State.Health.Status}}' puraloka-web 2>/dev/null || echo none)
  echo "   api=$API web=$WEB"
  [ "$API" = "healthy" ] && [ "$WEB" = "healthy" ] && break
  i=$((i + 1))
  sleep 10
done
if [ "$API" != "healthy" ] || [ "$WEB" != "healthy" ]; then
  echo ""
  echo "   GAGAL: container tak sehat dalam 5 menit. Log 30 baris terakhir:"
  docker compose logs --tail=30
  exit 1
fi

echo ""
echo "== 5. Bukti dari luar ====================================="
# Dijalankan terhadap alamat PUBLIK, bukan 127.0.0.1: yang diuji jalur yang
# benar-benar dilewati pengguna, termasuk nginx dan TLS-nya.
#
# ⚠ ERP-nya di `app.`, BUKAN di domain akar.
#
# Skrip ini semula menembak `https://puraloka-suite.duckdns.org/login` dan
# melapor "GAGAL: bukan 200" pada TIAP pembaruan — padahal deploy-nya berhasil
# setiap kali. Domain akar itu COMPRO, dan compro memang tak punya `/login`.
#
# Diukur 2026-08-30:
#   puraloka-suite.duckdns.org/         200   (compro)
#   puraloka-suite.duckdns.org/login    404   (memang tak ada)
#   app.puraloka-suite.duckdns.org/login 200  (ERP — INI yang dimaksud)
#
# Ditulis sebelum compro dipisah ke domain sendiri, lalu tak pernah
# diperbarui. Kegagalan palsu yang berulang tiap deploy adalah cara tercepat
# melatih orang mengabaikan langkah verifikasi — dan langkah verifikasi yang
# diabaikan tak memverifikasi apa pun.
#
# Compro ikut diuji di `/`, karena ia juga bagian dari yang di-deploy.
for U in https://puraloka-suite.duckdns.org/ \
         https://app.puraloka-suite.duckdns.org/login \
         https://api.puraloka-suite.duckdns.org/health; do
  KODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$U" || echo 000)
  printf '   %-52s %s\n' "$U" "$KODE"
  [ "$KODE" = "200" ] || { echo "   GAGAL: bukan 200."; exit 1; }
done

echo ""
echo "== 6. Situs lain tak terganggu ============================"
# nginx melayani EMPAT situs lain di mesin ini. Pembaruan yang menjatuhkan
# salah satunya tak boleh lolos tanpa ketahuan.
for H in tjs-command-center.duckdns.org \
         n8n.tjs-command-center.duckdns.org \
         admin.puraloka-suite.duckdns.org; do
  KODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "https://$H/" || echo 000)
  printf '   %-52s %s\n' "$H" "$KODE"
done

echo ""
echo "SELESAI. Versi terpasang: $(git log --oneline -1)"
