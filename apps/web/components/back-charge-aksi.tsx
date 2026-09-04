"use client";

/**
 * AKSI BACK-CHARGE — jalan menulis untuk `/mandor/penagihan`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua kemampuan tulis, nol jalan di layar. Halaman penagihan sudah menampilkan
 * back-charge yang siap dipotong beserta nilainya — dan tak ada satu pun cara
 * MEMBUAT maupun MEMUTUSKANNYA dari sana. Potongan hanya bisa lahir lewat SQL.
 *
 * ── Yang dijaga API, dan diulang di layar
 *
 *   uraian wajib   "Potongan tanpa sebab tak bisa dijelaskan ke mandor."
 *   nilai > 0      `Number('') === 0`, jadi kosong ditolak SEBELUM konversi
 *   pemutus ≠ pengaju   403, dan basis menegakkannya lagi
 *   pembatalan wajib beralasan
 *
 * Back-charge MEMOTONG uang orang. Ia juga melewati rantai persetujuan
 * (`evaluateEntityApproval`, migrasi 330) — jadi "disetujui" di sini belum
 * tentu berarti selesai: bisa jadi masih ada langkah berikutnya. Layar
 * menyatakan itu alih-alih membiarkannya tampak final.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  ModalDasar, TombolModal, KakiModal, gayaLabel, gayaInput, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";
import { Pilihan } from "@/components/pilihan";

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });

export type LingkupRingkas = { work_scope_id: string; scope_name: string };

const KATEGORI = [
  { kunci: "perbaikan", label: "Perbaikan pekerjaan" },
  { kunci: "material", label: "Material yang ditanggung" },
  { kunci: "alat", label: "Sewa alat" },
  { kunci: "denda", label: "Denda" },
  { kunci: "lainnya", label: "Lainnya" },
];

export function ModalBackChargeBaru({ lingkup, onClose, onSukses }: {
  lingkup: LingkupRingkas[]; onClose: () => void; onSukses: () => void;
}) {
  const [scopeId, setScopeId] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [uraian, setUraian] = useState("");
  const [kategori, setKategori] = useState("perbaikan");
  const [nilai, setNilai] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const angka = Number(nilai);
  const nilaiSah = nilai.trim() !== "" && Number.isFinite(angka) && angka > 0;
  const lengkap = scopeId !== "" && tanggal !== "" && uraian.trim() !== "" && nilaiSah;

  async function simpan() {
    if (!lengkap || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/back-charge", {
        work_scope_id: scopeId,
        tanggal,
        uraian: uraian.trim(),
        kategori,
        nilai: angka,
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal mencatat back-charge."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-bc" judul="Catat Back-charge" lebar={520} onClose={onClose}>
      <div>
        <label htmlFor="bc-scope" style={gayaLabel}>Lingkup kerja</label>
        <Pilihan id="bc-scope" value={scopeId} style={gayaInput}
          onChange={(e) => setScopeId(e.target.value)}>
          <option value="">— pilih lingkup —</option>
          {lingkup.map((l) => (
            <option key={l.work_scope_id} value={l.work_scope_id}>{l.scope_name}</option>
          ))}
        </Pilihan>
        <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          Potongan menempel pada lingkup kerja, bukan pada mandornya — satu mandor
          bisa memegang beberapa lingkup, dan potongan yang salah lingkup memotong
          tagihan pekerjaan yang tak bermasalah.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="bc-tanggal" style={gayaLabel}>Tanggal</label>
          <input id="bc-tanggal" type="date" value={tanggal}
            onChange={(e) => setTanggal(e.target.value)} style={gayaInput} />
        </div>
        <div>
          <label htmlFor="bc-kategori" style={gayaLabel}>Kategori</label>
          <Pilihan id="bc-kategori" value={kategori} style={gayaInput}
            onChange={(e) => setKategori(e.target.value)}>
            {KATEGORI.map((k) => <option key={k.kunci} value={k.kunci}>{k.label}</option>)}
          </Pilihan>
        </div>
        <div>
          <label htmlFor="bc-nilai" style={gayaLabel}>Nilai (Rp)</label>
          <input id="bc-nilai" type="number" min={0} step="1" value={nilai}
            onChange={(e) => setNilai(e.target.value)} style={gayaInput} />
        </div>
      </div>

      <div>
        <label htmlFor="bc-uraian" style={gayaLabel}>Uraian</label>
        <textarea id="bc-uraian" rows={3} value={uraian}
          onChange={(e) => setUraian(e.target.value)}
          placeholder="Apa yang harus diperbaiki, kenapa biayanya dibebankan ke mandor"
          style={{ ...gayaInput, resize: "vertical" }} />
        <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5,
          color: uraian.trim() === "" ? "var(--warning)" : C.muted }}>
          Wajib. <strong>Potongan tanpa sebab tak bisa dijelaskan ke mandor</strong> —
          dan yang tak bisa dijelaskan akan disengketakan saat pembayaran.
        </p>
      </div>

      {nilaiSah && (
        <p style={{ margin: 0, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>
          Akan memotong <strong style={{ color: C.text }}>{rupiah(angka)}</strong> dari
          tagihan lingkup ini setelah disetujui.
        </p>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!lengkap || kirim}>
          {kirim ? "Menyimpan…" : "Catat back-charge"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

export type BackChargeRingkas = {
  id: string; nomor: string; uraian: string; nilai: number | string;
  scopeNama: string | null;
};

/**
 * ── "Setujui" di sini belum tentu berarti selesai
 *
 * Back-charge melewati rantai persetujuan (`evaluateEntityApproval`, migrasi
 * 330): sebagian tenant menuntut dua lapis — pelaksana mengusulkan, keuangan
 * membebankan. Menulis "disetujui" seolah final akan membuat rantai dua
 * langkah tampak lolos dengan satu ketukan, sementara halaman pengaturannya
 * tetap menampilkan dua.
 *
 * Pembatalan TIDAK lewat rantai, dengan alasan yang ditulis API sendiri:
 * menarik kembali potongan yang belum berlaku bukan keputusan yang
 * membebankan, dan mensyaratkan rantai untuk membatalkan berarti potongan
 * salah bisa terkunci menunggu orang yang mungkin sedang tak ada.
 */
export function ModalPutusanBackCharge({ bc, onClose, onSukses }: {
  bc: BackChargeRingkas; onClose: () => void; onSukses: () => void;
}) {
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const adaAlasan = alasan.trim() !== "";

  async function putuskan(setujui: boolean) {
    if (kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/back-charge/${bc.id}/putuskan`,
        setujui ? { setujui: true } : { setujui: false, alasan: alasan.trim() });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menyimpan keputusan."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-bc-putus" judul={`Putuskan ${bc.nomor}`} lebar={480} onClose={onClose}>
      <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
        Potongan <strong style={{ color: C.text }}>{rupiah(Number(bc.nilai))}</strong>
        {bc.scopeNama && <> pada <strong style={{ color: C.text }}>{bc.scopeNama}</strong></>}.
      </p>

      <div style={{
        fontSize: 12, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap",
        padding: "10px 12px", borderRadius: 6,
        background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
      }}>{bc.uraian}</div>

      <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        Menyetujui memasukkannya ke rantai persetujuan — bila tenant ini menuntut
        dua lapis, potongan <strong>belum</strong> berlaku sesudah ketukan ini.
        Anda tak bisa menyetujui back-charge yang Anda ajukan sendiri.
      </p>

      <div>
        <label htmlFor="bcp-alasan" style={gayaLabel}>Alasan pembatalan</label>
        <textarea id="bcp-alasan" rows={2} value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="Kenapa potongan ini ditarik kembali"
          style={{ ...gayaInput, resize: "vertical" }} />
        <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          Wajib diisi hanya bila membatalkan — tanpa itu tak ada yang tahu kenapa
          potongan yang sudah diajukan tiba-tiba hilang.
        </p>
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal onClick={() => putuskan(false)} mati={!adaAlasan || kirim}>
          Batalkan potongan
        </TombolModal>
        <TombolModal utama onClick={() => putuskan(true)} mati={kirim}>
          {kirim ? "Menyimpan…" : "Setujui"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRAKUALIFIKASI VENDOR
// ═══════════════════════════════════════════════════════════════════════════

export type VendorRingkas = { id: string; name: string };

const DIMENSI = [
  { kunci: "skor_legalitas", label: "Legalitas" },
  { kunci: "skor_keuangan", label: "Keuangan" },
  { kunci: "skor_teknis", label: "Teknis" },
  { kunci: "skor_pengalaman", label: "Pengalaman" },
] as const;

/**
 * Penilaian prakualifikasi vendor.
 *
 * Ini SATU-SATUNYA guna halaman `/procurement/kualifikasi`, dan sampai
 * 2026-08-16 tak ada jalannya sama sekali: layar menampilkan penilaian yang
 * hanya bisa masuk lewat seed.
 *
 * ── Penolakan wajib beralasan, dan basis ikut menegakkannya
 *
 * Constraint menolak status `ditolak` yang alasannya kurang dari 5 huruf.
 * Vendor yang ditolak akan bertanya kenapa — dan penolakan tanpa alasan
 * tercatat akan dijawab dengan tebakan orang yang kebetulan mengangkat
 * telepon.
 */
export function ModalPrakualifikasiBaru({ vendor, onClose, onSukses }: {
  vendor: VendorRingkas[]; onClose: () => void; onSukses: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [berlaku, setBerlaku] = useState("");
  const [skor, setSkor] = useState<Record<string, number>>(
    () => Object.fromEntries(DIMENSI.map((d) => [d.kunci, 60])));
  const [status, setStatus] = useState("draft");
  const [catatan, setCatatan] = useState("");
  const [alasanTolak, setAlasanTolak] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const menolak = status === "ditolak";
  const alasanCukup = !menolak || alasanTolak.trim().length >= 5;
  const lengkap = supplierId !== "" && tanggal !== "" && alasanCukup;

  const rata = Math.round(
    DIMENSI.reduce((s, d) => s + skor[d.kunci], 0) / DIMENSI.length);

  async function simpan() {
    if (!lengkap || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/vendor-kualifikasi", {
        supplier_id: supplierId,
        tanggal,
        berlaku_sampai: berlaku || null,
        ...Object.fromEntries(DIMENSI.map((d) => [d.kunci, skor[d.kunci]])),
        status,
        catatan: catatan.trim() || undefined,
        alasan_tolak: menolak ? alasanTolak.trim() : undefined,
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menyimpan penilaian."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-pra" judul="Nilai Prakualifikasi Vendor" lebar={540} onClose={onClose}>
      <div>
        <label htmlFor="pra-vendor" style={gayaLabel}>Vendor</label>
        <Pilihan id="pra-vendor" value={supplierId} style={gayaInput}
          onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— pilih vendor —</option>
          {vendor.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Pilihan>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label htmlFor="pra-tanggal" style={gayaLabel}>Tanggal penilaian</label>
          <input id="pra-tanggal" type="date" value={tanggal}
            onChange={(e) => setTanggal(e.target.value)} style={gayaInput} />
        </div>
        <div>
          <label htmlFor="pra-berlaku" style={gayaLabel}>Berlaku sampai</label>
          <input id="pra-berlaku" type="date" value={berlaku}
            onChange={(e) => setBerlaku(e.target.value)} style={gayaInput} />
          <p style={{ margin: "5px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Kosongkan bila tak bermasa. Penilaian yang lewat masanya ditandai
            kedaluwarsa, bukan dihapus.
          </p>
        </div>
      </div>

      <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", margin: 0 }}>
        <legend style={{ ...gayaLabel, marginBottom: 0, padding: "0 4px" }}>
          Skor 0–100
        </legend>
        {DIMENSI.map((d) => (
          <div key={d.kunci} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <label htmlFor={`pra-${d.kunci}`} style={{ flex: 1, fontSize: 13, color: C.text }}>
              {d.label}
            </label>
            <input id={`pra-${d.kunci}`} type="range" min={0} max={100} step={5}
              value={skor[d.kunci]}
              onChange={(e) => setSkor((p) => ({ ...p, [d.kunci]: Number(e.target.value) }))}
              style={{ flex: 2 }} />
            <span style={{
              minWidth: 26, textAlign: "right", fontSize: 13, fontWeight: 700,
              color: C.text, fontVariantNumeric: "tabular-nums",
            }}>{skor[d.kunci]}</span>
          </div>
        ))}
        {/* Rata-rata ditampilkan sebagai KENDALI, bukan dikirim — yang
            disimpan tetap keempat skornya, dan bobotnya ditentukan server. */}
        <p style={{ margin: "10px 0 0", fontSize: 12, color: C.mid }}>
          Rata-rata polos <strong style={{ color: C.text }}>{rata}</strong> — pembobotannya
          dihitung server, jadi angka akhir bisa berbeda.
        </p>
      </fieldset>

      <div>
        <label htmlFor="pra-status" style={gayaLabel}>Keputusan</label>
        <Pilihan id="pra-status" value={status} style={gayaInput}
          onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">Draft — belum diputuskan</option>
          <option value="lolos">Lolos</option>
          <option value="ditolak">Ditolak</option>
        </Pilihan>
      </div>

      {menolak && (
        <div>
          <label htmlFor="pra-alasan" style={gayaLabel}>Alasan penolakan</label>
          <textarea id="pra-alasan" rows={2} value={alasanTolak}
            onChange={(e) => setAlasanTolak(e.target.value)}
            placeholder="Apa yang tidak memenuhi syarat"
            style={{ ...gayaInput, resize: "vertical" }} />
          <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5,
            color: alasanCukup ? C.muted : "var(--warning)" }}>
            Minimal 5 huruf — basis menolak yang lebih pendek. Vendor yang ditolak
            akan bertanya kenapa, dan jawabannya harus ada di sini.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="pra-catatan" style={gayaLabel}>Catatan</label>
        <textarea id="pra-catatan" rows={2} value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          style={{ ...gayaInput, resize: "vertical" }} />
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!lengkap || kirim}>
          {kirim ? "Menyimpan…" : "Simpan penilaian"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}
