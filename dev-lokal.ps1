<#
.SYNOPSIS
    Menjalankan seluruh service Puraloka Suite di localhost.

.DESCRIPTION
    Menyalakan API (:3001), Web dashboard (:3000), dan Web publik (:3002)
    di satu perintah, masing-masing di jendela PowerShell sendiri supaya
    log-nya tidak saling menimpa.

    Yang dilakukan skrip ini SELAIN memanggil `pnpm dev`:

    1. Memaksa API mendengarkan di 127.0.0.1, bukan 0.0.0.0.
       `apps/api/.env` menyetel HOST=0.0.0.0 — itu membuat API bisa dijangkau
       dari perangkat lain di jaringan yang sama (dipakai untuk uji dari HP).
       Untuk mode lokal murni, skrip meng-override-nya lewat variabel
       environment proses, TANPA menyentuh berkas .env.

    2. Memaksa web memanggil API di localhost.
       Pada saat skrip ini ditulis, `apps/web/.env.local` menyetel
       NEXT_PUBLIC_API_URL ke sebuah URL tunnel trycloudflare — sisa dari sesi
       uji perangkat. Kalau dibiarkan, seluruh service jalan lokal tetapi
       dashboard tetap menembak tunnel yang kemungkinan besar sudah mati, dan
       gejalanya muncul sebagai "API mati" padahal API sehat.
       Skrip meng-override-nya ke http://localhost:3001 untuk proses ini saja.
       CORS API sudah mengizinkan ^http://localhost:\d+$ (apps/api/src/index.ts),
       jadi tak ada yang perlu diubah di sisi server.

    3. Memeriksa port bentrok SEBELUM menyalakan apa pun, dan menunggu
       /health API benar-benar menjawab — bukan sekadar "proses sudah dijalankan".

    Mobile (Expo) TIDAK ikut dinyalakan secara default: ia butuh emulator atau
    perangkat fisik dan mengambil alih terminal dengan UI interaktif. Pakai
    -Mobile kalau memang diinginkan.

.PARAMETER Only
    Nyalakan sebagian saja. Nilai: api, web, publik. Bisa lebih dari satu.
    Contoh: -Only api,web

.PARAMETER Mobile
    Ikut menyalakan Expo dev server untuk apps/mobile.

.PARAMETER NoWait
    Jangan menunggu /health API. Langsung kembali setelah proses dijalankan.

.PARAMETER Kill
    Jangan menyalakan apa pun — hentikan proses yang sedang menempati
    port 3000/3001/3002, lalu keluar.

.EXAMPLE
    .\dev-lokal.ps1
    Menyalakan API + Web + Web publik.

.EXAMPLE
    .\dev-lokal.ps1 -Only api,web
    Hanya API dan dashboard.

.EXAMPLE
    .\dev-lokal.ps1 -Kill
    Membebaskan port 3000/3001/3002.
#>

[CmdletBinding()]
param(
    [ValidateSet('api', 'web', 'publik')]
    [string[]] $Only,

    [switch] $Mobile,
    [switch] $NoWait,
    [switch] $Kill
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Definisi service ─────────────────────────────────────────────────────────
# Port di sini harus cocok dengan yang dipakai kode:
#   api    → apps/api/src/index.ts  : Number(process.env.PORT) || 3001
#   web    → apps/web               : `next dev` (default 3000)
#   publik → apps/web-publik        : `next dev -p 3002` (package.json)
$Services = @(
    [pscustomobject]@{
        Key     = 'api'
        Nama    = 'API (Fastify)'
        Dir     = Join-Path $RepoRoot 'apps\api'
        Port    = 3001
        Cmd     = 'pnpm dev'
        Url     = 'http://localhost:3001'
        Health  = 'http://localhost:3001/health'
        Env     = @{
            # Lokal murni: hanya loopback. Menimpa HOST=0.0.0.0 dari apps/api/.env.
            HOST = '127.0.0.1'
        }
    }
    [pscustomobject]@{
        Key     = 'web'
        Nama    = 'Web dashboard (Next.js)'
        Dir     = Join-Path $RepoRoot 'apps\web'
        Port    = 3000
        Cmd     = 'pnpm dev'
        Url     = 'http://localhost:3000'
        Health  = $null
        Env     = @{
            # Menimpa URL tunnel di apps/web/.env.local — lihat catatan di header.
            NEXT_PUBLIC_API_URL = 'http://localhost:3001'
        }
    }
    [pscustomobject]@{
        Key     = 'publik'
        Nama    = 'Web publik (Next.js)'
        Dir     = Join-Path $RepoRoot 'apps\web-publik'
        Port    = 3002
        Cmd     = 'pnpm dev'
        Url     = 'http://localhost:3002'
        Health  = $null
        Env     = @{
            NEXT_PUBLIC_API_URL = 'http://localhost:3001'
        }
    }
)

if ($Mobile) {
    $Services += [pscustomobject]@{
        Key     = 'mobile'
        Nama    = 'Mobile (Expo)'
        Dir     = Join-Path $RepoRoot 'apps\mobile'
        Port    = 8081
        Cmd     = 'pnpm start'
        Url     = 'http://localhost:8081'
        Health  = $null
        Env     = @{}
    }
}

if ($Only) {
    $Services = $Services | Where-Object {
        $Only -contains $_.Key -or ($_.Key -eq 'mobile' -and $Mobile)
    }
}

# ── Util ─────────────────────────────────────────────────────────────────────

function Write-Langkah([string] $Teks) {
    Write-Host "  $Teks" -ForegroundColor Cyan
}

function Write-Ok([string] $Teks) {
    Write-Host "  OK   $Teks" -ForegroundColor Green
}

function Write-Gagal([string] $Teks) {
    Write-Host "  GAGAL $Teks" -ForegroundColor Red
}

function Write-Ingat([string] $Teks) {
    Write-Host "  !    $Teks" -ForegroundColor Yellow
}

# Mengembalikan daftar PID yang MENDENGARKAN di sebuah port.
# Get-NetTCPConnection dipakai lebih dulu (objek, bukan teks); netstat jadi
# cadangan untuk Windows yang tak punya modul NetTCPIP.
function Get-PidPort([int] $Port) {
    try {
        $konn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        return @($konn | Select-Object -ExpandProperty OwningProcess -Unique)
    } catch [System.Management.Automation.CommandNotFoundException] {
        $baris = netstat -ano -p TCP | Select-String -Pattern ":$Port\s+.*LISTENING"
        $hasil = @()
        foreach ($b in $baris) {
            $kolom = ($b.ToString().Trim() -split '\s+')
            $procId = $kolom[-1]
            # Cocokkan port secara ketat: ":3000" tidak boleh cocok dengan ":30001".
            if ($kolom[1] -match ":$Port$" -and $procId -match '^\d+$') {
                $hasil += [int] $procId
            }
        }
        return ($hasil | Select-Object -Unique)
    } catch {
        # Tak ada koneksi pada port itu — Get-NetTCPConnection melempar, bukan
        # mengembalikan kosong.
        return @()
    }
}

function Get-NamaProses([int] $ProcId) {
    try {
        return (Get-Process -Id $ProcId -ErrorAction Stop).ProcessName
    } catch {
        return '(tidak dikenal)'
    }
}

function Stop-Port([int] $Port, [string] $Nama) {
    $daftarPid = Get-PidPort $Port
    if (-not $daftarPid -or $daftarPid.Count -eq 0) {
        Write-Host "  ..   port $Port sudah bebas ($Nama)" -ForegroundColor DarkGray
        return
    }
    foreach ($procId in $daftarPid) {
        $namaProses = Get-NamaProses $procId
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Ok "port $Port dibebaskan — $namaProses (PID $procId)"
        } catch {
            Write-Gagal "port ${Port}: tidak bisa menghentikan $namaProses (PID $procId) — $($_.Exception.Message)"
        }
    }
}

# Menyalakan satu service di jendela PowerShell terpisah.
# Variabel environment di-set DI DALAM jendela anak, jadi tidak mencemari
# sesi pemanggil dan tidak menyentuh berkas .env mana pun.
function Start-Service-Lokal($Svc) {
    $barisEnv = @()
    foreach ($k in $Svc.Env.Keys) {
        $nilai = $Svc.Env[$k] -replace "'", "''"
        # Nama variabel dirakit terpisah supaya "`$env:$k" tidak dibaca parser
        # sebagai qualifier scope ("$env:" lalu token menggantung).
        $barisEnv += ('$env:' + $k + " = '$nilai'")
    }

    $judul = "Puraloka — $($Svc.Nama)"
    $perintah = @(
        "`$Host.UI.RawUI.WindowTitle = '$judul'"
        "Set-Location -LiteralPath '$($Svc.Dir)'"
        $barisEnv
        "Write-Host ''"
        "Write-Host '=== $($Svc.Nama) — $($Svc.Url) ===' -ForegroundColor Cyan"
        "Write-Host ''"
        $Svc.Cmd
    ) -join '; '

    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $perintah `
        -WorkingDirectory $Svc.Dir | Out-Null
}

# Menunggu endpoint /health menjawab 200. Nilai balik: $true kalau sehat.
function Wait-Health([string] $Url, [int] $TimeoutDetik = 90) {
    $batas = $TimeoutDetik * 2   # cek tiap 500 ms
    for ($i = 0; $i -lt $batas; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { return $true }
        } catch {
            # 503 = API hidup tapi DB tak terjangkau. Itu informasi berguna,
            # bukan sekadar "belum siap" — laporkan apa adanya lalu berhenti
            # menunggu, karena menunggu lebih lama tidak akan mengubahnya.
            $kode = $null
            if ($_.Exception.Response) {
                $kode = [int] $_.Exception.Response.StatusCode
            }
            if ($kode -eq 503) {
                Write-Ingat "API menjawab 503 (degraded) — proses hidup, tetapi DB tidak terjangkau."
                Write-Ingat "Periksa DATABASE_URL di apps/api/.env, lalu buka $Url untuk detailnya."
                return $false
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ── Mode -Kill ───────────────────────────────────────────────────────────────

if ($Kill) {
    Write-Host ''
    Write-Host 'Membebaskan port service lokal' -ForegroundColor White
    Write-Host ''
    foreach ($svc in $Services) {
        Stop-Port $svc.Port $svc.Nama
    }
    Write-Host ''
    exit 0
}

# ── Pemeriksaan awal ─────────────────────────────────────────────────────────

Write-Host ''
Write-Host 'Puraloka Suite — service lokal' -ForegroundColor White
Write-Host ''

# pnpm harus ada. Tanpa ini, jendela anak akan terbuka lalu langsung mati dan
# pesan galatnya hilang bersama jendelanya.
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Write-Gagal 'pnpm tidak ditemukan di PATH.'
    Write-Host '       Pasang dulu: npm install -g pnpm@11' -ForegroundColor DarkGray
    exit 1
}
Write-Ok "pnpm $((pnpm --version)) — $($pnpm.Source)"

if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    Write-Gagal 'node_modules belum ada — jalankan `pnpm install` lebih dulu.'
    exit 1
}

# Berkas env yang dibutuhkan tiap service. Ketiadaannya bukan alasan berhenti
# (Next.js bisa jalan tanpa .env.local), tapi wajib disebut — kalau tidak,
# gejalanya muncul jauh kemudian sebagai galat runtime yang membingungkan.
$berkasEnv = @{
    'api'    = 'apps\api\.env'
    'web'    = 'apps\web\.env.local'
    'publik' = 'apps\web-publik\.env.local'
}
foreach ($svc in $Services) {
    if ($berkasEnv.ContainsKey($svc.Key)) {
        $jalur = Join-Path $RepoRoot $berkasEnv[$svc.Key]
        if (-not (Test-Path $jalur)) {
            Write-Ingat "$($berkasEnv[$svc.Key]) tidak ada — salin dari .env.example bila service bermasalah."
        }
    }
}

# Port bentrok diperiksa untuk SEMUA service dulu, baru dilaporkan sekaligus.
# Menyalakan sebagian lalu gagal di tengah meninggalkan keadaan setengah jalan
# yang lebih sulit dibereskan daripada tidak menyalakan apa pun.
$bentrok = @()
foreach ($svc in $Services) {
    $daftarPid = Get-PidPort $svc.Port
    if ($daftarPid -and $daftarPid.Count -gt 0) {
        $bentrok += [pscustomobject]@{
            Port  = $svc.Port
            Nama  = $svc.Nama
            Pids  = $daftarPid
        }
    }
}

if ($bentrok.Count -gt 0) {
    Write-Host ''
    foreach ($b in $bentrok) {
        $detail = ($b.Pids | ForEach-Object { "$(Get-NamaProses $_) (PID $_)" }) -join ', '
        Write-Gagal "port $($b.Port) sudah dipakai — $detail · dibutuhkan oleh $($b.Nama)"
    }
    Write-Host ''
    Write-Host '       Bebaskan dulu:  .\dev-lokal.ps1 -Kill' -ForegroundColor DarkGray
    Write-Host '       Atau jalankan sebagian:  .\dev-lokal.ps1 -Only api' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

Write-Ok "port bebas: $(($Services | ForEach-Object { $_.Port }) -join ', ')"

# Peringatan khusus: NEXT_PUBLIC_API_URL di .env.local yang menunjuk ke luar
# localhost. Skrip ini sudah meng-override-nya, tetapi `pnpm dev` yang
# dijalankan manual TIDAK — dan itu sumber kebingungan yang mahal.
$webEnvLocal = Join-Path $RepoRoot 'apps\web\.env.local'
if (Test-Path $webEnvLocal) {
    $barisApiUrl = Select-String -Path $webEnvLocal -Pattern '^\s*NEXT_PUBLIC_API_URL\s*=\s*(.+)$'
    if ($barisApiUrl) {
        $nilai = $barisApiUrl.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($nilai -notmatch '^https?://(localhost|127\.0\.0\.1)(:\d+)?') {
            Write-Ingat "apps/web/.env.local menunjuk NEXT_PUBLIC_API_URL ke $nilai"
            Write-Ingat 'Skrip ini meng-override-nya ke http://localhost:3001 untuk sesi ini.'
            Write-Ingat 'Kalau menjalankan `pnpm dev` manual, override itu TIDAK berlaku.'
        }
    }
}

# ── Menyalakan ───────────────────────────────────────────────────────────────

Write-Host ''
foreach ($svc in $Services) {
    Write-Langkah "menyalakan $($svc.Nama) → $($svc.Url)"
    Start-Service-Lokal $svc
}

# ── Menunggu API sehat ───────────────────────────────────────────────────────

$svcApi = $Services | Where-Object { $_.Key -eq 'api' }
if ($svcApi -and -not $NoWait) {
    Write-Host ''
    Write-Langkah 'menunggu API menjawab /health ...'
    if (Wait-Health $svcApi.Health) {
        Write-Ok "API sehat — $($svcApi.Health)"
    } else {
        Write-Ingat "API belum menjawab 200 dalam 90 detik. Periksa jendela '$($svcApi.Nama)'."
    }
}

# ── Ringkasan ────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host 'Service berjalan:' -ForegroundColor White
foreach ($svc in $Services) {
    Write-Host ("  {0,-26} {1}" -f $svc.Nama, $svc.Url) -ForegroundColor Green
}
Write-Host ''
Write-Host '  Menghentikan semua:  .\dev-lokal.ps1 -Kill' -ForegroundColor DarkGray
Write-Host '  (atau tutup jendela masing-masing service)' -ForegroundColor DarkGray
Write-Host ''
