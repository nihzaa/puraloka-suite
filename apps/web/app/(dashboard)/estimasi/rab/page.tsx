"use client";

/**
 * SUSUN RAB — layar inti modul Estimasi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIPERBAIKI DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi lama (tab "Komposer") meminta EMPAT keputusan berjargon sebelum
 * pengguna boleh menyentuh pekerjaannya:
 *
 *     pilih proyek → buat SKENARIO → buat VERSI → pilih EDISI AHSP → baru item
 *
 * Tak satu pun dari "skenario", "versi", dan "edisi" adalah kata yang dipakai
 * estimator saat bekerja. Akibatnya layar pertama modul ini berisi panduan
 * tertulis tentang cara memakai layar itu sendiri, dan diukur 2026-08-16 ia
 * merender 0 tabel.
 *
 * ── Yang menggantikannya (spec §4b)
 *
 * Satu tombol "Buat RAB". Skenario `Utama` + versi v1 dibuat DI BELAKANG
 * LAYAR. Konsep aslinya tidak dihapus — ia cuma berhenti ditanyakan di depan,
 * dan muncul kembali dengan nama yang orang pakai:
 *
 *     "+ Buat pilihan lain"    → skenario baru   (mis. spek standar vs premium)
 *     "Revisi"                 → versi baru      (v1 tetap utuh sebagai bukti)
 *     "Kunci & kirim ke klien" → versi submitted (angka berhenti bisa berubah)
 *
 * ── Yang TIDAK berubah
 *
 * Immutability versi terkunci, rantai approval, dan penguncian
 * `ahsp_edition_id` saat versi keluar dari draft. Semuanya Ember [C] —
 * mekanismenya utuh, hanya namanya yang diterjemahkan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Upload, Lock, FileSpreadsheet, Layers, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { LayarKosong } from "../_bersama/layar-kosong";
import { AddItemModal } from "../_bersama/modal-item";
import { JelaskanModal } from "../_bersama/modal-jelaskan";
import {
  angka,
  rp,
  LABEL_STATUS,
  type ProyekRingkas,
  type StatusVersi,
} from "../_bersama/tipe";

// ── Bentuk jawaban API (dipakai apa adanya, bukan ditebak) ────────────────
interface VersiRingkas {
  id: string;
  version_number: number;
  status: StatusVersi;
}
interface SkenarioLengkap {
  id: string;
  name: string;
  purpose?: string | null;
  versions: VersiRingkas[];
}
/**
 * Satu item RAB.
 *
 * `assembly` dan `cost_code` datang BERSARANG dari PostgREST
 * (`assembly:assemblies(...)` di `estimate-versions.ts:296`), bukan sebagai
 * medan datar. Percobaan pertama saya menebak `assembly_name`/`assembly_code`
 * datar — lolos typecheck karena semuanya opsional, lalu merender "—" di
 * kolom Kode dan Uraian untuk SETIAP baris.
 *
 * Kelas cacat yang sama dengan `rollup` di bawah: tipe serba-opsional
 * membuat nama medan yang salah tak pernah jadi galat, cuma diam-diam
 * undefined. Dua-duanya baru ketahuan dari LAYAR, bukan dari compiler.
 */
interface ItemVersi {
  id: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price?: number | null;
  amount?: number | null;
  assembly_id?: string | null;
  assembly?: {
    id?: string;
    code?: string | null;
    name?: string | null;
    output_unit_code?: string | null;
    source?: string | null;
  } | null;
  cost_code?: { code?: string | null; name?: string | null } | null;
  notes?: string | null;
}
interface DetailVersi {
  id: string;
  version_number: number;
  status: StatusVersi;
  edition?: string | null;
  items?: ItemVersi[];
}
/**
 * Bentuk jawaban `GET /estimate-versions/:id/rollup`.
 *
 * Nama medannya diambil dari `computeRabRollup()` di `lib/ahsp-engine.ts`,
 * BUKAN dikira-kira. Percobaan pertama saya menebak `subtotal`/`total`, dan
 * hasilnya lolos typecheck (semuanya opsional) lalu merender "—" di layar:
 * item Rp 2.500.000 masuk, PPN terhitung, tetapi Subtotal dan Total RAB
 * kosong. Tipe opsional membuat medan yang salah nama tak pernah jadi galat —
 * ia cuma diam-diam undefined.
 */
interface Rollup {
  /** Jumlah seluruh item SEBELUM PPN. */
  totalBiaya?: number;
  ppn?: number;
  /** totalBiaya + ppn. */
  grandTotal?: number;
  groups?: { name: string; subtotal: number }[];
}

export default function SusunRabPage() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";

  const { data: dataProyek } = useData<{ projects?: ProyekRingkas[] }>("/api/v1/projects");
  const proyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  const [skenario, setSkenario] = useState<SkenarioLengkap[]>([]);
  const [versiDibuka, setVersiDibuka] = useState<DetailVersi | null>(null);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(false);
  /** Modal tambah item — dibuka dari tombol di kepala tabel & empty state. */
  const [bukaTambah, setBukaTambah] = useState(false);
  /** Item yang sedang ditanya "kenapa angkanya segini?". */
  const [jelaskanId, setJelaskanId] = useState<string | null>(null);

  const muatSkenario = useCallback(async (pid: string) => {
    if (!pid) { setSkenario([]); return; }
    setMemuat(true);
    try {
      const r = await api.get<{ data: SkenarioLengkap[] }>(
        `/api/v1/projects/${pid}/scenarios`);
      setSkenario(r.data.data ?? []);
    } catch {
      setSkenario([]);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muatSkenario(proyekId);
    setVersiDibuka(null);
    setRollup(null);
  }, [proyekId, muatSkenario]);

  const bukaVersi = useCallback(async (versiId: string) => {
    const r = await api.get<{ data: DetailVersi }>(`/api/v1/estimate-versions/${versiId}`);
    setVersiDibuka(r.data.data);
    if ((r.data.data.items ?? []).length > 0) {
      try {
        const rr = await api.get<Rollup>(`/api/v1/estimate-versions/${versiId}/rollup`);
        setRollup(rr.data);
      } catch { setRollup(null); }
    } else setRollup(null);
  }, []);

  /**
   * "Buat RAB" — satu klik, tanpa pertanyaan.
   *
   * Di belakangnya tetap dua panggilan (skenario, lalu versi) persis seperti
   * versi lama. Bedanya pengguna tak diminta menamai apa pun: skenario
   * pertama SELALU bernama "Utama". Nama itu baru jadi penting kalau ada
   * skenario kedua — dan saat itu pengguna memang sedang memikirkannya.
   */
  const buatRab = async () => {
    if (!proyekId) return;
    setSibuk(true); setGalat("");
    try {
      const sc = await api.post<{ id: string }>(
        `/api/v1/projects/${proyekId}/scenarios`, { name: "Utama" });
      const v = await api.post<{ id?: string }>(`/api/v1/scenarios/${sc.data.id}/versions`, {});
      await muatSkenario(proyekId);
      if (v.data?.id) await bukaVersi(v.data.id);
    } catch (e) {
      setGalat(pesanGalat(e) ?? "Gagal membuat RAB");
    } finally {
      setSibuk(false);
    }
  };

  const buatPilihanLain = async () => {
    if (!proyekId) return;
    const nama = window.prompt(
      "Nama pilihan ini — supaya mudah dibandingkan.\n\nMisalnya: Spek Premium, Hemat, Revisi Klien",
      `Pilihan ${skenario.length + 1}`,
    );
    if (!nama?.trim()) return;
    setSibuk(true); setGalat("");
    try {
      const sc = await api.post<{ id: string }>(
        `/api/v1/projects/${proyekId}/scenarios`, { name: nama.trim() });
      await api.post(`/api/v1/scenarios/${sc.data.id}/versions`, {});
      await muatSkenario(proyekId);
    } catch (e) {
      setGalat(pesanGalat(e) ?? "Gagal membuat pilihan baru");
    } finally { setSibuk(false); }
  };

  const revisi = async (skenarioId: string) => {
    setSibuk(true); setGalat("");
    try {
      const v = await api.post<{ id?: string }>(`/api/v1/scenarios/${skenarioId}/versions`, {});
      await muatSkenario(proyekId);
      if (v.data?.id) await bukaVersi(v.data.id);
    } catch (e) {
      setGalat(pesanGalat(e) ?? "Gagal membuat revisi");
    } finally { setSibuk(false); }
  };

  const kunci = async (versiId: string) => {
    if (!window.confirm(
      "Kunci RAB ini dan kirim ke klien?\n\n" +
      "Setelah dikunci, angkanya tak bisa berubah lagi — itu yang membuatnya " +
      "sah dipakai sebagai bukti penawaran. Kalau nanti perlu diubah, pakai " +
      "tombol Revisi (versi lama tetap tersimpan).",
    )) return;
    setSibuk(true); setGalat("");
    try {
      await api.post(`/api/v1/estimate-versions/${versiId}/submit`, {});
      await muatSkenario(proyekId);
      await bukaVersi(versiId);
    } catch (e) {
      setGalat(pesanGalat(e) ?? "Gagal mengunci RAB");
    } finally { setSibuk(false); }
  };

  // ── Belum pilih proyek ──────────────────────────────────────────────────
  if (!proyekId) {
    return (
      <>
        <PemilihProyek proyek={proyek} nilai="" onPilih={(id) => router.push(`/estimasi/rab?proyek=${id}`)} />
        <LayarKosong
          ikon={<FileSpreadsheet size={21} />}
          judul="Pilih proyek dulu"
          apa="RAB selalu melekat pada satu proyek."
          kenapa="Pilih proyeknya di atas, atau buka dari daftar di Ikhtisar."
          aksi={{ label: "Lihat daftar proyek", href: "/estimasi" }}
        />
      </>
    );
  }

  const adaRab = skenario.length > 0;

  return (
    <>
      <PemilihProyek
        proyek={proyek}
        nilai={proyekId}
        onPilih={(id) => router.push(id ? `/estimasi/rab?proyek=${id}` : "/estimasi/rab")}
      />

      {galat && (
        <p role="alert" style={{
          background: "var(--danger-bg)", color: "var(--danger)",
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
          padding: "8px 12px", fontSize: "var(--teks-label)", marginBottom: 12,
        }}>{galat}</p>
      )}

      {memuat && (
        <p style={{ fontSize: "var(--teks-label)", color: C.muted }}>Memuat…</p>
      )}

      {!memuat && !adaRab && <DuaPintu onSusun={buatRab} sibuk={sibuk} />}

      {!memuat && adaRab && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>
          <DaftarPilihan
            skenario={skenario}
            versiAktif={versiDibuka?.id ?? null}
            onBuka={bukaVersi}
            onRevisi={revisi}
            onPilihanLain={buatPilihanLain}
            sibuk={sibuk}
          />
          {versiDibuka && (
            <TabelItem
              versi={versiDibuka}
              rollup={rollup}
              onKunci={() => kunci(versiDibuka.id)}
              onTambah={() => setBukaTambah(true)}
              onJelaskan={setJelaskanId}
              sibuk={sibuk}
            />
          )}
        </div>
      )}

      {bukaTambah && versiDibuka && (
        <AddItemModal
          version={versiDibuka as never}
          onClose={() => setBukaTambah(false)}
          onDone={async () => {
            setBukaTambah(false);
            await bukaVersi(versiDibuka.id);
            await muatSkenario(proyekId);
          }}
        />
      )}

      {jelaskanId && (
        <JelaskanModal itemId={jelaskanId} onClose={() => setJelaskanId(null)} />
      )}
    </>
  );
}

// ── Pemilih proyek ────────────────────────────────────────────────────────
function PemilihProyek({ proyek, nilai, onPilih }: {
  proyek: ProyekRingkas[]; nilai: string; onPilih: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <select
        className="isian-fokus"
        aria-label="Proyek"
        value={nilai}
        onChange={(e) => onPilih(e.target.value)}
        style={{
          width: "min(100%, 340px)",
          padding: "9px 12px",
          border: `1px solid var(--border-strong)`,
          borderRadius: "var(--radius-dense)",
          background: C.surface,
          color: C.text,
          fontSize: "var(--teks-label)",
          fontFamily: "inherit",
        }}
      >
        <option value="">— Pilih proyek —</option>
        {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

// ── Dua pintu (spec §4a) ──────────────────────────────────────────────────
function DuaPintu({ onSusun, sibuk }: { onSusun: () => void; sibuk: boolean }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
      gap: 14,
    }}>
      <button
        type="button"
        onClick={onSusun}
        disabled={sibuk}
        style={{
          textAlign: "left",
          border: `1.5px solid ${C.aksen}`,
          borderRadius: "var(--radius-md)",
          background: "linear-gradient(180deg, var(--aksen-lembut) 0%, transparent 62%)",
          padding: 20,
          cursor: sibuk ? "wait" : "pointer",
          fontFamily: "inherit",
          color: "inherit",
          position: "relative",
        }}
      >
        <span style={{
          position: "absolute", top: 12, right: 12,
          fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: C.aksen, background: C.surface,
          padding: "3px 9px", borderRadius: "var(--radius-pill)",
          border: `1px solid ${C.aksen}`,
        }}>Paling sering</span>

        <span aria-hidden="true" style={ubin}><Plus size={20} /></span>
        <strong style={judulPintu}>Susun di sini</strong>
        <span style={isiPintu}>
          Pilih pekerjaan dari katalog AHSP, isi volumenya, harga terhitung
          otomatis dari price book.
        </span>
      </button>

      <Link href="/proyek" style={{
        textAlign: "left",
        border: `1.5px solid ${C.border}`,
        borderRadius: "var(--radius-md)",
        background: C.surface,
        padding: 20,
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}>
        <span aria-hidden="true" style={ubin}><Upload size={20} /></span>
        <strong style={judulPintu}>Unggah dari Excel</strong>
        <span style={isiPintu}>
          Sudah punya RAB dalam file Excel? Unggah di halaman Proyek — tiap
          baris dicocokkan ke analisa AHSP.
        </span>
      </Link>
    </div>
  );
}

const ubin: React.CSSProperties = {
  width: 40, height: 40, borderRadius: "var(--radius-sm)",
  background: "var(--aksen-lembut)", color: "var(--aksen)",
  display: "grid", placeItems: "center", marginBottom: 13,
};
const judulPintu: React.CSSProperties = {
  display: "block", fontFamily: "var(--font-display), sans-serif",
  fontSize: 16, fontWeight: 700, marginBottom: 5, color: "var(--text-primary)",
};
const isiPintu: React.CSSProperties = {
  display: "block", fontSize: "var(--teks-label)",
  color: "var(--text-secondary)", lineHeight: 1.55,
};

// ── Daftar pilihan (skenario) & revisi (versi) ────────────────────────────
function DaftarPilihan({ skenario, versiAktif, onBuka, onRevisi, onPilihanLain, sibuk }: {
  skenario: SkenarioLengkap[];
  versiAktif: string | null;
  onBuka: (id: string) => void;
  onRevisi: (skenarioId: string) => void;
  onPilihanLain: () => void;
  sibuk: boolean;
}) {
  return (
    <section style={{
      border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
      background: C.surface, padding: "var(--pad-kartu)",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 8, flexWrap: "wrap", marginBottom: 10,
      }}>
        <h2 style={{
          fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: C.muted,
        }}>
          {skenario.length > 1 ? `${skenario.length} pilihan RAB` : "RAB proyek ini"}
        </h2>
        <button type="button" onClick={onPilihanLain} disabled={sibuk} style={tombolTipis}>
          <Plus size={13} /> Buat pilihan lain
        </button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {skenario.map((sc) => {
          const versi = [...(sc.versions ?? [])].sort((a, b) => a.version_number - b.version_number);
          return (
            <div key={sc.id} style={{
              border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
              background: C.subtle, padding: 12,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 9,
              }}>
                <strong style={{ fontSize: "var(--teks-badan)", color: C.text }}>
                  {sc.name}
                </strong>
                <button type="button" onClick={() => onRevisi(sc.id)} disabled={sibuk} style={tombolTipis}>
                  Revisi
                </button>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {versi.length === 0 && (
                  <span style={{ fontSize: "var(--teks-label)", color: C.muted }}>
                    Belum ada isinya — klik “Revisi” untuk memulai.
                  </span>
                )}
                {versi.map((v) => {
                  const aktif = v.id === versiAktif;
                  const terkunci = v.status !== "draft";
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onBuka(v.id)}
                      aria-current={aktif ? "true" : undefined}
                      title={LABEL_STATUS[v.status]}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "var(--pad-lencana)",
                        borderRadius: "var(--radius-pill)",
                        border: `1px solid ${aktif ? C.aksen : C.border}`,
                        background: aktif ? C.aksen : C.surface,
                        color: aktif ? C.onAksen : C.text,
                        fontSize: 11, fontWeight: 600,
                        fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      {terkunci && <Lock size={10} aria-hidden="true" />}
                      Revisi {v.version_number}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Tabel item + ringkasan ────────────────────────────────────────────────
function TabelItem({ versi, rollup, onKunci, onTambah, onJelaskan, sibuk }: {
  versi: DetailVersi; rollup: Rollup | null;
  onKunci: () => void; onTambah: () => void;
  onJelaskan: (id: string) => void; sibuk: boolean;
}) {
  const items = versi.items ?? [];
  const terkunci = versi.status !== "draft";

  if (items.length === 0) {
    return (
      <LayarKosong
        ikon={<Layers size={21} />}
        judul="RAB ini belum berisi pekerjaan"
        apa="RAB tersusun dari item pekerjaan — tiap item memakai satu analisa AHSP dan volumenya."
        kenapa={terkunci
          ? "RAB ini sudah terkunci, jadi itemnya tak bisa ditambah lagi. Pakai “Revisi” untuk membuat versi baru."
          : "Belum ada satu pun item di sini."}
        aksi={terkunci
          ? { label: "Lihat katalog AHSP", href: "/master/ahsp" }
          : { label: "Tambah pekerjaan pertama", onKlik: onTambah }}
      />
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) minmax(240px, 300px)",
      gap: 14, alignItems: "start",
    }} className="rab-papan">
      <section style={{
        border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
        background: C.surface, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10, flexWrap: "wrap",
          padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
          background: C.subtle,
        }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: C.muted,
          }}>
            {items.length} item pekerjaan
          </h2>
          {!terkunci && (
            <button
              type="button"
              onClick={onTambah}
              disabled={sibuk}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "var(--pad-tombol-kcl)", borderRadius: "var(--radius-dense)",
                background: C.aksen, color: C.onAksen, border: `1px solid ${C.aksen}`,
                fontSize: "var(--teks-label)", fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <Plus size={13} aria-hidden="true" /> Tambah pekerjaan
            </button>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--teks-tabel)" }}>
            <thead>
              <tr>
                <th style={th}>Kode</th>
                <th style={th}>Uraian pekerjaan</th>
                <th style={{ ...th, textAlign: "right" }}>Volume</th>
                <th style={{ ...th, textAlign: "right" }}>HSP</th>
                <th style={{ ...th, textAlign: "right" }}>Jumlah</th>
                <th style={{ ...th, width: 1 }}><span className="sr-only">Penjelasan</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ ...td, color: C.aksen, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {it.assembly?.code ?? it.cost_code?.code ?? "—"}
                  </td>
                  <td style={td}>
                    {it.assembly?.name ?? it.description ?? it.cost_code?.name ?? "—"}
                    {/* Item lump-sum tak punya analisa — dinyatakan, bukan
                        dibiarkan tampak seperti baris yang datanya hilang. */}
                    {!punyaAnalisa(it) && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        harga langsung{it.notes ? ` · ${it.notes}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {angka(it.quantity, 2)}
                    <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>
                      {it.assembly?.output_unit_code ?? it.unit ?? ""}
                    </span>
                  </td>
                  {/*
                    HSP DITURUNKAN (amount ÷ quantity), tidak dibaca dari medan.

                    `estimate_items` tak punya kolom `unit_price` — diukur
                    2026-08-16 lewat `introspect.mjs columns`. Versi pertama
                    saya membacanya begitu saja dan kolom HSP berbunyi "—" di
                    SETIAP baris, padahal modal penjelasan di layar yang sama
                    menyebut Rp 90.800. Dua angka dari satu item yang saling
                    bertentangan lebih merusak kepercayaan daripada kolom yang
                    memang kosong.
                  */}
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {angka(hsp(it))}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {angka(it.amount)}
                  </td>
                  {/*
                    "Kenapa angkanya segini?" — janji inti modul ini, ditaruh
                    DI SEBELAH angkanya. Versi lama menaruhnya jauh dari baris
                    yang dijelaskan, jadi orang yang curiga pada satu angka
                    harus mencari dulu cara bertanya.

                    TIDAK ditampilkan untuk item harga-langsung (lump-sum).
                    Diukur 2026-08-16: menekannya di baris lump-sum memulangkan
                    404 dan modalnya berbunyi "Gagal memuat penjelasan" — dan
                    itu MENYESATKAN. Tak ada yang gagal: item lump-sum memang
                    tak punya rantai koefisien×harga untuk dijelaskan, karena
                    angkanya diketik langsung. Menawarkan tombol yang pasti
                    gagal lebih buruk daripada tak menawarkannya.
                  */}
                  <td style={{ ...td, textAlign: "right" }}>
                    {punyaAnalisa(it) ? (
                      <button
                        type="button"
                        onClick={() => onJelaskan(it.id)}
                        title="Kenapa angkanya segini?"
                        aria-label={`Kenapa angka ${it.assembly?.name ?? it.description ?? "item ini"} segini?`}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: C.muted, padding: 2, display: "inline-flex",
                        }}
                      >
                        <HelpCircle size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <span
                        title="Harga langsung — tak ada analisa untuk ditelusuri"
                        style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}
                      >
                        langsung
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside style={{
        border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
        background: C.subtle, padding: 15, position: "sticky", top: 18,
      }}>
        <h2 style={{
          fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: C.muted, marginBottom: 11,
        }}>Ringkasan</h2>

        <BarisJumlah label="Biaya pekerjaan" nilai={rollup?.totalBiaya} />
        <BarisJumlah label="PPN" nilai={rollup?.ppn} />
        <div style={{ height: 1, background: C.border, margin: "9px 0" }} />
        <div style={{ fontSize: "var(--teks-label)", color: C.mid, marginBottom: 2 }}>
          Total RAB
        </div>
        <div style={{
          fontFamily: "var(--font-display), sans-serif",
          fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.aksen,
          fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
          letterSpacing: "-.02em",
        }}>
          {rp(rollup?.grandTotal)}
        </div>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>
          {items.length} item
          {versi.edition ? ` · edisi ${versi.edition}` : ""}
          {` · ${LABEL_STATUS[versi.status]}`}
        </p>

        {!terkunci && (
          <>
            <div style={{ height: 1, background: C.border, margin: "11px 0" }} />
            <button
              type="button"
              onClick={onKunci}
              disabled={sibuk}
              style={{
                width: "100%", justifyContent: "center",
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "var(--pad-tombol)", borderRadius: "var(--radius-dense)",
                background: C.aksen, color: C.onAksen, border: `1px solid ${C.aksen}`,
                fontSize: "var(--teks-label)", fontWeight: 600,
                fontFamily: "inherit", cursor: sibuk ? "wait" : "pointer",
              }}
            >
              <Lock size={13} aria-hidden="true" /> Kunci &amp; kirim ke klien
            </button>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 7, textAlign: "center", lineHeight: 1.5 }}>
              Setelah dikunci, angka tak bisa berubah diam-diam
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function BarisJumlah({ label, nilai }: { label: string; nilai?: number | null }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "6px 0", fontSize: "var(--teks-label)", color: C.mid,
    }}>
      <span>{label}</span>
      <b style={{ color: C.text, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
        {nilai == null ? "—" : angka(nilai)}
      </b>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "var(--pad-baris)",
  fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-subtle)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "var(--pad-baris)", borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};
const tombolTipis: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "var(--pad-tombol-kcl)", borderRadius: "var(--radius-dense)",
  border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--text-primary)", fontSize: "var(--teks-label)",
  fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

function pesanGalat(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
}

/**
 * Item ini punya analisa AHSP di belakangnya?
 *
 * Item lump-sum (lift, pompa, septictank — §2.3 AHSP-EDITION-BUILDER-DESIGN)
 * sengaja TIDAK punya: harganya diketik langsung tanpa koefisien. Membedakan
 * keduanya menentukan apakah "kenapa angkanya segini?" bisa dijawab sama
 * sekali.
 */
function punyaAnalisa(it: ItemVersi): boolean {
  return Boolean(it.assembly_id ?? it.assembly?.id ?? it.assembly?.code);
}

/**
 * Harga satuan pekerjaan = jumlah ÷ volume.
 *
 * Bukan medan tersimpan: `estimate_items` menyimpan `amount` dan `quantity`,
 * tidak `unit_price`. Untuk item lump-sum (volume 1) hasilnya sama dengan
 * jumlahnya, jadi kolomnya dikosongkan supaya tak terbaca sebagai "harga
 * satuan" yang sebenarnya tak pernah dihitung.
 */
function hsp(it: ItemVersi): number | null {
  if (!punyaAnalisa(it)) return null;
  const q = Number(it.quantity);
  const a = Number(it.amount);
  if (!Number.isFinite(q) || !Number.isFinite(a) || q === 0) return null;
  return a / q;
}
