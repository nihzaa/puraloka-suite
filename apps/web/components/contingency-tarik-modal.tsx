"use client";

// ============================================================================
// PENARIKAN CADANGAN — dengan dasar tertulis, bukan sekadar angka.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Ditemukan 2026-08-08 oleh `audit-kolom-tak-tersambung.mjs` — penjaga yang
// baru dipasang beberapa jam sebelumnya:
//
//   `penggunaan_contingency.sumber_change_order_id` diterima di body
//   `POST /contingency/:id/penggunaan` dan LANGSUNG di-insert tanpa
//   diperiksa. UI tak punya cara mengirimnya.
//
// Diperiksa lebih jauh, dan celahnya lebih dalam daripada yang dilaporkan
// penjaga: halaman `/keuangan/contingency` hanya bisa MEMBUAT POS. **Tak ada
// satu pun jalur penarikan di seluruh UI.** Kolom `terpakai` dan `sisa` yang
// dihitung rapi di layar selalu nol karena tak ada yang bisa mengisinya.
//
// ── Kenapa CO-nya dipilih, bukan diketik
//
// `alasan` sudah wajib di server sejak awal — cadangan yang terpakai tanpa
// alasan tertulis adalah persis "hilang ke biaya lain-lain" yang modul ini
// akhiri. Tapi alasan berbentuk kalimat bebas tak bisa ditelusuri ke apa pun.
//
// Change order bisa. Ia punya nomor, nilai, dan persetujuan bertanggal — dan
// saat auditor bertanya "dasar penarikan Rp 2,5 juta ini apa", jawabannya
// menunjuk dokumen, bukan ingatan orang.
//
// ── Kenapa hanya CO yang DISETUJUI muncul
//
// Penarikan yang mengaku bersumber dari CO yang DITOLAK adalah jejak audit
// yang berbohong — lebih buruk daripada tak ada jejak, karena ia dipercaya.
// Server menolaknya (`co-sumber-contingency.ts`, 14 test); layar ini tak
// menawarkannya sejak awal supaya penolakan itu tak pernah perlu terjadi.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { DialogBersama } from "@/components/dialog-bersama";
import { Pilihan } from "@/components/pilihan";

type CoLayak = {
  id: string;
  co_number: string;
  status: string;
  judul: string | null;
  nilai: number | null;
};

type CoSumberResponse = {
  layak: CoLayak[];
  /** Yang tidak layak DIHITUNG, bukan dihilangkan diam-diam. */
  tak_layak: number;
  jumlah_co: number;
};

export interface ContingencyTarikModalProps {
  /** Pos yang ditarik. `null` = modal tertutup. */
  pos: { id: string; nama: string; project_id: string; sisa: number } | null;
  onTutup: () => void;
  /** Dipanggil setelah penarikan berhasil, supaya daftar dimuat ulang. */
  onBerhasil: () => void;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export function ContingencyTarikModal({ pos, onTutup, onBerhasil }: ContingencyTarikModalProps) {
  const [nilai, setNilai] = useState("");
  const [alasan, setAlasan] = useState("");
  const [coId, setCoId] = useState("");
  const [co, setCo] = useState<CoSumberResponse | null>(null);
  /**
   * Memuat daftar CO GAGAL — dibedakan dari "sedang memuat".
   *
   * Versi pertama menyetel `co = null` di `.catch`, sama persis dengan
   * keadaan awal. Terlihat saat menguji di peramban: layar berhenti di
   * "Memuat change order…" SELAMANYA, dan tak ada cara mengetahui itu
   * kegagalan. Keterangan yang berbohong lebih buruk daripada pesan galat.
   */
  const [coGagal, setCoGagal] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Form dikosongkan saat pos BERGANTI, bukan saat modal ditutup: menutup lalu
  // membuka pos yang sama sering berarti "saya salah ketik", dan mengosongkan
  // isian di situ membuang pekerjaan yang baru saja dilakukan.
  useEffect(() => {
    setNilai(""); setAlasan(""); setCoId(""); setGalat(null); setCoGagal(false);
  }, [pos?.id]);

  useEffect(() => {
    if (!pos) { setCo(null); return; }
    const ac = makeAbortController();
    api.get<CoSumberResponse>(`/api/v1/contingency/co-sumber?project_id=${pos.project_id}`, { signal: ac.signal })
      .then((r) => { setCo(r.data); setCoGagal(false); })
      // Gagal memuat CO TIDAK boleh memblokir penarikan — penarikan tanpa CO
      // tetap sah, dan sebagian memang risiko tak terduga yang tak punya
      // pekerjaan tambah di belakangnya. Yang WAJIB: kegagalannya terlihat.
      .catch((e) => { if (e?.name !== "CanceledError") { setCo(null); setCoGagal(true); } });
    return () => ac.abort();
  }, [pos?.id, pos?.project_id]);

  const angka = Number(nilai);

  const halangan = useMemo(() => {
    if (!nilai || !Number.isFinite(angka) || angka <= 0) return "Isi nilai penarikan lebih dari 0.";
    if (!alasan.trim()) return "Tulis alasan penarikan.";
    return null;
  }, [nilai, angka, alasan]);

  // Melebihi sisa BUKAN halangan — ia peringatan.
  //
  // Server memang mengizinkannya, dan itu disengaja: cadangan yang terlampaui
  // adalah keadaan nyata yang harus TERCATAT, bukan disembunyikan dengan
  // menolak pencatatannya. Yang salah bukan pencatatannya, melainkan
  // keadaannya — dan keadaan itu perlu terlihat justru supaya bisa ditangani.
  const melebihiSisa = pos !== null && Number.isFinite(angka) && angka > pos.sisa;

  async function kirim() {
    if (!pos || halangan) return;
    setMengirim(true); setGalat(null);
    try {
      await api.post(`/api/v1/contingency/${pos.id}/penggunaan`, {
        nilai: angka,
        alasan: alasan.trim(),
        ...(coId ? { sumber_change_order_id: coId } : {}),
      });
      onBerhasil();
      onTutup();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal mencatat penarikan");
    } finally {
      setMengirim(false);
    }
  }

  const labelGaya: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const isianGaya: React.CSSProperties = {
    padding: "9px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
    background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
  };

  const coDipilih = co?.layak.find((c) => c.id === coId);

  return (
    <DialogBersama
      terbuka={pos !== null}
      onTutup={onTutup}
      judul={pos ? `Tarik dari "${pos.nama}"` : "Tarik cadangan"}
      keterangan={pos ? `Sisa saat ini ${rupiah(pos.sisa)}. Tiap penarikan mengurangi sisa dan tercatat beserta alasannya.` : undefined}
      kaki={
        <>
          <button
            type="button" onClick={onTutup} disabled={mengirim}
            style={{
              padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              minHeight: 40, border: `1px solid ${C.border}`,
              background: "transparent", color: C.text,
              cursor: mengirim ? "not-allowed" : "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button" onClick={kirim} disabled={halangan !== null || mengirim}
            style={{
              padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700,
              minHeight: 40, border: "none",
              background: halangan || mengirim ? C.border : C.navy,
              color: halangan || mengirim ? C.mid : "var(--on-navy)",
              cursor: halangan || mengirim ? "not-allowed" : "pointer",
            }}
          >
            {mengirim ? "Mencatat…" : "Catat penarikan"}
          </button>
        </>
      }
    >
      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 12px", borderRadius: 6, fontSize: 12.5,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          {galat}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="ct-nilai" style={labelGaya}>Nilai penarikan</label>
          <input
            id="ct-nilai" type="number" min="0" inputMode="numeric"
            value={nilai} onChange={(e) => setNilai(e.target.value)}
            placeholder="mis. 2500000" style={isianGaya}
            aria-describedby={melebihiSisa ? "ct-nilai-peringatan" : undefined}
          />
          {melebihiSisa && pos && (
            <span id="ct-nilai-peringatan" role="status" style={{
              fontSize: 11.5, lineHeight: 1.5, color: "var(--warning-teks)",
            }}>
              Melebihi sisa {rupiah(pos.sisa)} — pos akan berstatus TERLAMPAUI.
              Tetap bisa dicatat: keadaan itu perlu terlihat, bukan disembunyikan.
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="ct-alasan" style={labelGaya}>Alasan</label>
          <input
            id="ct-alasan" type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)}
            placeholder="mis. penyesuaian pekerjaan galian batu" style={isianGaya}
            aria-describedby="ct-alasan-ket"
          />
          <span id="ct-alasan-ket" style={{ fontSize: 11, color: C.mid, lineHeight: 1.5 }}>
            Wajib. Cadangan yang terpakai tanpa alasan tertulis adalah cadangan yang hilang.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label htmlFor="ct-co" style={labelGaya}>
            Dasar change order <span style={{ fontWeight: 400, color: C.mid, textTransform: "none", letterSpacing: 0 }}>— opsional</span>
          </label>
          <Pilihan
            id="ct-co" value={coId} onChange={(e) => setCoId(e.target.value)}
            style={isianGaya} disabled={coGagal || !co || co.layak.length === 0}
            aria-describedby="ct-co-ket"
          >
            <option value="">— tanpa dasar CO —</option>
            {(co?.layak ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.co_number}{c.judul ? ` · ${c.judul}` : ""}
              </option>
            ))}
          </Pilihan>
          <span id="ct-co-ket" style={{ fontSize: 11, color: C.mid, lineHeight: 1.5 }}>
            {coGagal
              ? "Daftar change order tak bisa dimuat. Penarikan tetap bisa dicatat tanpa dasar CO."
              : !co
              ? "Memuat change order…"
              : co.layak.length === 0
                // Angka tanpa penyebut tak bisa dinilai: nol dari nol berarti
                // belum ada CO; nol dari dua berarti semuanya ditolak atau
                // belum disetujui — dua keadaan yang sangat berbeda.
                ? co.jumlah_co === 0
                  ? "Belum ada change order di proyek ini."
                  : `${co.jumlah_co} CO ada, tapi belum ada yang bisa jadi dasar — belum disetujui atau ditolak.`
                : `${co.layak.length} dari ${co.jumlah_co} CO bisa jadi dasar. Hanya yang sudah DISETUJUI yang ditawarkan.`}
          </span>
          {coDipilih?.nilai != null && (
            <span style={{ fontSize: 11.5, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              Nilai CO ini {rupiah(coDipilih.nilai)}
              {Number.isFinite(angka) && angka > 0 && angka !== coDipilih.nilai && (
                // Selisih DINYATAKAN, bukan dilarang: satu CO boleh jadi dasar
                // beberapa penarikan bertahap, jadi tak sama ≠ salah. Yang
                // berbahaya adalah selisih yang tak terlihat.
                <span style={{ color: C.mid }}> · penarikan ini {rupiah(angka)}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </DialogBersama>
  );
}
