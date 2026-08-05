"use client";

/**
 * ASET & ALAT — register, mutasi, penyusutan, sewa (ROADMAP #23 · migrasi 149).
 *
 * ── Yang dijawab halaman ini
 *
 * 1. **Alat kita ada di mana?** Kolom lokasi menunjukkan proyek atau gudang.
 *    Sebelumnya jawabannya cuma ada di kepala orang.
 * 2. **Berapa nilai alat kita sekarang?** Nilai buku, bukan harga beli — molen
 *    yang dibeli 5 tahun lalu bukan lagi seharga waktu itu.
 * 3. **Alat mana yang menganggur?** Utilisasi rendah = uang tertidur; alat yang
 *    tak terpakai lebih baik disewakan atau dijual.
 * 4. **Berapa yang keluar untuk sewa?** Termasuk sewa yang SEDANG berjalan —
 *    supaya tak muncul mendadak sebagai lonjakan saat ditutup.
 *
 * ── Dua tab, bukan dua halaman
 *
 * "Milik" dan "Sewa" dipisah tab karena pertanyaannya beda: aset milik soal
 * nilai buku & penyusutan, sewa soal biaya berjalan. Tapi keduanya menjawab
 * satu pertanyaan yang sama — "alat apa yang saya punya dan berapa biayanya" —
 * jadi memisahkannya jadi dua halaman memaksa orang mengingat mana yang mana.
 *
 * ── Kenapa status pakai warna DAN teks
 *
 * WCAG 1.4.1: warna saja tak boleh jadi satu-satunya pembawa makna. Pemakai
 * di lapangan sering membaca di HP di bawah sinar matahari, tempat perbedaan
 * warna tipis praktis hilang.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Package, Wallet, TrendingDown, Wrench, MapPin, AlertTriangle,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

import { C } from "@/lib/warna-ui";

type StatusAset = "tersedia" | "dipakai" | "perawatan" | "rusak" | "dilepas";

interface Aset {
  id: string; asset_code: string; name: string; category: string;
  ownership: "milik" | "sewa";
  brand: string | null; model: string | null;
  purchase_date: string | null; purchase_price: number | null;
  residual_value: number; useful_life_months: number;
  depreciation_method: string;
  current_project_id: string | null;
  status: StatusAset; condition: string;
  akumulasi_penyusutan: number; nilai_buku: number; sudah_disusutkan: boolean;
}

interface MetaAset {
  total: number; milik: number; sewa: number;
  nilai_perolehan: number; nilai_buku: number;
  dipakai: number; perawatan: number;
}

interface Sewa {
  id: string; item_name: string; project_id: string | null;
  rate: number; rate_unit: string;
  start_date: string; end_date: string | null;
  status: string; biaya_sampai_kini: number;
}

interface MetaSewa {
  total: number; berjalan: number; biaya_berjalan: number; biaya_total: number;
}

const STATUS: Record<StatusAset, { teks: string; warna: string; bg: string; border: string }> = {
  tersedia:  { teks: "Di gudang", warna: C.mid,    bg: "var(--surface-subtle)", border: C.border },
  dipakai:   { teks: "Dipakai",   warna: C.green,  bg: C.greenBg,  border: C.greenBorder },
  perawatan: { teks: "Perawatan", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  rusak:     { teks: "Rusak",     warna: C.red,    bg: C.redBg,    border: C.redBorder },
  dilepas:   { teks: "Dilepas",   warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
};

const KATEGORI: Record<string, string> = {
  alat_berat: "Alat berat", alat_ringan: "Alat ringan", kendaraan: "Kendaraan",
  scaffolding: "Scaffolding", perlengkapan: "Perlengkapan", lainnya: "Lainnya",
};

const fmtRp = (n: number | null) =>
  n == null ? "—"
  : n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export default function AsetPage() {
  const [tab, setTab] = useState<"milik" | "sewa">("milik");
  const [aset, setAset] = useState<Aset[]>([]);
  const [metaAset, setMetaAset] = useState<MetaAset | null>(null);
  const [sewa, setSewa] = useState<Sewa[]>([]);
  const [metaSewa, setMetaSewa] = useState<MetaSewa | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formBuka, setFormBuka] = useState(false);

  // `setMemuat(true)` SENGAJA tidak di sini. Fungsi ini dipanggil dari effect,
  // dan set-state sinkron di dalam effect memicu render tambahan sebelum data
  // sempat datang (`react-hooks/set-state-in-effect`). Keadaan awal sudah
  // `true`; pemanggilan ulang dari tombol/form memakai `muatUlang()` di bawah
  // yang boleh menyalakannya karena berjalan di handler, bukan di effect.
  const muat = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      api.get<{ data: Aset[]; meta: MetaAset }>("/api/v1/assets", { signal }),
      api.get<{ data: Sewa[]; meta: MetaSewa }>("/api/v1/asset-rentals", { signal }),
    ])
      .then(([a, s]) => {
        setAset(a.data.data ?? []); setMetaAset(a.data.meta);
        setSewa(s.data.data ?? []); setMetaSewa(s.data.meta);
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat data aset"); })
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  /** Muat ulang dari handler (tombol/form) — di sini spinner boleh dinyalakan. */
  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  const asetMilik = aset.filter((a) => a.ownership === "milik");

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
            Aset &amp; Alat
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.mid }}>
            Alat milik perusahaan, lokasinya sekarang, nilai bukunya, dan biaya sewa yang berjalan.
          </p>
        </div>
        <button
          onClick={() => setFormBuka((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 10, border: "none", background: C.navy, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={15} aria-hidden="true" /> {tab === "milik" ? "Aset baru" : "Sewa baru"}
        </button>
      </header>

      {formBuka && (
        <FormBaru
          jenis={tab}
          onSelesai={() => { setFormBuka(false); muatUlang(); }}
          onBatal={() => setFormBuka(false)}
        />
      )}

      {/* KPI — dipilih menurut keputusan yang dibantu, bukan sekadar angka yang tersedia */}
      {metaAset && metaSewa && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Kartu Icon={Package} label="Aset milik" nilai={String(metaAset.milik)}
            sub={`${metaAset.dipakai} sedang di proyek · ${metaAset.perawatan} perawatan`}
            warna={C.navy} bg="var(--navy-light)" border={C.border} />
          <Kartu Icon={Wallet} label="Nilai buku" nilai={fmtRp(metaAset.nilai_buku)}
            sub={metaAset.nilai_perolehan > 0
              ? `dari perolehan ${fmtRp(metaAset.nilai_perolehan)}`
              : "harga perolehan belum diisi"}
            warna={C.green} bg={C.greenBg} border={C.greenBorder} />
          <Kartu Icon={TrendingDown} label="Akumulasi penyusutan"
            nilai={fmtRp(asetMilik.reduce((s, a) => s + (a.akumulasi_penyusutan ?? 0), 0))}
            sub={asetMilik.some((a) => a.sudah_disusutkan)
              ? `${asetMilik.filter((a) => a.sudah_disusutkan).length} aset sudah dicatat`
              // "belum pernah dicatat" ≠ "penyusutannya nol" — yang kedua akan
              // membuat nilai buku terlihat sehat padahal belum dihitung.
              : "belum ada penyusutan yang dicatat"}
            warna={C.mid} bg="var(--surface-subtle)" border={C.border} />
          <Kartu Icon={Wrench} label="Sewa berjalan" nilai={fmtRp(metaSewa.biaya_berjalan)}
            sub={metaSewa.berjalan > 0
              ? `${metaSewa.berjalan} alat disewa saat ini`
              : "tak ada sewa berjalan"}
            warna={metaSewa.berjalan > 0 ? C.yellow : C.muted}
            bg={metaSewa.berjalan > 0 ? C.yellowBg : "var(--surface-subtle)"}
            border={metaSewa.berjalan > 0 ? C.yellowBorder : C.border} />
        </div>
      )}

      {/* Tab */}
      <div role="tablist" aria-label="Jenis aset" style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        {([["milik", `Milik (${metaAset?.milik ?? 0})`], ["sewa", `Sewa (${metaSewa?.total ?? 0})`]] as const).map(([k, label]) => (
          <button
            key={k} role="tab" aria-selected={tab === k}
            onClick={() => setTab(k)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === k ? 700 : 500,
              color: tab === k ? C.navy : C.mid,
              borderBottom: `2px solid ${tab === k ? C.navy : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {galat && (
        <div role="alert" style={{
          display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 12px",
          borderRadius: 10, background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 13, marginBottom: 14,
        }}>
          <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          {galat}
        </div>
      )}

      {memuat ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Memuat…</p>
      ) : tab === "milik" ? (
        <TabelAset baris={asetMilik} />
      ) : (
        <TabelSewa baris={sewa} />
      )}
    </div>
  );
}

function Kartu({ Icon, label, nilai, sub, warna, bg, border }: {
  Icon: typeof Package; label: string; nilai: string; sub: string;
  warna: string; bg: string; border: string;
}) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <Icon size={14} color={warna} aria-hidden="true" />
        <span style={{ fontSize: 11, fontWeight: 700, color: warna, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
        {nilai}
      </div>
      <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function TabelAset({ baris }: { baris: Aset[] }) {
  if (!baris.length) {
    return (
      <Kosong
        judul="Belum ada aset terdaftar"
        pesan="Daftarkan alat milik perusahaan supaya lokasinya terlacak dan nilai bukunya terhitung."
      />
    );
  }
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
        <thead>
          <tr style={{ background: "var(--surface-subtle)" }}>
            {["Kode", "Nama", "Kategori", "Status", "Perolehan", "Nilai buku", "Penyusutan"].map((h, i) => (
              <th key={h} scope="col" style={{
                padding: "8px 12px", textAlign: i >= 4 ? "right" : "left",
                fontSize: 11, fontWeight: 700, color: C.mid,
                textTransform: "uppercase", letterSpacing: 0.4,
                borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.map((a) => {
            const s = STATUS[a.status] ?? STATUS.tersedia;
            return (
              <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
                  {a.asset_code}
                </td>
                <td style={{ padding: "8px 12px", color: C.text }}>
                  {a.name}
                  {(a.brand || a.model) && (
                    <span style={{ color: C.muted, fontSize: 11, display: "block" }}>
                      {[a.brand, a.model].filter(Boolean).join(" ")}
                    </span>
                  )}
                </td>
                <td style={{ padding: "8px 12px", color: C.mid, whiteSpace: "nowrap" }}>
                  {KATEGORI[a.category] ?? a.category}
                </td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                  {/* Warna DAN teks — WCAG 1.4.1 */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
                  }}>
                    {a.status === "dipakai" && <MapPin size={10} aria-hidden="true" />}
                    {s.teks}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: C.mid, whiteSpace: "nowrap" }}>
                  {fmtRp(a.purchase_price)}
                  <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                    {fmtTgl(a.purchase_date)}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
                  {fmtRp(a.nilai_buku)}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {a.sudah_disusutkan ? (
                    <span style={{ color: C.mid }}>{fmtRp(a.akumulasi_penyusutan)}</span>
                  ) : (
                    /* Dibedakan dari "Rp 0" — belum dicatat bukan berarti nol. */
                    <span style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>belum dicatat</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabelSewa({ baris }: { baris: Sewa[] }) {
  if (!baris.length) {
    return (
      <Kosong
        judul="Belum ada sewa alat tercatat"
        pesan="Catat sewa alat supaya biayanya terlihat per proyek — termasuk sewa yang masih berjalan."
      />
    );
  }
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
        <thead>
          <tr style={{ background: "var(--surface-subtle)" }}>
            {["Alat", "Tarif", "Mulai", "Selesai", "Status", "Biaya s.d. kini"].map((h, i) => (
              <th key={h} scope="col" style={{
                padding: "8px 12px", textAlign: i >= 5 ? "right" : "left",
                fontSize: 11, fontWeight: 700, color: C.mid,
                textTransform: "uppercase", letterSpacing: 0.4,
                borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.map((r) => {
            const berjalan = r.status === "berjalan";
            return (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 12px", color: C.text, fontWeight: 600 }}>{r.item_name}</td>
                <td style={{ padding: "8px 12px", color: C.mid, whiteSpace: "nowrap" }}>
                  {fmtRp(r.rate)} <span style={{ color: C.muted }}>/ {r.rate_unit}</span>
                </td>
                <td style={{ padding: "8px 12px", color: C.mid, whiteSpace: "nowrap" }}>{fmtTgl(r.start_date)}</td>
                <td style={{ padding: "8px 12px", color: C.mid, whiteSpace: "nowrap" }}>
                  {r.end_date ? fmtTgl(r.end_date) : <span style={{ color: C.muted, fontStyle: "italic" }}>berjalan</span>}
                </td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: berjalan ? C.yellow : C.mid,
                    background: berjalan ? C.yellowBg : "var(--surface-subtle)",
                    border: `1px solid ${berjalan ? C.yellowBorder : C.border}`,
                  }}>
                    {berjalan ? "Berjalan" : r.status === "selesai" ? "Selesai" : "Batal"}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
                  {fmtRp(r.biaya_sampai_kini)}
                  {berjalan && (
                    <span style={{ display: "block", fontSize: 10, color: C.muted, fontWeight: 400 }}>
                      masih bertambah
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kosong({ judul, pesan }: { judul: string; pesan: string }) {
  return (
    <div style={{
      padding: "36px 20px", textAlign: "center", borderRadius: 10,
      border: `1px dashed ${C.border}`, background: C.surface,
    }}>
      <Package size={26} color={C.muted} aria-hidden="true" />
      <p style={{ margin: "10px 0 3px", fontSize: 13, fontWeight: 600, color: C.text }}>{judul}</p>
      <p style={{ margin: 0, fontSize: 12, color: C.mid, maxWidth: 420, marginInline: "auto" }}>{pesan}</p>
    </div>
  );
}

function FormBaru({ jenis, onSelesai, onBatal }: {
  jenis: "milik" | "sewa"; onSelesai: () => void; onBatal: () => void;
}) {
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSimpan(true); setGalat(null);
    try {
      if (jenis === "milik") {
        await api.post("/api/v1/assets", {
          asset_code: f.get("asset_code"),
          name: f.get("name"),
          category: f.get("category"),
          brand: f.get("brand") || null,
          purchase_date: f.get("purchase_date") || null,
          purchase_price: f.get("purchase_price") ? Number(f.get("purchase_price")) : null,
          residual_value: Number(f.get("residual_value") || 0),
          useful_life_months: Number(f.get("useful_life_months") || 60),
          depreciation_method: f.get("depreciation_method"),
        });
      } else {
        await api.post("/api/v1/asset-rentals", {
          item_name: f.get("item_name"),
          rate: Number(f.get("rate") || 0),
          rate_unit: f.get("rate_unit"),
          start_date: f.get("start_date"),
          end_date: f.get("end_date") || null,
        });
      }
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan");
    } finally {
      setSimpan(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 6,
    border: `1px solid ${C.border}`, fontSize: 13, background: C.surface,
    color: C.text, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4,
  };

  return (
    <form onSubmit={kirim} style={{
      padding: 16, borderRadius: 10, border: `1px solid ${C.border}`,
      background: C.surface, marginBottom: 20,
    }}>
      <h2 style={{ margin: "0 0 13px", fontSize: 15, fontWeight: 700, color: C.text }}>
        {jenis === "milik" ? "Aset baru" : "Catat sewa alat"}
      </h2>

      {galat && (
        <div role="alert" style={{
          padding: "8px 12px", borderRadius: 6, background: C.redBg,
          border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 12, marginBottom: 12,
        }}>{galat}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {jenis === "milik" ? (
          <>
            <div>
              <label htmlFor="asset_code" style={labelStyle}>Kode aset *</label>
              <input id="asset_code" name="asset_code" required placeholder="AST-001" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="name" style={labelStyle}>Nama alat *</label>
              <input id="name" name="name" required placeholder="Molen Semen 350L" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="category" style={labelStyle}>Kategori</label>
              <select id="category" name="category" defaultValue="alat_ringan" style={inputStyle}>
                {Object.entries(KATEGORI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="brand" style={labelStyle}>Merek</label>
              <input id="brand" name="brand" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="purchase_date" style={labelStyle}>Tanggal perolehan</label>
              <input id="purchase_date" name="purchase_date" type="date" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="purchase_price" style={labelStyle}>Harga perolehan (Rp)</label>
              <input id="purchase_price" name="purchase_price" type="number" min="0" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="residual_value" style={labelStyle}>Nilai sisa (Rp)</label>
              <input id="residual_value" name="residual_value" type="number" min="0" defaultValue={0} style={inputStyle} />
              <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 3 }}>
                Perkiraan harga jual saat umur habis — bukan nol.
              </span>
            </div>
            <div>
              <label htmlFor="useful_life_months" style={labelStyle}>Umur ekonomis (bulan)</label>
              <input id="useful_life_months" name="useful_life_months" type="number" min="1" defaultValue={60} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="depreciation_method" style={labelStyle}>Metode penyusutan</label>
              <select id="depreciation_method" name="depreciation_method" defaultValue="garis_lurus" style={inputStyle}>
                <option value="garis_lurus">Garis lurus</option>
                <option value="saldo_menurun">Saldo menurun ganda</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="item_name" style={labelStyle}>Nama alat *</label>
              <input id="item_name" name="item_name" required placeholder="Excavator PC200" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="rate" style={labelStyle}>Tarif (Rp) *</label>
              <input id="rate" name="rate" type="number" min="0" required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="rate_unit" style={labelStyle}>Satuan tarif</label>
              <select id="rate_unit" name="rate_unit" defaultValue="hari" style={inputStyle}>
                <option value="hari">Per hari</option>
                <option value="minggu">Per minggu</option>
                <option value="bulan">Per bulan</option>
              </select>
              <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 3 }}>
                Mingguan &amp; bulanan dibulatkan ke atas, seperti tagihan sewa.
              </span>
            </div>
            <div>
              <label htmlFor="start_date" style={labelStyle}>Mulai sewa *</label>
              <input id="start_date" name="start_date" type="date" required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="end_date" style={labelStyle}>Selesai sewa</label>
              <input id="end_date" name="end_date" type="date" style={inputStyle} />
              <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 3 }}>
                Kosongkan bila masih berjalan.
              </span>
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={simpan} style={{
          padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy,
          color: "#fff", fontSize: 13, fontWeight: 600,
          cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>
          {simpan ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={onBatal} style={{
          padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.surface, color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Batal
        </button>
      </div>
    </form>
  );
}
