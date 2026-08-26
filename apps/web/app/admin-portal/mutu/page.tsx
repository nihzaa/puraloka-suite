"use client";

// ============================================================================
// MUTU, K3 & DOKUMEN — Portal Admin/Direktur (Tahap 5)
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SATU HALAMAN UNTUK EMPAT GRUP MENU
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /mutu/ikhtisar` sudah menjawab keempatnya sekaligus — satu balasan
// memuat `ncr`, `inspeksi`, `punch`, `dokumen`, `izin_kerja`, dan `k3`.
// Memecahnya jadi empat halaman berarti memanggil endpoint yang sama empat
// kali lalu membuang tiga-perempat hasilnya di masing-masing.
//
// Pola identik Task 22 (Gudang & Aset), dengan alasan yang sama.
//
// ══════════════════════════════════════════════════════════════════════════
// TANPA GERBANG IZIN — DAN ITU DISENGAJA
// ══════════════════════════════════════════════════════════════════════════
//
// Endpoint-nya hanya ber-`authenticate`, tanpa `requirePermission`. Alasannya
// tertulis di `mutu-ikhtisar.ts:207-217`: sub-menu grup ini pun tak menyaring
// permission (`menu_items.required_permissions` semuanya array KOSONG).
// Menuntut izin di ikhtisar berarti halaman induknya lebih ketat daripada
// isinya — orang melihat "akses ditolak" untuk RINGKASAN dari data yang boleh
// ia buka satu per satu.
//
// Jadi halaman ini sengaja TIDAK memasang `useIzin` sebagai gerbang masuk.
// Tenancy tetap dijaga `request.db` di server.
//
// ══════════════════════════════════════════════════════════════════════════
// DUA ANGKA YANG TIDAK BOLEH DIHITUNG ULANG DI SINI
// ══════════════════════════════════════════════════════════════════════════
//
// 1. `ncr.berat` — sudah dipisah server dari `terbuka`. Menghitungnya ulang
//    dari `ncr.daftar` akan SALAH: `daftar` cuma 8 teratas, `berat`
//    menghitung SEMUA yang terbuka.
// 2. `dokumen.kedaluwarsa` vs `segera_habis` — dipisah server lewat tanda
//    `sisa_hari` (< 0 = sudah lewat).
// ============================================================================

import { ShieldCheck, FileWarning, HardHat, ClipboardCheck } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespMutuIkhtisar, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

/**
 * "sisa 5 hari" / "lewat 3 hari" / "—".
 *
 * `sisa_hari` NEGATIF berarti tenggatnya sudah TERLEWAT — server memang
 * memulangkannya begitu (`sisaHari()` di mutu-ikhtisar.ts:75). Menampilkan
 * "sisa -3 hari" apa adanya terbaca janggal dan menyembunyikan yang justru
 * penting. Cacat yang sama sudah ditemukan & diperbaiki di Task 23.
 */
function labelSisa(n: number | null): string {
  if (n === null) return "—";
  if (n < 0) return `lewat ${Math.abs(n)} hari`;
  if (n === 0) return "hari ini";
  return `sisa ${n} hari`;
}

const BERAT = /major|mayor|tinggi|high/i;

export default function AdminMutuPage() {
  const { data, memuat, galat } =
    useData<RespMutuIkhtisar>("/api/v1/mutu/ikhtisar");

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={100} />
        <SkeletonCard tinggi={140} />
      </div>
    );
  }

  if (galat || !data) {
    return (
      <EmptyState
        icon={ShieldCheck}
        judul="Gagal memuat ikhtisar mutu"
        deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "Belum ada data."}
      />
    );
  }

  const { ncr, inspeksi, punch, dokumen, izin_kerja: izin, k3 } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Mutu, K3 &amp; Dokumen
      </h1>

      {/* ── Empat angka yang menuntut tindakan ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <Kpi
          ikon={ShieldCheck} label="NCR terbuka" nilai={ncr.terbuka}
          sub={ncr.berat > 0 ? `${ncr.berat} berat` : undefined}
          sorot={ncr.berat > 0}
        />
        <Kpi
          ikon={FileWarning} label="Dokumen kedaluwarsa" nilai={dokumen.kedaluwarsa}
          sub={dokumen.segera_habis > 0 ? `${dokumen.segera_habis} segera habis` : undefined}
          sorot={dokumen.kedaluwarsa > 0}
        />
        <Kpi
          ikon={ClipboardCheck} label="Punch list terbuka" nilai={punch.terbuka}
          sub={`dari ${punch.total}`}
        />
        <Kpi
          ikon={HardHat} label="Izin kerja aktif" nilai={izin.aktif}
          sub={izin.menunggu > 0 ? `${izin.menunggu} menunggu` : undefined}
        />
      </div>

      {/* ── NCR terbuka ───────────────────────────────────────────────── */}
      <Bagian judul={`NCR terbuka (${ncr.terbuka} dari ${ncr.total})`}>
        {ncr.daftar.length === 0 ? (
          <Kosong teks="Tidak ada NCR yang masih terbuka." />
        ) : (
          <>
            {ncr.daftar.map((n) => (
              <div key={n.nomor} style={baris}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{n.judul}</div>
                  <div style={metaKecil}>
                    {n.nomor} · {n.status} · {labelSisa(n.sisa_hari)}
                  </div>
                </div>
                {/*
                  Penanda BERAT per baris memakai pola yang sama dengan server
                  (`/major|mayor|tinggi|high/i`) — hanya untuk MENANDAI baris
                  ini. Jumlah totalnya tetap dari `ncr.berat`, tak dihitung
                  ulang: `daftar` cuma 8 teratas.
                */}
                {BERAT.test(n.severity) && (
                  <span style={{ ...pil, background: "var(--danger-bg)", color: "var(--on-danger-bg)" }}>
                    {n.severity}
                  </span>
                )}
              </div>
            ))}
            {ncr.terbuka > ncr.daftar.length && (
              <p style={{ ...metaKecil, margin: "8px 0 0" }}>
                Menampilkan {ncr.daftar.length} dari {ncr.terbuka} NCR terbuka.
              </p>
            )}
          </>
        )}
      </Bagian>

      {/* ── Dokumen bermasalah ────────────────────────────────────────── */}
      <Bagian judul="Dokumen perlu perhatian">
        {dokumen.daftar.length === 0 ? (
          <Kosong teks="Semua dokumen masih berlaku." />
        ) : (
          dokumen.daftar.map((d, i) => (
            <div key={`${d.pihak}-${d.jenis}-${i}`} style={baris}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{d.pihak}</div>
                <div style={metaKecil}>{d.jenis}</div>
              </div>
              <span style={{
                ...pil,
                background: (d.sisa_hari ?? 0) < 0 ? "var(--danger-bg)" : "var(--warning-bg)",
                color: (d.sisa_hari ?? 0) < 0 ? "var(--on-danger-bg)" : "var(--on-warning-bg)",
              }}>
                {labelSisa(d.sisa_hari)}
              </span>
            </div>
          ))
        )}
        {dokumen.belum_terverifikasi > 0 && (
          <p style={{ ...metaKecil, margin: "8px 0 0" }}>
            {dokumen.belum_terverifikasi} dokumen belum terverifikasi.
          </p>
        )}
      </Bagian>

      {/* ── K3 ────────────────────────────────────────────────────────── */}
      <Bagian judul="Keselamatan kerja">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 6 }}>
          <Mini label="Kecelakaan" nilai={String(k3.kecelakaan)} sorot={k3.kecelakaan > 0} />
          <Mini label="Daftar hitam" nilai={String(k3.daftar_hitam)} sorot={k3.daftar_hitam > 0} />
          <Mini
            label="Skor K3 terendah"
            nilai={k3.skor_k3_terendah != null ? String(k3.skor_k3_terendah) : "—"}
          />
        </div>
        {/*
          Angka kecelakaan datang dari evaluasi subkon — satu-satunya tempat ia
          tercatat hari ini. Dinyatakan supaya pembacanya tahu cakupannya, dan
          tak menyimpulkan nol berarti "tak pernah ada insiden".
        */}
        <p style={{ ...metaKecil, margin: "10px 0 0", lineHeight: 1.5 }}>
          Dihitung dari evaluasi subkontraktor. Insiden yang tak tercatat di
          sana belum terhitung di angka ini.
        </p>
      </Bagian>

      {/* ── Inspeksi ──────────────────────────────────────────────────── */}
      <Bagian judul="Inspeksi">
        <div style={{ ...metaKecil, marginTop: 6 }}>
          {inspeksi.menunggu} menunggu tindakan, dari {inspeksi.total} inspeksi
          tercatat.
        </div>
      </Bagian>
    </div>
  );
}

function Kpi({
  ikon: Ikon, label, nilai, sub, sorot,
}: {
  ikon: typeof ShieldCheck; label: string; nilai: number; sub?: string; sorot?: boolean;
}) {
  return (
    <div style={kartu}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, ...metaKecil }}>
        <Ikon size={14} aria-hidden="true" />
        {label}
      </div>
      <div style={{
        marginTop: 4, fontSize: 22, fontWeight: 700,
        color: sorot ? "var(--on-danger-bg)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      {sub && <div style={{ ...metaKecil, fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

function Mini({ label, nilai, sorot }: { label: string; nilai: string; sorot?: boolean }) {
  return (
    <div>
      <div style={{ ...metaKecil, fontSize: 11 }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 700,
        color: sorot ? "var(--on-danger-bg)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
    </div>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section style={kartu}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {judul}
      </h2>
      {children}
    </section>
  );
}

function Kosong({ teks }: { teks: string }) {
  return <p style={{ ...metaKecil, margin: "8px 0 0" }}>{teks}</p>;
}

const kartu: React.CSSProperties = {
  padding: 14, borderRadius: 14,
  background: "var(--surface)", border: "1px solid var(--border)",
};
const metaKecil: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};
const baris: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)",
};
const pil: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "3px 8px",
  borderRadius: "var(--portal-radius-pill)", flexShrink: 0,
};
