"use client";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KEBUTUHAN MATERIAL — dua sudut pandang atas SATU sumber angka
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /estimate-versions/:id/material-takeoff` sudah menghitung ini dengan
 * benar sejak lama — koefisien AHSP × volume item, satu baris per material,
 * lengkap dengan `details[]` yang menyebut pekerjaan asalnya.
 *
 * Diukur 2026-08-20: **nol halaman** memakainya (grep seluruh `apps/web`).
 * Jadi yang hilang bukan mesinnya, melainkan layarnya. Estimator tak pernah
 * bisa melihat "proyek ini butuh 14.000 bata dan 6,4 ton semen" walau angkanya
 * sudah terhitung.
 *
 * ── Kenapa DUA sudut pandang, bukan satu tabel
 *
 * Keduanya menjawab pertanyaan yang berbeda, dan yang satu tak bisa
 * menggantikan yang lain:
 *
 *   REKAP     "seluruh proyek butuh berapa?"   -> untuk memesan & bernegosiasi
 *   PEKERJAAN "pekerjaan ini butuh apa saja?"  -> untuk menyiapkan lapangan
 *
 * Yang pertama dibaca sekali saat pengadaan; yang kedua dibaca berulang tiap
 * pekerjaan dimulai.
 *
 * ── Angkanya BUKAN dihitung ulang di sini
 *
 * Seluruh aritmetika ada di server (`computeMaterialAggregation`). Komponen ini
 * hanya MENGELOMPOKKAN ULANG `details[]` yang sudah dipulangkan — jadi tak ada
 * kemungkinan layar dan server berselisih angka.
 *
 * Menghitung ulang di peramban akan melahirkan sumber kebenaran kedua, dan yang
 * kedua selalu berselisih diam-diam begitu salah satunya diperbaiki.
 */

import { useMemo, useState } from "react";
import { Boxes, Layers, Info } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { formatAngka } from "@/lib/format";

/** Satu penyumbang: pekerjaan X memakai material ini sebanyak Y. */
interface AsalMaterial {
  estimateItemId: string;
  workName: string;
  volume: number;
  coefficient: number;
  subQty: number;
}

interface BarisMaterial {
  resourceId: string;
  resourceName: string;
  unitCode: string;
  qtyAhsp: number;
  category: string | null;
  details?: AsalMaterial[];
}

interface MuatanTakeoff {
  estimate_version_id: string;
  materials: BarisMaterial[];
}

/** Satu material di dalam satu pekerjaan. */
interface BarisPerPekerjaan {
  kunci: string;
  pekerjaan: string;
  material: string;
  satuan: string;
  volume: number;
  koefisien: number;
  jumlah: number;
  kategori: string | null;
}

type Sudut = "rekap" | "pekerjaan";

/*
  Kategori yang ditampilkan bisa disaring.

  Take-off memuat BAHAN, TENAGA, dan ALAT sekaligus. Untuk "berapa yang harus
  dibeli" hanya bahan yang relevan — tapi tenaga dan alat TIDAK disembunyikan
  permanen: keduanya dibutuhkan saat menyusun kebutuhan mandor dan sewa alat,
  dan menyembunyikannya membuat orang mengira aplikasi ini tak menghitungnya.
*/
const KATEGORI: Array<{ nilai: string; label: string }> = [
  { nilai: "material", label: "Bahan" },
  { nilai: "labor", label: "Tenaga" },
  { nilai: "equipment", label: "Alat" },
];

/*
  Berapa desimal yang PANTAS untuk satu satuan.

  Ditemukan dengan MELIHAT layarnya: bata tampil "16.800,000 buah" — tiga
  desimal pada barang yang dihitung butiran. Tak ada 0,000 buah bata, dan
  angka berdesimal pada satuan cacah membuat pembacanya ragu apakah itu
  16.800 atau 16,8 ribu.

  Sebaliknya m3 JUSTRU butuh desimal: 7,080 m3 pasir dibulatkan jadi "7"
  kehilangan 80 liter — dan pada volume besar selisihnya nyata.
*/
function desimalSatuan(satuan: string): number {
  const s = (satuan ?? "").toLowerCase().trim();
  /* Satuan CACAH: tak ada pecahannya di dunia nyata. */
  if (/^(buah|bh|btg|batang|lbr|lembar|set|unit|ls|zak|sak|bal|roll)$/.test(s)) return 0;
  /* Volume & luas: pecahannya bermakna. */
  if (/^(m3|m³|m2|m²)$/.test(s)) return 3;
  /* Sisanya (kg, m, OH, liter): dua desimal sudah lebih dari cukup. */
  return 2;
}

export function KebutuhanMaterial({ estimateVersionId }: { estimateVersionId: string | null }) {
  const [sudut, setSudut] = useState<Sudut>("rekap");
  const [kategori, setKategori] = useState<string>("material");

  const { data, memuat, galat } = useData<MuatanTakeoff>(
    estimateVersionId ? `/api/v1/estimate-versions/${estimateVersionId}/material-takeoff` : null,
  );

  const semua = useMemo(() => data?.materials ?? [], [data]);

  const tersaring = useMemo(
    () => semua.filter((m) => (m.category ?? "material") === kategori),
    [semua, kategori],
  );

  /*
    Sudut PEKERJAAN diturunkan dari `details[]` yang SAMA — bukan dari
    permintaan kedua ke server. Satu muatan, dua tampilan: tak ada kemungkinan
    keduanya berselisih.
  */
  const perPekerjaan = useMemo<BarisPerPekerjaan[]>(() => {
    const keluar: BarisPerPekerjaan[] = [];
    for (const m of tersaring) {
      for (const d of m.details ?? []) {
        keluar.push({
          kunci: `${d.estimateItemId}|${m.resourceId}`,
          pekerjaan: d.workName,
          material: m.resourceName,
          satuan: m.unitCode,
          volume: d.volume,
          koefisien: d.coefficient,
          jumlah: d.subQty,
          kategori: m.category,
        });
      }
    }
    return keluar.sort(
      (a, b) => a.pekerjaan.localeCompare(b.pekerjaan) || a.material.localeCompare(b.material),
    );
  }, [tersaring]);

  const jmlPekerjaan = useMemo(
    () => new Set(perPekerjaan.map((x) => x.pekerjaan)).size,
    [perPekerjaan],
  );

  if (!estimateVersionId) return null;

  if (memuat) {
    return (
      <div style={{ ...GAYA_KARTU, fontSize: "var(--teks-delta)", color: C.mid }}>
        Menghitung kebutuhan material…
      </div>
    );
  }

  /*
    Galat MUAT ditampilkan, tidak ditelan. Tabel kosong karena gagal memuat
    terlihat persis sama dengan proyek yang memang belum punya item — dan yang
    kedua adalah kesimpulan yang salah tentang angka pengadaan.
  */
  if (galat) {
    return (
      <div role="alert" style={{
        ...GAYA_KARTU, background: C.dangerBg, borderColor: C.dangerBorder,
        color: C.onDangerBg, fontSize: "var(--teks-delta)",
      }}>
        Kebutuhan material gagal dimuat — ini BUKAN berarti proyek ini tak butuh material.
      </div>
    );
  }

  return (
    <section aria-label="Kebutuhan material" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{
          display: "flex", gap: 6, alignItems: "center",
          fontSize: "var(--teks-label)", color: C.text,
        }}>
          <Boxes size={14} aria-hidden="true" /> Kebutuhan material
        </strong>

        <div role="group" aria-label="Sudut pandang" style={{ display: "flex", gap: 4 }}>
          {([
            ["rekap", "Rekap seluruh proyek"],
            ["pekerjaan", "Per jenis pekerjaan"],
          ] as Array<[Sudut, string]>).map(([nilai, label]) => (
            <button
              key={nilai}
              type="button"
              aria-pressed={sudut === nilai}
              onClick={() => setSudut(nilai)}
              style={{
                minHeight: 32, padding: "0 10px", fontSize: "var(--teks-delta)",
                fontWeight: 600, borderRadius: 7,
                border: `1px solid ${sudut === nilai ? C.aksen : C.border}`,
                background: sudut === nilai ? C.infoBg : "var(--surface)",
                color: sudut === nilai ? C.onInfoBg : C.mid,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label style={{ fontSize: "var(--teks-delta)", color: C.mid, display: "flex", gap: 6, alignItems: "center" }}>
          Kategori
          {/*
            `aria-label` eksplisit, bukan mengandalkan pembungkus <label>.

            Penjaga a11y menuduhnya "select tanpa nama", dan tuduhannya BENAR:
            teks "Kategori" ada di dalam <label> yang sama, tapi tanpa `htmlFor`
            atau `id` ia tak tersambung — pembaca layar menyebutnya "kotak
            kombo" saja. Untuk saringan tabel, artinya kontrolnya tak bisa
            dipakai sama sekali tanpa melihat layar.
          */}
          <select
            aria-label="Kategori sumber daya yang ditampilkan"
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            style={{
              minHeight: 32, padding: "0 8px", fontSize: "var(--teks-delta)",
              borderRadius: 7, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text,
            }}
          >
            {KATEGORI.map((k) => (
              <option key={k.nilai} value={k.nilai}>{k.label}</option>
            ))}
          </select>
        </label>
      </div>

      {!semua.length ? (
        /*
          Dibedakan dari "gagal memuat" di atas: yang ini benar-benar kosong.
          Sebabnya disebutkan, karena "tak ada material" hampir selalu berarti
          itemnya lump-sum — bukan bahwa pekerjaannya tak butuh bahan.
        */
        <div style={{ ...GAYA_KARTU, fontSize: "var(--teks-delta)", color: C.mid }}>
          Belum ada material yang bisa dihitung. Take-off hanya bisa dihitung untuk
          item yang memakai analisa (AHSP) — item lump-sum tak punya rincian bahan.
        </div>
      ) : sudut === "rekap" ? (
        <>
          <p style={{ margin: 0, fontSize: "var(--teks-delta)", color: C.mid }}>
            Total kebutuhan dari awal sampai selesai — {tersaring.length} jenis,
            dihitung dari koefisien analisa × volume tiap pekerjaan.
          </p>
          <Tabel<BarisMaterial>
            caption="Rekap kebutuhan material seluruh proyek"
            data={tersaring}
            kunciBaris={(m) => m.resourceId}
            kolom={[
              {
                kunci: "nama", judul: "MATERIAL", kepalaBaris: true,
                render: (m) => m.resourceName,
              },
              {
                kunci: "qty", judul: "KEBUTUHAN", rata: "kanan",
                render: (m) => formatAngka(m.qtyAhsp, desimalSatuan(m.unitCode)),
              },
              { kunci: "sat", judul: "SAT.", render: (m) => m.unitCode },
              {
                kunci: "asal", judul: "DIPAKAI DI", rata: "kanan",
                render: (m) => `${(m.details ?? []).length} pekerjaan`,
              },
            ]}
          />
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: "var(--teks-delta)", color: C.mid }}>
            {jmlPekerjaan} jenis pekerjaan — tiap baris menunjukkan asal angkanya:
            volume × koefisien analisa.
          </p>
          <Tabel<BarisPerPekerjaan>
            caption="Kebutuhan material per jenis pekerjaan"
            data={perPekerjaan}
            kunciBaris={(b) => b.kunci}
            kolom={[
              {
                kunci: "pekerjaan", judul: "PEKERJAAN", kepalaBaris: true,
                render: (b) => b.pekerjaan,
              },
              { kunci: "material", judul: "MATERIAL", render: (b) => b.material },
              {
                kunci: "asal", judul: "DARI", rata: "kanan",
                /*
                  Asal angkanya ditulis apa adanya — inilah yang menjawab
                  "kenapa segini?" tanpa harus membuka analisa.
                */
                render: (b) => `${formatAngka(b.volume, 2)} × ${b.koefisien}`,
              },
              {
                kunci: "jumlah", judul: "KEBUTUHAN", rata: "kanan",
                render: (b) => formatAngka(b.jumlah, desimalSatuan(b.satuan)),
              },
              { kunci: "sat", judul: "SAT.", render: (b) => b.satuan },
            ]}
          />
        </>
      )}

      <p style={{
        margin: 0, display: "flex", gap: 6, alignItems: "flex-start",
        fontSize: "var(--teks-delta)", color: C.mid,
      }}>
        <Info size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Angka ini kebutuhan menurut ANALISA — koefisien AHSP sudah mengandung
          susut wajar, tetapi belum memperhitungkan sisa potong di lapangan,
          kondisi cuaca, maupun stok yang sudah ada di gudang.
        </span>
      </p>
    </section>
  );
}

/** Ikon dipakai di tempat lain; diekspor supaya konsisten. */
export const IkonKebutuhan = Layers;
