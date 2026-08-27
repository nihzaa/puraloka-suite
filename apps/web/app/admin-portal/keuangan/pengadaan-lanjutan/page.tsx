"use client";

// ============================================================================
// Kontrak Payung / Expediting / Nota Kredit — Portal Admin/Direktur (Task 18,
// Tahap 3). Kerangka 3-tab (Kontrak Payung/Expediting/Nota Kredit) dan form
// Kontrak Baru/Nota Kredit Baru disalin APA ADANYA dari
// `pm-portal/keuangan/pengadaan-lanjutan/page.tsx` (Task 36 PM) — SATU fetch
// (`GET /pengadaan-lanjutan`), TIGA sub-modul, pola sama `kurva-s.ts`.
//
// ── BERBEDA dari versi PM: admin/direktur BOLEH memutuskan nota kredit
//
// Diverifikasi LANGSUNG ke `apps/api/src/routes/v1/pengadaan-lanjutan.ts`:
//
//   POST /pengadaan-lanjutan/kontrak              procurement:po:manage      (admin+direktur punya, SAMA PM)
//   POST /pengadaan-lanjutan/expediting            procurement:po:manage      (admin+direktur punya, SAMA PM)
//   PATCH /pengadaan-lanjutan/expediting/:id       procurement:po:manage      (admin+direktur punya, SAMA PM)
//   POST /pengadaan-lanjutan/nota-kredit           procurement:po:manage      (admin+direktur punya, SAMA PM)
//   PATCH /nota-kredit/:id/putuskan (561-630)      procurement:payment:manage (admin+direktur PUNYA — PM TIDAK)
//   PATCH /nota-kredit/:id/terapkan (637-673)      procurement:payment:manage (admin+direktur PUNYA — PM TIDAK)
//
// Arah TERBALIK dari Task 15/16 (yang MENGURANGI tombol PM untuk direktur):
// di sini KEDUA role admin dapat tombol yang PM tak pernah punya sama
// sekali. Tombol Setujui/Tolak (status "diajukan") dan Terapkan Potongan
// (status "disetujui") ditambahkan di tab Nota Kredit, digerbang
// `procurement:payment:manage` lewat `useSyncExternalStore` — pola PERSIS
// `bolehTulisGl` (Task 15) / `bolehBatalkan` (Task 17).
//
// ── SoD (segregation of duties) — DIPERIKSA BACKEND, bukan diduplikasi klien
//
// `pengadaan-lanjutan.ts:585-589`: kalau `diajukan_oleh === currentUser.id`,
// backend menjawab 403 "Anda yang mengajukan nota kredit ini — pemutus harus
// orang lain…". Tombol Setujui/Tolak TETAP DIRENDER untuk admin/direktur yang
// mengajukan nota kredit sendiri (backend yang menolak dengan pesan
// manusiawi) — BUKAN disembunyikan di klien berdasar
// `n.diajukan_oleh === user.id`. Menduplikasi logic SoD di klien berisiko
// menyimpang dari aturan backend yang sesungguhnya (mis. `diajukan_oleh`
// ternyata tak selalu terisi untuk nota kredit lama) — pola sama arahan
// approval inbox Task 4 / approval chain Task 10: render, biarkan backend
// menolak dengan pesan yang bisa dibaca manusia.
//
// Body `putuskan`: `{ setujui: boolean; alasan_tolak?: string }`. Penolakan
// WAJIB alasan minimal 10 karakter — divalidasi backend
// (`pengadaan-lanjutan.ts:592-596`, `.length < 10` → 422) DAN di klien di
// sini (UX; backend tetap sumber kebenaran). Body `terapkan`: kosong.
// Respons keduanya `{ notaKredit: {...} }`.
//
// ── Dua state galat TERPISAH (pelajaran Task 31/32, sama versi PM)
//
// `galat` (dari `useData`, kegagalan MUAT) TERPISAH dari `galatForm`
// (form Kontrak/Nota Baru) TERPISAH dari `galatPutus` (aksi Setujui/Tolak/
// Terapkan) — gagal satu aksi tak boleh menghapus pesan galat aksi lain.
// ============================================================================

import { useState, useSyncExternalStore } from "react";
import { FileText, Truck, ReceiptText, Plus, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type {
  RespPengadaanLanjutan, RespSupplierDaftar, HasilNotaKreditPM, GalatApi,
} from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

// `langganan`: pola PERSIS Task 10/15/17 — perubahan permission (login/switch
// company) tercermin tanpa reload.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const LABEL_STATUS_PAYUNG: Record<string, string> = {
  aktif: "Aktif", kuota_habis: "Kuota Habis", segera_berakhir: "Segera Berakhir",
  kedaluwarsa: "Kedaluwarsa", belum_mulai: "Belum Mulai", tak_aktif: "Tak Aktif",
};
const WARNA_STATUS_PAYUNG: Record<string, string> = {
  aktif: "var(--success)", kuota_habis: "var(--danger)", segera_berakhir: "var(--on-warning-bg)",
  kedaluwarsa: "var(--danger)", belum_mulai: "var(--text-muted)", tak_aktif: "var(--text-muted)",
};
const LABEL_STATUS_NOTA: Record<string, string> = {
  draft: "Draf", diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak", diterapkan: "Diterapkan",
};

const GAYA_INPUT: React.CSSProperties = {
  minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14,
};
const GAYA_LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" };

type Tab = "payung" | "expediting" | "nota";

export default function AdminPengadaanLanjutanPage() {
  // procurement:payment:manage — admin+direktur SAMA-SAMA punya (BEDA dari
  // PM yang tak punya sama sekali). TIDAK DIRENDER (bukan disabled) saat tak
  // ada, pola sama `bolehTulisGl` Task 15 — JANGAN "perbaiki" jadi selalu
  // tampil dengan asumsi peran lain juga berwenang.
  const bolehPutuskan = useSyncExternalStore(
    langganan, () => hasPermission("procurement:payment:manage"), () => false);

  const [tab, setTab] = useState<Tab>("payung");
  const [sheetPayung, setSheetPayung] = useState(false);
  const [sheetNota, setSheetNota] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const [formPayung, setFormPayung] = useState({
    supplier_id: "", nomor: "", judul: "", berlaku_dari: "", berlaku_sampai: "", pagu_nilai: "",
  });
  const [itemPayung, setItemPayung] = useState([{ uraian: "", satuan: "", harga_satuan: "", kuota: "" }]);
  const [formNota, setFormNota] = useState({ supplier_id: "", nomor: "", jumlah: "", alasan: "" });

  // Setujui/Tolak/Terapkan nota kredit — TAMBAHAN Task 18, tak ada di versi PM.
  const [sheetPutuskan, setSheetPutuskan] = useState<HasilNotaKreditPM | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [memutuskan, setMemutuskan] = useState(false);
  const [galatPutus, setGalatPutus] = useState<string | null>(null);
  const [menerapkan, setMenerapkan] = useState<string | null>(null);

  const { data, memuat, galat } = useData<RespPengadaanLanjutan>("/api/v1/pengadaan-lanjutan");
  // Dropdown pemilih supplier — daftar aktif tenant, cukup sekali per buka
  // halaman (bukan per-keystroke). Endpoint HANYA `authenticate` (Task 24).
  const { data: dataSupplier } = useData<RespSupplierDaftar>("/api/v1/procurement/suppliers");
  const suppliers = dataSupplier?.suppliers ?? [];

  async function buatKontrak() {
    if (!formPayung.supplier_id || !formPayung.nomor.trim() || !formPayung.judul.trim()
      || !formPayung.berlaku_dari || !formPayung.berlaku_sampai) {
      setGalatForm("Pemasok, nomor, judul, dan masa berlaku wajib diisi.");
      return;
    }
    const item = itemPayung.filter((i) => i.uraian.trim() && i.harga_satuan && i.kuota);
    if (item.length === 0) { setGalatForm("Minimal satu item kontrak wajib diisi."); return; }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/pengadaan-lanjutan/kontrak", {
        supplier_id: formPayung.supplier_id, nomor: formPayung.nomor.trim(), judul: formPayung.judul.trim(),
        berlaku_dari: formPayung.berlaku_dari, berlaku_sampai: formPayung.berlaku_sampai,
        pagu_nilai: formPayung.pagu_nilai ? Number(formPayung.pagu_nilai) : undefined,
        item: item.map((i) => ({
          uraian: i.uraian.trim(), satuan: i.satuan.trim(),
          harga_satuan: Number(i.harga_satuan), kuota: Number(i.kuota),
        })),
      });
      setSheetPayung(false);
      setFormPayung({ supplier_id: "", nomor: "", judul: "", berlaku_dari: "", berlaku_sampai: "", pagu_nilai: "" });
      setItemPayung([{ uraian: "", satuan: "", harga_satuan: "", kuota: "" }]);
      invalidasi("/api/v1/pengadaan-lanjutan");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuat kontrak payung"));
    } finally {
      setMengirim(false);
    }
  }

  async function buatNota() {
    if (!formNota.supplier_id || !formNota.nomor.trim() || !formNota.jumlah || formNota.alasan.trim().length < 10) {
      setGalatForm("Pemasok, nomor, jumlah wajib diisi; alasan minimal 10 karakter.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/pengadaan-lanjutan/nota-kredit", {
        supplier_id: formNota.supplier_id, nomor: formNota.nomor.trim(),
        jumlah: Number(formNota.jumlah), alasan: formNota.alasan.trim(),
      });
      setSheetNota(false);
      setFormNota({ supplier_id: "", nomor: "", jumlah: "", alasan: "" });
      invalidasi("/api/v1/pengadaan-lanjutan");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuat nota kredit"));
    } finally {
      setMengirim(false);
    }
  }

  // Setujui (setujui=true) atau tolak (setujui=false, alasan wajib ≥10
  // karakter — divalidasi di sini untuk UX, backend tetap sumber kebenaran
  // di `pengadaan-lanjutan.ts:592-596`).
  async function putuskan(id: string, setujui: boolean) {
    if (!setujui && alasanTolak.trim().length < 10) {
      setGalatPutus("Alasan penolakan wajib minimal 10 karakter.");
      return;
    }
    setMemutuskan(true);
    setGalatPutus(null);
    try {
      await api.patch(`/api/v1/pengadaan-lanjutan/nota-kredit/${id}/putuskan`, {
        setujui,
        alasan_tolak: setujui ? undefined : alasanTolak.trim(),
      });
      setSheetPutuskan(null);
      setAlasanTolak("");
      invalidasi("/api/v1/pengadaan-lanjutan");
    } catch (e) {
      // SoD ("pemutus harus orang lain", 403) dan status invalid ("hanya
      // yang diajukan bisa diputuskan", 422) DATANG dari backend sebagai
      // pesan manusiawi — diteruskan apa adanya, TIDAK diduplikasi logicnya
      // di klien (pola sama arahan Task 10 untuk approval chain).
      setGalatPutus(pesanGalat(e as GalatApi, "Gagal memutuskan nota kredit"));
    } finally {
      setMemutuskan(false);
    }
  }

  async function terapkan(id: string) {
    setMenerapkan(id);
    setGalatPutus(null);
    try {
      await api.patch(`/api/v1/pengadaan-lanjutan/nota-kredit/${id}/terapkan`, {});
      invalidasi("/api/v1/pengadaan-lanjutan");
    } catch (e) {
      setGalatPutus(pesanGalat(e as GalatApi, "Gagal menerapkan nota kredit"));
    } finally {
      setMenerapkan(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{
        fontSize: "var(--t-judul)", fontWeight: 700,
        color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em",
      }}>
        Kontrak Payung & Pengadaan Lanjutan
      </h1>

      <div role="tablist" aria-label="Bagian pengadaan lanjutan" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          { key: "payung", label: `Kontrak Payung${data ? ` (${data.kontrakPayung.aktif})` : ""}` },
          { key: "expediting", label: `Expediting${data && data.expediting.kritis > 0 ? ` (${data.expediting.kritis} kritis)` : ""}` },
          { key: "nota", label: `Nota Kredit${data && data.notaKredit.menggantung > 0 ? ` (${data.notaKredit.menggantung})` : ""}` },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 14px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", minHeight: 32,
              border: `1px solid ${tab === t.key ? "var(--navy)" : "var(--border)"}`,
              background: tab === t.key ? "var(--info-bg)" : "var(--surface)",
              color: tab === t.key ? "var(--navy)" : "var(--text-secondary)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {memuat && <SkeletonCard tinggi={140} />}
      {galat && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
      )}

      {!memuat && data && tab === "payung" && (
        <div role="tabpanel" id="panel-payung" aria-labelledby="tab-payung" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            type="button"
            onClick={() => { setGalatForm(null); setSheetPayung(true); }}
            aria-label="Buat kontrak payung baru"
            style={{
              display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", padding: "8px 14px",
              borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)",
              color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40,
            }}
          >
            <Plus size={16} aria-hidden="true" /> Kontrak Baru
          </button>
          {data.kontrakPayung.kontrak.length === 0 && (
            <EmptyState icon={FileText} judul="Belum ada kontrak payung" deskripsi="Buat kontrak payung untuk harga & kuota yang disepakati di muka." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.kontrakPayung.kontrak.map((k) => (
              <div
                key={k.id}
                style={{
                  background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)",
                  border: `1px solid ${k.aktifTapiTakBisaDipakai ? "var(--danger-border)" : "var(--border)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nomor}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{k.judul ?? "—"} · {k.pemasok_nama ?? "—"}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: WARNA_STATUS_PAYUNG[k.statusNyata], flexShrink: 0 }}>
                    {LABEL_STATUS_PAYUNG[k.statusNyata]}
                  </span>
                </div>
                {k.aktifTapiTakBisaDipakai && (
                  <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle size={12} aria-hidden="true" />
                    Berstatus aktif tapi tak bisa dipakai — PO berikutnya akan ditagih di luar harga kontrak.
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                  {formatTanggal(k.berlaku_dari)} – {formatTanggal(k.berlaku_sampai)}
                  {k.sisaHari !== null && ` (${k.sisaHari >= 0 ? `${k.sisaHari} hari lagi` : "kedaluwarsa"})`}
                </div>
                {k.sisaPagu !== null && (
                  <div style={{ fontSize: 12, marginTop: 4, color: k.sisaPagu <= 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                    Sisa pagu: {formatRupiah(k.sisaPagu)}
                  </div>
                )}
                {k.itemDinilai.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {k.itemDinilai.map((it) => (
                      <div
                        key={it.id}
                        style={{
                          display: "flex", justifyContent: "space-between", fontSize: 11,
                          color: it.habis ? "var(--danger)" : it.hampirHabis ? "var(--on-warning-bg)" : "var(--text-secondary)",
                        }}
                      >
                        <span>{it.uraian}</span>
                        <span>{it.sisa} {it.satuan} tersisa ({it.persenTerpakai}% terpakai)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!memuat && data && tab === "expediting" && (
        <div role="tabpanel" id="panel-expediting" aria-labelledby="tab-expediting" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.expediting.kiriman.length === 0 && (
            <EmptyState icon={Truck} judul="Belum ada pelacakan" deskripsi="Expediting dicatat dari detail PO." />
          )}
          {data.expediting.kiriman.map((e) => (
            <div
              key={e.id}
              style={{
                background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)",
                border: `1px solid ${e.kritis ? "var(--danger-border)" : "var(--border)"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{e.po_number ?? "—"}</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{e.pemasok_nama ?? "—"}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Butuh {formatTanggal(e.butuh_tanggal)} · Janji vendor {formatTanggal(e.janji_vendor)}
                {e.sudahTiba && ` · Tiba ${formatTanggal(e.tiba_aktual)}`}
              </div>
              {e.telatHari !== null && e.telatHari > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: e.kritis ? "var(--danger)" : "var(--on-warning-bg)", marginTop: 4 }}>
                  Telat {e.telatHari} hari dari kebutuhan{e.kritis ? " — KRITIS" : ""}
                </div>
              )}
              {e.janjiSudahTelat && (
                <div style={{ fontSize: 11, color: "var(--on-warning-bg)", marginTop: 2 }}>
                  Vendor menjanjikan tanggal yang sudah lebih lambat dari kebutuhan kita.
                </div>
              )}
              {e.sebab_tertahan && (
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Tertahan: {e.sebab_tertahan}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {!memuat && data && tab === "nota" && (
        <div role="tabpanel" id="panel-nota" aria-labelledby="tab-nota" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            type="button"
            onClick={() => { setGalatForm(null); setSheetNota(true); }}
            aria-label="Buat nota kredit baru"
            style={{
              display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", padding: "8px 14px",
              borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)",
              color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40,
            }}
          >
            <Plus size={16} aria-hidden="true" /> Nota Kredit Baru
          </button>
          {galatPutus && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatPutus}</div>}
          {data.notaKredit.nota.length === 0 && (
            <EmptyState icon={ReceiptText} judul="Belum ada nota kredit" deskripsi="Catat retur/koreksi tagihan supplier di sini." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.notaKredit.nota.map((n) => (
              <div
                key={n.id}
                style={{
                  background: "var(--surface)", borderRadius: 16, padding: "var(--pad-kartu-lega)",
                  border: `1px solid ${n.menggantung ? "var(--danger-border)" : "var(--border)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{n.nomor}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {formatRupiah(n.jumlahAngka)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{n.pemasok_nama ?? "—"} · {formatTanggal(n.tanggal)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginTop: 4 }}>
                  {LABEL_STATUS_NOTA[n.status] ?? n.status}
                </div>
                {n.menggantung && (
                  <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle size={12} aria-hidden="true" />
                    Disetujui {n.umurSetujuHari} hari lalu, belum diterapkan — potongan disepakati tapi tagihan penuh tetap dibayar.
                  </div>
                )}

                {/* Setujui/Tolak — TAMBAHAN Task 18, tak ada di versi PM.
                    TETAP DIRENDER walau pengaju = user saat ini (backend
                    menolak dengan pesan SoD-nya sendiri, TIDAK diduplikasi
                    di sini — lihat komentar kepala berkas). */}
                {n.status === "diajukan" && bolehPutuskan && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => { setSheetPutuskan(n); setAlasanTolak(""); setGalatPutus(null); }}
                      disabled={memutuskan}
                      style={{
                        flex: 1, minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                        background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)",
                        fontSize: 13, fontWeight: 700, cursor: memutuskan ? "default" : "pointer",
                      }}
                    >
                      Tolak
                    </button>
                    <button
                      type="button"
                      onClick={() => void putuskan(n.id, true)}
                      disabled={memutuskan}
                      style={{
                        flex: 1, minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                        background: memutuskan ? "var(--surface-subtle)" : "var(--success-bg)",
                        color: memutuskan ? "var(--text-muted)" : "var(--success)",
                        border: `1px solid ${memutuskan ? "var(--border)" : "var(--success-border)"}`,
                        fontSize: 13, fontWeight: 700, cursor: memutuskan ? "default" : "pointer",
                      }}
                    >
                      {memutuskan ? "Menyetujui…" : "Setujui"}
                    </button>
                  </div>
                )}
                {n.status === "disetujui" && bolehPutuskan && (
                  <button
                    type="button"
                    onClick={() => void terapkan(n.id)}
                    disabled={menerapkan === n.id}
                    style={{
                      width: "100%", minHeight: 40, marginTop: 10, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                      background: menerapkan === n.id ? "var(--surface-subtle)" : "var(--grad-aksen)",
                      color: menerapkan === n.id ? "var(--text-muted)" : "var(--on-navy)",
                      border: "none", fontSize: 13, fontWeight: 700,
                      cursor: menerapkan === n.id ? "default" : "pointer",
                    }}
                  >
                    {menerapkan === n.id ? "Menerapkan…" : "Terapkan Potongan"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <BottomSheet terbuka={sheetPayung} onTutup={() => setSheetPayung(false)} judul="Kontrak Payung Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Pemasok *</span>
            <select
              value={formPayung.supplier_id}
              onChange={(e) => setFormPayung((f) => ({ ...f, supplier_id: e.target.value }))}
              style={GAYA_INPUT}
            >
              <option value="">Pilih pemasok…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Nomor *</span>
            <input value={formPayung.nomor} onChange={(e) => setFormPayung((f) => ({ ...f, nomor: e.target.value }))} style={GAYA_INPUT} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Judul *</span>
            <input value={formPayung.judul} onChange={(e) => setFormPayung((f) => ({ ...f, judul: e.target.value }))} style={GAYA_INPUT} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <span style={GAYA_LABEL}>Berlaku Dari *</span>
              <input
                type="date"
                value={formPayung.berlaku_dari}
                onChange={(e) => setFormPayung((f) => ({ ...f, berlaku_dari: e.target.value }))}
                style={GAYA_INPUT}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <span style={GAYA_LABEL}>Sampai *</span>
              <input
                type="date"
                value={formPayung.berlaku_sampai}
                onChange={(e) => setFormPayung((f) => ({ ...f, berlaku_sampai: e.target.value }))}
                style={GAYA_INPUT}
              />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Pagu Nilai</span>
            <input
              type="number"
              min={0}
              value={formPayung.pagu_nilai}
              onChange={(e) => setFormPayung((f) => ({ ...f, pagu_nilai: e.target.value }))}
              style={GAYA_INPUT}
            />
          </label>

          <div style={GAYA_LABEL}>Item Kontrak *</div>
          {itemPayung.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <label style={{ flex: 2 }}>
                <span className="sr-only">Uraian item {i + 1}</span>
                <input
                  placeholder="Uraian"
                  value={it.uraian}
                  onChange={(e) => setItemPayung((p) => p.map((x, idx) => (idx === i ? { ...x, uraian: e.target.value } : x)))}
                  style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, width: "100%" }}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="sr-only">Satuan item {i + 1}</span>
                <input
                  placeholder="Satuan"
                  value={it.satuan}
                  onChange={(e) => setItemPayung((p) => p.map((x, idx) => (idx === i ? { ...x, satuan: e.target.value } : x)))}
                  style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, width: "100%" }}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="sr-only">Harga satuan item {i + 1}</span>
                <input
                  type="number"
                  placeholder="Harga"
                  value={it.harga_satuan}
                  onChange={(e) => setItemPayung((p) => p.map((x, idx) => (idx === i ? { ...x, harga_satuan: e.target.value } : x)))}
                  style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, width: "100%" }}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="sr-only">Kuota item {i + 1}</span>
                <input
                  type="number"
                  placeholder="Kuota"
                  value={it.kuota}
                  onChange={(e) => setItemPayung((p) => p.map((x, idx) => (idx === i ? { ...x, kuota: e.target.value } : x)))}
                  style={{ minHeight: 40, padding: "0 8px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, width: "100%" }}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItemPayung((p) => [...p, { uraian: "", satuan: "", harga_satuan: "", kuota: "" }])}
            style={{
              minHeight: 36, borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
              border: "1px dashed var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            + Tambah item
          </button>

          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button
            type="button"
            onClick={() => void buatKontrak()}
            disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              cursor: mengirim ? "default" : "pointer",
            }}
          >
            {mengirim ? "Membuat…" : "Buat Kontrak"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetNota} onTutup={() => setSheetNota(false)} judul="Nota Kredit Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Pemasok *</span>
            <select
              value={formNota.supplier_id}
              onChange={(e) => setFormNota((f) => ({ ...f, supplier_id: e.target.value }))}
              style={GAYA_INPUT}
            >
              <option value="">Pilih pemasok…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Nomor *</span>
            <input value={formNota.nomor} onChange={(e) => setFormNota((f) => ({ ...f, nomor: e.target.value }))} style={GAYA_INPUT} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Jumlah *</span>
            <input
              type="number"
              min={0}
              value={formNota.jumlah}
              onChange={(e) => setFormNota((f) => ({ ...f, jumlah: e.target.value }))}
              style={GAYA_INPUT}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={GAYA_LABEL}>Alasan * (min. 10 karakter)</span>
            <textarea
              value={formNota.alasan}
              onChange={(e) => setFormNota((f) => ({ ...f, alasan: e.target.value }))}
              rows={3}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }}
            />
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button
            type="button"
            onClick={() => void buatNota()}
            disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              cursor: mengirim ? "default" : "pointer",
            }}
          >
            {mengirim ? "Membuat…" : "Buat Nota Kredit"}
          </button>
        </div>
      </BottomSheet>

      {/* Tolak Nota Kredit — pola sama BottomSheet penolakan admin-portal/inbox
          (Task 4): textarea alasan wajib min. 10 karakter, submit memanggil
          `putuskan(id, false)`. */}
      <BottomSheet
        terbuka={!!sheetPutuskan}
        onTutup={() => { setSheetPutuskan(null); setAlasanTolak(""); setGalatPutus(null); }}
        judul="Tolak Nota Kredit"
      >
        {sheetPutuskan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {sheetPutuskan.nomor} · {formatRupiah(sheetPutuskan.jumlahAngka)}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={GAYA_LABEL}>Alasan penolakan * (min. 10 karakter)</span>
              <textarea
                value={alasanTolak}
                onChange={(e) => setAlasanTolak(e.target.value)}
                rows={3}
                style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
              />
            </label>
            {galatPutus && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatPutus}</div>}
            <button
              type="button"
              onClick={() => void putuskan(sheetPutuskan.id, false)}
              disabled={memutuskan}
              style={{
                minHeight: 48, borderRadius: "var(--portal-radius-pill)", fontSize: 14, fontWeight: 700, border: "none",
                background: memutuskan ? "var(--surface-subtle)" : "var(--danger)",
                color: memutuskan ? "var(--text-muted)" : "var(--on-navy)",
                cursor: memutuskan ? "default" : "pointer",
              }}
            >
              {memutuskan ? "Menolak…" : "Tolak Nota Kredit"}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
