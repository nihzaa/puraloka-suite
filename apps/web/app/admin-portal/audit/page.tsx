"use client";

// ============================================================================
// JEJAK AUDIT — Portal Admin/Direktur (Tahap 7)
//
// ══════════════════════════════════════════════════════════════════════════
// `reason` DAN `severity` WAJIB TAMPIL — INI BUKAN HIASAN
// ══════════════════════════════════════════════════════════════════════════
//
// Komentar di `audit.ts` mencatat cacat yang baru saja diperbaiki di server:
//
//   "Ketiganya sudah lama diisi `logAuditEvent`, tapi tak pernah sampai ke
//    pembacanya — kolom yang terisi dan tak pernah terbaca sama saja dengan
//    kolom kosong, hanya lebih menyesatkan: pemeriksaan skema melaporkannya
//    'ada', jadi tak ada yang mencurigainya."
//
// Halaman yang tak menampilkannya mengulang cacat itu di sisi klien — server
// mengirimnya, layar membuangnya, dan hasilnya sama persis.
//
// `reason` adalah alasan yang ditulis pelakunya saat melakukan sesuatu yang
// menuntut pembenaran (override kuota RAB, pemutihan denda). Itu justru yang
// paling dicari orang saat mempersoalkan sebuah perubahan.
//
// ══════════════════════════════════════════════════════════════════════════
// PAGINASI DINYATAKAN
// ══════════════════════════════════════════════════════════════════════════
//
// Server memulangkan maksimal 100 baris per halaman (bawaan 50) beserta
// `meta.total`. Menampilkan halaman pertama tanpa menyebut totalnya membuat
// orang menyimpulkan itulah SELURUH jejaknya — dan jejak audit yang terlihat
// lebih pendek dari kenyataannya adalah bentuk kebohongan yang tenang.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { ScrollText, AlertTriangle } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatTanggalJam } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespAudit, RespAuditMeta, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

const LABEL_AKSI: Record<string, string> = {
  INSERT: "Dibuat", UPDATE: "Diubah", DELETE: "Dihapus",
  insert: "Dibuat", update: "Diubah", delete: "Dihapus",
};

/*
  Waktu lewat `formatTanggalJam` (lib/format.ts), BUKAN pemformat bawaan
  peramban yang dipanggil langsung. `format-ratchet` menahannya, dan
  penolakannya benar dua kali:

  1. Format yang disalin antar halaman pelan-pelan menyimpang.
  2. Pemformat bersama itu memaku ZONA WAKTU; versi buatan sendiri memakai
     zona peramban, jadi jejak audit tampil beda jam untuk orang yang sama
     di perangkat berbeda — pada layar yang justru dipakai mempersoalkan
     "siapa mengubah apa, kapan".
*/

/** Severity yang menuntut perhatian — sisanya tak diberi warna. */
const BERAT = /critical|high|tinggi|kritis/i;

export default function AdminAuditPage() {
  const [tabel, setTabel] = useState("");

  const qs = tabel ? `?table_name=${encodeURIComponent(tabel)}&limit=50` : "?limit=50";
  const { data, memuat, galat } = useData<RespAudit>(`/api/v1/audit${qs}`);
  const { data: dataMeta } = useData<RespAuditMeta>("/api/v1/audit/meta");

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={70} />
        <SkeletonCard tinggi={140} />
      </div>
    );
  }

  if (galat) {
    return (
      <EmptyState
        icon={ScrollText}
        judul="Gagal memuat jejak audit"
        deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
      />
    );
  }

  const logs = data?.logs ?? [];
  const meta = data?.meta;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Jejak Audit" />

      {(dataMeta?.tables?.length ?? 0) > 0 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Tabel
          </span>
          <Pilihan value={tabel} onChange={(e) => setTabel(e.target.value)} style={isian}>
            <option value="">Semua tabel</option>
            {dataMeta!.tables.map((t) => <option key={t} value={t}>{t}</option>)}
          </Pilihan>
        </label>
      )}

      {/*
        Paginasi DINYATAKAN. Tanpa ini, orang menyimpulkan halaman pertama
        adalah seluruh jejaknya — dan jejak audit yang terlihat lebih pendek
        dari kenyataannya adalah kebohongan yang tenang.
      */}
      {meta && (
        <p style={{ ...metaKecil, margin: 0 }}>
          Menampilkan {logs.length} dari {meta.total} catatan
          {meta.pages > 1 ? ` · halaman ${meta.page} dari ${meta.pages}` : ""}.
          {meta.pages > 1 && " Riwayat penuh ada di modul Audit web."}
        </p>
      )}

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          judul="Belum ada catatan"
          deskripsi={tabel ? `Belum ada perubahan tercatat pada tabel "${tabel}".` : "Perubahan data akan tercatat di sini."}
        />
      ) : (
        logs.map((l) => {
          const berat = l.severity ? BERAT.test(l.severity) : false;
          return (
            <article key={l.id} style={kartu}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {LABEL_AKSI[l.action] ?? l.action} · {l.table_name}
                  </div>
                  <div style={metaKecil}>
                    {l.user?.name ?? "Sistem"}
                    {l.user?.role ? ` (${l.user.role})` : ""} · {formatTanggalJam(l.created_at)}
                  </div>
                </div>
                {/*
                  `severity` — salah satu dari tiga kolom yang dulu terisi tapi
                  tak pernah sampai ke pembaca. Hanya yang BERAT diberi warna;
                  memberi warna ke semua membuat tak ada yang menonjol.
                */}
                {l.severity && (
                  <span style={{
                    ...pil,
                    background: berat ? "var(--danger-bg)" : "var(--surface-subtle)",
                    color: berat ? "var(--on-danger-bg)" : "var(--text-muted)",
                  }}>
                    {l.severity}
                  </span>
                )}
              </div>

              {/*
                `reason` — alasan yang ditulis pelakunya saat melakukan sesuatu
                yang menuntut pembenaran (override kuota RAB, pemutihan denda).
                Justru inilah yang paling dicari saat sebuah perubahan
                dipersoalkan, dan justru ini yang dulu tak pernah tampil.
              */}
              {l.reason && (
                <div style={kotakAlasan}>
                  <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{l.reason}</span>
                </div>
              )}
            </article>
          );
        })
      )}

      <p style={{ ...metaKecil, margin: 0, lineHeight: 1.5 }}>
        Jejak audit bersifat append-only — tak bisa diubah maupun dihapus.
        Daftar pengguna ada di{" "}
        <Link href="/admin-portal/pengguna" style={{ color: "var(--navy)", fontWeight: 600 }}>
          Pengguna &amp; Peran
        </Link>.
      </p>
    </div>
  );
}

const kartu: React.CSSProperties = {
  padding: 14, borderRadius: 14,
  background: "var(--surface)",
  border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
  boxShadow: "var(--naik-1)",
};
const metaKecil: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};
const isian: React.CSSProperties = {
  minHeight: 44, padding: "0 12px", borderRadius: 12,
  border: "1px solid var(--border)", fontSize: 14,
  background: "var(--surface)", color: "var(--text-primary)",
};
const pil: React.CSSProperties = {
  fontSize: "var(--t-kecil)", fontWeight: 700, padding: "3px 8px",
  borderRadius: "var(--portal-radius-pill)", flexShrink: 0,
};
const kotakAlasan: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 6,
  marginTop: 8, padding: 10, borderRadius: 10,
  background: "var(--warning-bg)", color: "var(--on-warning-bg)",
  fontSize: 12, lineHeight: 1.5,
};
