"use client";

/**
 * TERAPKAN KE RAB PROYEK — memindahkan item estimasi jadi `rab_items`.
 *
 * Bertahap (siap → konfirmasi → selesai) dan menyebut DAMPAKNYA lebih dulu:
 * berapa baris akan dihapus, berapa akan dibuat. Tindakan yang menimpa data
 * proyek tak boleh dijalankan dari satu klik tanpa angka di depan mata.
 *
 * Disalin apa adanya dari berkas 4.070 baris yang dibongkar.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { formatRupiah } from "@/lib/format";
import { Modal, btnPrimary, btnGhost } from "./kerangka";
import type { VersionDetail } from "./modal-item";

const fmtRp = formatRupiah;

export function TerapkanKeRabModal({ version, onClose }: { version: VersionDetail; onClose: () => void }) {
  const [tahap, setTahap] = useState<"siap" | "konfirmasi" | "selesai">("siap");
  const [dampak, setDampak] = useState<{ akan_dihapus: number; akan_dibuat: number } | null>(null);
  const [hasil, setHasil] = useState<{ dihapus: number; dibuat: number; total: number; project_id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function jalankan(konfirmasi: boolean) {
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ dihapus: number; dibuat: number; total: number; project_id: string }>(
        `/api/v1/estimate-versions/${version.id}/terapkan-ke-rab`,
        konfirmasi ? { konfirmasi_timpa: true } : {});
      setHasil(r.data); setTahap("selesai");
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: {
        error?: string; kode?: string; akan_dihapus?: number; akan_dibuat?: number } } }).response;
      if (res?.status === 409 && res.data?.kode === "RAB_SUDAH_ADA") {
        setDampak({ akan_dihapus: res.data.akan_dihapus ?? 0, akan_dibuat: res.data.akan_dibuat ?? 0 });
        setTahap("konfirmasi");
      } else {
        setErr(res?.data?.error ?? "Gagal menerapkan ke RAB proyek");
      }
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Terapkan Versi ${version.version_number} ke RAB Proyek`} onClose={onClose}>
      {err && <p style={{ color: C.red, fontSize: 12, margin: "0 0 10px" }}>{err}</p>}

      {tahap === "siap" && (
        <>
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: "0 0 12px" }}>
            {version.items.length} item akan disalin menjadi RAB proyek. Setelah itu,
            <b> Kurva S, EVM, dan progress fisik</b> akan memakai angka dari versi ini —
            ketiganya membaca RAB proyek, bukan estimasi.
          </p>
          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
            Bobot tiap item dihitung dari proporsi nilainya, dan totalnya persis 100%.
            Unggah RAB Excel di halaman Proyek tetap bisa dipakai kapan saja — keduanya
            menulis ke tempat yang sama.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnGhost} onClick={onClose}>Batal</button>
            <button style={btnPrimary} disabled={busy} onClick={() => void jalankan(false)}>
              {busy ? "Memeriksa…" : "Terapkan"}
            </button>
          </div>
        </>
      )}

      {tahap === "konfirmasi" && dampak && (
        <>
          <div style={{ padding: "12px var(--pad-kartu-lega)", background: C.yellowBg, borderRadius: 6, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              RAB proyek ini sudah berisi <b>{dampak.akan_dihapus} baris</b>.
              Menerapkan versi ini akan <b>menghapus semuanya</b> dan menggantinya dengan{" "}
              <b>{dampak.akan_dibuat} baris</b> dari estimasi.
            </p>
          </div>
          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
            Progress fisik yang sudah tercatat pada baris lama ikut hilang, karena
            barisnya diganti. Pastikan ini memang yang Anda maksud.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnGhost} onClick={onClose}>Batal</button>
            <button style={{ ...btnPrimary, background: C.red, borderColor: C.red }}
              disabled={busy} onClick={() => void jalankan(true)}>
              {busy ? "Menerapkan…" : `Ganti ${dampak.akan_dihapus} baris`}
            </button>
          </div>
        </>
      )}

      {tahap === "selesai" && hasil && (
        <>
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: "0 0 12px" }}>
            <b>{hasil.dibuat} baris</b> RAB dibuat
            {hasil.dihapus > 0 && <> (menggantikan {hasil.dihapus} baris lama)</>}, total{" "}
            <b>{fmtRp(hasil.total)}</b>.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <a href={`/proyek/${hasil.project_id}`} style={{ ...btnPrimary, textDecoration: "none" }}>
              Buka RAB proyek
            </a>
            <button style={btnGhost} onClick={onClose}>Tutup</button>
          </div>
        </>
      )}
    </Modal>
  );
}
