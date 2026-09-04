"use client";

/**
 * PENGATURAN → PREFERENSI PESAN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA HALAMAN YANG BOLEH DIBUKA SIAPA PUN TANPA IZIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap orang berhak mematikan pesan yang mengganggunya tanpa meminta izin
 * siapa pun. Opt-out yang butuh permission bukan opt-out — ia jadi
 * permohonan, dan permohonan bisa ditolak.
 *
 * Karena itu halaman ini tak memakai `useIzin` sama sekali. Yang butuh izin
 * hanya mengubah preferensi ORANG LAIN, dan itu belum ada di layar ini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * "BERHENTI" DITARUH PALING BAWAH, BUKAN PALING ATAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ia pilihan paling menyeluruh — menahan SEMUA pesan, termasuk yang mendesak.
 * Menaruhnya paling atas membuatnya jadi jalan pintas yang diambil orang
 * sebelum mencoba jam tenang atau menurunkan kuota, dan yang sudah menekan
 * "berhenti total" jarang kembali menyalakannya.
 *
 * Urutannya: yang paling halus dulu, yang paling keras terakhir.
 */

import { useCallback, useEffect, useState } from "react";
import { BellOff, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { PanduanHalaman } from "@/components/panduan-halaman";
import { Saklar } from "@/components/saklar";

interface Preferensi {
  jam_tenang_mulai: string;
  jam_tenang_selesai: string;
  maks_per_hari: number;
  boleh_sapaan: boolean;
  berhenti: boolean;
  zona_waktu: string;
}

interface Muatan {
  data: Preferensi;
  tersimpan: boolean;
  bawaan: { jam_tenang_mulai: string; jam_tenang_selesai: string; maks_per_hari: number };
}

export default function PreferensiPesanPage() {
  const [draf, setDraf] = useState<Partial<Preferensi>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [toast, setToast] = useState<{ tipe: "ok" | "salah"; pesan: string } | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask.
  */
  const { data: muatan, memuat, galat: galatMuat, muatUlang } = useData<Muatan>("/api/v1/preferensi-pesan");
  const ambil = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const galat = galatMuat ? "Preferensi tidak bisa dimuat." : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const p = muatan ? { ...muatan.data, ...draf } : null;
  const berubah = Object.keys(draf).length > 0;

  async function simpan() {
    if (!p) return;
    setMenyimpan(true);
    try {
      await api.put("/api/v1/preferensi-pesan", {
        jam_tenang_mulai: p.jam_tenang_mulai,
        jam_tenang_selesai: p.jam_tenang_selesai,
        maks_per_hari: Number(p.maks_per_hari),
        boleh_sapaan: p.boleh_sapaan,
        berhenti: p.berhenti,
      });
      setDraf({});
      await ambil();
      setToast({ tipe: "ok", pesan: "Preferensi tersimpan" });
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "salah", pesan: m ?? "Gagal menyimpan" });
    } finally {
      setMenyimpan(false);
    }
  }

  if (memuat) {
    return (
      <div style={{ padding: "var(--pad-atas) var(--pad-x)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
        <KepalaHalaman judul="Preferensi Pesan" keterangan="Memuat…" />
      </div>
    );
  }

  if (galat || !p) {
    return (
      <div style={{ padding: "var(--pad-atas) var(--pad-x)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
        {/*
          Judul lewat `<KepalaHalaman>` juga di cabang GALAT — halaman yang
          gagal memuat tetap halaman yang sama, dan judul yang "meloncat"
          gayanya justru saat ada masalah membuat layarnya terasa rusak
          lebih dari yang sebenarnya.

          Pesan galatnya TIDAK dijadikan `keterangan`: keterangan bernada
          netral, sementara ini kabar buruk yang perlu warnanya sendiri.
        */}
        <KepalaHalaman judul="Preferensi Pesan" />
        <p style={{ fontSize: 13, color: C.danger, marginTop: 8 }}>{galat ?? "Preferensi tak tersedia."}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 60,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13,
            background: toast.tipe === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.tipe === "ok" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${toast.tipe === "ok" ? "var(--success)" : "var(--danger)"}`,
          }}
        >
          {toast.pesan}
        </div>
      )}

      <div style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Preferensi Pesan"
          keterangan="Kapan asisten boleh menghubungi Anda, dan seberapa sering."
          ikon={<BellOff size={19} />}
        />
      </div>

      <PanduanHalaman
        untuk={
          <>
            Pengaturan ini berlaku untuk pesan yang <strong>dimulai asisten</strong> — bukan
            balasan atas pertanyaan Anda. Kalau Anda bertanya pukul 23:00, jawabannya tetap
            datang.
          </>
        }
        langkah={[
          { teks: "Tentukan jam tenang — asisten tak menghubungi Anda di rentang ini", selesai: true },
          { teks: "Batasi berapa pesan per hari yang boleh masuk" },
          { teks: "Matikan sapaan kalau Anda hanya mau dihubungi saat ada temuan" },
        ]}
        catatan="Hal yang benar-benar mendesak (mis. pembayaran jatuh tempo hari ini) tetap menembus jam tenang dan batas harian — kecuali Anda menyalakan 'berhenti total' di bawah."
      />

      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
        {/* ── Jam tenang ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 550, color: C.mid, margin: "0 0 5px" }}>
            Jam tenang
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor="jam-mulai" style={{ fontSize: 12.5, color: C.mid }}>dari</label>
            <input
              className="isian-fokus"
              id="jam-mulai"
              type="time"
              value={p.jam_tenang_mulai}
              onChange={(e) => setDraf((d) => ({ ...d, jam_tenang_mulai: e.target.value }))}
              style={{ ...GAYA_ISIAN, width: 130, flexShrink: 0 }}
            />
            <label htmlFor="jam-selesai" style={{ fontSize: 12.5, color: C.mid }}>sampai</label>
            <input
              className="isian-fokus"
              id="jam-selesai"
              type="time"
              value={p.jam_tenang_selesai}
              onChange={(e) => setDraf((d) => ({ ...d, jam_tenang_selesai: e.target.value }))}
              style={{ ...GAYA_ISIAN, width: 130, flexShrink: 0 }}
            />
          </div>
          <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "8px 0 0", maxWidth: "60ch" }}>
            Boleh melewati tengah malam — {muatan?.bawaan.jam_tenang_mulai}–
            {muatan?.bawaan.jam_tenang_selesai} berarti dari malam sampai pagi berikutnya.
          </p>
        </div>

        {/* ── Kuota harian ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <label htmlFor="kuota" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
            Paling banyak per hari
          </label>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <input
              className="isian-fokus"
              id="kuota"
              type="number"
              min={0}
              max={50}
              value={p.maks_per_hari}
              onChange={(e) => setDraf((d) => ({ ...d, maks_per_hari: Number(e.target.value) }))}
              style={{ ...GAYA_ISIAN, width: 110, flexShrink: 0 }}
            />
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "8px 0 0", maxWidth: "60ch" }}>
              Isi <strong>0</strong> kalau Anda tak mau dihubungi duluan sama sekali, tetapi tetap
              ingin menerima yang mendesak.
            </p>
          </div>
        </div>

        {/* ── Sapaan ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <Saklar
            nyala={p.boleh_sapaan}
            onUbah={(v) => setDraf((d) => ({ ...d, boleh_sapaan: v }))}
            label="Boleh menyapa tanpa ada temuan"
            ringkas="Kalau dimatikan, asisten hanya menghubungi Anda saat memang ada sesuatu di data yang perlu disebut."
          />
        </div>

        {/*
          BERHENTI TOTAL — paling bawah, dengan sengaja.

          Ia menahan SEMUA pesan termasuk yang mendesak. Menaruhnya paling atas
          membuatnya jadi jalan pintas yang diambil sebelum orang mencoba jam
          tenang atau menurunkan kuota — dan yang sudah menekannya jarang
          kembali menyalakannya.
        */}
        <div
          style={{
            padding: "12px 14px", borderRadius: "var(--radius-sm, 10px)",
            border: `1px solid ${p.berhenti ? "var(--danger)" : C.border}`,
            background: p.berhenti ? "var(--danger-bg)" : "var(--surface-subtle)",
            marginBottom: 18,
          }}
        >
          <Saklar
            nyala={p.berhenti}
            onUbah={(v) => setDraf((d) => ({ ...d, berhenti: v }))}
            label="Berhenti total"
            ringkas="Menahan SEMUA pesan dari asisten, termasuk yang mendesak. Balasan atas pertanyaan Anda tetap datang."
          />
        </div>

        <button
          type="button"
          onClick={() => void simpan()}
          disabled={!berubah || menyimpan}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 16px", borderRadius: 8, border: "none",
            fontSize: 13, fontWeight: 600,
            background: berubah && !menyimpan ? C.navy : "var(--surface-subtle)",
            color: berubah && !menyimpan ? C.onNavy : C.muted,
            cursor: berubah && !menyimpan ? "pointer" : "default",
          }}
        >
          {menyimpan ? <Loader2 size={14} className="berputar" /> : null}
          Simpan preferensi
        </button>
      </section>
    </div>
  );
}
