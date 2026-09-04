"use client";

/**
 * ESTIMASI — IKHTISAR modul: DAFTAR RAB.
 *
 * Halaman pertama yang dilihat orang saat membuka modul, dan tugasnya menjawab
 * pertanyaan yang dibawa orang ke sini: **RAB apa saja yang kami punya, dan
 * mana yang perlu saya lanjutkan?**
 *
 * ── Dua versi sebelumnya, dan kenapa keduanya salah
 *
 * 1. Tab "Komposer" berisi PANDUAN TERTULIS — empat paragraf menjelaskan cara
 *    memakai layar yang sedang kosong. Diukur 2026-08-16: 0 tabel, 0 baris.
 *
 * 2. Daftar PROYEK ber-tombol "Susun RAB". Lebih baik, tetapi masih menjawab
 *    pertanyaan yang salah: tiap kartu terlihat identik, jadi proyek yang
 *    RAB-nya sudah Rp 4,8 M tak bisa dibedakan dari yang belum pernah
 *    disentuh. Orang tetap tak bisa MENEMUKAN KEMBALI pekerjaannya — cacat
 *    yang persis jadi alasan modul ini dirombak.
 *
 * Yang menggantikannya: satu baris per RAB, dengan angka dan keadaannya.
 * 208 skenario dan 2.221 versi sudah tersimpan sejak lama; sampai hari ini
 * tak satu pun tampil di layar mana pun. Datanya ada, jalan masuknya tidak.
 *
 * ── Kenapa dikelompokkan per proyek, bukan tabel rata
 *
 * Membandingkan dua penawaran untuk proyek yang SAMA adalah pekerjaan nyata di
 * sini — itu guna `scenarios`. Tabel rata mengurutkan menurut waktu, sehingga
 * dua pilihan harga untuk satu proyek bisa terpisah puluhan baris dan
 * perbandingannya hilang. Pengelompokan menjaga keduanya bersebelahan.
 *
 * Proyek yang BELUM punya RAB tetap ditampilkan (di bawah, dengan ajakan
 * membuat) — kalau disembunyikan, "belum ada RAB" jadi keadaan tak terlihat
 * dan orang mengira proyeknya hilang.
 */

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { FileText, Plus } from "lucide-react";
import { LayarKosong } from "@/components/layar-kosong";
import {
  LABEL_STATUS,
  rp,
  type BarisRab,
  type ProyekRingkas,
  type StatusVersi,
} from "./_bersama/tipe";

interface JawabProyek {
  projects?: ProyekRingkas[];
}
interface JawabRab {
  data?: BarisRab[];
  meta?: { jumlah: number; batas: number; terpotong: boolean };
}

/**
 * Tautan lama `?tab=…` DIALIHKAN, bukan dibiarkan mati.
 *
 * Ada 9 rujukan `/estimasi?tab=…` di `peta-menu.ts`, dan tautan seperti itu
 * juga sudah beredar di luar kode — dibagikan lewat chat, disimpan sebagai
 * bookmark. Membiarkannya mendarat di ikhtisar tanpa penjelasan persis
 * kegagalan yang sedang diperbaiki modul ini: pengguna sampai di layar yang
 * bukan tujuannya, tanpa tahu kenapa.
 */
const ALIH: Record<string, string> = {
  komposer: "/estimasi/rab",
  rap: "/estimasi/rap",
  cashflow: "/estimasi/kas",
  varians: "/estimasi/varians",
  katalog: "/master/ahsp",
  harga: "/master/harga",
};

/**
 * Warna lencana status.
 *
 * `draft` sengaja NETRAL, bukan kuning: RAB yang masih disusun adalah keadaan
 * normal — separuh daftar ini draft. Mewarnainya sebagai peringatan membuat
 * layar penuh tanda bahaya yang tak menuntut tindakan apa pun, dan status yang
 * benar-benar butuh perhatian jadi tenggelam.
 */
const WARNA_STATUS: Record<StatusVersi, { bg: string; fg: string }> = {
  draft: { bg: "var(--surface-subtle)", fg: "var(--text-muted)" },
  under_review: { bg: "var(--warning-bg, var(--surface-subtle))", fg: "var(--warning)" },
  approved: { bg: "var(--success-bg, var(--surface-subtle))", fg: "var(--success)" },
  frozen: { bg: "var(--surface-subtle)", fg: "var(--text-secondary)" },
  superseded: { bg: "var(--surface-subtle)", fg: "var(--text-muted)" },
};

export default function EstimasiIkhtisarPage() {
  return (
    <Suspense fallback={null}>
      <IsiIkhtisar />
    </Suspense>
  );
}

function IsiIkhtisar() {
  const router = useRouter();
  const params = useSearchParams();
  const tabLama = params.get("tab");

  useEffect(() => {
    const tujuan = tabLama ? ALIH[tabLama] : undefined;
    if (tujuan) router.replace(tujuan);
  }, [tabLama, router]);

  const { data: dataProyek, memuat: memuatProyek, galat: galatProyek } =
    useData<JawabProyek>("/api/v1/projects");
  const { data: dataRab, memuat: memuatRab, galat: galatRab } =
    useData<JawabRab>("/api/v1/estimate-versions?limit=200");

  const proyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);
  const rab = useMemo(() => dataRab?.data ?? [], [dataRab]);

  /*
    Dikelompokkan per proyek, urutan proyek mengikuti RAB TERBARU di dalamnya
    — bukan abjad. Proyek yang baru disentuh naik ke atas, dan itu yang dicari
    orang saat kembali melanjutkan pekerjaan kemarin.
  */
  const grup = useMemo(() => {
    const peta = new Map<string, { nama: string; baris: BarisRab[] }>();
    for (const b of rab) {
      if (!b.project_id) continue;
      const g = peta.get(b.project_id)
        ?? { nama: b.project_name ?? "(proyek tanpa nama)", baris: [] };
      g.baris.push(b);
      peta.set(b.project_id, g);
    }
    return [...peta.entries()].map(([id, g]) => ({ id, ...g }));
  }, [rab]);

  const proyekTanpaRab = useMemo(() => {
    const ber = new Set(grup.map((g) => g.id));
    return proyek.filter((p) => !ber.has(p.id));
  }, [proyek, grup]);

  // Sedang dialihkan — jangan berkedip menampilkan ikhtisar dulu.
  if (tabLama && ALIH[tabLama]) return null;

  if (memuatProyek || memuatRab) {
    return (
      <p style={{ fontSize: "var(--teks-label)", color: C.muted }}>
        Memuat daftar RAB…
      </p>
    );
  }

  /*
    Galat MUAT dan galat AKSI tak berbagi state (penjaga
    `uji-galat-muat-terpisah`). Di halaman ini tak ada aksi sama sekali, jadi
    yang ada hanya galat muat — dan ia dibedakan per sumber supaya "daftar
    proyek gagal" tak terbaca seperti "RAB-nya yang hilang".
  */
  if (galatProyek || galatRab) {
    return (
      <p role="alert" style={{ fontSize: "var(--teks-label)", color: "var(--danger)" }}>
        {galatRab
          ? "Gagal memuat daftar RAB. Coba muat ulang halaman."
          : "Gagal memuat daftar proyek. Coba muat ulang halaman."}
      </p>
    );
  }

  if (proyek.length === 0 && rab.length === 0) {
    return (
      <LayarKosong
        ikon={<FileText size={21} />}
        judul="Belum ada proyek"
        apa="RAB selalu melekat pada satu proyek."
        kenapa="Buat proyeknya lebih dulu, lalu RAB bisa disusun dari sini."
        aksi={{ label: "Buka daftar proyek", href: "/proyek" }}
      />
    );
  }

  return (
    <>
      {rab.length === 0 && (
        <LayarKosong
          ikon={<FileText size={21} />}
          judul="Belum ada RAB tersusun"
          apa="RAB menghitung nilai pekerjaan dari analisa AHSP × harga yang berlaku."
          kenapa="Proyeknya sudah ada, tetapi belum satu pun punya RAB. Pilih salah satu di bawah untuk mulai."
          aksi={{ label: "Susun RAB pertama", href: "/estimasi/rab" }}
        />
      )}

      {grup.length > 0 && (
        <div style={{ display: "grid", gap: "var(--gap-bagian, 16px)" }}>
          {grup.map((g) => (
            <GrupProyek key={g.id} id={g.id} nama={g.nama} baris={g.baris} />
          ))}
        </div>
      )}

      {proyekTanpaRab.length > 0 && (
        <section style={{ marginTop: rab.length ? 20 : 0 }}>
          <h2
            style={{
              fontSize: "var(--teks-label)",
              fontWeight: 600,
              color: C.muted,
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Belum punya RAB ({proyekTanpaRab.length})
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
              gap: "var(--gap-grid, 8px)",
            }}
          >
            {proyekTanpaRab.map((p) => (
              <Link
                key={p.id}
                href={`/estimasi/rab?proyek=${p.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  border: `1px dashed ${C.border}`,
                  borderRadius: "var(--radius-md)",
                  background: C.surface,
                  padding: "var(--pad-kartu, 12px)",
                  textDecoration: "none",
                  color: "inherit",
                  fontSize: "var(--teks-label)",
                }}
              >
                <span style={{ color: C.text, lineHeight: 1.35 }}>{p.name}</span>
                <span aria-hidden="true" style={{ color: C.aksen, flexShrink: 0 }}>
                  <Plus size={15} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {dataRab?.meta?.terpotong && (
        <p style={{ fontSize: "var(--teks-label)", color: C.muted, marginTop: 12 }}>
          Menampilkan {dataRab.meta.jumlah} RAB terbaru. RAB lama tetap tersimpan
          dan bisa dibuka dari halaman proyeknya.
        </p>
      )}

      <p
        style={{
          fontSize: "var(--teks-label)",
          color: C.muted,
          marginTop: 16,
          lineHeight: 1.6,
        }}
      >
        Analisa AHSP dan price book kini berada di{" "}
        {/* DIGARISBAWAHI, bukan hanya diwarnai. Tautan di TENGAH paragraf yang
            hanya dibedakan warna melanggar WCAG 1.4.1 — yang buta warna tak
            melihat ada tautan di sini sama sekali, dan satu-satunya jalan ke
            Master Data dari halaman ini jadi tak terlihat.
            Tautan yang berdiri SENDIRI (baris/tombol sendiri) tak kena aturan
            ini; yang di dalam blok teks kena. */}
        <Link
          href="/master/ahsp"
          style={{ color: C.aksen, textDecoration: "underline" }}
        >
          Master&nbsp;Data
        </Link>{" "}
        — keduanya dipakai lintas proyek, jadi bukan bagian dari pekerjaan satu
        proyek.
      </p>
    </>
  );
}

function GrupProyek({
  id,
  nama,
  baris,
}: {
  id: string;
  nama: string;
  baris: BarisRab[];
}) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-md)",
        background: C.surface,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          padding: "var(--pad-kartu, 12px)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <h2
          style={{
            fontSize: "var(--teks-badan)",
            fontWeight: 600,
            color: C.text,
            margin: 0,
            lineHeight: 1.35,
          }}
        >
          {nama}
        </h2>
        <Link
          href={`/estimasi/rab?proyek=${id}`}
          style={{
            fontSize: "var(--teks-label)",
            color: C.aksen,
            fontWeight: 600,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          + RAB baru
        </Link>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "var(--teks-tabel)", fontVariantNumeric: "tabular-nums" }}
        >
          <thead>
            <tr>
              <th style={th}>RAB</th>
              <th style={th}>Edisi AHSP</th>
              <th style={{ ...th, textAlign: "right" }}>Nilai</th>
              <th style={th}>Keadaan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => (
              <tr key={b.id}>
                <td style={td}>
                  <Link
                    href={`/estimasi/rab?proyek=${b.project_id}&versi=${b.id}`}
                    style={{ color: C.aksen, fontWeight: 600, textDecoration: "none" }}
                  >
                    {b.scenario_name ?? "Utama"} · revisi {b.version_number}
                  </Link>
                </td>
                {/*
                  Edisi AHSP ditulis, tidak disembunyikan. Selisih antar-edisi
                  terukur −13,47% pada cakupan yang sama (SE47-VS-CIBULUH),
                  jadi dua RAB dengan nilai berbeda bisa sama-sama benar —
                  asalkan edisinya terbaca. Menyembunyikannya membuat selisih
                  itu tampak seperti kesalahan hitung.
                */}
                <td style={{ ...td, color: b.edition_code ? C.mid : C.muted }}>
                  {b.edition_code ?? "belum dipilih"}
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: b.total_amount == null ? C.muted : C.text,
                  }}
                >
                  {/* null ≠ 0: "belum dihitung" beda dari "nol rupiah". */}
                  {b.total_amount == null ? "—" : rp(b.total_amount)}
                </td>
                <td style={td}>
                  <Lencana status={b.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Lencana({ status }: { status: StatusVersi }) {
  const w = WARNA_STATUS[status] ?? WARNA_STATUS.draft;
  return (
    <span
      style={{
        display: "inline-block",
        background: w.bg,
        color: w.fg,
        borderRadius: "var(--radius-dense)",
        padding: "2px 8px",
        fontSize: "var(--t-kecil)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {LABEL_STATUS[status] ?? status}
    </span>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--pad-baris)",
  fontSize: "var(--teks-label)",
  fontWeight: 600,
  color: C.muted,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "var(--pad-baris)",
  borderBottom: `1px solid ${C.border}`,
  color: C.text,
  verticalAlign: "top",
};
