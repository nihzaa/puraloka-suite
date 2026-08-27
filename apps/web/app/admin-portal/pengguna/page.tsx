"use client";

// ============================================================================
// PENGGUNA & PERAN — Portal Admin/Direktur (Tahap 7)
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TANPA TOMBOL AKSI
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /users` hanya ber-`authenticate` (users.ts:29) — daftarnya memang
// dipakai banyak dropdown di aplikasi. Yang menuntut `users:manage` adalah
// POST/PATCH-nya: menambah pengguna, menonaktifkan, mengubah peran.
//
// Ketiganya keputusan berkonsekuensi (satu klik bisa mengunci orang keluar
// dari sistem, atau memberi akses ke seluruh data keuangan), dan halaman
// webnya sudah menanganinya dengan konfirmasi dan matriks izin penuh.
// Menaruh tombol kedua di layar 390px berarti dua pintu ke keputusan yang
// sama — dan yang di HP justru yang paling mudah tersentuh tak sengaja.
//
// Halaman ini menjawab pertanyaan lain: SIAPA saja yang punya akses, dengan
// peran apa, dan berapa yang nonaktif.
//
// ⚠ `roles` adalah embed yang bisa OBJEK atau ARRAY — server TIDAK
// meratakannya di sini (beda dari `audit.ts` yang meratakan sendiri).
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, ShieldCheck, UserX } from "lucide-react";
import { useData } from "@/lib/data-cache";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespPengguna, RespPeran, PenggunaRingkas, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

/**
 * Ratakan embed `roles` yang bisa objek ATAU array.
 *
 * Bentuk embed Supabase berbeda tergantung relasinya, dan menulis
 * `u.roles.name` langsung akan `undefined` pada salah satu bentuk — gagal
 * senyap, tanpa galat.
 */
function namaPeran(u: PenggunaRingkas): string | null {
  const r = u.roles;
  if (!r) return null;
  return (Array.isArray(r) ? r[0] : r)?.name ?? null;
}

export default function AdminPenggunaPage() {
  const [tab, setTab] = useState<"pengguna" | "peran">("pengguna");

  const { data: dataUser, memuat: memuatUser, galat: galatUser } =
    useData<RespPengguna>("/api/v1/users");
  const { data: dataPeran, memuat: memuatPeran, galat: galatPeran } =
    useData<RespPeran>(tab === "peran" ? "/api/v1/roles" : null);

  const pengguna = useMemo(() => dataUser?.users ?? [], [dataUser]);
  const nonaktif = pengguna.filter((u) => !u.is_active).length;

  if (memuatUser) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={70} />
        <SkeletonCard tinggi={120} />
      </div>
    );
  }

  if (galatUser) {
    return (
      <EmptyState
        icon={Users}
        judul="Gagal memuat daftar pengguna"
        deskripsi={pesanGalat(galatUser as GalatApi, "Coba muat ulang.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <KepalaPortal judul="Pengguna &amp; Peran" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <Kpi ikon={Users} label="Pengguna aktif" nilai={pengguna.length - nonaktif} />
        <Kpi ikon={UserX} label="Nonaktif" nilai={nonaktif} sorot={nonaktif > 0} />
      </div>

      <SegmentedTab
        opsi={[
          { value: "pengguna", label: "Pengguna" },
          { value: "peran", label: "Peran" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {tab === "pengguna" && (
        pengguna.length === 0 ? (
          <EmptyState icon={Users} judul="Belum ada pengguna" deskripsi="Akun didaftarkan lewat modul Pengguna di web." />
        ) : (
          pengguna.map((u) => (
            <article key={u.id} style={kartu}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {u.name}
                  </div>
                  <div style={metaKecil}>{u.email}</div>
                </div>
                {/*
                  Nonaktif ditandai PIL berwarna, bukan `opacity` —
                  ARAH-VISUAL: swap warna solid, karena opacity membuat teks
                  gagal kontras WCAG.
                */}
                {!u.is_active && <span style={pilNonaktif}>Nonaktif</span>}
              </div>
              <div style={{ ...metaKecil, marginTop: 6 }}>
                {namaPeran(u) ?? "Tanpa peran"}
                {u.phone ? ` · ${u.phone}` : ""}
              </div>
            </article>
          ))
        )
      )}

      {tab === "peran" && (
        memuatPeran ? (
          <SkeletonCard tinggi={120} />
        ) : galatPeran ? (
          <EmptyState
            icon={ShieldCheck}
            judul="Gagal memuat daftar peran"
            deskripsi={pesanGalat(galatPeran as GalatApi, "Coba muat ulang.")}
          />
        ) : (dataPeran?.roles ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} judul="Belum ada peran" deskripsi="Peran diatur lewat Matriks Izin di web." />
        ) : (
          (dataPeran?.roles ?? []).map((r) => (
            <article key={r.id} style={kartu}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {r.label || r.name}
                  </div>
                  {r.description && <div style={metaKecil}>{r.description}</div>}
                </div>
                {r.is_builtin && <span style={pilBawaan}>Bawaan</span>}
              </div>
              {/*
                `permission_count` & `user_count` SUDAH diratakan server dari
                embed `role_permissions(count)` — tak diambil ulang dari array.
              */}
              <div style={{ ...metaKecil, marginTop: 6 }}>
                {r.permission_count} izin · {r.user_count} pengguna
                {r.portal ? ` · portal ${r.portal}` : ""}
              </div>
            </article>
          ))
        )
      )}

      <p style={{ ...metaKecil, margin: 0, lineHeight: 1.5 }}>
        Menambah pengguna, mengubah peran, dan mengatur izin dilakukan lewat
        modul Pengguna di web — keputusan berkonsekuensi sengaja hanya punya
        satu pintu. Jejak perubahannya ada di{" "}
        <Link href="/admin-portal/audit" style={{ color: "var(--navy)", fontWeight: 600 }}>
          Jejak Audit
        </Link>.
      </p>
    </div>
  );
}

function Kpi({
  ikon: Ikon, label, nilai, sorot,
}: {
  ikon: typeof Users; label: string; nilai: number; sorot?: boolean;
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
const pilNonaktif: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "3px 8px",
  borderRadius: "var(--portal-radius-pill)", flexShrink: 0,
  background: "var(--surface-subtle)", color: "var(--text-muted)",
};
const pilBawaan: React.CSSProperties = {
  ...pilNonaktif,
  background: "var(--info-bg)", color: "var(--on-info-bg)",
};
