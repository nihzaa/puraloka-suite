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
 *     "Kunci RAB ini"          → under_review (angka berhenti bisa berubah)
 *
 * ── Yang TIDAK berubah
 *
 * Immutability versi terkunci, rantai approval, dan penguncian
 * `ahsp_edition_id` saat versi keluar dari draft. Semuanya Ember [C] —
 * mekanismenya utuh, hanya namanya yang diterjemahkan.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Upload, Lock, FileSpreadsheet, Layers, HelpCircle, ArrowRightLeft, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { LayarKosong } from "@/components/layar-kosong";
import { AddItemModal } from "../_bersama/modal-item";
import { JelaskanModal } from "../_bersama/modal-jelaskan";
import { TerapkanKeRabModal } from "../_bersama/modal-terapkan";
import { Pilihan } from "@/components/pilihan";
import {
  angka,
  rp,
  LABEL_STATUS,
  type ProyekRingkas,
  type StatusVersi,
} from "../_bersama/tipe";
import { tanya, minta } from "@/components/tanya";

// ── Bentuk jawaban API (dipakai apa adanya, bukan ditebak) ────────────────
interface VersiRingkas {
  id: string;
  version_number: number;
  status: StatusVersi;
  /*
    Nilai RAB. SUDAH dikirim `GET /projects/:id/scenarios` sejak lama
    (`estimate-versions.ts` memilih `total_amount` di embed versinya), hanya
    tak pernah diketik di sini sehingga tak pernah dirender.

    Akibatnya terlihat di tangkapan layar 2026-08-17: empat pil "Revisi 1–4"
    yang tak bisa dibedakan satu sama lain, padahal salah satunya
    Rp 20.056.000 dan tiga lainnya nol. Daftar RAB di /estimasi menampilkan
    angka itu, lalu pengguna mengklik masuk dan angkanya HILANG.

    `numeric` datang sebagai string dari PostgREST — karena itu union-nya
    memuat string, dan pemakainya wajib `Number()` lebih dulu.
  */
  total_amount?: number | string | null;
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
  /*
    Edisi AHSP datang BERSARANG dari PostgREST, bukan sebagai string:

        edition:ahsp_editions!…(code, name)     estimate-versions.ts:433

    Sampai 2026-08-17 tipe ini menuliskannya `string`, dan panel ringkasan
    merendernya langsung — hasilnya **"edisi [object Object]"** terpampang di
    bawah TOTAL RAB, tepat di sebelah angka yang jadi dasar penawaran.

    `tsc` tak menangkapnya: bentuknya datang dari `api.get` saat runtime, jadi
    anotasi yang salah tak pernah diadu dengan data sungguhan. Kelas cacat yang
    sama sudah tercatat di berkas ini untuk `assembly`/`cost_code` — tebakan
    "medan datar" yang lolos typecheck lalu merender "—".

    PostgREST juga bisa memulangkan embed sebagai ARRAY berisi satu, jadi
    pembacanya wajib menangani kedua bentuk.
  */
  edition?: EdisiRingkas | EdisiRingkas[] | null;
  items?: ItemVersi[];
}
interface EdisiRingkas {
  code?: string | null;
  name?: string | null;
}

/** Kode edisi untuk ditampilkan — menangani objek, array-berisi-satu, dan null. */
function kodeEdisi(e: DetailVersi["edition"]): string | null {
  const satu = Array.isArray(e) ? e[0] : e;
  return satu?.code ?? null;
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

// Lihat catatan di /estimasi/kas: useSearchParams() tanpa Suspense
// MENGHENTIKAN `next build`, bukan sekadar memperingatkan.
export default function SusunRabPage() {
  return (
    <Suspense fallback={null}>
      <IsiSusunRab />
    </Suspense>
  );
}

function IsiSusunRab() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";
  /*
    `?versi=` — RAB mana yang harus LANGSUNG terbuka.

    Daftar RAB di /estimasi menautkan baris tertentu
    (`/estimasi/rab?proyek=X&versi=Y`), dan sampai 2026-08-17 parameter kedua
    itu DIABAIKAN: halaman berhenti di daftar pilihan, dan pengguna harus
    mencari lagi baris yang baru saja diklik. Tautan yang tak membuka apa yang
    ditunjuknya lebih buruk daripada tak bisa diklik — orang mengira sudah
    salah klik.

    Tanpa `?versi=`, perilaku lama dipertahankan: tampilkan daftar pilihan.
  */
  const versiDiminta = params.get("versi") ?? "";

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
  /** Versi yang sedang diterapkan ke RAB proyek (rab_items). */
  const [terapkan, setTerapkan] = useState<DetailVersi | null>(null);

  /**
   * Buang satu item dari RAB.
   *
   * ── Kenapa HAPUS, bukan ubah-volume-di-tempat
   *
   * Mockup menjanjikan volume bisa disunting langsung di tabel. Diukur ke
   * API: `estimate-versions.ts` punya POST dan DELETE untuk item, tetapi
   * TIDAK punya PATCH — tak ada jalan mengubah kuantitas item yang sudah
   * tersimpan. Volume bukan angka yang berdiri sendiri: mengubahnya berarti
   * menghitung ulang HSP × qty berikut snapshot harga dan pembulatannya.
   *
   * Membuat endpoint itu = menyentuh rantai hitung, dan itu di luar rombak
   * tampilan. Yang dikerjakan sekarang: jalur yang MEMANG ada dan belum
   * pernah terpasang di UI — buang lalu tambah ulang. Janji sunting-di-tempat
   * TIDAK ditampilkan sebagai kolom yang tampak bisa diklik tapi diam.
   */
  const hapusItem = async (item: ItemVersi) => {
    if (!versiDibuka) return;
    const nama = item.assembly?.name ?? item.description ?? "item ini";
    if (!(await tanya({
      judul: `Buang "${nama}" dari RAB?`,
      pesan:
        "Untuk mengubah volumenya, buang lalu tambahkan lagi dengan volume baru — " +
        "angkanya dihitung ulang dari koefisien & harga yang berlaku.",
      labelYa: "Buang",
      nada: "bahaya",
    }))) return;
    setSibuk(true); setGalat("");
    try {
      await api.delete(`/api/v1/estimate-versions/${versiDibuka.id}/items/${item.id}`);
      await bukaVersi(versiDibuka.id);
      await muatSkenario(proyekId);
    } catch (e) {
      setGalat(pesanGalat(e) ?? "Gagal membuang item");
    } finally { setSibuk(false); }
  };

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

  /*
    Buka versi dari `?versi=` — SESUDAH skenario termuat, bukan sebelumnya.

    Urutannya penting: id dicocokkan dulu ke daftar skenario proyek ini, jadi
    `?versi=` milik proyek LAIN (tautan basi, id salah tempel) tak pernah
    dibuka. Tanpa pencocokan itu halaman akan menampilkan RAB proyek A di
    bawah URL yang menyebut proyek B — kelas cacat yang persis dijaga
    `uji-rute-id-tak-basi` untuk rute `[id]`.

    Tidak dipasang di `muatSkenario` supaya efek ini tak ikut berjalan setiap
    kali daftar disegarkan sesudah aksi (revisi, kunci, hapus item) — kalau
    ikut, RAB yang sedang dibuka akan melompat balik ke versi di URL setiap
    kali pengguna menekan tombol.
  */
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

  /*
    Buka versi dari `?versi=` — SESUDAH skenario termuat, bukan sebelumnya.

    Urutannya penting: id dicocokkan dulu ke daftar skenario proyek ini, jadi
    `?versi=` milik proyek LAIN (tautan basi, id salah tempel) tak pernah
    dibuka. Tanpa pencocokan itu halaman akan menampilkan RAB proyek A di
    bawah URL yang menyebut proyek B — kelas cacat yang persis dijaga
    `uji-rute-id-tak-basi` untuk rute `[id]`.

    Ditempatkan SESUDAH `bukaVersi` dideklarasikan: `const` tidak ter-hoist,
    jadi efek yang memanggilnya dari atas akan melempar ReferenceError pada
    render pertama — dan halamannya kosong tanpa satu pun galat yang menunjuk
    sebabnya.

    Penjaga `!versiDibuka` membuatnya berjalan sekali saja: tanpa itu, tiap
    penyegaran daftar sesudah aksi (revisi, kunci, hapus item) akan melompat
    balik ke versi di URL, membatalkan apa pun yang sedang dibuka pengguna.
  */
  useEffect(() => {
    if (!versiDiminta || versiDibuka || skenario.length === 0) return;
    const ada = skenario.some((sc) =>
      (sc.versions ?? []).some((v) => v.id === versiDiminta));
    if (ada) void bukaVersi(versiDiminta);
  }, [versiDiminta, versiDibuka, skenario, bukaVersi]);

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
    const nama = await minta({
      judul: "Nama pilihan ini — supaya mudah dibandingkan.",
      pesan: "Misalnya: Spek Premium, Hemat, Revisi Klien",
      awal: `Pilihan ${skenario.length + 1}`,
      labelYa: "Buat pilihan",
    });
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
    if (!(await tanya({
      judul: "Kunci RAB ini dan kirim ke klien?",
      pesan:
        "Setelah dikunci, angkanya tak bisa berubah lagi — itu yang membuatnya " +
        "sah dipakai sebagai bukti penawaran. Kalau nanti perlu diubah, pakai " +
        "tombol Revisi (versi lama tetap tersimpan).",
      labelYa: "Kunci & kirim",
      nada: "peringatan",
    }))) return;
    setSibuk(true); setGalat("");
    try {
      /*
        PATCH, bukan POST.

        Percobaan pertama saya memakai POST dan mendapat 404 — rutenya
        terdaftar sebagai `app.patch`. Yang membuatnya sulit terlihat:
        layar TIDAK menampilkan apa pun. `pesanGalat()` membaca
        `response.data.error`, sementara 404 dari Fastify memulangkan
        `{message, error:"Not Found", statusCode}` — dan "Not Found" itu
        tertimpa pesan cadangan yang tak pernah muncul karena `setGalat`
        dipanggil dengan string kosong dari cabang lain.

        Gejalanya: tombol ditekan, tak terjadi apa-apa, tak ada keluhan.
        Persis kelas cacat yang modul ini ada untuk memberantas.
      */
      await api.patch(`/api/v1/estimate-versions/${versiId}/submit`, {});
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
              onTerapkan={() => setTerapkan(versiDibuka)}
              onHapus={hapusItem}
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

      {terapkan && (
        <TerapkanKeRabModal
          version={terapkan as never}
          onClose={() => setTerapkan(null)}
        />
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
      <Pilihan
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
      </Pilihan>
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
                      {/*
                        Nilainya ikut di pil — tanpa ini empat revisi terlihat
                        identik dan pengguna harus membuka satu per satu untuk
                        tahu mana yang berisi. Daftar RAB di /estimasi sudah
                        menampilkan angka ini; menghilangkannya di layar
                        berikutnya membuat orang mengira salah masuk.

                        null/undefined → tak ditulis sama sekali (bukan "Rp 0"):
                        "belum dihitung" beda dari "nol rupiah", dan aturan yang
                        sama sudah dipakai di kolom Nilai daftar RAB.
                      */}
                      {v.total_amount != null && (
                        <span style={{
                          fontWeight: 500,
                          opacity: aktif ? 0.85 : 0.6,
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          · {rp(Number(v.total_amount))}
                        </span>
                      )}
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
function TabelItem({ versi, rollup, onKunci, onTambah, onJelaskan, onTerapkan, onHapus, sibuk }: {
  versi: DetailVersi; rollup: Rollup | null;
  onKunci: () => void; onTambah: () => void;
  onJelaskan: (id: string) => void; onTerapkan: () => void;
  onHapus: (it: ItemVersi) => void; sibuk: boolean;
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
                background: "var(--grad-aksen)", color: C.onAksen, border: `1px solid ${C.aksen}`,
                fontSize: "var(--teks-label)", fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <Plus size={13} aria-hidden="true" /> Tambah pekerjaan
            </button>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--teks-tabel)", fontVariantNumeric: "tabular-nums" }}>
            <caption className="sr-only">
              Rincian anggaran biaya: kode pekerjaan, uraian, volume, harga
              satuan, dan jumlahnya.
            </caption>
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
              {items.map((it, i) => {
                const akhir = i === items.length - 1;
                const sel = akhir ? tdAkhir : td;
                return (
                <tr key={it.id} style={i % 2 === 1 ? { background: "var(--surface-subtle)" } : undefined}>
                  {/*
                    `th scope="row"`, bukan `td` — kode pekerjaan adalah
                    IDENTITAS barisnya. Tanpa itu pembaca layar membacakan
                    "1.250.000" tanpa menyebut baris mana yang punya, dan
                    tabel RAB berisi puluhan angka yang mirip satu sama lain.
                  */}
                  <th scope="row" style={{ ...sel, color: C.aksen, fontWeight: 600, whiteSpace: "nowrap", textAlign: "left" }}>
                    {it.assembly?.code ?? it.cost_code?.code ?? "—"}
                  </th>
                  <td style={sel}>
                    {it.assembly?.name ?? it.description ?? it.cost_code?.name ?? "—"}
                    {/* Item lump-sum tak punya analisa — dinyatakan, bukan
                        dibiarkan tampak seperti baris yang datanya hilang. */}
                    {!punyaAnalisa(it) && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        harga langsung{it.notes ? ` · ${it.notes}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ ...sel, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
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
                  <td style={{ ...sel, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {angka(hsp(it))}
                  </td>
                  <td style={{ ...sel, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
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
                  <td style={{ ...sel, textAlign: "right" }}>
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

                    {/* Buang item — hanya saat masih draft (API menolak 409
                        sesudah terkunci, dan tombol yang pasti ditolak lebih
                        buruk daripada tombol yang tak ada). */}
                    {!terkunci && (
                      <button
                        type="button"
                        onClick={() => onHapus(it)}
                        disabled={sibuk}
                        title="Buang item ini"
                        aria-label={`Buang ${it.assembly?.name ?? it.description ?? "item ini"} dari RAB`}
                        style={{
                          background: "none", border: "none",
                          cursor: sibuk ? "wait" : "pointer",
                          color: C.muted, padding: 2, marginLeft: 6,
                          display: "inline-flex", verticalAlign: "middle",
                        }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/*
        ── Hierarki panel ini disengaja (ARAH-VISUAL §3d: SATU aksen per layar)
        Total RAB adalah satu-satunya angka yang dicari orang saat membuka
        layar ini, jadi ia yang mendapat ukuran display + warna aksen. Dua
        baris di atasnya (biaya, PPN) sengaja abu-abu dan lebih kecil: mereka
        penyusun, bukan jawaban. Memberi ketiganya bobot yang sama membuat
        mata harus memilih sendiri mana yang penting — itu kerja yang
        seharusnya dikerjakan tata letak.
      */}
      <aside style={{
        border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
        background: C.surface, position: "sticky", top: 18, overflow: "hidden",
      }}>
        <div style={{
          padding: "10px 15px", borderBottom: `1px solid ${C.border}`,
          background: C.subtle,
        }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: C.muted,
          }}>Ringkasan</h2>
        </div>

        <div style={{ padding: 15 }}>
          <BarisJumlah label="Biaya pekerjaan" nilai={rollup?.totalBiaya} />
          <BarisJumlah label="PPN" nilai={rollup?.ppn} />

          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: `2px solid ${C.aksen}`,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: C.muted, marginBottom: 3,
            }}>
              Total RAB
            </div>
            <div style={{
              fontFamily: "var(--font-display), sans-serif",
              fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.aksen,
              fontVariantNumeric: "tabular-nums", lineHeight: 1.08,
              letterSpacing: "-.025em",
            }}>
              {rp(rollup?.grandTotal)}
            </div>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              {items.length} item
              {kodeEdisi(versi.edition) ? ` · edisi ${kodeEdisi(versi.edition)}` : ""}
            </p>
            <LencanaStatus status={versi.status} />
          </div>

          {!terkunci && (
            <>
              <button
                type="button"
                onClick={onKunci}
                disabled={sibuk}
                style={{
                  width: "100%", justifyContent: "center", marginTop: 14,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "var(--pad-tombol)", borderRadius: "var(--radius-dense)",
                  background: "var(--grad-aksen)", color: C.onNavy,
                  border: "none",
                  fontSize: "var(--teks-label)", fontWeight: 600,
                  fontFamily: "inherit", cursor: sibuk ? "wait" : "pointer",
                }}
              >
                <Lock size={13} aria-hidden="true" /> Kunci RAB ini
              </button>
              <p style={{
                fontSize: 11, color: C.muted, marginTop: 7,
                textAlign: "center", lineHeight: 1.5,
              }}>
                Setelah dikunci, angka tak bisa berubah diam-diam
              </p>
            </>
          )}

          {/*
            "Pakai sebagai RAB proyek" hanya muncul SETELAH terkunci.

            Menerapkan RAB yang masih draft berarti Kurva S, EVM, dan progress
            fisik mulai memakai angka yang masih bisa berubah — dan ketiganya
            membaca `rab_items`, bukan estimasi. Menawarkannya lebih awal
            mengundang basis pengukuran yang bergeser diam-diam.
          */}
          {terkunci && (
            <>
              <div style={{ height: 1, background: C.border, margin: "14px 0 12px" }} />
              <button
                type="button"
                onClick={onTerapkan}
                disabled={sibuk}
                style={{
                  width: "100%", justifyContent: "center",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "var(--pad-tombol)", borderRadius: "var(--radius-dense)",
                  background: C.surface, color: C.aksen,
                  border: `1px solid ${C.aksen}`,
                  fontSize: "var(--teks-label)", fontWeight: 600,
                  fontFamily: "inherit", cursor: sibuk ? "wait" : "pointer",
                }}
              >
                <ArrowRightLeft size={13} aria-hidden="true" /> Pakai sebagai RAB proyek
              </button>
              <p style={{
                fontSize: 11, color: C.muted, marginTop: 7,
                textAlign: "center", lineHeight: 1.5,
              }}>
                Kurva S, EVM &amp; progress fisik akan memakai angka ini
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Keadaan RAB sebagai PIL BERWARNA, bukan kalimat abu-abu di antara kalimat
 * abu-abu lain.
 *
 * "Masih disusun" dan "Terkunci — sudah dikirim" adalah perbedaan yang paling
 * mahal salah baca di layar ini: yang pertama masih bisa diubah, yang kedua
 * sudah jadi bukti penawaran ke klien. Ditulis dengan bobot yang sama seperti
 * "4 item · edisi SE-47/2026", keduanya larut jadi metadata.
 */
function LencanaStatus({ status }: { status: StatusVersi }) {
  const terkunci = status !== "draft";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8,
      padding: "var(--pad-lencana)", borderRadius: "var(--radius-pill)",
      fontSize: 11, fontWeight: 600,
      background: terkunci ? "var(--success-bg)" : "var(--surface-hover)",
      color: terkunci ? "var(--success)" : C.mid,
      border: `1px solid ${terkunci ? "var(--success-border)" : C.border}`,
    }}>
      {terkunci && <Lock size={10} aria-hidden="true" />}
      {LABEL_STATUS[status]}
    </span>
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
  borderBottom: `1px solid var(--border)`,
  whiteSpace: "nowrap",
};
/*
  Baris terakhir TANPA garis bawah.

  Tabel di dalam kartu ber-`overflow:hidden` yang tiap barisnya bergaris
  menghasilkan garis ganda di dasar kartu — satu dari baris terakhir, satu
  dari tepi kartu. Detail kecil, tapi ia yang membedakan tabel yang terasa
  disusun dari tabel yang terasa ditempel.
*/
const td: React.CSSProperties = {
  padding: "var(--pad-baris)", borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};
const tdAkhir: React.CSSProperties = { ...td, borderBottom: "none" };
const tombolTipis: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "var(--pad-tombol-kcl)", borderRadius: "var(--radius-dense)",
  border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--text-primary)", fontSize: "var(--teks-label)",
  fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

/**
 * Pesan galat yang TIDAK PERNAH DIAM.
 *
 * ── Kenapa tidak cukup `response.data.error`
 *
 * Bentuk pertama fungsi ini hanya membaca `response.data.error`. Itu benar
 * untuk galat yang DIBUAT rute ini sendiri, tetapi 404 dari Fastify berbentuk
 * `{ message, error: "Not Found", statusCode: 404 }` — dan galat jaringan
 * (server mati, CORS) tak punya `response` sama sekali.
 *
 * Akibatnya, saat `POST /submit` memulangkan 404 karena rutenya ternyata
 * `PATCH`, layar tidak menampilkan APA PUN: tombol ditekan, tak terjadi
 * apa-apa, tak ada keluhan. Bug itu baru ketahuan dari log jaringan, bukan
 * dari memakai aplikasinya.
 *
 * Sekarang ia selalu memulangkan sesuatu yang bisa dibaca manusia, dan
 * menyebut status HTTP-nya supaya cacat rute tak lagi menyamar jadi
 * "tidak terjadi apa-apa".
 */
function pesanGalat(e: unknown): string | undefined {
  const r = (e as {
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
  })?.response;

  if (!r) {
    const m = (e as { message?: string })?.message;
    return m ? `Tidak bisa menghubungi server (${m})` : "Tidak bisa menghubungi server";
  }
  const isi = r.data?.error ?? r.data?.message;
  if (isi && isi !== "Not Found") return isi;
  if (r.status === 404) return "Rute tidak ditemukan di server (404) — kemungkinan cacat versi aplikasi.";
  if (r.status === 403) return "Anda tidak punya izin untuk tindakan ini (403).";
  if (r.status === 409) return isi ?? "Tindakan ini bentrok dengan keadaan sekarang (409).";
  return isi ?? `Permintaan gagal (${r.status ?? "?"}).`;
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
