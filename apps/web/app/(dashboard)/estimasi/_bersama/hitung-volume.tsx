"use client";

/**
 * KALKULATOR VOLUME — take-off dimensional & sektor, di tempat angkanya diketik.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Isian "Volume" di modal item adalah satu-satunya pintu yang dilalui angka
 * sebelum ia dikalikan HSP dan mendarat di `estimate_items.amount`. Satu-satunya
 * pemeriksaan yang dilaluinya:
 *
 *     if (typeof b.quantity !== 'number' || b.quantity <= 0) { … }
 *
 * Volume 84,5 m³ yang benar dan 84,5 m³ yang salah ketik dari 8,45 masuk lewat
 * pintu yang sama — dan sesudah masuk, keduanya terlihat identik.
 *
 * Migrasi 431 membangun `takeoff_dimensi` untuk menutup itu, dan migrasi 465
 * menambah sembilan sektor. **Layarnya tak pernah dibangun.** Diukur
 * 2026-08-19: `/estimasi/rab` memuat NOL rujukan takeoff, sementara peta-menu
 * menyatakan tab "Take-off Volume" SELESAI sejak 2026-08-16. Endpoint yang
 * lengkap dan tak terjangkau orang sama saja dengan endpoint yang tak ada.
 *
 * ── Tiga keputusan tampilan yang bukan selera
 *
 *   1. **MENGUSULKAN, bukan mengisi diam-diam.** Hasil hitung ditampilkan
 *      dengan rantai perhitungannya, dan baru masuk ke isian Volume kalau
 *      ditekan. Angka yang berpindah sendiri ke kolom uang tak pernah
 *      diperiksa siapa pun.
 *
 *   2. **RANTAI ikut ditampilkan, bukan hasilnya saja.** "8,67 m²" tak bisa
 *      diperiksa; "4 × 3 = 12 m² − bukaan 3,33 m² (P1 0,9×2,1×1)" bisa.
 *
 *   3. **Bukaan punya barisnya sendiri.** Dinding 4×3 m dengan satu pintu dan
 *      satu jendela bukan 12 m² melainkan 8,67 — selisih 28%, di sektor yang
 *      paling banyak barisnya. Menyembunyikannya di balik "opsi lanjutan"
 *      berarti sebagian besar orang tak pernah memakainya.
 */

import { useState } from "react";
import { C } from "@/lib/warna-ui";
import { GAYA_ISIAN } from "@/components/isian";
import { formatAngka } from "@/lib/format";
import { Calculator, Plus, Trash2 } from "lucide-react";

/** Sektor — kembaran `SEKTOR_SAH` di `apps/api/src/lib/takeoff-sektor.ts`. */
const SEKTOR = [
  { nilai: "", label: "— tanpa sektor (p × l × t biasa) —" },
  { nilai: "atap", label: "Atap — luas miring (÷ cos kemiringan)" },
  { nilai: "plafon", label: "Plafon — luas denah" },
  { nilai: "dinding", label: "Dinding — luas dikurangi bukaan" },
  { nilai: "lantai", label: "Lantai — luas denah" },
  { nilai: "kusen", label: "Kusen — keliling bukaan" },
  { nilai: "daun", label: "Daun pintu/jendela — luas" },
  { nilai: "sanitair", label: "Sanitair — per unit" },
  { nilai: "mep_pipa", label: "Pipa MEP — panjang" },
  { nilai: "mep_titik", label: "Titik MEP — per titik" },
] as const;

/** Dimensi yang ditampilkan per sektor — kolom yang tak relevan disembunyikan. */
const MEDAN: Record<string, Array<"panjang" | "lebar" | "tinggi" | "kemiringan" | "cacah" | "bukaan">> = {
  "": ["panjang", "lebar", "tinggi"],
  atap: ["panjang", "lebar", "kemiringan"],
  plafon: ["panjang", "lebar"],
  dinding: ["panjang", "tinggi", "bukaan"],
  lantai: ["panjang", "lebar"],
  kusen: ["lebar", "tinggi"],
  daun: ["panjang", "lebar"],
  sanitair: ["cacah"],
  mep_pipa: ["panjang"],
  mep_titik: ["cacah"],
};

interface BarisBukaan { nama: string; lebar: string; tinggi: string; jumlah: string }

interface Hasil {
  volume: number;
  satuan: string;
  rincian: string;
  catatan: string[];
}

/**
 * Hitung di KLIEN, mengikuti rumus yang sama dengan `lib/takeoff-sektor.ts`.
 *
 * ⚠ Ini PRATINJAU, bukan sumber kebenaran. Angka yang benar-benar tersimpan
 * dihitung ulang di server saat baris take-off dibuat — klien tak pernah
 * dipercaya untuk angka yang jadi rupiah. Yang ditampilkan di sini hanya untuk
 * membuat orang melihat akibat ketikannya sebelum menekan apa pun.
 */
export function hitung(
  sektor: string,
  d: { panjang: string; lebar: string; tinggi: string; kemiringan: string; cacah: string; jumlah: string; faktor: string },
  bukaan: BarisBukaan[],
): Hasil | { galat: string } {
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const p = n(d.panjang), l = n(d.lebar), t = n(d.tinggi);
  const jml = d.jumlah.trim() === "" ? 1 : n(d.jumlah);
  const fak = d.faktor.trim() === "" ? 1 : n(d.faktor);
  const ang = (x: number, des = 2) => formatAngka(x, des);

  if (!Number.isFinite(jml) || jml <= 0) return { galat: "Jumlah harus angka > 0" };
  if (!Number.isFinite(fak) || fak <= 0) return { galat: "Faktor harus angka > 0" };
  if (fak > 10) return { galat: "Faktor melewati batas 10" };

  const catatan: string[] = [];

  if (sektor === "sanitair" || sektor === "mep_titik") {
    const c = n(d.cacah);
    if (!Number.isFinite(c) || c <= 0) return { galat: "Cacah harus angka > 0" };
    return {
      volume: c * fak, satuan: sektor === "sanitair" ? "unit" : "titik",
      rincian: `${ang(c, 0)} titik${fak !== 1 ? ` × faktor ${ang(fak)}` : ""}`, catatan,
    };
  }

  if (sektor === "kusen" || sektor === "mep_pipa") {
    if (Number.isFinite(l) && Number.isFinite(t)) {
      const kel = 2 * (l + t);
      return {
        volume: kel * jml * fak, satuan: "m",
        rincian: `keliling 2 × (${ang(l)} + ${ang(t)}) = ${ang(kel)} m × ${ang(jml, 0)} buah`,
        catatan,
      };
    }
    if (!Number.isFinite(p) || p <= 0) return { galat: "Isi lebar+tinggi bukaannya, atau panjang jaringannya" };
    return { volume: p * jml * fak, satuan: "m", rincian: `${ang(p)} m × ${ang(jml, 0)}`, catatan };
  }

  if (sektor === "atap") {
    if (!Number.isFinite(p) || !Number.isFinite(l)) return { galat: "Panjang dan lebar denah wajib diisi" };
    const der = d.kemiringan.trim() === "" ? 0 : n(d.kemiringan);
    if (!Number.isFinite(der) || der < 0) return { galat: "Kemiringan harus 0..60 derajat" };
    if (der > 60) return { galat: "Kemiringan di atas 60° bukan atap melainkan dinding — periksa angkanya" };
    const fk = 1 / Math.cos((der * Math.PI) / 180);
    const denah = p * l * jml;
    if (der === 0) {
      catatan.push(
        "Kemiringan 0° — dihitung sebagai atap DATAR (dak). Untuk atap genteng, "
        + "isi kemiringannya: pada 30° luasnya 15,5% lebih besar daripada denah, "
        + "dan selisih itu genteng yang tak terbeli.",
      );
    }
    return {
      volume: denah * fk * fak, satuan: "m²",
      rincian: `denah ${ang(p)} × ${ang(l)} × ${ang(jml, 0)} = ${ang(denah)} m²`
        + (der > 0 ? ` ÷ cos ${ang(der, 0)}° (×${ang(fk, 3)})` : " (datar)"),
      catatan,
    };
  }

  if (sektor === "dinding") {
    if (!Number.isFinite(p) || !Number.isFinite(t)) return { galat: "Panjang dan tinggi dinding wajib diisi" };
    const kotor = p * t * jml;
    let luasBuka = 0;
    const daftar: string[] = [];
    for (const b of bukaan) {
      const bl = n(b.lebar), bt = n(b.tinggi), bj = b.jumlah.trim() === "" ? 1 : n(b.jumlah);
      if (!Number.isFinite(bl) || !Number.isFinite(bt) || bl <= 0 || bt <= 0) continue;
      luasBuka += bl * bt * bj;
      daftar.push(`${b.nama || "?"} ${ang(bl)}×${ang(bt)}×${ang(bj, 0)}`);
    }
    if (luasBuka >= kotor) {
      return { galat: `Luas bukaan (${ang(luasBuka)} m²) ≥ luas dinding (${ang(kotor)} m²) — periksa ukurannya` };
    }
    if (luasBuka === 0) {
      catatan.push(
        "Tidak ada bukaan yang dikurangkan. Kalau dinding ini punya pintu atau "
        + "jendela, luasnya kelebihan — satu pintu 0,9×2,1 dan satu jendela "
        + "1,2×1,2 pada dinding 4×3 m sudah 28% dari luasnya.",
      );
    }
    return {
      volume: (kotor - luasBuka) * fak, satuan: "m²",
      rincian: `${ang(p)} × ${ang(t)} × ${ang(jml, 0)} = ${ang(kotor)} m²`
        + (luasBuka > 0 ? ` − bukaan ${ang(luasBuka)} m² (${daftar.join(" + ")})` : ""),
      catatan,
    };
  }

  if (sektor === "") {
    // p × l × t biasa — metode generik migrasi 431.
    const dim = [p, l, t].filter((x) => Number.isFinite(x) && x > 0);
    if (!dim.length) return { galat: "Isi minimal satu dimensi" };
    const hasil = dim.reduce((a, b) => a * b, 1) * jml * fak;
    const satuan = dim.length === 3 ? "m³" : dim.length === 2 ? "m²" : "m";
    return {
      volume: hasil, satuan,
      rincian: `${dim.map((x) => ang(x)).join(" × ")} × ${ang(jml, 0)}`
        + (fak !== 1 ? ` × faktor ${ang(fak)}` : ""),
      catatan,
    };
  }

  // plafon · lantai · daun
  if (!Number.isFinite(p) || !Number.isFinite(l)) return { galat: "Panjang dan lebar wajib diisi" };
  return {
    volume: p * l * jml * fak, satuan: "m²",
    rincian: `${ang(p)} × ${ang(l)} × ${ang(jml, 0)} = ${ang(p * l * jml)} m²`
      + (fak !== 1 ? ` × faktor ${ang(fak)}` : ""),
    catatan,
  };
}

export function HitungVolume({ onPakai }: { onPakai: (volume: number) => void }) {
  const [buka, setBuka] = useState(false);
  const [sektor, setSektor] = useState("");
  const [d, setD] = useState({
    panjang: "", lebar: "", tinggi: "", kemiringan: "", cacah: "", jumlah: "1", faktor: "1",
  });
  const [bukaan, setBukaan] = useState<BarisBukaan[]>([]);

  const medan = MEDAN[sektor] ?? MEDAN[""];
  const hasil = hitung(sektor, d, bukaan);
  const galat = "galat" in hasil ? hasil.galat : null;

  const isi = (k: keyof typeof d) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value })),
  });

  const lbl = (t: string) => (
    <label style={{ fontSize: "var(--teks-delta)", color: C.mid, display: "block", marginBottom: 3 }}>{t}</label>
  );

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none",
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
          padding: "4px 10px", cursor: "pointer", color: C.mid,
          fontSize: "var(--teks-delta)", marginTop: 4,
        }}>
        <Calculator size={13} aria-hidden="true" /> Hitung dari ukuran
      </button>
    );
  }

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
      padding: "var(--pad-kartu)", marginTop: 6, background: C.subtle,
    }}>
      <p style={{ fontSize: "var(--teks-delta)", color: C.mid, margin: "0 0 8px" }}>
        Hasilnya <strong>diusulkan</strong>, tidak langsung mengisi — tekan
        “Pakai angka ini” kalau sudah benar.
      </p>

      {lbl("Sektor pekerjaan")}
      <select className="isian-fokus" style={{ ...GAYA_ISIAN, marginBottom: 8 }}
        value={sektor} onChange={(e) => { setSektor(e.target.value); setBukaan([]); }}>
        {SEKTOR.map((s) => <option key={s.nilai} value={s.nilai}>{s.label}</option>)}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
        {medan.includes("panjang") && <div>{lbl("Panjang (m)")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" {...isi("panjang")} /></div>}
        {medan.includes("lebar") && <div>{lbl("Lebar (m)")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" {...isi("lebar")} /></div>}
        {medan.includes("tinggi") && <div>{lbl("Tinggi (m)")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" {...isi("tinggi")} /></div>}
        {medan.includes("kemiringan") && <div>{lbl("Kemiringan (°)")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" placeholder="mis. 30" {...isi("kemiringan")} /></div>}
        {medan.includes("cacah") && <div>{lbl("Cacah")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" {...isi("cacah")} /></div>}
        <div>{lbl("Jumlah")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" {...isi("jumlah")} /></div>
        <div>{lbl("Faktor")}<input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" {...isi("faktor")} /></div>
      </div>

      {medan.includes("bukaan") && (
        <div style={{ marginTop: 10 }}>
          {lbl("Bukaan yang dikurangkan (pintu, jendela)")}
          {bukaan.map((b, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 6, marginBottom: 6 }}>
              <input className="isian-fokus" style={GAYA_ISIAN} placeholder="P1" value={b.nama}
                onChange={(e) => setBukaan((x) => x.map((y, j) => j === i ? { ...y, nama: e.target.value } : y))} />
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" placeholder="lebar" value={b.lebar}
                onChange={(e) => setBukaan((x) => x.map((y, j) => j === i ? { ...y, lebar: e.target.value } : y))} />
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" placeholder="tinggi" value={b.tinggi}
                onChange={(e) => setBukaan((x) => x.map((y, j) => j === i ? { ...y, tinggi: e.target.value } : y))} />
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" step="any" placeholder="jml" value={b.jumlah}
                onChange={(e) => setBukaan((x) => x.map((y, j) => j === i ? { ...y, jumlah: e.target.value } : y))} />
              <button type="button" aria-label={`Hapus bukaan ${b.nama || i + 1}`}
                onClick={() => setBukaan((x) => x.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.mid }}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button"
            onClick={() => setBukaan((x) => [...x, { nama: "", lebar: "", tinggi: "", jumlah: "1" }])}
            style={{
              display: "flex", alignItems: "center", gap: 5, background: "none",
              border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
              padding: "3px 8px", cursor: "pointer", color: C.mid, fontSize: "var(--teks-delta)",
            }}>
            <Plus size={12} aria-hidden="true" /> Tambah bukaan
          </button>
        </div>
      )}

      {/*
        HASIL dan GALAT tak pernah tampil bersamaan, dan galat TIDAK menghapus
        apa yang sudah diketik — orang memperbaiki satu angka, bukan mengisi
        ulang seluruh formulir.
      */}
      <div style={{ marginTop: 10 }} role="status" aria-live="polite">
        {galat ? (
          <p style={{
            fontSize: "var(--teks-delta)", color: C.onWarningBg, background: C.warningBg,
            border: `1px solid ${C.warningBorder}`, borderRadius: "var(--radius-dense)",
            padding: "var(--pad-kartu)", margin: 0,
          }}>{galat}</p>
        ) : (
          <>
            <div style={{ fontSize: "var(--teks-badan)", fontWeight: 600, color: C.text }}>
              {formatAngka((hasil as Hasil).volume, 4)} {(hasil as Hasil).satuan}
            </div>
            <div style={{ fontSize: "var(--teks-delta)", color: C.mid, marginTop: 2 }}>
              {(hasil as Hasil).rincian}
            </div>
            {(hasil as Hasil).catatan.map((c) => (
              <p key={c} style={{
                fontSize: "var(--teks-delta)", color: C.onWarningBg, background: C.warningBg,
                border: `1px solid ${C.warningBorder}`, borderRadius: "var(--radius-dense)",
                padding: "var(--pad-kartu)", margin: "6px 0 0",
              }}>{c}</p>
            ))}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" disabled={!!galat}
          onClick={() => { onPakai((hasil as Hasil).volume); setBuka(false); }}
          style={{
            background: galat ? C.border : C.aksen, color: galat ? C.mid : C.onAksen,
            border: "none", borderRadius: "var(--radius-dense)", padding: "5px 12px",
            cursor: galat ? "not-allowed" : "pointer", fontSize: "var(--teks-delta)",
          }}>
          Pakai angka ini
        </button>
        <button type="button" onClick={() => setBuka(false)}
          style={{
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: "var(--radius-dense)", padding: "5px 12px",
            cursor: "pointer", color: C.mid, fontSize: "var(--teks-delta)",
          }}>
          Tutup
        </button>
      </div>
    </div>
  );
}
