# Cara Demo Puraloka Suite ke Device Lain

## Prasyarat
- Semua dependency sudah terinstall (`pnpm install`)
- File `apps/api/.env` dan `apps/web/.env.local` sudah ada dan terisi
- `tools/cloudflared.exe` sudah ada (sudah di-download, lihat di bawah jika belum)

## Langkah

1. Buka PowerShell di folder `E:\Project\puraloka-suite`
2. Jalankan:
   ```powershell
   .\start-demo.ps1
   ```
3. Tunggu sampai muncul URL di terminal (~20–30 detik)
4. Bagikan URL web ke device lain
5. Tekan `Ctrl+C` untuk stop semua tunnel

## Apa yang Dilakukan Script

1. Kill proses cloudflared lama (jika ada)
2. Start API server (port 3001) di PowerShell window baru
3. Buat Cloudflare Quick Tunnel untuk API → dapat URL seperti `https://xxxx.trycloudflare.com`
4. Update `apps/web/.env.local` dengan URL API tunnel
5. **Build** Next.js (`pnpm build`) — URL API sudah ter-bake ke dalam bundle
6. Start Next.js **production** server (`pnpm start`, port 3000) — tidak ada HMR, tidak ada WebSocket error
7. Buat Cloudflare Quick Tunnel untuk Web → dapat URL web
8. Tampilkan kedua URL, tunggu Ctrl+C

> **Kenapa production mode?** Next.js dev server mencoba buka HMR WebSocket ke `wss://[tunnel-url]` yang tidak bisa melewati Cloudflare Tunnel, menyebabkan flood error di console browser. Production mode tidak punya HMR sama sekali.

## Download cloudflared (jika belum ada)

```powershell
curl -L -o tools\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
```

## Catatan
- URL tunnel berubah setiap kali script dijalankan ulang
- `apps/web/.env.local` otomatis diupdate oleh script dengan URL API yang baru
- Butuh koneksi internet di PC yang menjalankan script
- `tools/cloudflared.exe` sudah ada di `.gitignore` (tidak ikut commit)
- Tidak perlu akun Cloudflare — menggunakan Quick Tunnel (gratis, no auth)
