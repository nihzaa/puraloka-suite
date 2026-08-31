"use client";

/**
 * REKOMENDASI PEMBESIAN — dari dimensi & beban ke usulan tulangan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA LAYAR STRUKTUR YANG ARAHNYA TERBALIK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman Analisa Struktur (`/estimasi/struktur`) menuntut tulangan sebagai
 * MASUKAN: isi Ø16, 3 batang, sengkang Ø8-150, lalu ia menjawab aman/tidak.
 * Itu berguna bagi yang sudah punya jawabannya.
 *
 * Layar ini untuk yang belum. Ia menanyakan dimensi dan beban, lalu
 * MENGUSULKAN tulangannya — pertanyaan yang sebenarnya lebih sering
 * ditanyakan di lapangan: "balok 25/40 bentang 4 m besinya berapa?"
 *
 * ── Kenapa halaman SENDIRI, bukan tab di halaman struktur
 *
 * `ARAH-VISUAL-2026.md` §10 nomor 3: tab dipecah jadi halaman — sudah
 * diratifikasi dan sudah dikerjakan untuk keuangan, mandor, dan kas.
 * Halaman struktur sendiri sudah 3.216 baris dengan 34 jenis elemen; satu
 * tab lagi di sana berarti pemakai harus tahu dulu ia mau apa sebelum bisa
 * bertanya. Layar ini justru untuk orang yang belum tahu.
 *
 * ── Kenapa `catatan` TIDAK bisa disembunyikan
 *
 * Di dalamnya ada batas yang menentukan sah-tidaknya angka ini dipakai
 * (tulangan tarik saja, tanpa torsi & lendutan, berat belum termasuk
 * penyaluran). Usulan tanpa batasnya adalah angka yang terlihat lebih pasti
 * daripada yang sebenarnya — dan angka yang terlihat pasti akan disalin ke
 * gambar kerja tanpa ditanya lagi.
 *
 * ── Kenapa kegagalan TIDAK ditampilkan sebagai galat merah biasa
 *
 * "Tak ada kombinasi yang cukup" bukan kerusakan aplikasi, melainkan JAWABAN:
 * penampangnya memang kurang. Menampilkannya seperti galat sistem membuat
 * pemakai mengira aplikasinya rusak lalu mengulang-ulang masukan yang sama.
 * Karena itu ia tampil sebagai hasil — lengkap dengan usul tinggi minimum,
 * yang justru informasi paling berguna di layar ini.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya kartu usulan terpilih. Alternatif dan catatan memakai
 * nada tenang: layar yang seluruhnya berteriak tak menunjukkan apa pun.
 */

import { useCallback, useMemo, useState } from "react";
import { TriangleAlert, Info, Lightbulb, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Kartu, JudulKartu, Rangka, Galat,
  Tombol, Lencana, Medan, gayaInput,
} from "@/components/dasar";

// ── Bentuk jawaban rute ──────────────────────────────────────────────────────

interface UsulanBalok {
  dUtamaMm: number; nTarik: number;
  dSengkangMm: number; jarakSengkangMm: number;
  besiKg: number; rasioKritis: number; pemeriksaanKritis: string;
}
interface UsulanKolom {
  dUtamaMm: number; nBarisX: number; nBarisY: number; nTotal: number;
  dSengkangMm: number; jarakSengkangMm: number;
  besiKg: number; rasioKritis: number; pemeriksaanKritis: string;
}
type Usulan = Partial<UsulanBalok & UsulanKolom>;

interface HasilSaran {
  jenis: "balok" | "kolom";
  berhasil: boolean;
  terpilih?: Usulan;
  alternatif: Usulan[];
  usulTinggiMm?: number;
  kandidatDicoba: number;
  catatan: string[];
}

type Jenis = "balok" | "kolom";

/** Nilai awal — balok 300×520 L=6m, dimensi contoh yang dipakai di repo. */
const AWAL_BALOK = {
  bMm: "300", hMm: "520", panjangM: "6", selimutMm: "30",
  fcMpa: "25", fyMpa: "420", fyvMpa: "280",
  muKnm: "120", vuKn: "90", puKn: "", tinggiM: "",
};
const AWAL_KOLOM = {
  bMm: "400", hMm: "400", tinggiM: "3.5", selimutMm: "40",
  fcMpa: "25", fyMpa: "420", fyvMpa: "280",
  puKn: "900", muKnm: "60", vuKn: "", panjangM: "",
};

/**
 * Tulis usulan sebagaimana dibaca orang lapangan.
 *
 * Balok: "6D13" · Kolom: "8D16 (2×4)" — bentuk yang sama dengan yang ditulis
 * di gambar kerja, supaya tak perlu diterjemahkan lagi saat disalin.
 */
function tulisUsulan(u: Usulan, jenis: Jenis): string {
  if (jenis === "balok") return `${u.nTarik}D${u.dUtamaMm}`;
  return `${u.nTotal}D${u.dUtamaMm} (${u.nBarisX}×${u.nBarisY})`;
}

const tulisSengkang = (u: Usulan) => `Ø${u.dSengkangMm}-${u.jarakSengkangMm}`;

/**
 * Nada lencana rasio: hijau lega, kuning mepet.
 *
 * Ambangnya 0.90 — sama dengan `BATAS_RASIO_NYAMAN` di mesinnya. Kalau layar
 * memakai ambang sendiri, ia bisa menghijaukan usulan yang mesinnya sendiri
 * tandai bercadangan tipis.
 */
const BATAS_NYAMAN = 0.9;

export default function PembesianPage() {
  const [jenis, setJenis] = useState<Jenis>("balok");
  const [f, setF] = useState<Record<string, string>>(AWAL_BALOK);
  const [hasil, setHasil] = useState<HasilSaran | null>(null);
  const [memuat, setMemuat] = useState(false);

  /*
    Dua state galat yang TERPISAH — dijaga `uji-galat-muat-terpisah.mjs`.
    Galat aksi (gagal menghitung) tak boleh menghapus hasil yang sudah
    tampil; pemakai yang kehilangan hasilnya karena satu percobaan gagal
    akan mengira pekerjaannya hilang.
  */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const gantiJenis = useCallback((j: Jenis) => {
    setJenis(j);
    setF(j === "balok" ? AWAL_BALOK : AWAL_KOLOM);
    setHasil(null);
    setGalatAksi(null);
  }, []);

  const ubah = useCallback((k: string, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
  }, []);

  const hitung = useCallback(async () => {
    setMemuat(true);
    setGalatAksi(null);
    try {
      const badan = jenis === "balok"
        ? {
          jenis, bMm: +f.bMm, hMm: +f.hMm, panjangM: +f.panjangM,
          selimutMm: +f.selimutMm, muKnm: +f.muKnm, vuKn: +f.vuKn,
          mutu: { fcMpa: +f.fcMpa, fyMpa: +f.fyMpa, fyvMpa: +f.fyvMpa },
        }
        : {
          jenis, bMm: +f.bMm, hMm: +f.hMm, tinggiM: +f.tinggiM,
          selimutMm: +f.selimutMm, puKn: +f.puKn, muKnm: +f.muKnm,
          mutu: { fcMpa: +f.fcMpa, fyMpa: +f.fyMpa, fyvMpa: +f.fyvMpa },
        };
      const { data } = await api.post<HasilSaran>(
        "/api/v1/struktur/saran-pembesian", badan,
      );
      setHasil(data);
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })
        .response?.data?.error;
      setGalatAksi(pesan ?? "Gagal menghitung usulan. Periksa isian lalu coba lagi.");
    } finally {
      setMemuat(false);
    }
  }, [jenis, f]);

  const medan = useMemo(() => jenis === "balok"
    ? [
      { k: "bMm", l: "Lebar b", s: "mm" },
      { k: "hMm", l: "Tinggi h", s: "mm" },
      { k: "panjangM", l: "Bentang", s: "m" },
      { k: "selimutMm", l: "Selimut beton", s: "mm" },
      { k: "muKnm", l: "Momen terfaktor Mu", s: "kNm" },
      { k: "vuKn", l: "Geser terfaktor Vu", s: "kN" },
    ]
    : [
      { k: "bMm", l: "Sisi b", s: "mm" },
      { k: "hMm", l: "Sisi h", s: "mm" },
      { k: "tinggiM", l: "Tinggi kolom", s: "m" },
      { k: "selimutMm", l: "Selimut beton", s: "mm" },
      { k: "puKn", l: "Aksial terfaktor Pu", s: "kN" },
      { k: "muKnm", l: "Momen terfaktor Mu", s: "kNm" },
    ], [jenis]);

  const t = hasil?.terpilih;

  return (
    <>
      {/* ── Pilihan jenis elemen */}
      <Kartu>
        <JudulKartu>Jenis elemen</JudulKartu>
        <div role="group" aria-label="Jenis elemen" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["balok", "kolom"] as Jenis[]).map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => gantiJenis(j)}
              aria-pressed={jenis === j}
              style={{
                padding: "var(--pad-tombol)",
                borderRadius: "var(--rad-sedang)",
                border: `1px solid ${jenis === j ? C.navy : C.border}`,
                background: jenis === j ? C.navy : "transparent",
                color: jenis === j ? "var(--on-navy)" : C.mid,
                fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                transition: "background var(--gerak-cepat) var(--gerak-kurva)",
              }}
            >
              {j}
            </button>
          ))}
        </div>
      </Kartu>

      {/* ── Masukan */}
      <Kartu>
        <JudulKartu>Dimensi &amp; beban</JudulKartu>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--gap-grid)",
        }}>
          {medan.map(({ k, l, s }) => (
            <Medan
              key={k}
              id={`medan-${k}`}
              label={`${l} (${s})`}
              wajib
              anak={
                <input
                  id={`medan-${k}`}
                  type="number"
                  inputMode="decimal"
                  value={f[k] ?? ""}
                  onChange={(e) => ubah(k, e.target.value)}
                  style={gayaInput}
                />
              }
            />
          ))}
          <Medan
            id="medan-fcMpa"
            label="Mutu beton f'c (MPa)"
            wajib
            keterangan="K300 ≈ 25 MPa"
            anak={
              <input
                id="medan-fcMpa" type="number" inputMode="decimal"
                value={f.fcMpa} onChange={(e) => ubah("fcMpa", e.target.value)}
                style={gayaInput}
              />
            }
          />
          <Medan
            id="medan-fyMpa"
            label="Mutu baja fy (MPa)"
            wajib
            keterangan="BjTS 420 untuk tulangan ulir"
            anak={
              <input
                id="medan-fyMpa" type="number" inputMode="decimal"
                value={f.fyMpa} onChange={(e) => ubah("fyMpa", e.target.value)}
                style={gayaInput}
              />
            }
          />
          <Medan
            id="medan-fyvMpa"
            label="Mutu sengkang fyv (MPa)"
            keterangan="BjTP 280 untuk sengkang polos"
            anak={
              <input
                id="medan-fyvMpa" type="number" inputMode="decimal"
                value={f.fyvMpa} onChange={(e) => ubah("fyvMpa", e.target.value)}
                style={gayaInput}
              />
            }
          />
        </div>

        <div style={{ marginTop: "var(--gap-bagian)" }}>
          <Tombol jenis="utama" onClick={hitung} disabled={memuat} ikon={<Lightbulb size={16} />}>
            {memuat ? "Menghitung…" : "Usulkan pembesian"}
          </Tombol>
        </div>

        {galatAksi && <div style={{ marginTop: 12 }}><Galat pesan={galatAksi} /></div>}
      </Kartu>

      {memuat && <Rangka />}

      {/* ── Hasil */}
      {hasil && !memuat && (
        <>
          {hasil.berhasil && t ? (
            <Kartu>
              <JudulKartu>Usulan terpilih</JudulKartu>

              <div style={{
                display: "flex", alignItems: "baseline", gap: 12,
                flexWrap: "wrap", marginBottom: 12,
              }}>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--teks-kpi)", fontWeight: 700,
                  color: C.navy, letterSpacing: "-.02em",
                }}>
                  {tulisUsulan(t, hasil.jenis)}
                </span>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.mid,
                }}>
                  sengkang {tulisSengkang(t)}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <Lencana nada="netral">{t.besiKg!.toFixed(1)} kg besi</Lencana>
                <Lencana nada={t.rasioKritis! <= BATAS_NYAMAN ? "sukses" : "peringatan"}>
                  {(t.rasioKritis! * 100).toFixed(0)}% kapasitas · {t.pemeriksaanKritis}
                </Lencana>
                <Lencana nada="netral">{hasil.kandidatDicoba} kombinasi diuji</Lencana>
              </div>

              {hasil.alternatif.length > 0 && (
                <>
                  <p style={{
                    margin: "0 0 6px", fontSize: "var(--teks-label)",
                    fontWeight: 700, letterSpacing: ".05em",
                    textTransform: "uppercase", color: C.muted,
                  }}>
                    Alternatif yang juga memenuhi
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
                    {hasil.alternatif.map((a, i) => (
                      <li key={i}>
                        {tulisUsulan(a, hasil.jenis)} sengkang {tulisSengkang(a)}
                        {" — "}{a.besiKg!.toFixed(1)} kg
                        {" · "}{(a.rasioKritis! * 100).toFixed(0)}% kapasitas
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Kartu>
          ) : (
            /*
              Kegagalan sebagai JAWABAN, bukan galat sistem. Lihat header.
            */
            <Kartu>
              <JudulKartu>Penampang ini belum cukup</JudulKartu>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <TriangleAlert size={18} aria-hidden="true" style={{ color: C.yellow, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: "0 0 8px", color: C.mid, lineHeight: 1.7 }}>
                    Tak ada kombinasi tulangan yang memenuhi syarat untuk dimensi
                    dan beban ini — dari {hasil.kandidatDicoba} kombinasi yang diuji.
                  </p>
                  {hasil.usulTinggiMm && (
                    <p style={{ margin: 0, color: C.text, fontWeight: 600 }}>
                      Coba tinggi {hasil.usulTinggiMm} mm — sudah diuji dan bisa dibesi.
                    </p>
                  )}
                </div>
              </div>
            </Kartu>
          )}

          {/*
            Catatan & batas — WAJIB tampil, tak bisa ditutup. Lihat header.
          */}
          <Kartu>
            <JudulKartu>Catatan &amp; batas</JudulKartu>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
              {hasil.catatan.map((c, i) => <li key={i}>{c}</li>)}
            </ul>

            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            }}>
              <Info size={15} aria-hidden="true" style={{ color: C.muted }} />
              <span style={{ color: C.muted, fontSize: "var(--teks-label)" }}>
                Sudah punya angka tulangannya dan ingin memeriksanya?
              </span>
              <Link
                href="/estimasi/struktur"
                style={{
                  color: C.navy, fontWeight: 600, textDecoration: "none",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                Analisa Struktur <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </Kartu>
        </>
      )}
    </>
  );
}
