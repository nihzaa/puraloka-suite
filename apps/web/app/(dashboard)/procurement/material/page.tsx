"use client";

/**
 * PROCUREMENT — KATALOG MATERIAL.
 *
 * Dipindahkan dari tab `materials`. Satu perubahan nyata di luar pemindahan:
 * tabel HTML mentah diganti `<Tabel>` dari `@/components/dasar`, yang membawa
 * serta `<caption>` tersembunyi, `<th scope="row">` di kolom pertama,
 * `tabular-nums` pada kolom angka, dan pembungkus `overflow-x` — empat hal
 * yang sebelumnya ditulis tangan dan tak pernah lengkap di semua tabel.
 */

import { useCallback, useState } from "react";
import { Plus, Search } from "lucide-react";

import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { useUnits } from "@/lib/use-units";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { Btn, Input, Memuat, Modal, Select, fmt } from "../_bersama/ui";
import { Pilihan } from "@/components/pilihan";

interface Material {
  id: string;
  name: string;
  unit: string;
  unit_price?: number | null;
  min_stock?: number | null;
  category?: { id?: string; name?: string } | null;
}

interface Kategori { id: string; name: string }

export default function MaterialPage() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "sak", category_id: "", unit_price: "", min_stock: "", description: "" });

  // Sumber tunggal satuan (master `units`); procurement menyimpan symbol-nya.
  const { units } = useUnits();

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useEffect+useState+tundaSatuTick, dipanggil dua
    kali — satu per URL, seperti dianjurkan untuk halaman ber-`Promise.all`.
  */
  const { data: dataMat, memuat: memuatMat, muatUlang: muatUlangMat } =
    useData<{ materials: Material[] }>("/api/v1/procurement/materials?is_active=true");
  const { data: dataCat, memuat: memuatCat, muatUlang: muatUlangCat } =
    useData<{ categories: Kategori[] }>("/api/v1/procurement/material-categories");
  const loading = memuatMat || memuatCat;
  const load = useCallback(async () => {
    await Promise.all([muatUlangMat(), muatUlangCat()]);
  }, [muatUlangMat, muatUlangCat]);

  // Diturunkan, bukan disalin.
  const materials = dataMat?.materials ?? [];
  const categories = dataCat?.categories ?? [];

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (!catFilter || m.category?.id === catFilter)
  );

  const save = async () => {
    if (!form.name || !form.unit) return;
    setSaving(true);
    await api.post("/api/v1/procurement/materials", {
      ...form,
      unit_price: Number(form.unit_price) || 0,
      min_stock: Number(form.min_stock) || 0,
      category_id: form.category_id || null,
    }).catch(() => null);
    setSaving(false);
    setModal(false);
    setForm({ name: "", unit: "sak", category_id: "", unit_price: "", min_stock: "", description: "" });
    void load();
  };

  const kolom: Kolom<Material>[] = [
    // `kepalaBaris`: nama material adalah identitas barisnya. Tanpa itu harga
    // satuan dibacakan tanpa menyebut material apa — dan di daftar harga, itu
    // angka tanpa pemilik.
    { kunci: "nama", judul: "Nama Material", kepalaBaris: true, render: m => m.name },
    { kunci: "kategori", judul: "Kategori", render: m => <span style={{ color: C.mid }}>{m.category?.name ?? "—"}</span> },
    { kunci: "satuan", judul: "Satuan", render: m => <span style={{ color: C.mid }}>{m.unit}</span> },
    { kunci: "harga", judul: "Harga Ref.", rata: "kanan", render: m => m.unit_price ? fmt(m.unit_price) : "—" },
    {
      kunci: "min", judul: "Stok Min.", rata: "kanan",
      render: m => (m.min_stock ?? 0) > 0
        ? <span style={{ fontWeight: 600, color: C.warning }}>{m.min_stock} {m.unit}</span>
        : <span style={{ color: C.muted }}>—</span>,
    },
  ];

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Cari material" placeholder="Cari material..."
            style={{ padding: "8px 12px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box", background: C.surface, color: C.text }}
          />
        </div>
        <Pilihan
          aria-label="Saring kategori material" value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, minWidth: 160, background: C.surface, color: C.text }}
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Pilihan>
        <Btn onClick={() => setModal(true)}><Plus size={14} aria-hidden="true" /> Tambah Material</Btn>
      </div>

      {loading ? <Memuat /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <Tabel              berpermukaan
            kolom={kolom}
            data={filtered}
            kunciBaris={m => m.id}
            caption="Katalog material: nama, kategori, satuan, harga referensi, dan stok minimum. Harga referensi dipakai sebagai estimasi awal Material Request, bukan harga final PO."
            kosong={
              <Kosong
                judul={search || catFilter ? "Tak ada material yang cocok" : "Belum ada material"}
                sebab={search || catFilter
                  ? `Saringan yang sedang aktif tak menyisakan satu pun dari ${materials.length} material. Datanya tidak hilang; longgarkan saringannya.`
                  : "Katalog material adalah daftar yang dipilih saat membuat permintaan dan pesanan. Selama kosong, Material Request tak punya apa pun untuk diminta."}
              />
            }
          />
        </div>
      )}

      {modal && (
        <Modal title="Tambah Material" onClose={() => setModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="Nama Material *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Semen Portland 50kg" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select label="Satuan *" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {units.map(u => <option key={u.code} value={u.symbol}>{u.symbol}</option>)}
              </Select>
              <Select label="Kategori" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">— Pilih Kategori —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Harga Referensi (Rp)" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} type="number" placeholder="0" />
              <Input label="Stok Minimum (reorder alert)" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} type="number" placeholder="0" />
            </div>
            <Input label="Deskripsi" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => setModal(false)}>Batal</Btn>
              <Btn loading={saving} onClick={() => void save()}>Simpan</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
