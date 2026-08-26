"use client";

// ============================================================================
// GUDANG & ASET — Portal Admin/Direktur (Tahap 4, Task 22)
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SATU HALAMAN, BUKAN "GUDANG" DAN "ASET" TERPISAH
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /gudang/ikhtisar` sudah MENGGABUNGKAN keduanya dalam satu balasan:
// `kpi` memuat `total_aset`/`nilai_buku`/`akumulasi_susut` (aset) BERSAMA
// `jenis_material_gudang`/`proyek_belum_ditarik` (stok material).
//
// Memecahnya jadi dua halaman berarti memanggil endpoint yang sama dua kali
// lalu membuang separuh hasilnya di masing-masing — dan itu juga bukan
// cerminan kenyataannya: satu gudang menyimpan ALAT dan MATERIAL sekaligus.
// Orang yang membukanya bertanya "apa yang ada di gudang saya", bukan
// "tunjukkan asetnya saja".
//
// ══════════════════════════════════════════════════════════════════════════
// DUA HAL YANG DIHITUNG SERVER — JANGAN DIHITUNG ULANG DI SINI
// ══════════════════════════════════════════════════════════════════════════
//
// 1. `pergerakan[].memburuk` — perbandingan tingkat kondisi (baik > cukup >
//    buruk). `gudang-ikhtisar.ts` menuliskan alasannya sendiri: urutan yang
//    ditulis ulang di tiap tempat akan salah di salah satunya, dan alat
//    sehat tertandai rusak.
//
// 2. `isi_gudang` SUDAH terurut kondisi terburuk di atas, dipotong 10.
//    Mengurutkan ulang di sini hanya menambah tempat yang bisa menyimpang.
//
// ⚠ `kpi.nilai_perolehan`/`nilai_buku`/`akumulasi_susut` bertipe STRING tapi
// ISINYA ANGKA MENTAH ("18750000.00" — server melewatkannya lewat
// `toFixed(2)`, bukan pemformat rupiah). Jadi WAJIB lewat `formatRupiah`;
// menampilkan apa adanya membuat layar berbunyi "18750000.00".
// ============================================================================

import { Warehouse, PackageSearch, TrendingDown, MapPin } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import Kartu from "@/components/portal/Kartu";
import type { RespGudangIkhtisar, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

const LABEL_KONDISI: Record<string, string> = {
  baik: "Baik", cukup: "Cukup", buruk: "Buruk",
};
const WARNA_KONDISI: Record<string, string> = {
  baik: "var(--on-success-bg)",
  cukup: "var(--on-warning-bg)",
  buruk: "var(--on-danger-bg)",
};
const LATAR_KONDISI: Record<string, string> = {
  baik: "var(--success-bg)",
  cukup: "var(--warning-bg)",
  buruk: "var(--danger-bg)",
};

export default function AdminGudangPage() {
  const { data, memuat, galat } =
    useData<RespGudangIkhtisar>("/api/v1/gudang/ikhtisar");

  if (memuat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonCard tinggi={110} />
        <SkeletonCard tinggi={140} />
      </div>
    );
  }

  if (galat || !data) {
    return (
      <EmptyState
        icon={Warehouse}
        judul="Gagal memuat data gudang"
        deskripsi={galat ? pesanGalat(galat as GalatApi, "Coba muat ulang.") : "Belum ada data."}
      />
    );
  }

  const { kpi } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Gudang &amp; Aset
      </h1>

      {/* ── Nilai aset ─────────────────────────────────────────────────── */}
      <Kartu menonjol>
        <div style={labelKecil}>Nilai buku aset</div>
        <div style={angkaBesar}>{formatRupiah(kpi.nilai_buku)}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          <Mini label="Perolehan" nilai={formatRupiah(kpi.nilai_perolehan)} />
          <Mini label="Akumulasi susut" nilai={formatRupiah(kpi.akumulasi_susut)} />
        </div>
      </Kartu>

      {/* ── Sebaran aset ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <Kpi ikon={Warehouse} label="Di gudang" nilai={kpi.di_gudang} />
        <Kpi ikon={MapPin} label="Di lapangan" nilai={kpi.di_lapangan} />
        <Kpi
          ikon={TrendingDown}
          label="Perlu perhatian"
          nilai={kpi.perlu_perhatian}
          sorot={kpi.perlu_perhatian > 0}
        />
        <Kpi ikon={PackageSearch} label="Jenis material" nilai={kpi.jenis_material_gudang} />
      </div>

      {kpi.proyek_belum_ditarik > 0 && (
        <div style={kotakPeringatan} role="status">
          {kpi.proyek_belum_ditarik} proyek masih menyimpan material yang belum
          ditarik kembali ke gudang.
        </div>
      )}

      {/* ── Daftar gudang ──────────────────────────────────────────────── */}
      <Bagian judul={`Gudang (${data.gudang.length})`}>
        {data.gudang.length === 0 ? (
          <Kosong teks="Belum ada gudang terdaftar." />
        ) : (
          data.gudang.map((g) => (
            <div key={g.id} style={barisDaftar}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {g.nama}
                </div>
                <div style={metaKecil}>
                  {g.kode}{g.alamat ? ` · ${g.alamat}` : ""}
                </div>
              </div>
              <div style={{ ...metaKecil, textAlign: "right", flexShrink: 0 }}>
                {g.jumlah_aset} alat<br />{g.jenis_material} material
              </div>
            </div>
          ))
        )}
      </Bagian>

      {/* ── Isi gudang — sudah terurut server, kondisi terburuk di atas ── */}
      <Bagian judul="Alat di gudang">
        {data.isi_gudang.length === 0 ? (
          <Kosong teks="Tidak ada alat yang sedang di gudang." />
        ) : (
          data.isi_gudang.map((a) => (
            <div key={a.id} style={barisDaftar}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.nama}</div>
                <div style={metaKecil}>
                  {a.kode} · {a.kategori}{a.gudang ? ` · ${a.gudang}` : ""}
                </div>
              </div>
              <span style={{
                ...pil,
                background: LATAR_KONDISI[a.kondisi] ?? "var(--surface-subtle)",
                color: WARNA_KONDISI[a.kondisi] ?? "var(--text-secondary)",
              }}>
                {LABEL_KONDISI[a.kondisi] ?? a.kondisi}
              </span>
            </div>
          ))
        )}
      </Bagian>

      {/* ── Pergerakan terakhir ────────────────────────────────────────── */}
      <Bagian judul="Pergerakan terakhir">
        {data.pergerakan.length === 0 ? (
          <Kosong teks="Belum ada pergerakan alat tercatat." />
        ) : (
          data.pergerakan.map((m) => (
            <div key={m.id} style={barisDaftar}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  {m.dari ?? "—"} → {m.ke ?? "—"}
                </div>
                <div style={metaKecil}>
                  {m.jenis}
                  {m.tanggal ? ` · ${m.tanggal}` : ""}
                  {m.hari_lalu != null ? ` (${m.hari_lalu} hari lalu)` : ""}
                </div>
              </div>
              {/*
                `memburuk` datang dari server — TIDAK dihitung ulang di sini.
                Lihat alasan di kepala berkas.
              */}
              {m.memburuk && (
                <span style={{ ...pil, background: "var(--danger-bg)", color: "var(--on-danger-bg)" }}>
                  Kondisi turun
                </span>
              )}
            </div>
          ))
        )}
      </Bagian>

      {/*
        ── Material terbanyak ──────────────────────────────────────────────

        ⚠ NAMA material TIDAK ditampilkan — bukan kelalaian.

        `GET /gudang/ikhtisar` hanya mengirim `material_id`, tanpa nama
        (gudang-ikhtisar.ts:76 & 259 — `select` tak menyertakan relasi
        `materials`). Menebak namanya di klien butuh permintaan kedua ke
        katalog untuk sesuatu yang cuma ringkasan.

        Yang bisa ditampilkan jujur: ASAL stoknya dan jumlahnya. Judulnya
        menyebut "jumlah terbanyak" supaya pembacanya tahu apa yang diurut,
        dan bukan mengira nama materialnya hilang karena rusak.
      */}
      <Bagian judul="Stok terbanyak di gudang">
        {data.material_gudang.length === 0 ? (
          <Kosong teks="Belum ada material tersimpan di gudang." />
        ) : (
          data.material_gudang.map((s) => (
            <div key={s.id} style={barisDaftar}>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {s.asal ? `Sisa dari ${s.asal}` : "Stok gudang"}
              </div>
              <div style={{ ...metaKecil, fontVariantNumeric: "tabular-nums" }}>
                {s.qty}
              </div>
            </div>
          ))
        )}
      </Bagian>
    </div>
  );
}

function Kpi({
  ikon: Ikon, label, nilai, sorot,
}: {
  ikon: typeof Warehouse; label: string; nilai: number; sorot?: boolean;
}) {
  return (
    <Kartu>
      <div style={{ display: "flex", alignItems: "center", gap: 6, ...labelKecil }}>
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
    </Kartu>
  );
}

function Mini({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <div style={labelKecil}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
    </div>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <Kartu sebagai="section">
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
        {judul}
      </h2>
      {children}
    </Kartu>
  );
}

function Kosong({ teks }: { teks: string }) {
  return (
    <p style={{ ...metaKecil, margin: "8px 0 0" }}>{teks}</p>
  );
}

const labelKecil: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
};
const metaKecil: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};
const angkaBesar: React.CSSProperties = {
  marginTop: 4, fontSize: 24, fontWeight: 700,
  color: "var(--navy)", fontVariantNumeric: "tabular-nums",
};
const barisDaftar: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)",
};
const pil: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "3px 8px",
  borderRadius: "var(--portal-radius-pill)", flexShrink: 0,
};
const kotakPeringatan: React.CSSProperties = {
  padding: 12, borderRadius: 12,
  background: "var(--warning-bg)", color: "var(--on-warning-bg)",
  fontSize: 12, lineHeight: 1.5,
};
