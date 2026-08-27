"use client";

// ============================================================================
// ALAT OPERASIONAL — Portal Admin/Direktur (Tahap 4, Task 23)
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA HANYA-BACA, PADAHAL ADA TIGA ENDPOINT TULIS
// ══════════════════════════════════════════════════════════════════════════
//
// `POST /pemakaian`, `/biaya`, `/perawatan` semuanya pencatatan LAPANGAN —
// jam pakai alat, isi BBM, servis selesai. Yang mencatatnya operator atau
// mekanik di lokasi, bukan direktur di kantor.
//
// Portal ini menjawab pertanyaan yang berbeda: alat mana yang paling mahal,
// mana yang akan jatuh tempo, dan mana yang perawatan preventifnya gagal.
//
// `POST /penyusutan/jurnalkan` sengaja TIDAK dipasang: ia menuntut
// `gl:manage` dan MENULIS ke buku besar. Aksi akuntansi berkonsekuensi
// seperti itu sudah punya rumahnya di `/admin-portal/keuangan/gl` (Tahap 3);
// tombol kedua di sini berarti dua pintu menuju jurnal yang sama.
//
// ══════════════════════════════════════════════════════════════════════════
// EMPAT ANGKA DIHITUNG SERVER — JANGAN DIHITUNG ULANG DI SINI
// ══════════════════════════════════════════════════════════════════════════
//
// 1. `palingMendesak` — sudah disaring & diurut. Komentar servernya: "layar
//    tak boleh menuntut pembacanya membandingkan sendiri belasan baris."
// 2. `biaya.total` — operasional DITAMBAH perawatan. Menjumlah ulang dari
//    `perJenis` akan mengulang cacat yang tercatat di server: alat yang
//    paling sering rusak justru tampil PALING MURAH.
// 3. `kesehatan.preventifGagal` — ambang 50%, satu tempat.
// 4. `jatuhTempo.status` — ambang 80%, satu tempat.
//
// Yang diurut DI SINI hanyalah URUTAN KARTU (paling mendesak di atas), dan
// itu keputusan tata letak — bukan menghitung ulang ambangnya.
// ============================================================================

import { useMemo } from "react";
import { Wrench, AlertTriangle, Gauge, Activity } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespAlatOperasional, AlatOperasional, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

const LABEL_JATUH_TEMPO: Record<string, string> = {
  aman: "Aman", segera: "Segera", jatuh_tempo: "Jatuh tempo",
};
const LATAR_JATUH_TEMPO: Record<string, string> = {
  aman: "var(--success-bg)", segera: "var(--warning-bg)", jatuh_tempo: "var(--danger-bg)",
};
const WARNA_JATUH_TEMPO: Record<string, string> = {
  aman: "var(--on-success-bg)", segera: "var(--on-warning-bg)", jatuh_tempo: "var(--on-danger-bg)",
};

/** Bobot urutan kartu — makin kecil makin atas. */
const BOBOT: Record<string, number> = { jatuh_tempo: 0, segera: 1 };

export default function AdminAsetPage() {
  const { data, memuat, galat } =
    useData<RespAlatOperasional>("/api/v1/alat-operasional");

  /*
    Urutan KARTU: alat yang punya perawatan mendesak di atas, lalu yang
    biayanya paling besar. Ini keputusan TATA LETAK — ambangnya sendiri tetap
    dari server lewat `palingMendesak.jatuhTempo.status`.
  */
  const alat = useMemo(() => {
    const xs = [...(data?.alat ?? [])];
    xs.sort((a, b) => {
      const ba = BOBOT[a.palingMendesak?.jatuhTempo.status ?? ""] ?? 9;
      const bb = BOBOT[b.palingMendesak?.jatuhTempo.status ?? ""] ?? 9;
      if (ba !== bb) return ba - bb;
      return (b.biaya?.total ?? 0) - (a.biaya?.total ?? 0);
    });
    return xs;
  }, [data]);

  const mendesak = alat.filter(
    (a) => a.palingMendesak?.jatuhTempo.status === "jatuh_tempo",
  ).length;
  const preventifGagal = alat.filter((a) => a.kesehatan?.preventifGagal).length;

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={90} />
        <SkeletonCard tinggi={140} />
      </div>
    );
  }

  if (galat || !data) {
    return (
      <EmptyState
        icon={Wrench}
        judul="Gagal memuat data alat"
        deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "Belum ada data."}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <KepalaPortal judul="Alat Operasional" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Kpi label="Total alat" nilai={data.total} />
        <Kpi label="Jatuh tempo" nilai={mendesak} sorot={mendesak > 0} />
        <Kpi label="Preventif gagal" nilai={preventifGagal} sorot={preventifGagal > 0} />
      </div>

      {alat.length === 0 ? (
        <EmptyState
          icon={Wrench}
          judul="Belum ada alat terdaftar"
          deskripsi="Alat operasional muncul di sini setelah didaftarkan di register aset."
        />
      ) : (
        alat.map((a) => <KartuAlat key={a.id} alat={a} />)
      )}

      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
        Pencatatan jam pakai, BBM, dan servis dilakukan di lapangan lewat modul
        Aset. Halaman ini menampilkan ringkasannya saja.
      </p>
    </div>
  );
}

function KartuAlat({ alat }: { alat: AlatOperasional }) {
  const pm = alat.palingMendesak;
  const status = pm?.jatuhTempo.status ?? "aman";

  return (
    <section style={kartu}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {alat.name}
          </h2>
          <div style={metaKecil}>
            {alat.asset_code} · {alat.category}
            {alat.brand ? ` · ${alat.brand}` : ""}
          </div>
        </div>
        {pm && (
          <span style={{
            ...pil,
            background: LATAR_JATUH_TEMPO[status] ?? "var(--surface-subtle)",
            color: WARNA_JATUH_TEMPO[status] ?? "var(--text-secondary)",
          }}>
            {LABEL_JATUH_TEMPO[status] ?? status}
          </span>
        )}
      </div>

      {/*
        Perawatan paling mendesak — dipilih SERVER. Ditampilkan lebih dulu
        karena inilah satu-satunya baris yang menuntut tindakan.
      */}
      {pm && (
        <div style={{ marginTop: 10, ...metaKecil }}>
          <strong style={{ color: "var(--text-primary)" }}>{pm.nama}</strong>
          {/*
            Sisa NEGATIF berarti ambangnya sudah TERLEWAT — server memang
            memulangkannya begitu. Menampilkan "sisa -18 jam" apa adanya
            terbaca janggal dan menyembunyikan yang justru penting: alat ini
            sudah lewat jadwal, bukan sekadar hampir.
          */}
          {pm.jatuhTempo.sisaJam != null && (
            pm.jatuhTempo.sisaJam < 0
              ? ` · lewat ${Math.abs(pm.jatuhTempo.sisaJam)} jam`
              : ` · sisa ${pm.jatuhTempo.sisaJam} jam`
          )}
          {pm.jatuhTempo.sisaHari != null && (
            pm.jatuhTempo.sisaHari < 0
              ? ` · lewat ${Math.abs(pm.jatuhTempo.sisaHari)} hari`
              : ` · sisa ${pm.jatuhTempo.sisaHari} hari`
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 12 }}>
        <Angka
          ikon={Gauge}
          label="Jam operasi"
          nilai={`${alat.jamOperasi} jam`}
          sub={`${alat.hariDipakai} hari dipakai`}
        />
        <Angka
          ikon={Activity}
          label="Biaya total"
          nilai={formatRupiah(alat.biaya?.total ?? 0)}
          sub={alat.biaya?.perJam != null ? `${formatRupiah(alat.biaya.perJam)}/jam` : undefined}
        />
      </div>

      {/* ── Kesehatan alat ───────────────────────────────────────────── */}
      {alat.kesehatan && (
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)",
          ...metaKecil,
        }}>
          Servis: {alat.kesehatan.servisTerjadwal} terjadwal,{" "}
          {alat.kesehatan.servisMendadak} mendadak
          {alat.kesehatan.rasioMendadak != null && ` (${alat.kesehatan.rasioMendadak}%)`}

          {/*
            `preventifGagal` datang dari server (ambang 50%). Tak dihitung
            ulang di sini — lihat catatan di kepala berkas.
          */}
          {alat.kesehatan.preventifGagal && (
            <div style={kotakGagal} role="status">
              <AlertTriangle size={14} aria-hidden="true" />
              Separuh atau lebih servisnya mendadak — perawatan preventif alat
              ini tidak mencegah apa pun.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, nilai, sorot }: { label: string; nilai: number; sorot?: boolean }) {
  return (
    <div style={kartu}>
      <div style={metaKecil}>{label}</div>
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

function Angka({
  ikon: Ikon, label, nilai, sub,
}: {
  ikon: typeof Gauge; label: string; nilai: string; sub?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, ...metaKecil }}>
        <Ikon size={13} aria-hidden="true" />
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
        fontVariantNumeric: "tabular-nums", marginTop: 2,
      }}>
        {nilai}
      </div>
      {sub && <div style={{ ...metaKecil, fontSize: 11 }}>{sub}</div>}
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
const pil: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "3px 8px",
  borderRadius: "var(--portal-radius-pill)", flexShrink: 0,
};
const kotakGagal: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 6,
  marginTop: 8, padding: 10, borderRadius: 10,
  background: "var(--warning-bg)", color: "var(--on-warning-bg)",
  fontSize: 12, lineHeight: 1.5,
};
