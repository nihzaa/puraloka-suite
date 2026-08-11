"use client";

/**
 * RENCANA SUSUT — pembanding yang membuat angka susut berarti (G6e).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR YANG MENOLAK MENILAI TANPA PEMBANDING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `/gudang/rekonsiliasi` sudah menjawab "berapa yang hilang". Yang tak bisa
 * dijawabnya: **apakah yang hilang itu wajar.**
 *
 * "12% hilang" tidak berarti apa-apa sendirian. Yang berarti: "12% hilang
 * padahal yang dianggarkan 5%". Tanpa pembanding, angka susut hanya bisa
 * dipakai untuk mencurigai — dan orang yang dicurigai tanpa dasar akan
 * membantah, dengan benar.
 *
 * ── Kenapa ada dua bagian, dan urutannya begitu
 *
 * Jembatan AHSP↔gudang lebih dulu, rencana susut sesudahnya. Bukan urutan
 * yang enak dibaca, melainkan urutan yang harus dikerjakan: tanpa jembatan,
 * kebutuhan menurut AHSP tak bisa dibandingkan dengan apa pun di gudang.
 *
 * Diukur 2026-08-12: `resources` (2.830, kode AHSP-*) dan `materials` (24,
 * kode MAT-*) punya NOL kode yang cocok. Dua penomoran yang tak pernah
 * dirancang untuk bertemu — jadi jembatannya memang harus diisi orang.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk "belum ada jembatan". Sesudah terisi, halaman
 * ini tenang — dan memang seharusnya: pemetaan yang sudah benar tak perlu
 * menarik perhatian tiap kali dibuka.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Percent, TriangleAlert, Info, Link2, Trash2 } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, KartuAngka, gayaInput, type Kolom,
} from "@/components/dasar";

interface Material { id: string; code: string; name: string; unit: string | null }

interface Resource { id: string; code: string; name: string; unit_code: string | null }

interface Peta {
  id: string;
  resource_id: string;
  material_id: string;
  faktor: string | number;
  catatan: string | null;
  resources: { id: string; code: string; name: string; unit_code: string | null } | null;
  materials: Material | null;
}

interface Rencana {
  id: string;
  material_id: string;
  susut_fraksi: string | number;
  dasar: string | null;
  materials: Material | null;
}

/** Fraksi → persen untuk tampilan. 0.05 → "5%". */
const pct = (v: string | number | null | undefined) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(Math.round(n * 10000) / 100).toLocaleString("id-ID")}%`;
};

export default function SusutPage() {
  const [peta, setPeta] = useState<Peta[]>([]);
  const [material, setMaterial] = useState<Material[]>([]);
  const [rencana, setRencana] = useState<Rencana[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const [rMaterial, setRMaterial] = useState("");
  const [rPersen, setRPersen] = useState("");
  const [rDasar, setRDasar] = useState("");

  // Pemetaan AHSP → gudang. Resource DICARI, tak dipilih dari daftar penuh:
  // katalognya 2.830 baris, dan pemilih dengan 2.830 pilihan tak bisa dipakai
  // siapa pun.
  const [cari, setCari] = useState("");
  const [hasilCari, setHasilCari] = useState<Resource[]>([]);
  const [mencari, setMencari] = useState(false);
  const [pResource, setPResource] = useState<Resource | null>(null);
  const [pMaterial, setPMaterial] = useState("");
  const [pFaktor, setPFaktor] = useState("1");

  const muat = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true); setGalat(null);
    try {
      const [p, r] = await Promise.all([
        api.get<{ peta: Peta[]; material: Material[] }>("/api/v1/gudang/susut/peta", { signal }),
        api.get<{ rencana: Rencana[] }>("/api/v1/gudang/susut/rencana", { signal }),
      ]);
      setPeta(p.data.peta ?? []);
      setMaterial(p.data.material ?? []);
      setRencana(r.data.rencana ?? []);
    } catch (e) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat rencana susut");
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const simpanRencana = useCallback(async () => {
    setMenyimpan(true); setGalat(null);
    try {
      await api.put("/api/v1/gudang/susut/rencana", {
        material_id: rMaterial,
        // Kosong dikirim apa adanya supaya server yang menolaknya dengan
        // pesan yang menjelaskan — bukan diam-diam jadi 0 di sini.
        susut_persen: rPersen === "" ? "" : Number(rPersen),
        dasar: rDasar.trim() || null,
      });
      setRMaterial(""); setRPersen(""); setRDasar("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menyimpan rencana susut");
    } finally { setMenyimpan(false); }
  }, [rMaterial, rPersen, rDasar, muat]);

  /** Mencari resource. Dipanggil dari tombol, bukan tiap ketikan. */
  const jalankanCari = useCallback(async () => {
    if (cari.trim().length < 2) return;
    setMencari(true); setGalat(null);
    try {
      const r = await api.get<{ resource: Resource[] }>(
        `/api/v1/gudang/susut/resource?cari=${encodeURIComponent(cari.trim())}`);
      setHasilCari(r.data.resource ?? []);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal mencari resource");
    } finally { setMencari(false); }
  }, [cari]);

  const simpanPeta = useCallback(async () => {
    if (!pResource || !pMaterial) return;
    setMenyimpan(true); setGalat(null);
    try {
      await api.put("/api/v1/gudang/susut/peta", {
        resource_id: pResource.id,
        material_id: pMaterial,
        // Kosong dikirim apa adanya — server yang menolaknya dengan pesan
        // yang menjelaskan, bukan diam-diam jadi 0 di sini.
        faktor: pFaktor === "" ? "" : Number(pFaktor),
      });
      setPResource(null); setPMaterial(""); setPFaktor("1");
      setCari(""); setHasilCari([]);
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menyimpan pemetaan");
    } finally { setMenyimpan(false); }
  }, [pResource, pMaterial, pFaktor, muat]);

  const hapusPeta = useCallback(async (p: Peta) => {
    setGalat(null);
    try {
      await api.delete(`/api/v1/gudang/susut/peta/${p.id}`);
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menghapus pemetaan");
    }
  }, [muat]);

  /** Material yang BELUM punya rencana — itu yang perlu dikerjakan. */
  const belumBerencana = useMemo(() => {
    const ada = new Set(rencana.map((r) => r.material_id));
    return material.filter((m) => !ada.has(m.id));
  }, [material, rencana]);

  const kolomRencana: Array<Kolom<Rencana>> = [
    {
      kunci: "material", judul: "Material", kepalaBaris: true,
      render: (r) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>
            {r.materials?.name ?? "—"}
          </strong>
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
            {r.materials?.code} · {r.materials?.unit ?? "—"}
          </span>
        </span>
      ),
    },
    {
      kunci: "susut", judul: "Rencana susut", rata: "kanan",
      render: (r) => (
        <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>
          {pct(r.susut_fraksi)}
        </span>
      ),
    },
    {
      kunci: "dasar", judul: "Dasar",
      render: (r) => (
        <span style={{ fontSize: 11.5, color: C.mid, display: "block", maxWidth: "40ch", lineHeight: 1.45 }}>
          {/* Susut yang tak bisa dijelaskan akan dibantah orang lapangan
              begitu ia dipakai menilai mereka — dan bantahan itu benar. */}
          {r.dasar ?? <span style={{ color: C.muted }}>belum ada dasar tertulis</span>}
        </span>
      ),
    },
  ];

  const kolomPeta: Array<Kolom<Peta>> = [
    {
      kunci: "resource", judul: "Resource (AHSP)", kepalaBaris: true,
      render: (p) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>
            {p.resources?.name ?? "—"}
          </strong>
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
            {p.resources?.code} · {p.resources?.unit_code ?? "—"}
          </span>
        </span>
      ),
    },
    {
      kunci: "material", judul: "Material (gudang)",
      render: (p) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>
            {p.materials?.name ?? "—"}
          </strong>
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
            {p.materials?.code} · {p.materials?.unit ?? "—"}
          </span>
        </span>
      ),
    },
    {
      kunci: "faktor", judul: "Faktor", rata: "kanan",
      render: (p) => (
        <span style={{ fontSize: 12.5, color: C.text }}>
          {Number(p.faktor).toLocaleString("id-ID", { maximumFractionDigits: 6 })}
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (p) => (
        <Tombol kecil jenis="hantu" ikon={<Trash2 size={12} aria-hidden="true" />}
          onClick={() => void hapusPeta(p)}>
          Hapus
        </Tombol>
      ),
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Percent size={18} />}
        judul="Rencana Susut Material"
        keterangan={
          <>Pembanding untuk halaman Rekonsiliasi Material. &quot;12% hilang&quot;
          tidak berarti apa-apa sendirian — yang berarti: <strong>12% hilang
          padahal yang dianggarkan 5%</strong>. Tanpa pembanding, angka susut
          hanya bisa dipakai untuk mencurigai.</>
        }
        aksi={
          <Tombol jenis="sekunder" href="/gudang/rekonsiliasi">
            Rekonsiliasi Material
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {/* ── SATU aksen: jembatan belum ada (§3d) ──────────────────────────── */}
      {!memuat && peta.length === 0 && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TriangleAlert size={15} aria-hidden="true" />
            Belum ada jembatan AHSP ↔ gudang
          </strong>
          <span style={{ display: "block", fontSize: 12.5 }}>
            Katalog AHSP memakai kode <code>AHSP-*</code> dan gudang memakai
            <code> MAT-*</code> — <strong>nol kode yang cocok</strong>, karena
            keduanya tak pernah dirancang untuk bertemu. Sampai dipetakan,
            kebutuhan menurut AHSP tak bisa dibandingkan dengan apa pun di
            gudang. Pemetaannya tak bisa ditebak sistem: hanya yang mengelola
            gudang yang tahu satu sak itu 50 kg atau 40 kg.
          </span>
        </div>
      )}

      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      }}>
        <KartuAngka label="Material berencana" nilai={String(rencana.length)}
          sub={`dari ${material.length} material`} />
        <KartuAngka label="Belum berencana" nilai={String(belumBerencana.length)}
          sub="susutnya tak bisa dinilai" />
        <KartuAngka label="Pemetaan AHSP" nilai={String(peta.length)}
          sub="resource → material" />
      </div>

      <Kartu pad="rapat">
        <JudulKartu sub="0% sah — untuk material yang memang tak menyusut">
          Rencana susut per material
        </JudulKartu>
        <div style={{
          display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}>
          <div>
            <label htmlFor="s-mat" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Material
            </label>
            <select id="s-mat" style={gayaInput} value={rMaterial}
              onChange={(e) => setRMaterial(e.target.value)}>
              <option value="">— pilih material —</option>
              {material.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="s-pct" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Rencana susut (%)
            </label>
            <input id="s-pct" type="number" min="0" max="100" step="any" style={gayaInput}
              value={rPersen} onChange={(e) => setRPersen(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label htmlFor="s-dasar" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
            Dasar (opsional, tapi dicari saat angkanya dibantah)
          </label>
          <input id="s-dasar" style={gayaInput} value={rDasar}
            onChange={(e) => setRDasar(e.target.value)}
            placeholder="mis. pengalaman 3 proyek terakhir, rata-rata 4–6%" />
        </div>
        <div style={{ marginTop: 12 }}>
          <Tombol jenis="utama"
            disabled={menyimpan || !rMaterial || rPersen === ""}
            onClick={() => void simpanRencana()}>
            {menyimpan ? "Menyimpan…" : "Simpan rencana"}
          </Tombol>
        </div>
      </Kartu>

      {memuat ? (
        <Rangka tinggi={56} jumlah={3} />
      ) : (
        <Kartu pad="rapat">
          <JudulKartu sub={`${belumBerencana.length} material belum punya rencana`}>
            Rencana yang sudah ditetapkan
          </JudulKartu>
          <Tabel
            kolom={kolomRencana}
            data={rencana}
            kunciBaris={(r) => r.id}
            caption="Rencana susut per material beserta dasarnya"
            kosong={
              <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0, lineHeight: 1.6 }}>
                Belum ada rencana susut. Sampai ada, halaman Rekonsiliasi
                Material hanya bisa menyebut berapa yang hilang — bukan apakah
                jumlah itu wajar.
              </p>
            }
          />
          {belumBerencana.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: C.muted }}>Belum berencana:</span>
              {belumBerencana.slice(0, 12).map((m) => (
                <Lencana key={m.id} nada="netral">{m.code}</Lencana>
              ))}
              {belumBerencana.length > 12 && (
                <span style={{ fontSize: 11.5, color: C.muted }}>
                  +{belumBerencana.length - 12} lagi
                </span>
              )}
            </div>
          )}
        </Kartu>
      )}

      <Kartu pad="rapat">
        <JudulKartu sub="cari resource AHSP, pasangkan ke material gudang, sebutkan faktor konversinya">
          Petakan AHSP → gudang
        </JudulKartu>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <label htmlFor="p-cari" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Cari resource AHSP — minimal 2 huruf
            </label>
            <input id="p-cari" style={gayaInput} value={cari}
              onChange={(e) => setCari(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void jalankanCari(); }}
              placeholder="mis. semen, bata, AHSP-PASIR" />
          </div>
          <Tombol jenis="sekunder" disabled={mencari || cari.trim().length < 2}
            onClick={() => void jalankanCari()}>
            {mencari ? "Mencari…" : "Cari"}
          </Tombol>
        </div>

        {hasilCari.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {hasilCari.map((r) => {
              const aktif = pResource?.id === r.id;
              return (
                <button
                  key={r.id} type="button" aria-pressed={aktif}
                  onClick={() => setPResource(aktif ? null : r)}
                  style={{
                    textAlign: "left", padding: "6px 10px", borderRadius: 8,
                    fontSize: 11.5, cursor: "pointer", maxWidth: 280,
                    border: `1px solid ${aktif ? "var(--aksen)" : C.border}`,
                    background: aktif ? "var(--aksen-lembut)" : "transparent",
                    color: C.text,
                  }}
                >
                  <strong style={{ display: "block" }}>{r.name}</strong>
                  <span style={{ color: C.muted }}>{r.code} · {r.unit_code ?? "—"}</span>
                </button>
              );
            })}
          </div>
        )}

        {cari.trim().length >= 2 && !mencari && hasilCari.length === 0 && (
          <p style={{ marginTop: 10, fontSize: 12, color: C.mid }}>
            Tidak ada resource material yang cocok dengan &quot;{cari.trim()}&quot;.
          </p>
        )}

        {pResource && (
          <div style={{
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
            display: "grid", gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}>
            <div>
              <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Resource terpilih
              </span>
              <span style={{
                display: "block", padding: "8px 10px", borderRadius: 6,
                background: "var(--surface-hover)", fontSize: 12.5, color: C.text,
              }}>
                {pResource.name}
                <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                  {pResource.code} · {pResource.unit_code ?? "—"}
                </span>
              </span>
            </div>
            <div>
              <label htmlFor="p-mat" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Material gudang
              </label>
              <select id="p-mat" style={gayaInput} value={pMaterial}
                onChange={(e) => setPMaterial(e.target.value)}>
                <option value="">— pilih material —</option>
                {material.map((m) => (
                  <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.unit ?? "—"})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-faktor" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Faktor konversi
              </label>
              <input id="p-faktor" type="number" min="0" step="any" style={gayaInput}
                value={pFaktor} onChange={(e) => setPFaktor(e.target.value)} />
              <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>
                Berapa satuan <strong>gudang</strong> untuk satu satuan{" "}
                <strong>AHSP</strong>. Semen: 1 kg = 0,02 sak.
              </span>
            </div>
          </div>
        )}

        {pResource && (
          <div style={{ marginTop: 12 }}>
            <Tombol jenis="utama" ikon={<Link2 size={13} aria-hidden="true" />}
              disabled={menyimpan || !pMaterial || pFaktor === ""}
              onClick={() => void simpanPeta()}>
              {menyimpan ? "Menyimpan…" : "Petakan"}
            </Tombol>
          </div>
        )}
      </Kartu>

      {peta.length > 0 && (
        <Kartu pad="rapat">
          <JudulKartu sub="satu resource AHSP menunjuk tepat satu material gudang">
            Jembatan AHSP ↔ gudang
          </JudulKartu>
          <Tabel
            kolom={kolomPeta}
            data={peta}
            kunciBaris={(p) => p.id}
            caption="Pemetaan resource AHSP ke material gudang beserta faktor konversinya"
          />
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          <strong>Faktor konversi</strong> ikut dipetakan karena satuan AHSP
          dan satuan gudang jarang sama: AHSP menghitung semen dalam kg,
          gudang menyimpannya dalam sak. Tanpa faktor, 500 kg menurut AHSP
          dibandingkan dengan 10 sak di gudang menghasilkan{" "}
          <strong>&quot;susut 98%&quot;</strong> — angka yang menuduh orang atas
          kesalahan satuan.
        </span>
      </p>
    </Halaman>
  );
}
