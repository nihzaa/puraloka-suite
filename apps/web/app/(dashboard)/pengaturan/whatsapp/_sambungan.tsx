"use client";

/**
 * KARTU SAMBUNGAN — instance Evolution dikelola dari UI Puraloka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DI SINI, BUKAN DI HALAMAN EVOLUTION SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Evolution punya UI-nya sendiri (`/manager`), dan memakainya berarti admin
 * satu perusahaan melihat SELURUH instance di server — termasuk milik
 * perusahaan lain. Untuk SaaS multi-tenant itu bukan ketidaknyamanan,
 * melainkan kebocoran.
 *
 * Semua percakapan dengan Evolution terjadi di server Puraloka. Yang sampai
 * ke peramban hanya status, gambar QR, dan nomor yang tersambung — `apikey`
 * Evolution tak pernah menyeberang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA QR MENYEGARKAN SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * QR WhatsApp kedaluwarsa ~60 detik, dan yang basi GAGAL DIAM: ponsel hanya
 * berkata "tidak valid" tanpa menyebut sebabnya, lalu orang menyimpulkan
 * sambungannya yang rusak.
 *
 * Karena itu QR diminta ulang tiap 20 detik selama panel terbuka, dan
 * berhenti sendiri begitu state jadi `open`.
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import {
  AlertTriangle, CheckCircle2, Link2, Loader2, QrCode, Unplug,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";

interface Status {
  siap: boolean;
  instance?: string | null;
  state?: string;
  nomor?: string | null;
  error?: string;
}

const JEDA_QR_MS = 20_000;

/** Label yang menyebut KEADAAN, bukan istilah teknis Evolution. */
function labelState(s: string | undefined): { teks: string; warna: string } {
  switch (s) {
    case "open":            return { teks: "Tersambung", warna: "var(--success)" };
    case "connecting":      return { teks: "Menunggu dipindai", warna: "var(--warning)" };
    case "close":           return { teks: "Terputus", warna: C.mid };
    case "belum_dibuat":    return { teks: "Belum dibuat", warna: C.mid };
    case "hilang_di_server":return { teks: "Tak ditemukan di server", warna: "var(--danger)" };
    default:                return { teks: s ?? "—", warna: C.mid };
  }
}

export default function KartuSambungan({
  bolehKelola,
  onToast,
}: {
  bolehKelola: boolean;
  onToast: (t: { tipe: "ok" | "err"; pesan: string }) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [sedang, setSedang] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [panelQr, setPanelQr] = useState(false);

  // Penghitung putaran — MEMICU penyegaran, bukan menyimpan timer.
  //
  // Versi pertama menyimpan `setTimeout` di sebuah ref lalu menulisinya dari
  // dalam `useCallback`. Itu melanggar `react-hooks/immutability` (menulis ref
  // saat render/callback yang di-memo), dan repo ini memakai lint-ratchet
  // berambang NOL untuk error — warning baru pun menaikkan angka yang tak
  // boleh naik.
  //
  // Bentuk ini memindahkan timer ke `useEffect`, tempat efek samping memang
  // boleh hidup: menaikkan `putaran` menjadwalkan permintaan berikutnya, dan
  // membersihkannya cukup dengan `return () => clearTimeout(...)`.
  const [putaran, setPutaran] = useState(0);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<Status>("/api/v1/wa/instance");
      setStatus(r.data);
    } catch (e) {
      setStatus({
        siap: false,
        error:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal membaca status sambungan",
      });
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void muat(); }); }, [muat]);

  /**
   * Meminta QR sekali tiap `putaran` berubah, selama panel terbuka.
   *
   * Timer-nya milik effect ini, jadi menutup panel atau meninggalkan halaman
   * membersihkannya sendiri. Tanpa itu, pindah halaman meninggalkan permintaan
   * yang terus menyentuh Evolution tiap 20 detik selamanya.
   */
  useEffect(() => {
    if (!panelQr) return;
    let hidup = true;
    let jam: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        const r = await api.get<{ state: string; base64: string | null }>(
          "/api/v1/wa/instance/qr",
        );
        if (!hidup) return;

        if (r.data.state === "open") {
          setQr(null);
          setPanelQr(false);
          void muat();
          onToast({ tipe: "ok", pesan: "WhatsApp tersambung." });
          return;
        }
        setQr(r.data.base64);
        jam = setTimeout(() => { if (hidup) setPutaran((n) => n + 1); }, JEDA_QR_MS);
      } catch (e) {
        if (!hidup) return;
        onToast({
          tipe: "err",
          pesan:
            (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Gagal meminta QR",
        });
        setPanelQr(false);
      }
    })();

    return () => {
      hidup = false;
      if (jam) clearTimeout(jam);
    };
  }, [panelQr, putaran, muat, onToast]);

  async function buatInstance() {
    setSedang("buat");
    try {
      const r = await api.post<{ instance: string; sudahAda: boolean }>(
        "/api/v1/wa/instance", {},
      );
      onToast({
        tipe: "ok",
        pesan: r.data.sudahAda
          ? `Instance ${r.data.instance} sudah ada — dipakai.`
          : `Instance ${r.data.instance} dibuat.`,
      });
      await muat();
    } catch (e) {
      onToast({
        tipe: "err",
        pesan:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal membuat instance",
      });
    } finally {
      setSedang(null);
    }
  }

  async function putus() {
    setSedang("putus");
    try {
      await api.post("/api/v1/wa/instance/putus", {});
      onToast({ tipe: "ok", pesan: "Sesi diputus. Pindai QR untuk menyambung lagi." });
      setQr(null);
      setPanelQr(false);
      await muat();
    } catch (e) {
      onToast({
        tipe: "err",
        pesan:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal memutus sesi",
      });
    } finally {
      setSedang(null);
    }
  }

  function bukaPanelQr() {
    setQr(null);
    setPutaran((n) => n + 1); // memicu effect QR
    setPanelQr(true);
  }

  const st = labelState(status?.state);
  const tersambung = status?.state === "open";
  const adaInstance = Boolean(status?.instance);

  return (
    <section
      style={{
        ...GAYA_KARTU,
        padding: "var(--pad-kartu-lega)",
        marginBottom: "var(--gap-bagian)",
      }}
    >
      <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 12px" }}>
        Sambungan
      </h2>

      {memuat ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.mid }}>
          <Loader2 size={14} className="berputar" /> memuat status…
        </div>
      ) : status && !status.siap ? (
        <div style={{ display: "flex", gap: 10 }}>
          <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            {status.error}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: "50%", background: st.warna, flexShrink: 0 }}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{st.teks}</span>
            {status?.nomor && (
              <span style={{ fontSize: 13, color: C.mid }}>· +{status.nomor}</span>
            )}
            {status?.instance && (
              <code style={{ fontSize: 11, color: C.muted }}>{status.instance}</code>
            )}
          </div>

          {/*
            Nomor yang tersambung DITAMPILKAN, dan itu bukan hiasan: satu
            server Evolution memuat instance banyak perusahaan, dan memindai
            dengan nomor yang salah tak menghasilkan galat apa pun — pesan
            perusahaan ini akan terkirim dari nomor perusahaan lain.
          */}
          {tersambung && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mid, marginBottom: 14 }}>
              <CheckCircle2 size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
              Pastikan nomor di atas benar milik perusahaan ini.
            </div>
          )}

          {bolehKelola && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!adaInstance || status?.state === "hilang_di_server" ? (
                <button
                  onClick={buatInstance}
                  disabled={sedang !== null}
                  style={tombolUtama(sedang !== null)}
                >
                  {sedang === "buat"
                    ? <Loader2 size={14} className="berputar" />
                    : <Link2 size={14} />}
                  {status?.state === "hilang_di_server" ? "Buat ulang instance" : "Buat instance"}
                </button>
              ) : !tersambung ? (
                <button
                  onClick={bukaPanelQr}
                  disabled={sedang !== null || panelQr}
                  style={tombolUtama(sedang !== null || panelQr)}
                >
                  <QrCode size={14} /> Tampilkan QR
                </button>
              ) : (
                <button
                  onClick={putus}
                  disabled={sedang !== null}
                  style={tombolBiasa(sedang !== null)}
                >
                  {sedang === "putus"
                    ? <Loader2 size={14} className="berputar" />
                    : <Unplug size={14} />}
                  Putuskan sesi
                </button>
              )}
            </div>
          )}

          {panelQr && (
            <div style={{ marginTop: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div
                style={{
                  width: 240, height: 240, borderRadius: 12, background: "#fff",
                  display: "grid", placeItems: "center", flexShrink: 0,
                  border: `1px solid ${C.border}`,
                }}
              >
                {/*
                  `next/image` dengan `unoptimized`: sumbernya data-URI base64
                  yang berganti tiap 20 detik. Mengoptimalkannya sia-sia —
                  tak ada berkas untuk di-cache, dan pengoptimal justru
                  menambah pekerjaan untuk gambar yang langsung basi.
                  Dipakai `Image` (bukan `<img>`) agar lint-ratchet tak naik.
                */}
                {qr
                  ? <Image src={qr} alt="Kode QR WhatsApp" width={216} height={216} unoptimized />
                  : <Loader2 size={20} className="berputar" style={{ color: C.mid }} />}
              </div>
              <ol style={{ fontSize: 13, color: C.mid, lineHeight: 1.9, margin: 0, paddingLeft: 18, maxWidth: 320 }}>
                <li>Buka WhatsApp di ponsel</li>
                <li>Setelan → Perangkat tertaut</li>
                <li>Tautkan perangkat, lalu pindai kode ini</li>
                <li style={{ color: C.muted }}>Kode diperbarui otomatis tiap 20 detik</li>
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function tombolUtama(mati: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 8, border: "none",
    background: mati ? "var(--text-muted)" : C.navy, color: C.onNavy,
    fontSize: 13, fontWeight: 600, cursor: mati ? "not-allowed" : "pointer",
  };
}

function tombolBiasa(mati: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: "var(--surface)", color: C.mid,
    fontSize: 13, fontWeight: 600, cursor: mati ? "not-allowed" : "pointer",
  };
}
