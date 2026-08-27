"use client";

// ============================================================================
// PROCUREMENT — Portal Admin/Direktur (Tahap 4, Task 21)
//
// ══════════════════════════════════════════════════════════════════════════
// BEDA STRUKTURAL DARI PORTAL PM: PROJECT-PICKER OPSIONAL, BUKAN PRASYARAT
// ══════════════════════════════════════════════════════════════════════════
//
// Portal PM MEWAJIBKAN memilih satu proyek sebelum apa pun tampil
// (`proyekAktif = proyekId || daftarProyek[0]?.id`, lalu url dibuat `null`
// selama belum ada pilihan). Itu benar untuk PM: ia bekerja per proyek.
//
// Admin/direktur bekerja LINTAS proyek. Menyalin pola PM ke sini akan
// membuat halaman ini membuka pada proyek yang kebetulan pertama secara
// abjad — dan MR mendesak di proyek lain tak terlihat sampai seseorang
// menebak harus mengganti penyaring.
//
// Server sudah mendukung ini: `project_id` OPSIONAL di ketiga endpoint, dan
// tanpa parameter itu `proyekBolehDibaca()` memulangkan seluruh
// `db.projectIds()` milik tenant. Jadi penyaring di sini adalah OPSI
// ("Semua Proyek" = bawaan), bukan gerbang.
//
// Konsekuensinya: tiap kartu WAJIB menampilkan nama proyeknya. Tanpa itu,
// daftar lintas-proyek jadi kumpulan nomor MR tanpa konteks.
//
// ── Kenapa tombol buat DIGERBANGI izin, beda dari Portal PM
//
// Portal PM menampilkan tombol create tanpa `hasPermission` karena PM
// TERBUKTI memegang `mr:manage` + `po:manage` penuh. Di sini pemakainya bisa
// role custom mana pun yang punya `settings:manage` (gerbang portal), dan
// itu TIDAK menjamin izin procurement. Menampilkan tombol yang berujung 403
// membuat orang menyimpulkan aplikasinya rusak.
//
// `useIzin` (bukan `hasPermission` langsung) karena halaman ini SSR —
// alasannya tertulis di `lib/use-izin.ts`.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { formatRupiah } from "@/lib/format";
import SegmentedTab from "@/components/portal/SegmentedTab";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type {
  ProyekPM, GalatApi, RespMrDaftar, RespPoDaftar, RespGrDaftar,
  RespMaterialDaftar, RespSupplierDaftar,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_MR: Record<string, string> = {
  draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
  partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
};
const VARIAN_MR: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
  partially_ordered: "info", fully_ordered: "approved",
};
const LABEL_PO: Record<string, string> = {
  draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan",
};
const VARIAN_PO: Record<string, VarianStatus> = {
  draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected",
};
const LABEL_GR: Record<string, string> = { draft: "Draf", confirmed: "Dikonfirmasi" };
const VARIAN_GR: Record<string, VarianStatus> = { draft: "pending", confirmed: "approved" };

/** "Semua Proyek" — sengaja string kosong supaya `?project_id=` tak dikirim. */
const SEMUA = "";

export default function AdminProcurementPage() {
  const [tab, setTab] = useState<"mr" | "po" | "gr">("mr");
  const [proyekId, setProyekId] = useState(SEMUA);
  const [sheetMr, setSheetMr] = useState(false);
  const [sheetPo, setSheetPo] = useState(false);

  const bolehBuatMr = useIzin("procurement:mr:manage");
  const bolehBuatPo = useIzin("procurement:po:manage");

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  /*
    TANPA `.filter(p => p.pm)` — itu penyaring khas Portal PM ("proyek yang
    saya pegang"). Admin/direktur melihat seluruh proyek tenant.
  */
  const daftarProyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  const qs = proyekId ? `?project_id=${encodeURIComponent(proyekId)}` : "";

  const { data: dataMr, memuat: memuatMr, galat: galatMr } =
    useData<RespMrDaftar>(tab === "mr" ? `/api/v1/procurement/material-requests${qs}` : null);
  const { data: dataPo, memuat: memuatPo, galat: galatPo } =
    useData<RespPoDaftar>(tab === "po" ? `/api/v1/procurement/purchase-orders${qs}` : null);
  const { data: dataGr, memuat: memuatGr, galat: galatGr } =
    useData<RespGrDaftar>(tab === "gr" ? `/api/v1/procurement/goods-receipts${qs}` : null);

  const { data: dataMaterial } =
    useData<RespMaterialDaftar>(sheetMr || sheetPo ? "/api/v1/procurement/materials?limit=200" : null);
  const { data: dataSupplier } =
    useData<RespSupplierDaftar>(sheetPo ? "/api/v1/procurement/suppliers?limit=200" : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={kepala}>
        <KepalaPortal judul="Procurement" />
        {tab === "mr" && bolehBuatMr && (
          <button type="button" onClick={() => setSheetMr(true)} aria-label="Buat Material Request baru" style={tombolBuat}>
            <Plus size={16} aria-hidden="true" /> MR
          </button>
        )}
        {tab === "po" && bolehBuatPo && (
          <button type="button" onClick={() => setSheetPo(true)} aria-label="Buat Purchase Order baru" style={tombolBuat}>
            <Plus size={16} aria-hidden="true" /> PO
          </button>
        )}
      </div>

      {/*
        Penyaring, bukan prasyarat — "Semua Proyek" adalah bawaan dan selalu
        tersedia. Ditampilkan hanya bila memang ada lebih dari satu proyek.
      */}
      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekId}
            onChange={(e) => setProyekId(e.target.value)}
            style={isian}
          >
            <option value={SEMUA}>Semua Proyek</option>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[
          { value: "mr", label: "Material Request" },
          { value: "po", label: "Purchase Order" },
          { value: "gr", label: "Penerimaan" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {tab === "mr" && (
        <>
          {memuatMr && <SkeletonCard tinggi={80} />}
          {galatMr && (
            <EmptyState icon={ShoppingCart} judul="Gagal memuat MR"
              deskripsi={pesanGalat(galatMr as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatMr && !galatMr && (dataMr?.material_requests?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Material Request"
              deskripsi={proyekId ? "Proyek ini belum punya permintaan material." : "Belum ada permintaan material di seluruh proyek."} />
          )}
          {!memuatMr && !galatMr && (dataMr?.material_requests ?? []).map((mr) => (
            <Link key={mr.id} href={`/admin-portal/procurement/mr/${mr.id}`} style={kartuTautan}>
              <div style={barisAtas}>
                <span style={judulKartu}>{mr.mr_number ?? "MR"}</span>
                <StatusBadge status={VARIAN_MR[mr.status] ?? "netral"} label={LABEL_MR[mr.status] ?? mr.status} />
              </div>
              {/* Nama proyek WAJIB — daftar ini lintas-proyek. */}
              <div style={metaTebal}>{mr.project?.name ?? "Proyek tak diketahui"}</div>
              <div style={meta}>
                {mr.request_date ?? "—"}
                {mr.needed_date ? ` · dibutuhkan ${mr.needed_date}` : ""} · {mr.items.length} item
              </div>
              {mr.requested_by?.name && <div style={meta}>Diminta: {mr.requested_by.name}</div>}
            </Link>
          ))}
        </>
      )}

      {tab === "po" && (
        <>
          {memuatPo && <SkeletonCard tinggi={80} />}
          {galatPo && (
            <EmptyState icon={ShoppingCart} judul="Gagal memuat PO"
              deskripsi={pesanGalat(galatPo as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatPo && !galatPo && (dataPo?.purchase_orders?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Purchase Order"
              deskripsi={proyekId ? "Proyek ini belum punya PO." : "Belum ada PO di seluruh proyek."} />
          )}
          {!memuatPo && !galatPo && (dataPo?.purchase_orders ?? []).map((po) => (
            <Link key={po.id} href={`/admin-portal/procurement/po/${po.id}`} style={kartuTautan}>
              <div style={barisAtas}>
                <span style={judulKartu}>{po.po_number ?? "PO"}</span>
                <StatusBadge status={VARIAN_PO[po.status] ?? "netral"} label={LABEL_PO[po.status] ?? po.status} />
              </div>
              <div style={metaTebal}>{po.project?.name ?? "Proyek tak diketahui"}</div>
              <div style={meta}>{po.supplier?.name ?? "—"} · {formatRupiah(po.total_amount)}</div>
              {po.expected_delivery_date && <div style={meta}>Estimasi kirim: {po.expected_delivery_date}</div>}
            </Link>
          ))}
        </>
      )}

      {tab === "gr" && (
        <>
          {memuatGr && <SkeletonCard tinggi={80} />}
          {galatGr && (
            <EmptyState icon={ShoppingCart} judul="Gagal memuat penerimaan"
              deskripsi={pesanGalat(galatGr as GalatApi, "Coba muat ulang.")} />
          )}
          {!memuatGr && !galatGr && (dataGr?.goods_receipts?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada penerimaan barang"
              deskripsi="Penerimaan dibuat dari halaman detail PO." />
          )}
          {!memuatGr && !galatGr && (dataGr?.goods_receipts ?? []).map((gr) => (
            <div key={gr.id} style={kartu}>
              <div style={barisAtas}>
                <span style={judulKartu}>{gr.gr_number ?? "GR"}</span>
                <StatusBadge status={VARIAN_GR[gr.status] ?? "netral"} label={LABEL_GR[gr.status] ?? gr.status} />
              </div>
              <div style={metaTebal}>{gr.project?.name ?? "Proyek tak diketahui"}</div>
              <div style={meta}>
                {gr.supplier?.name ?? "—"}
                {gr.po?.po_number ? ` · dari ${gr.po.po_number}` : ""} · {gr.items.length} item
              </div>
              {gr.receipt_date && <div style={meta}>Diterima: {gr.receipt_date}</div>}
            </div>
          ))}
        </>
      )}

      {sheetMr && (
        <SheetBuatMr
          proyek={daftarProyek}
          proyekTerpilih={proyekId}
          material={dataMaterial?.materials ?? []}
          tutup={() => setSheetMr(false)}
          selesai={() => { setSheetMr(false); invalidasi("/api/v1/procurement/material-requests"); }}
        />
      )}
      {sheetPo && (
        <SheetBuatPo
          proyek={daftarProyek}
          proyekTerpilih={proyekId}
          supplier={dataSupplier?.suppliers ?? []}
          material={dataMaterial?.materials ?? []}
          tutup={() => setSheetPo(false)}
          selesai={() => { setSheetPo(false); invalidasi("/api/v1/procurement/purchase-orders"); }}
        />
      )}
    </div>
  );
}

/* ── Form buat MR ─────────────────────────────────────────────────────────
   Proyek WAJIB dipilih di form meski daftar boleh "Semua Proyek": MR selalu
   melekat pada satu proyek, dan membiarkannya kosong berarti server yang
   menolak — galat yang muncul SESUDAH pengguna mengisi seluruh form.        */
function SheetBuatMr({
  proyek, proyekTerpilih, material, tutup, selesai,
}: {
  proyek: ProyekPM[];
  proyekTerpilih: string;
  material: RespMaterialDaftar["materials"];
  tutup: () => void;
  selesai: () => void;
}) {
  const [projectId, setProjectId] = useState(proyekTerpilih || proyek[0]?.id || "");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [neededDate, setNeededDate] = useState("");
  const [notes, setNotes] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const bisa = projectId && materialId && Number(qty) > 0;
  const mat = material.find((m) => m.id === materialId);

  async function simpan() {
    if (!bisa) return;
    setKirim(true);
    setGalat(null);
    try {
      await api.post("/api/v1/procurement/material-requests", {
        project_id: projectId,
        needed_date: neededDate || undefined,
        notes: notes.trim() || undefined,
        items: [{ material_id: materialId, qty_requested: Number(qty), unit: mat?.unit ?? "unit" }],
      });
      selesai();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat Material Request."));
    } finally {
      setKirim(false);
    }
  }

  return (
    <BottomSheet terbuka judul="Material Request baru" onTutup={tutup}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Isian label="Proyek">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={isian}>
            <option value="">— pilih proyek —</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Isian>

        <Isian label="Material">
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} style={isian}>
            <option value="">— pilih material —</option>
            {material.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.unit ? ` (${m.unit})` : ""}</option>
            ))}
          </select>
        </Isian>

        <Isian label={`Jumlah${mat?.unit ? ` (${mat.unit})` : ""}`}>
          <input type="number" min={0} step="any" inputMode="decimal"
            value={qty} onChange={(e) => setQty(e.target.value)} style={isian} />
        </Isian>

        <Isian label="Dibutuhkan tanggal (opsional)">
          <input type="date" value={neededDate} onChange={(e) => setNeededDate(e.target.value)} style={isian} />
        </Isian>

        <Isian label="Catatan (opsional)">
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={isian} />
        </Isian>

        {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={!bisa || kirim}
          style={{
            ...tombolSimpan,
            background: !bisa || kirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
            color: !bisa || kirim ? "var(--text-muted)" : "var(--on-navy)",
          }}>
          {kirim ? "Menyimpan…" : "Buat MR"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ── Form buat PO ──────────────────────────────────────────────────────────
   ⚠ ITEM WAJIB, minimal satu.

   Versi pertama form ini hanya mengirim proyek + supplier + tanggal, dan itu
   SELALU ditolak 400: `procurement.ts:915` menuntut
   `project_id && supplier_id && items?.length`. Ketahuan dari MEMBACA
   kontrak endpoint-nya, bukan dari typecheck — TypeScript tak tahu apa pun
   tentang bentuk body yang diterima server.

   Editor barisnya meniru Portal PM: memilih material mengisi otomatis satuan
   & harga dari katalog, tapi keduanya tetap bisa disunting (harga nego beda
   dari harga katalog, dan itu kejadian normal).                            */
function SheetBuatPo({
  proyek, proyekTerpilih, supplier, material, tutup, selesai,
}: {
  proyek: ProyekPM[];
  proyekTerpilih: string;
  supplier: RespSupplierDaftar["suppliers"];
  material: RespMaterialDaftar["materials"];
  tutup: () => void;
  selesai: () => void;
}) {
  type Baris = { material_id: string; qty: string; unit: string; harga: string };
  const KOSONG: Baris = { material_id: "", qty: "", unit: "", harga: "" };

  const [projectId, setProjectId] = useState(proyekTerpilih || proyek[0]?.id || "");
  const [supplierId, setSupplierId] = useState("");
  const [tanggalKirim, setTanggalKirim] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Baris[]>([KOSONG]);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function ubahBaris(i: number, patch: Partial<Baris>) {
    setItems((p) => p.map((b, idx) => {
      if (idx !== i) return b;
      const next = { ...b, ...patch };
      // Memilih material mengisi satuan & harga dari katalog — tetap bisa
      // disunting sesudahnya.
      if (patch.material_id) {
        const m = material.find((x) => x.id === patch.material_id);
        if (m) { next.unit = m.unit; next.harga = String(m.unit_price ?? ""); }
      }
      return next;
    }));
  }

  const valid = items.filter((it) => it.material_id && Number(it.qty) > 0 && Number(it.harga) >= 0);
  const bisa = Boolean(projectId && supplierId && valid.length > 0);
  const total = valid.reduce((t, it) => t + Number(it.qty) * Number(it.harga), 0);

  async function simpan() {
    if (!bisa) return;
    setKirim(true);
    setGalat(null);
    try {
      await api.post("/api/v1/procurement/purchase-orders", {
        project_id: projectId,
        supplier_id: supplierId,
        expected_delivery_date: tanggalKirim || undefined,
        notes: notes.trim() || undefined,
        items: valid.map((it) => ({
          material_id: it.material_id,
          qty_ordered: Number(it.qty),
          unit: it.unit,
          unit_price: Number(it.harga),
        })),
      });
      selesai();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat Purchase Order."));
    } finally {
      setKirim(false);
    }
  }

  return (
    <BottomSheet terbuka judul="Purchase Order baru" onTutup={tutup}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Isian label="Proyek">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={isian}>
            <option value="">— pilih proyek —</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Isian>

        <Isian label="Supplier">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={isian}>
            <option value="">— pilih supplier —</option>
            {supplier.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Isian>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Item ({valid.length} terisi)
          </span>
          {items.map((it, i) => (
            <div key={i} style={kotakBaris}>
              <select value={it.material_id} onChange={(e) => ubahBaris(i, { material_id: e.target.value })}
                aria-label={`Material baris ${i + 1}`} style={isian}>
                <option value="">— pilih material —</option>
                {material.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input type="number" min={0} step="any" inputMode="decimal" placeholder="Jumlah"
                  aria-label={`Jumlah baris ${i + 1}`}
                  value={it.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })} style={isian} />
                <input type="number" min={0} step="any" inputMode="decimal" placeholder="Harga satuan"
                  aria-label={`Harga satuan baris ${i + 1}`}
                  value={it.harga} onChange={(e) => ubahBaris(i, { harga: e.target.value })} style={isian} />
              </div>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                  style={tombolHapusBaris}>
                  Hapus baris
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setItems((p) => [...p, KOSONG])} style={tombolTambahBaris}>
            + Tambah item
          </button>
        </div>

        {total > 0 && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            Total: {formatRupiah(total)}
          </div>
        )}

        <Isian label="Estimasi kirim (opsional)">
          <input type="date" value={tanggalKirim} onChange={(e) => setTanggalKirim(e.target.value)} style={isian} />
        </Isian>

        <Isian label="Catatan (opsional)">
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={isian} />
        </Isian>

        {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={!bisa || kirim}
          style={{
            ...tombolSimpan,
            background: !bisa || kirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
            color: !bisa || kirim ? "var(--text-muted)" : "var(--on-navy)",
          }}>
          {kirim ? "Menyimpan…" : "Buat PO"}
        </button>
      </div>
    </BottomSheet>
  );
}


function Isian({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

const kepala: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
};
const tombolBuat: React.CSSProperties = {
  minHeight: 44, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
  background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
};
const isian: React.CSSProperties = {
  minHeight: 44, padding: "0 12px", borderRadius: 12,
  border: "1px solid var(--border)", fontSize: 14,
  background: "var(--surface)", color: "var(--text-primary)",
};
const kartu: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6, padding: 14,
  borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)",
};
const kartuTautan: React.CSSProperties = { ...kartu, textDecoration: "none" };
const barisAtas: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
};
const judulKartu: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
};
const meta: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };
const metaTebal: React.CSSProperties = { ...meta, fontWeight: 600 };
const gayaGalat: React.CSSProperties = {
  padding: 12, borderRadius: 12,
  background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 13,
};
const kotakBaris: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 8, padding: 10,
  borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)",
};
const tombolTambahBaris: React.CSSProperties = {
  minHeight: 44, borderRadius: 12, border: "1px dashed var(--border)",
  background: "var(--surface)", color: "var(--text-primary)",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const tombolHapusBaris: React.CSSProperties = {
  minHeight: 44, borderRadius: 10, border: "1px solid var(--danger-border)",
  background: "var(--surface)", color: "var(--on-danger-bg)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const tombolSimpan: React.CSSProperties = {
  minHeight: 44, borderRadius: 12, border: "none",
  fontSize: 14, fontWeight: 700, cursor: "pointer",
};
