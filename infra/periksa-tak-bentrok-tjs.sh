#!/bin/sh
# ============================================================================
# PENJAGA: Puraloka tak boleh bentrok dengan TJS di VPS yang sama
# ============================================================================
#   ssh root@187.52.124.41 "/srv/puraloka-suite/infra/periksa-tak-bentrok-tjs.sh"
#
# Dijalankan SEBELUM `docker compose up`, dan LAGI sesudahnya.
#
# ── Kenapa berkas ini ada
#
# Mesin ini menjalankan TJS Command Center yang DIPAKAI. Diukur 2026-08-30:
#
#     :3000  next-server        aplikasi TJS
#     :5432  postgres           basis TJS
#     :5678  n8n                n8n TJS
#     :5679  n8n broker         n8n TJS
#     :8080  evolution-api      Evolution TJS (database `evolution`)
#
# Bentrok di sini TIDAK menghasilkan galat yang menunjuk sebabnya. Yang
# terjadi: pesan WhatsApp Puraloka dikirim ke webhook TJS, atau dua instance
# menulis ke folder workflow yang sama. Gejalanya muncul berhari-hari kemudian
# sebagai "riwayat chat kok campur".
#
# Karena itu yang diperiksa BUKAN "apakah container Puraloka hidup" melainkan
# "apakah ia menyentuh milik TJS".
# ============================================================================
set -e

GAGAL=0

echo "== 1. Port TJS masih dipegang TJS =========================="
# Kalau salah satu ini kosong, ada yang MATI — dan mungkin karena kita.
for P in 3000 5432 5678 5679 8080; do
  if ss -tln 2>/dev/null | grep -q ":$P "; then
    printf '   :%-6s masih hidup  ✓\n' "$P"
  else
    printf '   :%-6s KOSONG  ✗  ← milik TJS, seharusnya hidup\n' "$P"
    GAGAL=1
  fi
done

echo ""
echo "== 2. Port Puraloka BUKAN port TJS ========================="
for P in 3101 3102 3103 5690 5691 8091; do
  PEMILIK=$(ss -tlnp 2>/dev/null | grep ":$P " | head -1 | sed 's/.*users:((//; s/,.*//' | tr -d '"')
  if [ -z "$PEMILIK" ]; then
    printf '   :%-6s bebas\n' "$P"
  else
    printf '   :%-6s dipakai %s\n' "$P" "$PEMILIK"
  fi
done
for P in 3000 5432 5678 5679 8080; do
  if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E '^puraloka' | grep -q ":$P->"; then
    printf '   ✗ container Puraloka memetakan :%s — ITU MILIK TJS\n' "$P"
    GAGAL=1
  fi
done

echo ""
echo "== 3. Evolution: database TERPISAH =========================="
# Berbagi database membuat sesi WhatsApp dan riwayat chat dua perusahaan
# bercampur — cacat paling mahal di berkas ini, dan paling sunyi.
TJS_DB=$(grep -hoP '(?<=DATABASE_CONNECTION_CLIENT_NAME=).*' /var/www/tjs/evolution-api/.env 2>/dev/null || echo '?')
PRL_DB=$(docker inspect puraloka-evolution --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
         | grep -oP '(?<=DATABASE_CONNECTION_CLIENT_NAME=).*' || echo '(container belum jalan)')
echo "   TJS      : $TJS_DB"
echo "   Puraloka : $PRL_DB"
if [ "$TJS_DB" = "$PRL_DB" ]; then
  echo "   ✗ SAMA — sesi WhatsApp dua perusahaan akan bercampur"
  GAGAL=1
elif [ "$PRL_DB" != "(container belum jalan)" ]; then
  echo "   ✓ berbeda"
fi

echo ""
echo "== 4. Situs TJS masih menjawab ============================="
for H in tjs-command-center.duckdns.org n8n.tjs-command-center.duckdns.org; do
  KODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "https://$H/" || echo 000)
  printf '   %-45s %s\n' "$H" "$KODE"
  case "$KODE" in
    2*|3*) : ;;
    *) echo "      ✗ TJS tak menjawab — periksa sebelum melanjutkan"; GAGAL=1 ;;
  esac
done

echo ""
if [ "$GAGAL" = "0" ]; then
  echo "AMAN — Puraloka tak menyentuh milik TJS."
  exit 0
fi
echo "BENTROK TERDETEKSI. Jangan lanjutkan sebelum ini beres."
exit 1
