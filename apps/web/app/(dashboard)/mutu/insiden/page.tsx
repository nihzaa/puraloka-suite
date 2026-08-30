"use client";

/**
 * REGISTER INSIDEN K3 — kecelakaan, nyaris celaka, dan yang belum ditutup.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI BARU ADA SEKARANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menu `/mutu/insiden` sudah AKTIF di sidebar sejak lama, dan halamannya tak
 * pernah dibuat. Founder mengekliknya 2026-08-16 lalu terlempar ke dashboard —
 * satu dari LIMA menu aktif yang menunjuk halaman kosong.
 *
 * Tabel `insiden_k3`, rutenya, izinnya, bahkan otomasi "insiden belum ditutup"
 * semuanya sudah ada. Yang hilang cuma layarnya.
 *
 * ── Kenapa NYARIS CELAKA ikut ditampilkan, dan tidak disembunyikan
 *
 * Godaannya menyaring `nyaris_celaka` supaya daftar terlihat "bersih". Justru
 * kebalikannya: nyaris celaka adalah satu-satunya jenis yang bisa dipelajari
 * TANPA ada yang terluka. Perusahaan yang laporannya nol nyaris-celaka bukan
 * perusahaan yang aman — ia perusahaan yang orangnya berhenti melapor.
 *
 * Karena itu ia dihitung terpisah di ringkasan, bukan dibuang.
 *
 * ── Urutan bagian, dan alasannya
 *
 * 1. BELUM DITUTUP — insiden yang penyelidikannya menggantung. Ini yang
 *    ditagih auditor dan yang bikin tender gugur, jadi ia dibaca pertama.
 * 2. HARI KERJA HILANG — angka yang masuk ke evaluasi subkon. Kalau ia
 *    berbeda dari yang dicatat evaluasi, salah satunya bohong.
 * 3. Register penuh.
 *
 * ── Galat MUAT dipisah dari galat AKSI
 *
 * Satu state `galat` untuk keduanya adalah cacat yang sudah ditemukan di 11
 * halaman repo ini: gagal menyimpan MENGHAPUS pesan gagal memuat, jadi orang
 * yang jaringannya putus lalu menekan tombol melihat pesan tombolnya saja dan
 * mengira datanya sudah termuat.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";

interface Insiden {
  id: string;
  project_id: string;
  proyek_nama: string | null;
  nomor: string;
  jenis: string;
  tanggal: string;
  waktu: string | null;
  lokasi: string | null;
  kronologi: string | null;
  korban_nama: string | null;
  melukai: boolean | null;
  hari_kerja_hilang: number | null;
  status: string;
  ditutup_pada: string | null;
  biaya_akibat: number | string | null;
  subkon: { id: string; name: string } | null;
}

interface Proyek { id: string; name: string }

/** Label + warna per jenis. Fatal & berat dibedakan tajam — menyamakan
 *  keduanya dengan "kecelakaan" membuat yang terburuk tenggelam. */
const JENIS: Record<string, { label: string; warna: string; bg: string }> = {
  fatal: { label: "Fatal", warna: C.red, bg: C.redBg },
  kecelakaan_berat: { label: "Kecelakaan Berat", warna: C.red, bg: C.redBg },
  kecelakaan_ringan: { label: "Kecelakaan Ringan", warna: C.yellow, bg: C.yellowBg },
  nyaris_celaka: { label: "Nyaris Celaka", warna: "var(--info)", bg: "var(--info-bg)" },
  kerusakan_properti: { label: "Kerusakan Properti", warna: C.mid, bg: "var(--surface-subtle)" },
  pencemaran_lingkungan: { label: "Pencemaran Lingkungan", warna: C.mid, bg: "var(--surface-subtle)" },
};

const STATUS: Record<string, string> = {
  dilaporkan: "Dilaporkan",
  diselidiki: "Diselidiki",
  tindakan_berjalan: "Tindakan Berjalan",
  ditutup: "Ditutup",
};

const tgl = (s: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("id-ID",
    { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function HalamanInsiden() {
  const [proyekId, setProyekId] = useState("");
  const [jenisSaring, setJenisSaring] = useState("");

  const { data: dataProyek } = useData<{ projects: Proyek[] }>("/api/v1/projects");

  const jalur = useMemo(() => {
    const q = new URLSearchParams();
    if (proyekId) q.set("proyek", proyekId);
    if (jenisSaring) q.set("jenis", jenisSaring);
    const s = q.toString();
    return `/api/v1/k3/insiden${s ? `?${s}` : ""}`;
  }, [proyekId, jenisSaring]);

  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ insiden: Insiden[]; jumlah: number; terpotong: boolean; batas: number }>(jalur);

  /*
    Dibungkus useMemo — DIPERBAIKI 2026-08-31, bukan dibungkam.

    `?? []` membuat array BARU tiap render, jadi `useMemo` di bawah menerima
    dependensi yang selalu berbeda dan TAK PERNAH menahan hasilnya. Perhitungan
    di dalamnya berjalan ulang pada setiap render, termasuk render yang tak ada
    hubungannya dengan data ini.

    Jadi peringatan `exhaustive-deps` di sini menunjuk pemborosan yang nyata,
    bukan sekadar kerewelan aturan. Membungkus sumbernya membuat rujukannya
    stabil selama datanya sama, dan `useMemo` di bawah kembali bekerja.

    Perilakunya tidak berubah: nilai yang dihasilkan sama persis.
  */
  const insiden = useMemo(() => data?.insiden ?? [], [data?.insiden]);

  const ringkas = useMemo(() => {
    const belumTutup = insiden.filter((i) => i.status !== "ditutup");
    const berat = insiden.filter((i) => i.jenis === "fatal" || i.jenis === "kecelakaan_berat");
    const nyaris = insiden.filter((i) => i.jenis === "nyaris_celaka");
    const hariHilang = insiden.reduce((s, i) => s + (Number(i.hari_kerja_hilang) || 0), 0);
    const biaya = insiden.reduce((s, i) => s + (Number(i.biaya_akibat) || 0), 0);
    return { belumTutup, berat, nyaris, hariHilang, biaya };
  }, [insiden]);

  return (
    <div style={{
      // Pembungkus BAKU halaman dashboard — 111 dari 143 halaman memakainya.
      // Tanpa ini isinya menempel ke tepi layar ("mepet") dan melebar tanpa
      // batas di monitor lebar, sementara halaman sebelahnya tidak — dan
      // ketaksamaan itu yang paling terasa saat berpindah menu.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <KepalaHalaman
        judul="Insiden & Kecelakaan"
        keterangan="Register K3 lintas proyek — termasuk nyaris celaka, yang justru paling bisa dipelajari."
        ikon={<ShieldAlert size={18} />}
        aksi={
          <button
            onClick={() => muatUlang()}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: "pointer",
            }}
          >
            <RefreshCw size={14} /> Muat ulang
          </button>
        }
      />

      {/* Galat MUAT — terpisah, dan tidak terhapus oleh aksi apa pun. */}
      {galatMuat && (
        <div role="alert" style={{
          margin: "0 0 16px", padding: "10px 12px", borderRadius: 8, fontSize: 13,
          background: "var(--danger-bg)", color: "var(--danger)",
          border: "1px solid var(--danger-border)",
        }}>
          Gagal memuat daftar insiden. {String(galatMuat)}
        </div>
      )}

      {/* Ringkasan. Tiap angka menjawab pertanyaan yang berbeda — bukan empat
          cara menghitung hal yang sama. */}
      <div style={{
        display: "grid", gap: 12, marginBottom: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      }}>
        {[
          {
            label: "BELUM DITUTUP", nilai: String(ringkas.belumTutup.length),
            ket: "penyelidikannya masih menggantung",
            warna: ringkas.belumTutup.length > 0 ? C.red : C.text,
          },
          {
            label: "FATAL / BERAT", nilai: String(ringkas.berat.length),
            ket: "yang menggugurkan prakualifikasi",
            warna: ringkas.berat.length > 0 ? C.red : C.text,
          },
          {
            label: "NYARIS CELAKA", nilai: String(ringkas.nyaris.length),
            ket: "nol bukan berarti aman — bisa berarti tak ada yang melapor",
            warna: C.text,
          },
          {
            label: "HARI KERJA HILANG", nilai: String(ringkas.hariHilang),
            ket: ringkas.biaya > 0 ? `biaya ${formatRupiah(ringkas.biaya)}` : "belum ada biaya tercatat",
            warna: C.text,
          },
        ].map((k) => (
          <div key={k.label} style={{
            padding: 14, borderRadius: 10, background: "var(--surface)",
            border: `1px solid ${C.border}`,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>{k.label}</div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700,
              color: k.warna, lineHeight: 1.15, margin: "4px 0 2px",
            }}>{k.nilai}</div>
            <div style={{ fontSize: 12, color: C.mid, lineHeight: 1.45 }}>{k.ket}</div>
          </div>
        ))}
      </div>

      {/* Saringan */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
        marginBottom: 12, padding: 12, borderRadius: 10,
        background: "var(--surface)", border: `1px solid ${C.border}`,
      }}>
        <label htmlFor="saring-proyek" style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
          Proyek
        </label>
        <select
          id="saring-proyek" value={proyekId}
          onChange={(e) => setProyekId(e.target.value)}
          style={{
            padding: "6px 10px", fontSize: 13, borderRadius: 6, minHeight: 36,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, fontFamily: "inherit",
          }}
        >
          <option value="">Semua proyek</option>
          {(dataProyek?.projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label htmlFor="saring-jenis" style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
          Jenis
        </label>
        <select
          id="saring-jenis" value={jenisSaring}
          onChange={(e) => setJenisSaring(e.target.value)}
          style={{
            padding: "6px 10px", fontSize: 13, borderRadius: 6, minHeight: 36,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, fontFamily: "inherit",
          }}
        >
          <option value="">Semua jenis</option>
          {Object.entries(JENIS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid }}>
          {memuat ? "memuat…" : `${insiden.length} insiden`}
          {data?.terpotong ? ` · ${data.batas} teratas` : ""}
        </span>
      </div>

      {/* Daftar. `memuat` menang atas "kosong" — daftar kosong saat sedang
          memuat terbaca sebagai "tidak ada insiden", kabar baik yang palsu. */}
      {memuat ? (
        <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat daftar insiden…
        </div>
      ) : (
        <Tabel<Insiden>
          caption="Register insiden K3 lintas proyek"
          data={insiden}
          kunciBaris={(i) => i.id}
          // Baris yang BELUM ditutup ditandai — itu satu-satunya keadaan di
          // tabel ini yang menuntut tindakan hari ini.
          tandaiBaris={(i) => (i.status !== "ditutup" ? C.redBg : undefined)}
          kosong={
            <div style={{ padding: "24px 16px", textAlign: "center", color: C.muted }}>
              <AlertTriangle size={26} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                Belum ada insiden tercatat
              </div>
              <div style={{ fontSize: 12, maxWidth: 420, margin: "6px auto 0", lineHeight: 1.5 }}>
                Nol insiden bisa berarti dua hal yang sangat berbeda: lapangan
                memang aman, atau tak ada yang melaporkannya. Insiden dicatat
                dari halaman K3 proyek.
              </div>
            </div>
          }
          kolom={[
            {
              kunci: "nomor", judul: "Nomor", kepalaBaris: true,
              render: (i) => <span style={{ fontWeight: 600 }}>{i.nomor}</span>,
            },
            {
              kunci: "tanggal", judul: "Tanggal",
              render: (i) => `${tgl(i.tanggal)}${i.waktu ? ` · ${i.waktu.slice(0, 5)}` : ""}`,
            },
            {
              kunci: "jenis", judul: "Jenis",
              render: (i) => {
                const j = JENIS[i.jenis] ?? { label: i.jenis, warna: C.mid, bg: "var(--surface-subtle)" };
                return (
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 6,
                    fontSize: 11, fontWeight: 600, color: j.warna, background: j.bg,
                  }}>{j.label}</span>
                );
              },
            },
            { kunci: "proyek", judul: "Proyek", render: (i) => i.proyek_nama ?? "—" },
            { kunci: "lokasi", judul: "Lokasi", render: (i) => i.lokasi ?? "—" },
            {
              // "tak melukai" DIBEDAKAN dari "tidak diketahui" — em-dash untuk
              // keduanya membuat insiden tanpa korban terlihat sama dengan
              // insiden yang datanya belum diisi.
              kunci: "korban", judul: "Korban",
              render: (i) => i.korban_nama ?? (i.melukai === false ? "tak melukai" : "—"),
            },
            {
              kunci: "hari", judul: "Hari Hilang", rata: "kanan",
              render: (i) => (i.hari_kerja_hilang != null ? String(i.hari_kerja_hilang) : "—"),
            },
            {
              kunci: "status", judul: "Status",
              render: (i) => {
                const belum = i.status !== "ditutup";
                return (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 12, fontWeight: belum ? 600 : 400,
                    color: belum ? C.red : C.mid,
                  }}>
                    {belum && <TriangleAlert size={12} aria-hidden="true" />}
                    {STATUS[i.status] ?? i.status}
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}
