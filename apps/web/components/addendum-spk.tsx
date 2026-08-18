"use client";

/**
 * ADDENDUM SPK — mengubah perintah kerja yang sudah ditandatangani.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PANEL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kartu SPK sudah lama menulis "Terbitkan addendum bila lingkupnya berubah" —
 * kalimat yang benar, untuk jalan yang tidak ada. Sampai 2026-08-18 tak ada
 * satu pun cara menerbitkannya.
 *
 * Yang terjadi tanpa jalan itu bisa ditebak: orang menerbitkan SPK KEDUA untuk
 * lingkup yang sama (layar memperingatkan "SPK ganda", tapi memperingatkan
 * bukan menyediakan jalan), atau seseorang menyunting basis langsung.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HARUS TERLIHAT SEKALI PANDANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Nilai induk dan nilai efektif, berdampingan.** Yang membaca kartu ini
 * sedang memutuskan pembayaran — dan nilai yang salah satu digit lebih besar
 * tetap terlihat wajar. Menampilkan hanya nilai efektif menyembunyikan bahwa
 * angka itu BUKAN yang tertulis di kertas yang ditandatangani.
 *
 * ── Delta ditulis dengan tandanya, selalu
 *
 * `+15.000.000` dan `−10.000.000`, bukan angka telanjang. Pekerjaan kurang
 * itu nyata dan sah; yang berbahaya adalah pengurangan yang terbaca seperti
 * penambahan karena tandanya hilang di antara pemisah ribuan.
 *
 * ── Yang dibatalkan TETAP terlihat
 *
 * Ia tak ikut dihitung, tapi tetap didaftar dengan tanda coret. Addendum batal
 * yang hilang dari daftar membuat orang bertanya-tanya ke mana perginya nomor
 * urut yang loncat — dan menebak lebih buruk daripada melihat.
 */

import { useState } from "react";
import { FilePlus2, Loader2, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { DialogBersama } from "@/components/dialog-bersama";
import { Tombol, Medan, gayaInput, Lencana } from "@/components/dasar";

interface Addendum {
  id: string;
  urutan: number;
  nomor: string;
  tanggal: string;
  alasan: string;
  lingkup_tambahan: string | null;
  nilai_delta: number | string;
  hari_delta: number;
  status: "draf" | "diterbitkan" | "ditandatangani" | "dibatalkan";
}

interface Muatan {
  spk: {
    id: string; nomor: string; status: string;
    nilai_induk: number; tanggal_selesai_induk: string;
  };
  addendum: Addendum[];
  efektif: {
    nilai: number; delta_nilai: number;
    tanggal_selesai: string; delta_hari: number;
    jumlah_berlaku: number;
  };
}

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Delta SELALU bertanda — pengurangan yang kehilangan tandanya terbaca
 *  seperti penambahan di antara pemisah ribuan. */
const delta = (n: number) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("id-ID");

export function AddendumSpk({ spkId, bolehKelola }: {
  spkId: string;
  bolehKelola: boolean;
}) {
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>(`/api/v1/spk/${spkId}/addendum`);

  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [lingkup, setLingkup] = useState("");
  const [nilai, setNilai] = useState("");
  const [hari, setHari] = useState("");
  const [sibuk, setSibuk] = useState(false);
  // Galat AKSI terpisah dari galat MUAT: gagal menyimpan tak boleh menghapus
  // pesan gagal memuat, dan sebaliknya.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const daftar = data?.addendum ?? [];
  const e = data?.efektif;

  async function simpan() {
    setSibuk(true);
    setGalatAksi(null);
    try {
      await api.post(`/api/v1/spk/${spkId}/addendum`, {
        alasan: alasan.trim(),
        lingkup_tambahan: lingkup.trim() || undefined,
        // Kosong = 0, bukan NaN. `Number("")` memang 0, tapi ditulis
        // eksplisit supaya pembacanya tak perlu mengingat itu.
        nilai_delta: nilai.trim() === "" ? 0 : Number(nilai.replace(/[^\d-]/g, "")),
        hari_delta: hari.trim() === "" ? 0 : Number(hari.replace(/[^\d-]/g, "")),
      });
      setBuka(false);
      setAlasan(""); setLingkup(""); setNilai(""); setHari("");
      void muatUlang();
    } catch (err) {
      // Pesan server diteruskan apa adanya — ia sudah ditulis untuk manusia
      // ("Addendum membuat nilai SPK jadi −5.000.000 — batalkan SPK-nya,
      // jangan dikurangi habis"), dan menggantinya membuang petunjuknya.
      setGalatAksi(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal menyimpan addendum.",
      );
    } finally {
      setSibuk(false);
    }
  }

  async function ubahStatus(id: string, status: string) {
    setSibuk(true);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/spk/addendum/${id}/status`, { status });
      void muatUlang();
    } catch (err) {
      setGalatAksi(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal mengubah status addendum.",
      );
    } finally {
      setSibuk(false);
    }
  }

  if (memuat && !data) return null;

  return (
    <div style={{
      padding: "10px var(--pad-kartu-lega) 12px",
      background: "var(--surface-subtle)",
      borderTop: `1px solid ${C.border}`,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Addendum{daftar.length > 0 ? ` (${daftar.length})` : ""}
        </span>
        {bolehKelola && (
          <Tombol kecil jenis="sekunder" ikon={<FilePlus2 size={12} />}
            onClick={() => { setBuka(true); setGalatAksi(null); }}>
            Terbitkan addendum
          </Tombol>
        )}
      </div>

      {galatMuat && (
        <div role="alert" style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>
          Gagal memuat addendum.{" "}
          <button type="button" onClick={() => void muatUlang()} style={{
            background: "none", border: "none", padding: 0, font: "inherit",
            color: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer",
          }}>Coba lagi</button>
        </div>
      )}

      {galatAksi && (
        <div role="alert" style={{
          marginTop: 8, padding: "8px 10px", borderRadius: 7, fontSize: 12, lineHeight: 1.5,
          background: "var(--danger-bg)", color: "var(--danger)",
          border: "1px solid var(--danger-border)",
        }}>{galatAksi}</div>
      )}

      {/* Nilai INDUK dan EFEKTIF berdampingan. Menampilkan hanya yang efektif
          menyembunyikan bahwa angka itu bukan yang tertulis di kertas yang
          ditandatangani — dan yang membacanya sedang memutuskan pembayaran. */}
      {e && e.jumlah_berlaku > 0 && (
        <div style={{
          display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8,
          fontSize: 12.5, color: C.mid,
        }}>
          <span>
            Nilai di kertas: <strong style={{ color: C.text }}>{rupiah(data!.spk.nilai_induk)}</strong>
          </span>
          <span>
            Nilai berlaku:{" "}
            <strong style={{ color: C.text }}>{rupiah(e.nilai)}</strong>
            {e.delta_nilai !== 0 && (
              <span style={{ color: e.delta_nilai > 0 ? "var(--success)" : "var(--danger)" }}>
                {" "}({delta(e.delta_nilai)})
              </span>
            )}
          </span>
          {e.delta_hari !== 0 && (
            <span>
              Selesai: <strong style={{ color: C.text }}>{e.tanggal_selesai}</strong>{" "}
              <span style={{ color: C.muted }}>({delta(e.delta_hari)} hari)</span>
            </span>
          )}
        </div>
      )}

      {daftar.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {daftar.map((a) => {
            const batal = a.status === "dibatalkan";
            return (
              <div key={a.id} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                fontSize: 12, lineHeight: 1.5,
                // Yang dibatalkan TETAP terlihat, hanya diredupkan + dicoret.
                opacity: batal ? 0.55 : 1,
              }}>
                <span style={{
                  fontWeight: 700, color: C.text, whiteSpace: "nowrap",
                  textDecoration: batal ? "line-through" : undefined,
                }}>{a.nomor}</span>
                <span style={{ flex: 1, minWidth: 0, color: C.mid }}>
                  {a.alasan}
                  {a.lingkup_tambahan && <> — {a.lingkup_tambahan}</>}
                </span>
                <span style={{
                  whiteSpace: "nowrap", fontWeight: 600,
                  color: Number(a.nilai_delta) > 0 ? "var(--success)"
                    : Number(a.nilai_delta) < 0 ? "var(--danger)" : C.muted,
                  textDecoration: batal ? "line-through" : undefined,
                }}>
                  {Number(a.nilai_delta) === 0 ? "—" : delta(Number(a.nilai_delta))}
                </span>
                <Lencana nada={
                  a.status === "ditandatangani" ? "sukses"
                    : a.status === "dibatalkan" ? "netral" : "info"
                }>{a.status}</Lencana>
                {bolehKelola && a.status === "draf" && (
                  <Tombol kecil jenis="sekunder" disabled={sibuk}
                    onClick={() => void ubahStatus(a.id, "diterbitkan")}>Terbitkan</Tombol>
                )}
                {bolehKelola && a.status === "diterbitkan" && (
                  <>
                    <Tombol kecil jenis="utama" ikon={<Check size={11} />} disabled={sibuk}
                      onClick={() => void ubahStatus(a.id, "ditandatangani")}>Sahkan</Tombol>
                    <Tombol kecil jenis="sekunder" ikon={<X size={11} />} disabled={sibuk}
                      onClick={() => void ubahStatus(a.id, "dibatalkan")}>Batalkan</Tombol>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DialogBersama
        terbuka={buka}
        onTutup={() => setBuka(false)}
        judul="Terbitkan Addendum"
        keterangan="SPK induk tidak berubah — addendum menyimpan selisihnya, jadi kertas yang sudah ditandatangani tetap bisa dicetak ulang apa adanya."
        kaki={
          <Tombol jenis="utama" onClick={() => void simpan()}
            disabled={sibuk || alasan.trim() === ""}
            ikon={sibuk ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            {sibuk ? "Menyimpan…" : "Simpan sebagai draf"}
          </Tombol>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Medan id="add-alasan" label="Alasan" wajib
            keterangan="Wajib. Addendum tanpa alasan adalah perubahan nilai kontrak yang tak seorang pun bisa pertanggungjawabkan enam bulan lagi."
            anak={
              <textarea id="add-alasan" value={alasan} rows={2}
                onChange={(ev) => setAlasan(ev.target.value)}
                style={{ ...gayaInput, resize: "vertical" }} />
            } />
          <Medan id="add-lingkup" label="Lingkup tambahan / dikurangi"
            anak={
              <textarea id="add-lingkup" value={lingkup} rows={2}
                onChange={(ev) => setLingkup(ev.target.value)}
                style={{ ...gayaInput, resize: "vertical" }} />
            } />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Medan id="add-nilai" label="Selisih nilai (Rp)"
              keterangan="Boleh MINUS untuk pekerjaan yang dikurangi."
              anak={
                <input id="add-nilai" value={nilai} inputMode="numeric"
                  placeholder="mis. 15000000 atau -5000000"
                  onChange={(ev) => setNilai(ev.target.value)} style={gayaInput} />
              } />
            <Medan id="add-hari" label="Selisih hari"
              keterangan="Boleh minus bila dipercepat."
              anak={
                <input id="add-hari" value={hari} inputMode="numeric"
                  placeholder="mis. 7"
                  onChange={(ev) => setHari(ev.target.value)} style={gayaInput} />
              } />
          </div>
        </div>
      </DialogBersama>
    </div>
  );
}
