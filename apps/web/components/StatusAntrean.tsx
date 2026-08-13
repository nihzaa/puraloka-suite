"use client";

// ============================================================================
// F4-3 — pemicu sinkron + status antrean yang terlihat mandor.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI WAJIB ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Tanpa pemicu, `antrean-offline.ts` hanya MENYIMPAN. Kirimannya tak pernah
// berangkat, dan mandor melihat pesan "terkirim otomatis saat sinyal kembali"
// untuk sesuatu yang tak akan pernah kembali sendiri. Itu lebih buruk daripada
// tidak punya antrean sama sekali — ia berbohong dengan meyakinkan.
//
// Dua hal yang dikerjakan komponen ini:
//
//   1. MENGIRIM — saat browser mengabarkan `online`, saat tab kembali terlihat,
//      dan sekali di awal muat (perangkat bisa saja SUDAH online sejak awal,
//      sehingga `online` tak pernah menyala).
//
//   2. MEMPERLIHATKAN — berapa kiriman yang masih tertahan. Antrean yang tak
//      terlihat membuat mandor mengira laporannya sudah masuk, lalu terkejut
//      seminggu kemudian.
//
// ── Kenapa tak memakai interval berkala
//
// Mengulang tiap N detik di ponsel lapangan berarti membakar baterai dan kuota
// untuk percobaan yang hampir selalu gagal — justru di tempat yang keduanya
// paling langka. `online` + `visibilitychange` menangkap semua momen yang
// berguna tanpa biaya diam.
//
// ⚠️ `navigator.onLine` HANYA dipakai untuk menghias tampilan, tak pernah untuk
// memutuskan kirim-atau-tidak. Nilainya terkenal berbohong: ia menyala saat
// perangkat tersambung ke Wi-Fi proyek yang sendirinya tak punya internet —
// keadaan yang justru LAZIM di lokasi konstruksi. Satu-satunya bukti yang sah
// bahwa jaringan hidup adalah percobaan kirim yang berhasil.
// ============================================================================

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { antreanAktif, berlangganan, sinkronkan } from "@/lib/antrean-offline";
import {
  antreanCompany as antreanFotoCompany, berlangganan as berlanggananFoto,
  sinkronkan as sinkronkanFoto, companyAktif, type FotoAntre,
} from "@/lib/antrean-foto";
import { attachProgressPhoto } from "@/lib/storage";
import { api } from "@/lib/api";

/**
 * Snapshot dibaca sebagai ANGKA, bukan array.
 *
 * `useSyncExternalStore` membandingkan snapshot dengan `Object.is`. Bila yang
 * dikembalikan array, tiap pembacaan menghasilkan objek baru — React
 * menganggapnya selalu berubah dan render tanpa henti.
 */
const bacaJumlah = () => antreanAktif().length;

/**
 * Di server tak ada localStorage. Tanpa snapshot server tersendiri, render
 * pertama melempar dan seluruh layout mandor gagal dimuat.
 */
const bacaJumlahServer = () => 0;

export default function StatusAntrean() {
  // `useSyncExternalStore`, BUKAN useState+useEffect.
  //
  // Versi pertama memakai `setJumlah` di dalam `useEffect` dan penjaga
  // `lint:ratchet` menolaknya (`set-state-in-effect` 70 > ambang 69) — dengan
  // benar: pola itu merender dua kali tiap perubahan antrean. Hook ini memang
  // dirancang untuk sumber data di luar React seperti localStorage.
  const jumlahTeks = useSyncExternalStore(berlangganan, bacaJumlah, bacaJumlahServer);
  const [sedang, setSedang] = useState(false);

  // ── Foto TIDAK lewat useSyncExternalStore ────────────────────────────────
  //
  // Hook itu menuntut pembaca SINKRON, sementara IndexedDB asinkron. Yang
  // dipakai: berlangganan ke antrean foto, lalu menyimpan angkanya di state.
  // Tanpa hitungan foto, lencana ini hilang saat yang tertahan hanya foto —
  // dan mandor tak punya cara tahu masih ada yang belum terkirim.
  const [jumlahFoto, setJumlahFoto] = useState(0);

  // ── Pastikan company aktif DIKETAHUI ──────────────────────────────────────
  //
  // `puraloka_company_id` dibaca empat berkas tapi hanya ditulis oleh
  // `company-switcher.tsx`, yang TAK dirender di portal mandor. Diukur di
  // peramban nyata 2026-08-13: nol kunci ber-"company" di localStorage
  // sesudah mandor login.
  //
  // Akibatnya justru menimpa komponen INI: antrean disaring dengan company
  // kosong, tak menemukan apa pun, dan lencana "menunggu sinyal" tak pernah
  // muncul — mandor mengira kirimannya sudah sampai.
  //
  // Dipanggil di sini, bukan di layout: komponen inilah yang membutuhkannya,
  // dan ia hadir di kedua sisi aplikasi (dashboard & portal mandor).
  useEffect(() => {
    if (companyAktif()) return;
    // Balasannya diserap interceptor `api.ts` yang menyimpan
    // `active_company_id`. Gagal memuat bukan alasan menjatuhkan lencana —
    // ia hanya tetap menghitung dengan company kosong, seperti sebelumnya.
    void api.get("/api/v1/my/companies").catch(() => { /* diam */ });
  }, []);

  useEffect(() => {
    let batal = false;
    const hitung = () => {
      void antreanFotoCompany(companyAktif()).then((a) => {
        if (!batal) setJumlahFoto(a.length);
      });
    };
    hitung();
    const lepas = berlanggananFoto(hitung);
    return () => { batal = true; lepas(); };
  }, []);

  const jumlah = jumlahTeks + jumlahFoto;

  const coba = useCallback(async () => {
    const adaTeks = antreanAktif().length > 0;
    const company = companyAktif();
    const adaFoto = (await antreanFotoCompany(company)).length > 0;
    if (!adaTeks && !adaFoto) return;

    setSedang(true);
    try {
      // Teks lebih dulu: foto menempel pada log, dan log yang belum terkirim
      // membuat fotonya tertahan menunggu `logId`. Urutan terbalik berarti
      // seluruh foto dilewati, lalu baru bisa naik pada percobaan berikutnya.
      if (adaTeks) await sinkronkan();
      if (adaFoto) {
        await sinkronkanFoto(company, async (f: FotoAntre) => {
          if (!f.logId) return;
          await attachProgressPhoto(
            f.projectId, f.logId,
            new File([f.blob], f.namaBerkas, { type: f.blob.type || "image/jpeg" }),
            f.keterangan || undefined,
          );
        });
      }
    } finally {
      setSedang(false);
    }
  }, []);

  useEffect(() => {
    // Percobaan pertama sengaja DITUNDA satu tick, bukan dipanggil langsung.
    //
    // `coba()` memanggil `setSedang(true)` secara sinkron; memanggilnya di
    // badan effect memicu render bertingkat, dan penjaga `lint:ratchet`
    // menolaknya dengan benar. Menundanya juga lebih tepat perilakunya: render
    // pertama tak perlu tertahan menunggu jaringan yang mungkin memang mati.
    //
    // Alasan percobaan awal ini ada sama sekali: perangkat bisa SUDAH online
    // sejak awal, sehingga peristiwa `online` tak pernah menyala dan antrean
    // dari sesi sebelumnya menganggur selamanya.
    const awal = setTimeout(() => void coba(), 0);

    const saatTerlihat = () => {
      if (document.visibilityState === "visible") void coba();
    };
    window.addEventListener("online", coba);
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      clearTimeout(awal);
      window.removeEventListener("online", coba);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [coba]);

  if (jumlah === 0) return null;

  return (
    <button
      type="button"
      onClick={() => void coba()}
      disabled={sedang}
      aria-live="polite"
      aria-label={
        jumlahFoto > 0 && jumlahTeks > 0
          ? `${jumlahTeks} kiriman dan ${jumlahFoto} foto menunggu sinyal. Tekan untuk mencoba mengirim sekarang.`
          : jumlahFoto > 0
            ? `${jumlahFoto} foto menunggu sinyal. Tekan untuk mencoba mengirim sekarang.`
            : `${jumlahTeks} kiriman menunggu sinyal. Tekan untuk mencoba mengirim sekarang.`
      }
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 12px", borderRadius: 999,
        border: "1px solid var(--warning)",
        background: "var(--warning-bg)", color: "var(--warning)",
        fontSize: 12, fontWeight: 600,
        cursor: sedang ? "progress" : "pointer",
      }}
    >
      {sedang
        ? <RefreshCw size={13} aria-hidden="true" />
        : <CloudOff size={13} aria-hidden="true" />}
      {sedang
        ? "Mengirim…"
        : jumlahFoto > 0 && jumlahTeks === 0
          ? `${jumlahFoto} foto menunggu sinyal`
          : `${jumlah} menunggu sinyal`}
    </button>
  );
}
