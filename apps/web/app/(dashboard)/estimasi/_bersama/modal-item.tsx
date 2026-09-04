"use client";

/**
 * MODAL ITEM RAB — tambah item, jelaskan angkanya, terapkan ke RAB proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DISALIN dari berkas lama, BUKAN ditulis ulang
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ketiga modal ini memuat keputusan yang lahir dari cacat nyata, dan tiap
 * keputusan itu mahal kalau hilang saat dipindahkan:
 *
 *   • **BUK tidak berdefault "10".** Sampai 2026-08-12 nilai awalnya "10" —
 *     sepuluh persen jadi angka bawaan tanpa seorang pun memutuskannya,
 *     padahal API-nya sendiri menolak default ("tidak ada default"). Sekarang
 *     kosong, lalu diisi dari markup perusahaan yang BERLAKU, dan layar
 *     menyebutkan dari mana angkanya datang.
 *
 *   • **Analisa perusahaan wajib ikut terdaftar.** Versi sebelumnya hanya
 *     memanggil `?edition=…`, dan itu membuang seluruh 423 analisa company
 *     (edition_id mereka NULL) — analisa yang justru dibuat untuk dipakai
 *     tak pernah bisa dipilih saat menyusun RAB.
 *
 *   • **limit 5.000, bukan 200.** Dropdown yang memotong di 200 dari 2.620
 *     analisa berarti pekerjaan yang dicari sering tak ada di daftar, tanpa
 *     penjelasan apa pun.
 *
 *   • **Dropdown bisa dicari & dikelompokkan.** `<select>` asli hanya bisa
 *     diloncati per huruf awal; dengan 3.040 analisa itu praktis tak terpakai.
 *
 * Yang BERUBAH cuma rumahnya: dulu di dalam berkas 4.070 baris, sekarang
 * modul sendiri yang dipanggil `/estimasi/rab`.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { PilihCari } from "@/components/pilih-cari";
import { GAYA_ISIAN } from "@/components/isian";
import { HitungVolume, type MasukanTakeoff } from "./hitung-volume";
import { Plus, X } from "lucide-react";
import { Modal, label, btnPrimary, btnGhost } from "./kerangka";
import { Pilihan } from "@/components/pilihan";



// ── Tipe respons API yang dipakai modal ini ──────────────────────────────
export interface AsmComponent { coefficient: number; sort_order: number; resource: { code: string; name: string; category: string; unit_code: string } | null }
export interface Assembly {
  id: string; code: string; name: string; source: string; version_number: number; status: string;
  output_unit_code: string; is_import_baseline: boolean;
  edition: { code: string; name: string } | null; components: AsmComponent[];
}
export interface EstItem {
  id: string; quantity: number; amount: number; notes: string | null;
  cost_code: { code: string; name: string } | null;
  assembly: { id: string; code: string; name: string; output_unit_code: string } | null;
}
export interface VersionDetail {
  id: string; version_number: number; status: string; total_amount: number;
  edition: { code: string; name: string } | null; items: EstItem[];
}
export interface Rollup {
  estimate_version_id: string; at_date: string; ppn_rate: number;
  groups: { name: string; subtotal: number }[];
  totalBiaya: number; ppn: number; grandTotal: number;
}

export interface CostCodeOpt { id: string; code: string; name: string }

// Item tak ada di katalog (§2 AHSP-EDITION-BUILDER-DESIGN.md) — 3 mode:
//   Katalog  : assembly existing (national/company) × price book (jalur lama)
//   Custom   : buat analisa company BARU di tempat (§2.2) lalu langsung dipakai
//   Lump-sum : harga langsung, TANPA analisa (§2.3 — bukan pekerjaan beranalisa)
export function AddItemModal({ version, onClose, onDone }:
  { version: VersionDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"katalog" | "custom" | "lumpsum">("katalog");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [assemblyId, setAssemblyId] = useState("");
  const [qty, setQty] = useState("");
  const [priceDate, setPriceDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  // C1: parameter bisnis TERLIHAT & dikirim eksplisit (bukan default tersembunyi).
  //
  // ── Kosong, BUKAN "10" (G6, migrasi 301)
  //
  // Sampai 2026-08-12 baris ini berbunyi `useState("10")`, dan komentar di
  // atasnya sudah menyatakan niat yang benar sementara kodenya melakukan
  // kebalikannya: sepuluh persen menjadi angka bawaan tanpa seorang pun
  // memutuskannya. API bahkan MENOLAK default dengan tegas
  // (`ahsp.ts:411`: "tidak ada default") — penjaga itu dibatalkan diam-diam
  // oleh satu nilai awal di sini.
  //
  // Sekarang: kosong, lalu diisi dari markup perusahaan yang BERLAKU. Kalau
  // belum ditetapkan, kolomnya tetap kosong dan layar mengatakannya —
  // estimator memilih sadar, bukan mewarisi tebakan.
  const [bukPct, setBukPct] = useState("");
  const [markupBelumAda, setMarkupBelumAda] = useState(false);
  const [markupUmum, setMarkupUmum] = useState(false);
  const [roundMode, setRoundMode] = useState<"down" | "up" | "nearest" | "none">("down");
  const [roundStep, setRoundStep] = useState("100");
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Mode custom: buat analisa company baru
  const [costCodes, setCostCodes] = useState<CostCodeOpt[]>([]);
  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customCostCodeId, setCustomCostCodeId] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [customComps, setCustomComps] = useState<{ resource_code: string; coefficient: string }[]>([
    { resource_code: "", coefficient: "" },
  ]);

  // Mode lumpsum
  const [lumpCostCodeId, setLumpCostCodeId] = useState("");
  const [lumpAmount, setLumpAmount] = useState("");
  const [lumpNotes, setLumpNotes] = useState("");

  // Analisa yang bisa dipilih = analisa EDISI versi ini + SELURUH analisa
  // company. Dua panggilan, sengaja.
  //
  // Sebelumnya hanya `?edition=...`, dan itu membuang seluruh 423 analisa
  // company: `assemblies.edition_id` mereka NULL — analisa milik perusahaan
  // memang tak menempel ke edisi nasional mana pun, karena ia bukan turunan
  // SE/SNI melainkan susunan sendiri. Akibatnya analisa yang justru dibuat
  // untuk dipakai tak pernah bisa dipilih saat menyusun RAB.
  useEffect(() => {
    let batal = false;
    // limit 5.000, bukan 200: dropdown yang memotong di 200 dari 2.620 analisa
    // edisi berarti pekerjaan yang dicari sering tak ada di daftar, tanpa
    // penjelasan apa pun. Katalog ini data referensi — dimuat utuh sekali.
    const edisi = version.edition
      ? api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?edition=${encodeURIComponent(version.edition.code)}&limit=5000`)
      : api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?source=national&limit=5000`);
    const company = api.get<{ data: Assembly[] }>(`/api/v1/cecep/assemblies?source=company&limit=5000`);

    void Promise.all([edisi, company])
      .then(([e, c]) => {
        if (batal) return;
        const gabung = [...(e.data.data ?? []), ...(c.data.data ?? [])];
        // Dedup by id: analisa company yang KEBETULAN punya edition_id terisi
        // akan muncul di kedua panggilan.
        const unik = new Map(gabung.map(a => [a.id, a]));
        setAssemblies([...unik.values()].filter(a => a.status === "active"));
      })
      .catch(() => {});

    api.get<{ data: CostCodeOpt[] }>("/api/v1/cecep/cost-codes?limit=200")
      .then(r => { if (!batal) setCostCodes(r.data.data ?? []); }).catch(() => {});

    // Markup perusahaan yang BERLAKU (G6). Kalau belum ditetapkan, kolom BUK
    // dibiarkan kosong dan spanduk muncul — tak diisi angka aman.
    api.get<{ markup: { buk: number; dari_umum: boolean } | null }>(
      "/api/v1/markup/berlaku")
      .then(r => {
        if (batal) return;
        const m = r.data.markup;
        setMarkupBelumAda(!m);
        setMarkupUmum(!!m?.dari_umum);
        // Dibulatkan 2 desimal persen: 0.0825 → "8.25". Tanpa pembulatan,
        // galat titik-mengambang menampilkan "8.250000000000001".
        if (m) setBukPct(String(Math.round(m.buk * 10000) / 100));
      })
      .catch(() => { if (!batal) setMarkupBelumAda(true); });

    return () => { batal = true; };
  }, [version.edition]);

  /*
    ══════════════════════════════════════════════════════════════════════════
    MASUKAN TAKE-OFF DISIMPAN, bukan cuma hasilnya.

    Volume yang tersimpan tanpa asal-usul tak bisa diperiksa siapa pun enam
    bulan kemudian — dan itu justru alasan `takeoff_dimensi` dibangun (431).
    Kalau orang memakai kalkulator, barisnya ikut tersimpan; kalau ia mengetik
    angkanya langsung, tak ada yang disimpan dan itu memang benar.

    Server MENGHITUNG ULANG dari masukan ini; angka klien tak pernah dipercaya
    untuk apa pun yang jadi rupiah.
    ══════════════════════════════════════════════════════════════════════════
  */
  const [takeoff, setTakeoff] = useState<MasukanTakeoff | null>(null);

  /**
   * Simpan baris take-off untuk item yang baru dibuat.
   *
   * Kegagalannya TIDAK menggagalkan penambahan item: itemnya sudah tersimpan
   * dan bernilai benar, yang hilang cuma jejak perhitungannya. Melempar di sini
   * membuat orang menekan "Tambah" lagi dan menghasilkan item KEMBAR.
   */
  const simpanTakeoff = async (itemId: string) => {
    if (!takeoff) return;
    try {
      await api.post(
        `/api/v1/estimate-versions/${version.id}/items/${itemId}/takeoff-dimensi`,
        { ...takeoff, uraian: `Take-off ${takeoff.sektor ?? "dimensional"}` },
      );
    } catch (e) {
      /*
        ══════════════════════════════════════════════════════════════════════
        DILAPORKAN KE LAYAR, bukan cuma ke console.

        Versi pertama memakai `console.warn` saja — dan console tak dilihat
        siapa pun kecuali programmer yang sedang membukanya. Bagi estimator,
        take-off yang gagal tersimpan TIDAK MENINGGALKAN GEJALA: itemnya
        masuk, angkanya benar, dan jejak perhitungannya hilang tanpa suara.

        Justru jejak itulah seluruh alasan take-off dibangun. Volume 12 yang
        tak bisa ditanya "dari mana?" sama saja dengan volume yang diketik
        langsung — dan itu masalah yang hendak diselesaikannya.

        Tetap TIDAK melempar: itemnya sudah tersimpan dan bernilai benar.
        Melempar di sini membuat orang menekan "Tambah" lagi dan menghasilkan
        item KEMBAR.
        ══════════════════════════════════════════════════════════════════════
      */
      console.warn("Baris take-off gagal disimpan (item tetap tersimpan):", e);
      setErr(
        "Item tersimpan, tetapi RINCIAN take-off-nya gagal disimpan. "
        + "Volumenya benar, yang hilang catatan asal-usulnya — buka item ini "
        + "dan isi ulang take-off-nya kalau rinciannya perlu ditelusuri nanti.",
      );
    }
  };

  const submitKatalog = async () => {
    const r = await api.post<{ item?: { id: string }; id?: string }>(
      `/api/v1/estimate-versions/${version.id}/items`, {
        item_type: "assembly", assembly_id: assemblyId, quantity: Number(qty), price_date: priceDate,
        location: location || null, buk_fraction: Number(bukPct) / 100,
        rounding: { mode: roundMode, step: Number(roundStep) },
      });
    const itemId = r.data.item?.id ?? r.data.id;
    if (itemId) await simpanTakeoff(itemId);
  };
  const submitCustom = async () => {
    const created = await api.post<{ id: string }>("/api/v1/cecep/assemblies", {
      code: customCode, name: customName, cost_code_id: customCostCodeId,
      output_unit_code: customUnit,
      components: customComps
        .filter(c => c.resource_code.trim() && c.coefficient)
        .map(c => ({ resource_code: c.resource_code.trim(), coefficient: Number(c.coefficient) })),
      created_in_estimate_id: version.id,
    });
    const r = await api.post<{ item?: { id: string }; id?: string }>(
      `/api/v1/estimate-versions/${version.id}/items`, {
        item_type: "assembly", assembly_id: created.data.id, quantity: Number(qty), price_date: priceDate,
        location: location || null, buk_fraction: Number(bukPct) / 100,
        rounding: { mode: roundMode, step: Number(roundStep) },
      });
    const itemId = r.data.item?.id ?? r.data.id;
    if (itemId) await simpanTakeoff(itemId);
  };
  const submitLumpsum = async () => {
    await api.post(`/api/v1/estimate-versions/${version.id}/items`, {
      item_type: "lumpsum", cost_code_id: lumpCostCodeId, amount: Number(lumpAmount), notes: lumpNotes || undefined,
    });
  };

  const canSubmit =
    mode === "katalog" ? Boolean(assemblyId && qty) :
    mode === "custom" ? Boolean(customCode && customName && customCostCodeId && customUnit && qty
      && customComps.some(c => c.resource_code.trim() && c.coefficient)) :
    Boolean(lumpCostCodeId && lumpAmount);

  return (
    <Modal title={`Tambah Item — Versi ${version.version_number}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {([["katalog", "Dari Katalog"], ["custom", "Buat Analisa Baru"], ["lumpsum", "Harga Langsung"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)}
            style={{ ...btnGhost, borderColor: mode === k ? C.navy : C.border, color: mode === k ? C.navy : C.mid, fontWeight: mode === k ? 700 : 600 }}>
            {t}
          </button>
        ))}
      </div>

      {mode === "katalog" && (
        <>
          <span id="lbl-assembly">
            {label(`Assembly / AHSP ${version.edition ? `(edisi ${version.edition.code} + analisa perusahaan)` : "(nasional + analisa perusahaan)"}`)}
          </span>
          {/* Dropdown BISA DICARI: daftarnya memuat 3.040 analisa, dan `<select>`
              asli hanya bisa diloncati dengan huruf awal. Orang yang tahu
              barangnya tapi tak hafal urutan katalog praktis tak bisa memakainya.
              Dikelompokkan supaya jelas mana milik perusahaan sendiri dan mana
              turunan edisi nasional — asalnya menentukan siapa yang bertanggung
              jawab atas koefisiennya. */}
          <PilihCari
            labelId="lbl-assembly"
            value={assemblyId}
            onChange={setAssemblyId}
            placeholder="— cari pekerjaan (ketik nama atau kode) —"
            kosong="Tidak ada analisa yang cocok. Coba kata kunci lain, atau buat analisa baru."
            opsi={[
              ...assemblies.filter(a => a.source === "company").map(a => ({
                value: a.id, label: a.name,
                keterangan: `${a.code} · per ${a.output_unit_code}`,
                grup: "Analisa Perusahaan",
              })),
              ...assemblies.filter(a => a.source !== "company").map(a => ({
                value: a.id, label: a.name,
                keterangan: `${a.code} · per ${a.output_unit_code}`,
                grup: version.edition ? `Edisi ${version.edition.code}` : "Analisa Nasional",
              })),
            ]}
          />
          <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: "6px 0 0" }}>
            Tidak ketemu? Coba tab &quot;Buat Analisa Baru&quot; atau &quot;Harga Langsung&quot; (untuk pekerjaan bukan-beranalisa: lift, pompa, septictank, dll).
          </p>
        </>
      )}

      {mode === "custom" && (
        <>
          <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: "0 0 8px" }}>
            Analisa baru khusus proyek ini — tidak masuk katalog nasional/company lama.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <div>{label("Kode")}<input className="isian-fokus" style={GAYA_ISIAN} value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="mis. CUSTOM-01" /></div>
            <div>{label("Nama pekerjaan")}<input className="isian-fokus" style={GAYA_ISIAN} value={customName} onChange={e => setCustomName(e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div>{label("Kategori (cost code)")}
              <Pilihan className="isian-fokus" aria-label="Kode biaya item custom" style={GAYA_ISIAN} value={customCostCodeId} onChange={e => setCustomCostCodeId(e.target.value)}>
                <option value="">— pilih —</option>
                {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </Pilihan></div>
            <div>{label("Satuan output")}<input className="isian-fokus" style={GAYA_ISIAN} value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder="mis. m2, kg, unit" /></div>
          </div>
          {label("Komponen (resource code + koefisien)")}
          {customComps.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="isian-fokus" style={{ ...GAYA_ISIAN, flex: 2 }} value={c.resource_code} placeholder="kode resource"
                onChange={e => setCustomComps(cs => cs.map((x, xi) => xi === i ? { ...x, resource_code: e.target.value } : x))} />
              <input className="isian-fokus" style={{ ...GAYA_ISIAN, flex: 1 }} type="number" step="any" value={c.coefficient} placeholder="koefisien"
                onChange={e => setCustomComps(cs => cs.map((x, xi) => xi === i ? { ...x, coefficient: e.target.value } : x))} />
              {customComps.length > 1 && (
                <button aria-label="Hapus komponen" style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}
                  onClick={() => setCustomComps(cs => cs.filter((_, xi) => xi !== i))}><X size={16} /></button>
              )}
            </div>
          ))}
          <button style={{ ...btnGhost, marginBottom: 10 }} onClick={() => setCustomComps(cs => [...cs, { resource_code: "", coefficient: "" }])}>
            <Plus size={13} /> Tambah komponen
          </button>
          {label("Volume")}
          <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} />
          <HitungVolume onPakai={(v, m) => { setQty(String(v)); setTakeoff(m); }} />
        </>
      )}

      {(mode === "katalog" || mode === "custom") && (
        <>
          {mode === "katalog" && (
            <>{label("Volume")}
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="mis. 518.4" />
              {/*
                KALKULATOR di sebelah isian angkanya, bukan di layar terpisah.

                Take-off yang harus dibuka di halaman lain tak akan dipakai saat
                orang sedang menyusun RAB — dan itu persis yang terjadi pada
                migrasi 431: endpoint-nya lengkap sejak 2026-08-16, layarnya tak
                pernah ada, jadi volume tetap diketik tangan.
              */}
              <HitungVolume onPakai={(v, m) => { setQty(String(v)); setTakeoff(m); }} /></>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>{label("Tanggal harga (price book)")}
              <input className="isian-fokus" aria-label="Tanggal" style={GAYA_ISIAN} type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} /></div>
            <div>{label("Lokasi harga (opsional)")}
              <input className="isian-fokus" style={GAYA_ISIAN} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>{label("BUK %")}
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" max="100" step="any"
                value={bukPct} onChange={e => setBukPct(e.target.value)}
                aria-describedby="buk-asal" />
              {/* Dari mana angkanya. Kolom terisi tanpa keterangan tak bisa
                  dibedakan dari kolom yang diketik sendiri — dan itu justru
                  keadaan yang G6 perbaiki. */}
              <span id="buk-asal" style={{
                display: "block", fontSize: "var(--t-kecil)", marginTop: 3, lineHeight: 1.45,
                color: markupBelumAda ? "var(--danger)" : "var(--text-muted)",
              }}>
                {markupBelumAda
                  ? "Markup perusahaan belum ditetapkan — isi sendiri, atau tetapkan di Pengaturan → Markup & Margin."
                  : markupUmum
                    ? "Dari markup umum perusahaan (bukan khusus jenis pekerjaan ini)."
                    : "Dari markup perusahaan yang berlaku."}
              </span></div>
            <div>{label("Pembulatan")}
              <Pilihan className="isian-fokus" aria-label="Metode pembulatan" style={GAYA_ISIAN} value={roundMode} onChange={e => setRoundMode(e.target.value as typeof roundMode)}>
                <option value="down">ROUNDDOWN</option><option value="up">ROUNDUP</option>
                <option value="nearest">ROUND</option><option value="none">Tanpa</option>
              </Pilihan></div>
            <div>{label("Kelipatan (Rp)")}
              <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" value={roundStep} onChange={e => setRoundStep(e.target.value)} /></div>
          </div>
        </>
      )}

      {mode === "lumpsum" && (
        <>
          <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: "0 0 8px" }}>
            Untuk pekerjaan yang bukan analisa AHSP (lift, pompa, septictank, air kerja, dll) — harga langsung, tanpa koefisien.
          </p>
          {label("Kategori (cost code)")}
          <Pilihan className="isian-fokus" aria-label="Kode biaya item lump-sum" style={GAYA_ISIAN} value={lumpCostCodeId} onChange={e => setLumpCostCodeId(e.target.value)}>
            <option value="">— pilih —</option>
            {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Pilihan>
          {label("Jumlah (Rp)")}
          <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={lumpAmount} onChange={e => setLumpAmount(e.target.value)} />
          {label("Catatan (opsional)")}
          <input className="isian-fokus" style={GAYA_ISIAN} value={lumpNotes} onChange={e => setLumpNotes(e.target.value)} placeholder="mis. Sewa lift barang 1 bulan" />
        </>
      )}

      {err && (
        <div style={{ background: C.redBg, borderRadius: 6, padding: "8px 12px", marginTop: 10 }}>
          <p style={{ color: C.red, fontSize: 12, margin: 0 }}>{err}</p>
          {missing.length > 0 && (
            <p style={{ color: C.red, fontSize: 12, margin: "4px 0 0" }}>
              Harga belum ada di Price Book untuk: <b>{missing.join(", ")}</b> — isi lewat Master Data → Price Book.
            </p>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button style={btnGhost} onClick={onClose}>Batal</button>
        <button style={btnPrimary} disabled={busy || !canSubmit} onClick={async () => {
          setBusy(true); setErr(""); setMissing([]);
          try {
            if (mode === "katalog") await submitKatalog();
            else if (mode === "custom") await submitCustom();
            else await submitLumpsum();
            await onDone();
          } catch (e) {
            const resp = (e as { response?: { data?: { error?: string; missing?: string[]; unknown?: string[] } } }).response?.data;
            setErr(resp?.error ?? "Gagal menambah item");
            setMissing(resp?.missing ?? resp?.unknown ?? []);
          } finally { setBusy(false); }
        }}>{mode === "lumpsum" ? "Tambah" : "Hitung & Tambah"}</button>
      </div>
    </Modal>
  );
}