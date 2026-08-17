"use client";

/**
 * TOMBOL UNDUH BERKAS — satu komponen untuk seluruh ekspor server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN, BUKAN `<a href>` BIASA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ekspor di aplikasi ini dijaga izin dan tenant. `<a href="/api/...">` biasa
 * membuat peramban meminta URL itu TANPA header sesi — jadi yang terunduh
 * halaman login berformat HTML, bernama `rekap-pajak.csv`.
 *
 * Kegagalan itu tak menampilkan galat apa pun. Orang membuka berkasnya di
 * Excel, melihat markup, dan menyimpulkan ekspornya rusak.
 *
 * Jadi berkasnya diambil lewat `api` (yang membawa sesi), diubah jadi blob,
 * lalu diunduh dari memori.
 *
 * ── Kenapa galat ditampilkan, bukan hanya di-console
 *
 * Ekspor gagal itu SENYAP: tak ada baris yang berubah di layar, dan tombol
 * yang kembali normal terbaca sebagai "berhasil". Karena itu pesan galatnya
 * dimunculkan di tempat — termasuk pesan dari server, yang biasanya sudah
 * menjelaskan sebabnya (mis. "belum berstatus PKP").
 *
 * ── Kenapa jumlah baris ikut dilaporkan
 *
 * Header `x-*-jumlah`/`x-*-ditolak` dari endpoint ekspor membawa berapa yang
 * masuk dan berapa yang ditolak. Berkas 0 baris yang terunduh diam-diam
 * membuat orang mengira datanya memang kosong — padahal bisa jadi seluruh
 * barisnya ditolak karena NPWP klien belum diisi.
 */

import { useState } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";

export type FormatUnduh = "csv" | "xlsx" | "pdf" | "json";

const LABEL: Record<FormatUnduh, string> = {
  csv: "CSV",
  xlsx: "Excel",
  pdf: "PDF",
  json: "JSON",
};

export function TombolUnduh({
  jalur,
  namaBerkas,
  format = ["csv", "xlsx", "pdf"],
  label = "Unduh",
  jalurTetap = false,
  nonaktif = false,
}: {
  /** Jalur endpoint TANPA `?format=` — ditambahkan komponen ini. */
  jalur: string;
  /** Nama berkas tanpa ekstensi. Ekstensi mengikuti format yang dipilih. */
  namaBerkas: string;
  format?: FormatUnduh[];
  label?: string;
  /**
   * Endpoint yang formatnya sudah ada DI JALURNYA (mis. `/k3/rk3k.pdf`),
   * bukan lewat `?format=`.
   *
   * Alternatifnya membuat tiap endpoint dokumen tunggal menerima `?format=`
   * yang hanya punya satu nilai sah — parameter yang berpura-pura menawarkan
   * pilihan padahal tidak. Yang mengirim `?format=csv` ke pencetak RK3K akan
   * menerima PDF, dan tak ada yang memberitahunya.
   */
  jalurTetap?: boolean;
  /** Dinonaktifkan (mis. proyek belum dipilih). */
  nonaktif?: boolean;
}) {
  const [sibuk, setSibuk] = useState<FormatUnduh | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const unduh = async (f: FormatUnduh) => {
    setSibuk(f);
    setGalat(null);
    setKabar(null);
    try {
      const pemisah = jalur.includes("?") ? "&" : "?";
      const alamat = jalurTetap ? jalur : `${jalur}${pemisah}format=${f}`;
      const r = await api.get(alamat, { responseType: "blob" });

      // Server bisa membalas JSON galat dengan status 200-an palsu? Tidak —
      // tapi ia BISA membalas 422 (mis. belum PKP), dan axios melemparkannya
      // ke catch. Yang di sini murni jalur berhasil.
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${namaBerkas}.${f}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Jumlah baris DILAPORKAN. Berkas 0 baris yang terunduh diam-diam
      // membuat orang mengira datanya kosong — padahal bisa jadi seluruh
      // barisnya ditolak karena data induknya belum lengkap.
      const h = r.headers as Record<string, string>;
      const jumlah = h["x-ekspor-jumlah"] ?? h["x-jurnal-baris"]
        ?? h["x-bupot-jumlah"] ?? h["x-efaktur-jumlah"];
      const ditolak = h["x-bupot-ditolak"] ?? h["x-efaktur-ditolak"];
      if (jumlah !== undefined) {
        setKabar(
          `${jumlah} baris terunduh` +
          (ditolak && Number(ditolak) > 0 ? ` · ${ditolak} ditolak (data belum lengkap)` : ""),
        );
      }
    } catch (e) {
      // Pesan server ditampilkan apa adanya — ia biasanya sudah menjelaskan
      // sebabnya dan cara memperbaikinya.
      const resp = (e as { response?: { data?: unknown } }).response;
      let pesan = "Unduhan gagal.";
      const d = resp?.data;
      if (d instanceof Blob) {
        try { pesan = (JSON.parse(await d.text()) as { error?: string }).error ?? pesan; }
        catch { /* blob bukan JSON — pakai pesan bawaan */ }
      } else if (d && typeof d === "object" && "error" in d) {
        pesan = String((d as { error: string }).error);
      }
      setGalat(pesan);
    } finally {
      setSibuk(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>{label}</span>
        {format.map((f) => (
          <button
            key={f}
            onClick={() => unduh(f)}
            disabled={sibuk !== null || nonaktif}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              minHeight: 34, padding: "0 12px", fontSize: 12, fontWeight: 600,
              borderRadius: 7, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text,
              cursor: nonaktif ? "not-allowed" : sibuk ? "wait" : "pointer",
              opacity: nonaktif || (sibuk && sibuk !== f) ? 0.5 : 1,
            }}
          >
            {sibuk === f
              ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              : <Download size={13} aria-hidden="true" />}
            {LABEL[f]}
          </button>
        ))}
      </div>

      {galat && (
        <div role="alert" style={{
          display: "flex", alignItems: "flex-start", gap: 6,
          padding: "8px 10px", borderRadius: 6, fontSize: 12, lineHeight: 1.5,
          background: "var(--danger-bg)", color: "var(--danger)",
          border: "1px solid var(--danger-border)",
        }}>
          <TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>{galat}</span>
        </div>
      )}

      {kabar && !galat && (
        <div style={{ fontSize: 12, color: C.mid }}>{kabar}</div>
      )}
    </div>
  );
}
