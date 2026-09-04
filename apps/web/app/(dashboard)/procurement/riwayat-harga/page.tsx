"use client";

/**
 * RIWAYAT HARGA MATERIAL (F5 PEMBEDA — semula "Eskalasi Harga")
 *
 * ── Yang dijawab halaman ini
 *
 * "Harga besi bulan ini 100.000. Dulu berapa? Naik atau turun?"
 *
 * ── Kenapa netral terhadap arah
 *
 * Diukur pada data nyata: Besi Ø12mm 120.000 (Mar) → 100.000 (Agu), TURUN
 * 16,7%. Saya sempat melaporkannya "+20%" karena menghitung selisih tanpa
 * memperhatikan urutan waktu.
 *
 * Layar bernama "eskalasi" menjanjikan kenaikan, dan pembacanya menyimpulkan
 * kenaikan bahkan saat angkanya turun. Halaman ini menampilkan naik DAN turun
 * dengan bobot visual yang sama.
 *
 * ── Beda vendor BUKAN pergerakan harga
 *
 * Dua harga pada tanggal yang sama dari dua supplier adalah rentang
 * penawaran — urusan RFQ. Dinyatakan terpisah supaya tak terbaca sebagai
 * kenaikan.
 */

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, LineChart, RefreshCw } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { formatRupiah } from "@/lib/format";
import { Pilihan } from "@/components/pilihan";

type Proyek = { id: string; name: string };

type Titik = {
  tanggal: string;
  harga: number;
  jumlah_vendor: number;
  sebaran_vendor_pct: number | null;
  vendor_terbaik: string | null;
  perubahan_pct: number;
};

type Material = {
  material_id: string;
  material_name: string;
  unit: string | null;
  titik: Titik[];
  harga_awal: number;
  harga_akhir: number;
  perubahan_pct: number;
  rentang_hari: number;
  cukup_untuk_tren: boolean;
};

type Hasil = {
  material: Material[];
  jumlah_naik: number;
  jumlah_turun: number;
  jumlah_satu_titik: number;
  jumlah_beda_vendor: number;
};

const rupiah = formatRupiah;

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function RiwayatHargaPage() {
  const [proyekId, setProyekId] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan dua pasang useEffect+useState+AbortController.
    Saringan proyek masuk sebagai bagian dari URL hasil.
  */
  const { data: dataProyek, galat: galatProyek } = useData<{ projects: Proyek[] }>("/api/v1/projects");
  const { data: hasil, memuat, galat: galatHasil, muatUlang } = useData<Hasil>(
    proyekId ? `/api/v1/riwayat-harga?project_id=${proyekId}` : "/api/v1/riwayat-harga",
  );

  const proyek = dataProyek?.projects ?? [];
  const galat = galatProyek ? "Gagal memuat daftar proyek" : galatHasil ? "Gagal memuat riwayat harga" : null;

  const bergerak = useMemo(
    () => (hasil?.material ?? []).filter((m) => m.titik.length >= 2),
    [hasil],
  );
  const satuTitik = useMemo(
    () => (hasil?.material ?? []).filter((m) => m.titik.length < 2),
    [hasil],
  );

  // Material yang punya sebaran antar-vendor, BESERTA NAMANYA.
  // Kartu ringkasan yang cuma menyebut "1" tak bisa ditindaklanjuti siapa pun:
  // pembaca tahu ada masalah, tapi tak tahu di mana.
  const bedaVendor = useMemo(
    () => (hasil?.material ?? [])
      .map((m) => {
        const t = m.titik.find((x) => x.sebaran_vendor_pct != null && x.sebaran_vendor_pct > 0);
        return t ? { nama: m.material_name, unit: m.unit, titik: t } : null;
      })
      .filter((x): x is { nama: string; unit: string | null; titik: Titik } => x !== null),
    [hasil],
  );

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };
  const labelGaya: React.CSSProperties = {
    fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  /**
   * Warna & ikon menurut ARAH.
   *
   * Naik = merah (biaya bertambah), turun = hijau (biaya berkurang) — dari
   * sudut pandang PEMBELI, bukan penjual. Ikon panah ikut serta supaya arahnya
   * terbaca tanpa bergantung warna (WCAG 1.4.1).
   */
  const arah = (pct: number) =>
    pct > 0
      ? { warna: "var(--danger)", Ikon: TrendingUp, kata: "naik" }
      : pct < 0
        ? { warna: "var(--success)", Ikon: TrendingDown, kata: "turun" }
        : { warna: C.mid, Ikon: Minus, kata: "tetap" };

  /**
   * Kolom "material yang bergerak".
   *
   * Ditulis di dalam komponen karena `arah()` ada di sini — memindahkannya ke
   * luar berarti menyalin peta warna/ikon ke tempat kedua, dan dua salinan
   * arah harga adalah persis cara laporan "+20%" untuk harga yang TURUN lahir
   * (lihat catatan kepala berkas).
   */
  const kolomBergerak: Array<Kolom<Material>> = [
    {
      kunci: "material", judul: "Material", kepalaBaris: true,
      render: (m) => {
        const a = arah(m.perubahan_pct);
        return (
          // Garis aksen kiri dipindahkan dari `<th>` ke pembungkus isinya:
          // `Tabel` yang memiliki gaya selnya, dan `tandaiBaris` hanya bisa
          // mengubah LATAR baris — bukan garis tepi. Yang terlihat sama:
          // batang berwarna setinggi isi sel, di tepi kiri.
          <span style={{
            display: "block", paddingLeft: 9, marginLeft: -12,
            borderLeft: `3px solid ${m.perubahan_pct === 0 ? "transparent" : a.warna}`,
          }}>
            {m.material_name}
            {m.unit && <span style={{ fontSize: "var(--t-kecil)", color: C.mid }}> · {m.unit}</span>}
            <span style={{ display: "block", fontSize: "var(--t-mikro)", color: C.muted, marginTop: 2 }}>
              {m.titik.length} kali beli · {m.titik.map((t) => tanggalTerbaca(t.tanggal)).join(" → ")}
            </span>
          </span>
        );
      },
    },
    {
      kunci: "pertama", judul: "Pertama", rata: "kanan",
      render: (m) => <span style={{ color: C.mid }}>{rupiah(m.harga_awal)}</span>,
    },
    {
      kunci: "terakhir", judul: "Terakhir", rata: "kanan",
      render: (m) => <span style={{ color: C.text, fontWeight: 600 }}>{rupiah(m.harga_akhir)}</span>,
    },
    {
      kunci: "perubahan", judul: "Perubahan", rata: "kanan",
      render: (m) => {
        const a = arah(m.perubahan_pct);
        return (
          // Ikon panah ikut serta — arah tak boleh bergantung warna saja
          // (WCAG 1.4.1), dan kata "naik"/"turun" dibacakan pembaca layar
          // lewat sr-only.
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            justifyContent: "flex-end", fontWeight: 700, color: a.warna,
          }}>
            <a.Ikon size={13} aria-hidden="true" />
            <span className="sr-only">{a.kata} </span>
            {m.perubahan_pct > 0 ? "+" : ""}{m.perubahan_pct.toFixed(1)}%
          </span>
        );
      },
    },
    {
      kunci: "rentang", judul: "Rentang", rata: "kanan",
      render: (m) => <span style={{ color: C.mid }}>{m.rentang_hari} hari</span>,
    },
    {
      kunci: "dasar", judul: "Dasar",
      // Seberapa jauh angkanya bisa dipercaya, DINYATAKAN. Dua titik bisa
      // berarti satu pembelian borongan yang kebetulan murah — bukan tren.
      render: (m) => (
        <span style={{
          fontSize: "var(--t-kecil)", fontWeight: 600, padding: "2px 8px", borderRadius: 20,
          color: m.cukup_untuk_tren ? "var(--info)" : "var(--text-secondary)",
          background: m.cukup_untuk_tren ? "var(--info-bg)" : "var(--surface-subtle)",
          border: `1px solid ${m.cukup_untuk_tren ? "var(--info-border)" : "var(--border)"}`,
          whiteSpace: "nowrap",
        }}>
          {m.cukup_untuk_tren ? "cukup untuk tren" : `baru ${m.titik.length} titik`}
        </span>
      ),
    },
  ];

  /** Kolom "baru sekali beli" — tak punya arah, jadi tak punya warna. */
  const kolomSatuTitik: Array<Kolom<Material>> = [
    {
      kunci: "material", judul: "Material", kepalaBaris: true,
      render: (m) => (
        <>
          {m.material_name}
          {m.unit && <span style={{ fontSize: "var(--t-kecil)", color: C.mid }}> · {m.unit}</span>}
        </>
      ),
    },
    {
      kunci: "harga", judul: "Harga", rata: "kanan",
      render: (m) => <span style={{ color: C.text }}>{rupiah(m.harga_akhir)}</span>,
    },
    {
      kunci: "tanggal", judul: "Tanggal",
      render: (m) => (
        <span style={{ color: C.mid, whiteSpace: "nowrap" }}>
          {m.titik[0] ? tanggalTerbaca(m.titik[0].tanggal) : "—"}
        </span>
      ),
    },
    {
      kunci: "vendor", judul: "Vendor",
      render: (m) => <span style={{ color: C.mid }}>{m.titik[0]?.vendor_terbaik ?? "—"}</span>,
    },
  ];

  return (
    // Judul, lebar, dan padding datang dari `procurement/layout.tsx` — lihat
    // catatan yang sama di `rfq/page.tsx`. Halaman ini menyediakan ketiganya
    // sendiri sampai 2026-08-08, dan hasilnya dua judul bertumpuk plus kartu
    // di dalam kartu.
    <div>
      <p style={{ fontSize: 13, color: C.mid, margin: "0 0 18px", maxWidth: "68ch", lineHeight: 1.55 }}>
        Bagaimana harga tiap material bergerak sepanjang waktu — naik maupun
        turun. Beda harga antar vendor pada tanggal yang sama bukan pergerakan
        harga; itu rentang penawaran, dan tempatnya di RFQ.
      </p>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>
          {galat}
        </div>
      )}

      <div className="rise rise-2" style={{
        ...kartu, padding: "12px 16px", marginBottom: 16,
        display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
          <label htmlFor="rh-proyek" style={labelGaya}>Proyek</label>
          <Pilihan
            id="rh-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
            style={{
              padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text, fontSize: 13,
            }}
          >
            <option value="">Semua proyek</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </div>

        <button
          type="button" onClick={() => void muatUlang()}
          style={{
            padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>
      </div>

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : !hasil ? null : hasil.material.length === 0 ? (
        <Kosong
          ikon={<LineChart size={28} />}
          judul="Belum ada riwayat harga"
          sebab="Riwayat terbentuk sendiri dari purchase order yang sudah diterbitkan. Ia terisi begitu ada pembelian material."
        />
      ) : (
        <>
          {/* ── Ringkasan ────────────────────────────────────────────────
              Naik dan turun berdiri SEJAJAR, bukan satu ditonjolkan. */}
          <div className="rise rise-2b" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              { label: "Harga naik", nilai: hasil.jumlah_naik, sub: "biaya bertambah", warna: "var(--danger)", Ikon: TrendingUp },
              { label: "Harga turun", nilai: hasil.jumlah_turun, sub: "biaya berkurang", warna: "var(--success)", Ikon: TrendingDown },
              { label: "Baru sekali beli", nilai: hasil.jumlah_satu_titik, sub: "belum bisa dibandingkan", warna: C.mid, Ikon: Minus },
              {
                label: "Beda antar vendor", nilai: hasil.jumlah_beda_vendor,
                sub: bedaVendor.length > 0
                  ? bedaVendor.map((x) => x.nama).join(", ")
                  : "rentang penawaran, bukan kenaikan",
                warna: C.mid, Ikon: Minus,
              },
            ].map((k) => (
              <div key={k.label} style={{ ...kartu, padding: "10px 14px", flex: "1 1 190px", minWidth: 178 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <k.Ikon size={12} aria-hidden="true" style={{ color: k.warna }} />
                  <span style={labelGaya}>{k.label}</span>
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 800, color: k.warna, marginTop: 3,
                  fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                }}>
                  {k.nilai}
                </div>
                <div style={{ fontSize: "var(--t-kecil)", color: C.mid, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Material yang bergerak ───────────────────────────────── */}
          {bergerak.length > 0 && (
            <div className="rise rise-3" style={{ ...kartu, overflow: "hidden", marginBottom: 16 }}>
              {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
                  kolom pertama <th scope="row">, tabular-nums, dan pembungkus
                  overflow-x sekarang dijamin komponen. `tabular-nums` penting
                  khusus di sini: seluruh guna tabel ini adalah membandingkan
                  "Pertama" dengan "Terakhir" sekilas, dan itu hanya bekerja
                  bila digitnya sejajar.

                  Kepala baris = nama material. Itu yang menamai barisnya;
                  "12 Mar 2026" tidak, karena banyak material dibeli di hari
                  yang sama dan tanggalnya tak membedakan apa pun.

                  `minWidth: 700` dilepas — gulir horizontal datang dari
                  pembungkus komponen. */}
              <Tabel<Material>
              berpermukaan
                caption="Material yang harganya bergerak: harga pembelian pertama, harga terakhir, arah dan besar perubahan, rentang waktu, serta apakah titiknya cukup untuk disebut tren."
                data={bergerak}
                kunciBaris={(m) => m.material_id}
                kolom={kolomBergerak}
              />

              <p style={{
                margin: 0, padding: "10px 14px", borderTop: `1px solid ${C.border}`,
                background: "var(--surface-subtle)", fontSize: "var(--t-kecil)", color: C.mid, lineHeight: 1.55,
              }}>
                Perubahan dihitung dari harga <strong>pembelian pertama</strong>, bukan
                dari harga master — harga master ditimpa tiap kali diperbarui, sehingga
                perubahannya ikut hilang. Bila satu tanggal punya beberapa vendor, yang
                dipakai harga <strong>terbaik</strong> pada tanggal itu; sebarannya
                dilaporkan terpisah karena itu rentang penawaran, bukan pergerakan harga.
              </p>
            </div>
          )}

          {/* ── Baru sekali beli ─────────────────────────────────────────
              DITAMPILKAN, bukan disembunyikan: menyembunyikannya membuat
              pembaca mengira seluruh material sudah punya riwayat. */}
          {satuTitik.length > 0 && (
            <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Baru sekali dibeli — belum bisa dibandingkan
                </h2>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0" }}>
                  Bukan berarti harganya tetap. Belum ada pembanding sama sekali.
                </p>
              </div>
              {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
                  kolom pertama <th scope="row">, tabular-nums, dan pembungkus
                  overflow-x sekarang dijamin komponen.

                  Kepala baris = nama material, sama seperti tabel di atasnya.
                  Kedua tabel di halaman ini menjawab pertanyaan yang sama
                  ("material apa"), jadi keduanya harus dinamai dengan sumbu
                  yang sama — pembaca layar yang melompat antar tabel tak
                  perlu menyesuaikan diri.

                  `minWidth: 480` dilepas — pembungkus komponen yang menggulir. */}
              <Tabel<Material>
              berpermukaan
                caption="Material yang baru sekali dibeli: nama, harga, dan tanggal pembelian."
                data={satuTitik}
                kunciBaris={(m) => m.material_id}
                kolom={kolomSatuTitik}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
