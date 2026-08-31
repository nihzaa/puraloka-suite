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
import { useData } from "@/lib/data-cache";
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

interface HasilBeban {
  muKnm: number; vuKn: number; quKnM: number;
  qMatiKnM: number; qHidupKnM: number;
  rincianMati: Array<{ nama: string; knM: number }>;
  pembagiMomen: number; skema: string;
}

interface HasilSaran {
  jenis: "balok" | "kolom";
  /** Hanya terisi pada mode "dari beban". */
  beban?: HasilBeban;
  berhasil: boolean;
  terpilih?: Usulan;
  alternatif: Usulan[];
  usulTinggiMm?: number;
  kandidatDicoba: number;
  catatan: string[];
}

type Jenis = "balok" | "kolom";

/**
 * Dua cara memberi beban, dan keduanya sah.
 *
 * `angka` — pemakai sudah punya Mu/Vu (dari ETABS, dari hitungan tangan).
 * Membuang mode ini akan menutup pintu bagi pengguna yang paling teliti.
 *
 * `beban` — Mu/Vu dihitung dari bentang + fungsi ruang + lapis mati. Ini yang
 * menjawab pertanyaan lapangan yang sebenarnya: "balok 25/40 bentang 4 m
 * besinya berapa?" — orang yang bertanya begitu justru TIDAK punya momennya.
 */
type Mode = "angka" | "beban";

interface Katalog {
  fungsiRuang: Array<{ kunci: string; nama: string; bebanHidupKnM2: number; kelompok: string }>;
  lapisMati: Array<{ kunci: string; nama: string; knM2: number; kelompok: string }>;
  jenisDinding: Array<{ kunci: string; nama: string; knM2: number }>;
}

/** Nilai awal mode beban — balok hunian 5 m yang lazim. */
const AWAL_BEBAN = {
  bentangM: "5", lebarPikulM: "3", tebalPelatMm: "120",
  fungsiRuangKunci: "hunian", jenisDinding: "", tinggiDindingM: "3",
  skema: "menerus-tengah",
};

const SKEMA: Array<{ nilai: string; label: string }> = [
  { nilai: "sederhana", label: "Sederhana (dua tumpuan)" },
  { nilai: "menerus-tepi", label: "Menerus — bentang tepi" },
  { nilai: "menerus-tengah", label: "Menerus — bentang tengah" },
  { nilai: "kantilever", label: "Kantilever" },
];

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
  const [mode, setMode] = useState<Mode>("angka");
  const [fb, setFb] = useState<Record<string, string>>(AWAL_BEBAN);
  const [lapis, setLapis] = useState<string[]>(["keramik-spesi"]);
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

  /*
    Katalog datang dari SATU tempat — konstanta di `struktur-katalog-beban.ts`,
    lewat rute yang sudah ada. Menyalinnya ke layar akan membuat daftarnya
    berpisah dari kodenya saat salah satu dikoreksi, dan memilih beban hidup
    yang salah adalah kesalahan termahal di form ini: selisih hunian 1,92 vs
    ruang rapat 4,79 kN/m2 lebih dari dua kali lipat.
  */
  const { data: katalog } = useData<Katalog>("/api/v1/struktur/katalog-beban");

  const gantiJenis = useCallback((j: Jenis) => {
    setJenis(j);
    setF(j === "balok" ? AWAL_BALOK : AWAL_KOLOM);
    // Kolom belum punya jalur beban (aksial datang dari tributari, bentuk
    // masukan yang lain sama sekali) — rutenya menolak, jadi layar tak boleh
    // membiarkan keadaan itu terbentuk.
    if (j === "kolom") setMode("angka");
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
      const mutu = { fcMpa: +f.fcMpa, fyMpa: +f.fyMpa, fyvMpa: +f.fyvMpa };
      const badan = jenis === "balok" && mode === "beban"
        ? {
          jenis, bMm: +f.bMm, hMm: +f.hMm, panjangM: +fb.bentangM,
          selimutMm: +f.selimutMm, mutu,
          beban: {
            bentangM: +fb.bentangM,
            lebarPikulM: +fb.lebarPikulM,
            tebalPelatMm: +fb.tebalPelatMm,
            /* Daftar KOSONG tetap dikirim: modul beban memperlakukan daftar
               yang HILANG sebagai kesalahan, bukan nol. */
            lapisMati: lapis,
            fungsiRuangKunci: fb.fungsiRuangKunci,
            ...(fb.jenisDinding
              ? { jenisDinding: fb.jenisDinding, tinggiDindingM: +fb.tinggiDindingM }
              : {}),
            skema: fb.skema,
          },
        }
        : jenis === "balok"
        ? {
          jenis, bMm: +f.bMm, hMm: +f.hMm, panjangM: +f.panjangM,
          selimutMm: +f.selimutMm, muKnm: +f.muKnm, vuKn: +f.vuKn,
          mutu,
        }
        : {
          jenis, bMm: +f.bMm, hMm: +f.hMm, tinggiM: +f.tinggiM,
          selimutMm: +f.selimutMm, puKn: +f.puKn, muKnm: +f.muKnm, mutu,
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
  }, [jenis, f, mode, fb, lapis]);

  const medan = useMemo(() => jenis === "balok"
    ? (mode === "beban"
      /* Mu/Vu dan bentang pindah ke kartu beban — mengulanginya di sini
         membuat dua tempat mengaku sebagai sumber angka yang sama. */
      ? [
        { k: "bMm", l: "Lebar b", s: "mm" },
        { k: "hMm", l: "Tinggi h", s: "mm" },
        { k: "selimutMm", l: "Selimut beton", s: "mm" },
      ]
      : [
        { k: "bMm", l: "Lebar b", s: "mm" },
        { k: "hMm", l: "Tinggi h", s: "mm" },
        { k: "panjangM", l: "Bentang", s: "m" },
        { k: "selimutMm", l: "Selimut beton", s: "mm" },
        { k: "muKnm", l: "Momen terfaktor Mu", s: "kNm" },
        { k: "vuKn", l: "Geser terfaktor Vu", s: "kN" },
      ])
    : [
      { k: "bMm", l: "Sisi b", s: "mm" },
      { k: "hMm", l: "Sisi h", s: "mm" },
      { k: "tinggiM", l: "Tinggi kolom", s: "m" },
      { k: "selimutMm", l: "Selimut beton", s: "mm" },
      { k: "puKn", l: "Aksial terfaktor Pu", s: "kN" },
      { k: "muKnm", l: "Momen terfaktor Mu", s: "kNm" },
    ], [jenis, mode]);

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

      {/* ── Saklar mode (balok saja) */}
      {jenis === "balok" && (
        <Kartu>
          <JudulKartu>Dari mana momennya?</JudulKartu>
          <div role="group" aria-label="Cara memberi beban"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              ["angka", "Saya punya Mu & Vu"],
              ["beban", "Hitungkan dari beban"],
            ] as Array<[Mode, string]>).map(([m, label]) => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setHasil(null); setGalatAksi(null); }}
                aria-pressed={mode === m}
                style={{
                  padding: "var(--pad-tombol)", borderRadius: "var(--rad-sedang)",
                  border: `1px solid ${mode === m ? C.navy : C.border}`,
                  background: mode === m ? C.navy : "transparent",
                  color: mode === m ? "var(--on-navy)" : C.mid,
                  fontWeight: 600, cursor: "pointer",
                  transition: "background var(--gerak-cepat) var(--gerak-kurva)",
                }}>
                {label}
              </button>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", color: C.muted, fontSize: "var(--teks-label)", lineHeight: 1.6 }}>
            {mode === "beban"
              ? "Momen dan geser dihitung dari beban memakai koefisien perkiraan SNI — ditampilkan lebih dulu sebelum jadi usulan."
              : "Untuk yang momennya sudah dihitung sendiri atau datang dari software analisa."}
          </p>
        </Kartu>
      )}

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

        {/* ── Beban (mode "dari beban") */}
        {jenis === "balok" && mode === "beban" && (
          <div style={{ marginTop: "var(--gap-bagian)", paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <p style={{
              margin: "0 0 10px", fontSize: "var(--teks-label)", fontWeight: 700,
              letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
            }}>
              Beban yang dipikul
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--gap-grid)",
            }}>
              <Medan id="b-bentangM" label="Bentang (m)" wajib
                anak={<input id="b-bentangM" type="number" inputMode="decimal" style={gayaInput}
                  value={fb.bentangM} onChange={(e) => setFb((x) => ({ ...x, bentangM: e.target.value }))} />} />
              <Medan id="b-lebarPikulM" label="Lebar pikul (m)" wajib
                keterangan="Setengah bentang kiri + kanan"
                anak={<input id="b-lebarPikulM" type="number" inputMode="decimal" style={gayaInput}
                  value={fb.lebarPikulM} onChange={(e) => setFb((x) => ({ ...x, lebarPikulM: e.target.value }))} />} />
              <Medan id="b-tebalPelatMm" label="Tebal pelat (mm)"
                keterangan="0 bila tak memikul pelat"
                anak={<input id="b-tebalPelatMm" type="number" inputMode="decimal" style={gayaInput}
                  value={fb.tebalPelatMm} onChange={(e) => setFb((x) => ({ ...x, tebalPelatMm: e.target.value }))} />} />
              <Medan id="b-skema" label="Skema balok" wajib
                anak={
                  <select id="b-skema" style={gayaInput} value={fb.skema}
                    onChange={(e) => setFb((x) => ({ ...x, skema: e.target.value }))}>
                    {SKEMA.map((k) => <option key={k.nilai} value={k.nilai}>{k.label}</option>)}
                  </select>
                } />
              <Medan id="b-fungsi" label="Fungsi ruang" wajib
                keterangan="Menentukan beban hidup (SNI 1727 Tabel 4.3-1)"
                anak={
                  <select id="b-fungsi" style={gayaInput} value={fb.fungsiRuangKunci}
                    onChange={(e) => setFb((x) => ({ ...x, fungsiRuangKunci: e.target.value }))}>
                    {(katalog?.fungsiRuang ?? []).map((r) => (
                      <option key={r.kunci} value={r.kunci}>{r.nama} — {r.bebanHidupKnM2} kN/m²</option>
                    ))}
                  </select>
                } />
              <Medan id="b-dinding" label="Dinding di atas balok"
                anak={
                  <select id="b-dinding" style={gayaInput} value={fb.jenisDinding}
                    onChange={(e) => setFb((x) => ({ ...x, jenisDinding: e.target.value }))}>
                    <option value="">Tak ada dinding</option>
                    {(katalog?.jenisDinding ?? []).map((d) => (
                      <option key={d.kunci} value={d.kunci}>{d.nama}</option>
                    ))}
                  </select>
                } />
              {fb.jenisDinding && (
                <Medan id="b-tinggiDinding" label="Tinggi dinding (m)" wajib
                  anak={<input id="b-tinggiDinding" type="number" inputMode="decimal" style={gayaInput}
                    value={fb.tinggiDindingM} onChange={(e) => setFb((x) => ({ ...x, tinggiDindingM: e.target.value }))} />} />
              )}
            </div>

            <fieldset style={{ marginTop: 14, border: "none", padding: 0 }}>
              <legend style={{
                padding: 0, marginBottom: 6, fontSize: "var(--teks-label)", fontWeight: 700,
                letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
              }}>
                Lapisan beban mati
              </legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
                {(katalog?.lapisMati ?? []).map((l) => (
                  <label key={l.kunci} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    color: C.mid, cursor: "pointer",
                  }}>
                    <input type="checkbox" checked={lapis.includes(l.kunci)}
                      onChange={(e) => setLapis((xs) => e.target.checked
                        ? [...xs, l.kunci]
                        : xs.filter((k) => k !== l.kunci))} />
                    {l.nama} <span style={{ color: C.muted }}>({l.knM2} kN/m²)</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

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
          {/*
            Beban yang DIPAKAI, ditampilkan SEBELUM usulannya.

            Bukan hiasan. Momen yang salah tak punya "rasa salah" — 72 kNm dan
            210 kNm sama-sama terlihat wajar, dan yang salah menghasilkan balok
            yang lolos pemeriksaan tapi tak kuat. Pemakai yang tak pernah
            melihat angkanya tak punya kesempatan berkata "kok kecil sekali
            untuk bentang segitu". Rinciannya ikut supaya bisa ditelusuri
            baris per baris, bukan dipercaya bulat-bulat.
          */}
          {hasil.beban && (
            <Kartu>
              <JudulKartu>Beban yang dipakai</JudulKartu>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Lencana nada="info">Mu {hasil.beban.muKnm.toFixed(1)} kNm</Lencana>
                <Lencana nada="info">Vu {hasil.beban.vuKn.toFixed(1)} kN</Lencana>
                <Lencana nada="netral">qu {hasil.beban.quKnM.toFixed(2)} kN/m</Lencana>
                <Lencana nada="netral">wL²/{hasil.beban.pembagiMomen}</Lencana>
              </div>
              <p style={{
                margin: "0 0 6px", fontSize: "var(--teks-label)", fontWeight: 700,
                letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
              }}>
                Penyusun beban mati
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
                {hasil.beban.rincianMati.map((r, i) => (
                  <li key={i}>{r.nama} — {r.knM.toFixed(2)} kN/m</li>
                ))}
                <li style={{ color: C.muted }}>
                  Beban hidup {hasil.beban.qHidupKnM.toFixed(2)} kN/m
                  {" · "}mati total {hasil.beban.qMatiKnM.toFixed(2)} kN/m
                </li>
              </ul>
            </Kartu>
          )}

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
