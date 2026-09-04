"use client";

/**
 * Price Book — dipindahkan dari `/estimasi?tab=harga`.
 *
 * Isinya DISALIN apa adanya dari berkas 4.070 baris yang sedang dibongkar;
 * alasannya ada di `_cecep/dasar.tsx`. Singkatnya: dua layar master ini
 * satu-satunya bagian modul yang TIDAK rusak, jadi mengetik ulangnya cuma
 * mengundang regresi.
 *
 * Yang berubah: alamatnya, judul halamannya (`<h1>` sendiri, bukan menumpang
 * "Estimasi"), dan tautan lama tetap hidup lewat pengalihan di
 * `/estimasi/page.tsx`.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { useVirtualList } from "@/lib/use-virtual-list";
import { C } from "@/lib/warna-ui";
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import {
  formatRupiah, formatAngka, 
} from "@/lib/format";
import {
  ChevronDown, ChevronRight, Plus, 
  Coins, CheckCircle2, PlayCircle, CircleOff,
  BadgeCheck,
} from "lucide-react";
import {
  Modal, label, StatusBadge, btnPrimary, btnGhost,
  type PriceEntry, 
  th, td, 
} from "../_cecep/dasar";
import { tanya } from "@/components/tanya";
import { Pilihan } from "@/components/pilihan";

const fmtRp = formatRupiah;

function JenisHarga({ c }: { c: string }) {
  const peta: Record<string, { label: string; warna: string; bg: string }> = {
    labor: { label: "upah", warna: C.navy, bg: "var(--bg)" },
    material: { label: "bahan", warna: C.green, bg: C.greenBg },
    equipment: { label: "alat", warna: C.yellow, bg: C.yellowBg },
  };
  const p = peta[c];
  if (!p) return null;
  return (
    <span style={{ marginLeft: 6, padding: "0px 6px", borderRadius: 999, fontSize: 10,
      fontWeight: 700, color: p.warna, background: p.bg, whiteSpace: "nowrap" }}>
      {p.label}
    </span>
  );
}

function HargaTab() {
  const [entries, setEntries] = useState<PriceEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  /** labor = upah · material = bahan · equipment = alat (kolom resources.category) */
  const [kategori, setKategori] = useState("");
  const [cari, setCari] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [prefill, setPrefill] = useState<{ code: string; name: string; unit_code: string } | null>(null);
  const [err, setErr] = useState("");

  // SELURUH price book dimuat sekali (limit 5.000), pencarian di memori.
  // Sebelumnya UI memanggil tanpa `limit` sehingga hanya dapat 100 dari 2.637 —
  // harga di luar itu tak pernah terlihat, dan pemakai menginput duplikat
  // karena mengira harganya belum ada.
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (kategori) p.set("category", kategori);
    p.set("limit", "5000");
    const r = await api.get<{ data: PriceEntry[]; total: number | null }>(
      `/api/v1/cecep/price-book?${p}`);
    setEntries(r.data.data ?? []);
    setTotal(r.data.total ?? null);
  }, [status, kategori]);

  // Dibungkus lewat batas asinkron: `load()` menulis state di awal jalannya,
  // dan memanggilnya sinkron dari effect memicu render beruntun
  // (`react-hooks/set-state-in-effect`).
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const terlihat = entries.filter(en => {
    if (!cari.trim()) return true;
    const q = cari.toLowerCase();
    return (en.resource?.name ?? "").toLowerCase().includes(q)
        || (en.resource?.code ?? "").toLowerCase().includes(q);
  });
  const terpotong = total != null && total > entries.length;
  const { pasang: pasangHarga, mulai: vhMulai, akhir: vhAkhir, padTop: vhTop, padBottom: vhBawah, nonaktif: vhOff } = useVirtualList(terlihat.length, 44, { tinggiViewport: 560 });

  function isiHarga(r: { code: string; name: string; unit_code: string }) {
    setPrefill(r);
    setShowNew(true);
  }

  const transition = async (id: string, to: string) => {
    setErr("");
    try { await api.patch(`/api/v1/cecep/price-book/${id}/status`, { status: to }); await load(); }
    catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Transisi gagal"); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {/* Upah / bahan / alat sudah terpisah di `resources.category` — tinggal
            disaring. Berguna karena keduanya diperlakukan berbeda: upah berubah
            per kesepakatan mandor, harga bahan per supplier. */}
        <Pilihan className="isian-fokus" value={kategori} onChange={e => setKategori(e.target.value)}
          aria-label="Saring jenis harga pokok" style={{ ...GAYA_ISIAN, width: 170 }}>
          <option value="">Semua jenis</option>
          <option value="labor">Upah (tenaga kerja)</option>
          <option value="material">Bahan / material</option>
          <option value="equipment">Alat / peralatan</option>
        </Pilihan>
        <Pilihan className="isian-fokus" value={status} onChange={e => setStatus(e.target.value)}
          aria-label="Saring status harga" style={{ ...GAYA_ISIAN, width: 160 }}>
          <option value="">Semua status</option>
          <option value="draft">draft</option><option value="verified">verified</option>
          <option value="active">active</option><option value="expired">expired</option>
        </Pilihan>
        <label htmlFor="harga-cari" style={{ position: "absolute", width: 1, height: 1,
          overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          Cari nama atau kode resource
        </label>
        <input className="isian-fokus" id="harga-cari" type="search" value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari resource (semen, besi, pekerja…)"
          style={{ ...GAYA_ISIAN, width: 260 }} />
        <button style={btnPrimary} onClick={() => setShowNew(true)}><Plus size={14} /> Harga Baru</button>
        {/* Jujur soal pemotongan: 2.637 entri, hanya 200 termuat. Pemakai yang
            tak menemukan harganya perlu tahu daftarnya memang dipotong — bukan
            menyimpulkan harganya belum ada lalu menginput duplikat. */}
        {total != null && (
          <span style={{ fontSize: 12, whiteSpace: "nowrap",
            color: terpotong ? C.yellow : C.muted }}>
            {terpotong
              ? `${entries.length} dari ${formatAngka(total)} — melebihi batas muat`
              : cari.trim()
                ? `${formatAngka(terlihat.length)} dari ${formatAngka(entries.length)} harga`
                : `${formatAngka(terlihat.length)} harga`}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px" }}>
        Alur: draft → verified → active (maju saja, dijaga database). Hanya <b>active</b> yang
        dipakai menghitung HSP.
      </p>
      {err && <div style={{ background: C.redBg, color: C.red, borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <PrioritasHarga onIsi={isiHarga} />

      {/* Wadah scroll vertikal untuk virtualisasi + horizontal untuk kolom
          yang tak muat di layar sempit. Tinggi dibatasi supaya tabel 2.637
          baris tak mendorong seluruh halaman menjadi sangat panjang. */}
      <div ref={pasangHarga} style={{ overflowX: "auto", background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 10,
        ...(vhOff ? {} : { maxHeight: 560, overflowY: "auto" as const }) }}>
        {/* TIDAK dipindahkan ke <Tabel> (diperiksa 2026-08-07, UI-0-4) — jangan
            dicoba lagi tanpa lebih dulu mengubah komponennya.

            Tabel ini DIVIRTUALISASI: dari 2.637 entri harga, hanya ~30 baris yang
            dirender kapan pun, dan panjang scrollbar dijaga oleh dua baris
            pengganjal ber-`colSpan={8}` di awal & akhir <tbody> (`vhTop`/`vhBawah`,
            lihat `useVirtualList` di atas). `Tabel` merender `data.map()` UTUH dan
            tak punya jalan menyisipkan baris pengganjal — memakainya di sini
            berarti merender 2.637 baris sekaligus, yaitu persis beban yang
            virtualisasinya dibuat untuk menghindari.

            Memindahkannya butuh `Tabel` mendukung virtualisasi lebih dulu. Itu
            pekerjaan terhadap komponennya, bukan terhadap halaman ini.

            Keempat jaminan `Tabel` sudah dipenuhi tangan: caption sr-only ada,
            tabular-nums ada, pembungkus overflow-x ada, dan kolom Resource
            memakai <th scope="row"> (dipasang 2026-08-07 bersama catatan ini). */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only">Daftar harga resource: harga, satuan, masa berlaku, lokasi, tingkat keyakinan, status, dan aksi.</caption>
          <thead><tr>
            <th style={th}>Resource</th><th style={{ ...th, textAlign: "right" }}>Harga</th><th style={th}>Sat</th>
            <th style={th}>Berlaku</th><th style={th}>Lokasi</th><th style={th}>Keyakinan</th><th style={th}>Status</th><th style={th}>Aksi</th>
          </tr></thead>
          <tbody>
            {vhTop > 0 && <tr aria-hidden="true"><td colSpan={8} style={{ height: vhTop, padding: 0 }} /></tr>}
            {terlihat.slice(vhMulai, vhAkhir).map(en => (
              <tr key={en.id}>
                <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 400 }}>
                  <b>{en.resource?.name}</b>
                  {/* Jenis ditandai per baris, bukan hanya lewat filter: upah
                      dan bahan diperlakukan berbeda saat memutuskan harga, dan
                      keduanya berdampingan di daftar yang sama. */}
                  {en.resource?.category && <JenisHarga c={en.resource.category} />}
                  <br /><code style={{ fontSize: 11, color: C.muted }}>{en.resource?.code}</code>
                </th>
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtRp(Number(en.amount))}</td>
                <td style={td}>{en.resource?.unit_code}</td>
                <td style={td}>{en.effective_date}{en.expired_date ? ` → ${en.expired_date}` : ""}</td>
                <td style={td}>{en.location ?? <span style={{ color: C.muted }}>umum</span>}</td>
                <td style={td}>{en.confidence_level
                  ? <span style={{ fontSize: 11, fontWeight: 600, color: en.confidence_level === "high" ? C.green : en.confidence_level === "low" ? C.red : C.yellow }}>
                      {en.confidence_level === "high" ? "Tinggi" : en.confidence_level === "low" ? "Rendah" : "Sedang"}
                    </span>
                  : <span style={{ color: C.muted }}>—</span>}</td>
                <td style={td}><StatusBadge s={en.status} /></td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {en.status === "draft" && <button style={btnGhost} onClick={() => void transition(en.id, "verified")}><BadgeCheck size={13} /> Verifikasi</button>}
                  {en.status === "verified" && <button style={{ ...btnGhost, color: C.green }} onClick={() => void transition(en.id, "active")}><PlayCircle size={13} /> Aktifkan</button>}
                  {en.status === "active" && <button style={{ ...btnGhost, color: C.mid }} onClick={() => void transition(en.id, "expired")}><CircleOff size={13} /> Expire</button>}
                  {en.status === "expired" && <CheckCircle2 size={14} color={C.muted} />}
                </td>
              </tr>
            ))}
            {vhBawah > 0 && <tr aria-hidden="true"><td colSpan={8} style={{ height: vhBawah, padding: 0 }} /></tr>}
            {terlihat.length === 0 && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={8}>
                {cari.trim() ? `Tidak ada harga yang cocok dengan "${cari}".` : "Belum ada entry harga."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {showNew && (
        <NewPriceModal
          initial={prefill}
          onClose={() => { setShowNew(false); setPrefill(null); }}
          onDone={async () => { setShowNew(false); setPrefill(null); await load(); }}
        />
      )}

      <OverrideProyek />
    </div>
  );
}

// ── Harga khusus proyek (override) ────────────────────────────────────────────
//
// ROADMAP #14g. `project_price_override` sudah dipakai TIGA jalur perhitungan —
// `price-resolver.ts`, `ahsp.ts`, `estimate-versions.ts` — dan alasannya bahkan
// ikut muncul di explainability trail. Tapi endpointnya nol pemanggil dari web:
// fitur yang sudah mempengaruhi angka RAB hanya bisa dipakai lewat panggilan
// API langsung, dan tabelnya nol baris. Persis kelas cacat yang §9a dibuat
// untuk menangkap — kodenya benar dan teruji, yang kurang jalur pemakaiannya.
//
// Diletakkan DI DALAM tab Harga, bukan tab sendiri: override adalah pengecualian
// atas price book, dan memisahkannya membuat orang menyetel harga khusus tanpa
// pernah melihat harga umumnya lebih dulu. Pemilih proyek ada di sini karena
// override selalu milik satu proyek, sementara price book global.

interface OverrideHarga {
  id: string;
  resource_id: string;
  amount: number;
  currency: string;
  effective_date: string | null;
  expired_date: string | null;
  reason: string;
  notes: string | null;
  created_at: string;
  resource: { code: string; name: string; unit_code: string; category: string } | null;
}

function OverrideProyek() {
  const [proyek, setProyek] = useState<Array<{ id: string; name: string }>>([]);
  const [proyekId, setProyekId] = useState("");
  const [data, setData] = useState<OverrideHarga[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState("");
  const [formBuka, setFormBuka] = useState(false);

  useEffect(() => {
    let batal = false;
    api.get("/api/v1/projects")
      .then((r) => {
        if (batal) return;
        const d = (r.data?.projects ?? []) as Array<{ id: string; name: string }>;
        setProyek(d);
        setProyekId((k) => k || d[0]?.id || "");
      })
      .catch(() => { if (!batal) setErr("Daftar proyek tidak bisa dimuat."); });
    return () => { batal = true; };
  }, []);

  const muat = useCallback(async (pid: string) => {
    if (!pid) return;
    setMemuat(true); setErr("");
    try {
      const r = await api.get(`/api/v1/projects/${pid}/price-overrides`);
      setData(r.data?.data ?? []);
    } catch {
      setErr("Daftar harga khusus tidak bisa dimuat.");
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    if (!proyekId) return;
    let batal = false;
    void Promise.resolve().then(() => { if (!batal) void muat(proyekId); });
    return () => { batal = true; };
  }, [proyekId, muat]);

  const hapus = async (o: OverrideHarga) => {
    if (!(await tanya({
      judul: `Hapus harga khusus untuk ${o.resource?.code ?? "resource ini"}?`,
      pesan: "Estimasi yang belum dikunci akan kembali memakai harga price book.",
      labelYa: "Hapus",
      nada: "bahaya",
    }))) return;
    try {
      await api.delete(`/api/v1/price-overrides/${o.id}`);
      await muat(proyekId);
    } catch {
      setErr("Harga khusus tidak bisa dihapus.");
    }
  };

  return (
    <section style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end",
        justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            Harga khusus proyek
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.mid, lineHeight: 1.55, maxWidth: 620 }}>
            Menimpa price book untuk satu proyek saja — dipakai saat harga di
            lokasi berbeda dari harga umum. Alasannya wajib, dan ikut muncul di
            rincian perhitungan supaya angka yang menyimpang selalu punya
            keterangannya.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Pilihan
            aria-label="Pilih proyek untuk harga khusus"
            value={proyekId}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 36, padding: "0 10px", fontSize: 13, borderRadius: 6,
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              maxWidth: 220, fontFamily: "inherit" }}
          >
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
          <button style={btnGhost} onClick={() => setFormBuka(true)} disabled={!proyekId}>
            <Plus size={13} /> Harga khusus
          </button>
        </div>
      </div>

      {err && (
        <p style={{ fontSize: 12, color: C.red, margin: "0 0 10px" }}>{err}</p>
      )}

      {memuat ? (
        <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>Memuat…</p>
      ) : data.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.6 }}>
          Belum ada harga khusus di proyek ini — seluruh perhitungan memakai
          price book. Tambahkan hanya bila harga di lokasi benar-benar berbeda;
          tiap override membuat angka proyek ini menyimpang dari yang lain, dan
          alasannya harus bisa dipertanggungjawabkan.
        </p>
      ) : (
        /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
           scope="row", tabular-nums, dan overflow-x dijamin komponen.

           `kepalaBaris` di Resource: kode + nama bahannya yang menamai baris.
           "Alasan" isinya kalimat panjang dan "Berlaku" tanggal — keduanya
           keterangan atas harga khusus itu, bukan identitasnya. */
        <Tabel<OverrideHarga>
              berpermukaan
          caption="Harga khusus per resource: nilai, masa berlaku, dan alasan penetapannya."
          data={data}
          kunciBaris={o => o.id}
          kolom={[
            { kunci: "resource", judul: "Resource", kepalaBaris: true, render: o => (
              <>
                <strong>{o.resource?.code ?? "—"}</strong>
                <span style={{ display: "block", color: C.mid }}>
                  {o.resource?.name ?? ""}{o.resource?.unit_code ? ` / ${o.resource.unit_code}` : ""}
                </span>
              </>
            ) },
            { kunci: "harga", judul: "Harga khusus", rata: "kanan", render: o => (
              <span style={{ fontWeight: 700 }}>{fmtRp(o.amount)}</span>
            ) },
            { kunci: "berlaku", judul: "Berlaku", render: o => (
              <span style={{ whiteSpace: "nowrap" }}>
                {o.effective_date ?? "—"}{o.expired_date ? ` → ${o.expired_date}` : ""}
              </span>
            ) },
            { kunci: "alasan", judul: "Alasan", render: o => (
              <span style={{ display: "block", maxWidth: 320 }}>{o.reason}</span>
            ) },
            { kunci: "aksi", judul: "", render: o => (
              <button style={{ ...btnGhost, color: C.red, whiteSpace: "nowrap" }}
                aria-label={`Hapus harga khusus ${o.resource?.code ?? "resource ini"}`}
                onClick={() => void hapus(o)}>
                Hapus
              </button>
            ) },
          ]}
        />
      )}

      {formBuka && (
        <FormOverride
          proyekId={proyekId}
          onTutup={() => setFormBuka(false)}
          onSimpan={async () => { setFormBuka(false); await muat(proyekId); }}
        />
      )}
    </section>
  );
}

function FormOverride({ proyekId, onTutup, onSimpan }: {
  proyekId: string; onTutup: () => void; onSimpan: () => Promise<void>;
}) {
  // API menerima `resource_id` (UUID), bukan kode. Meminta orang mengetik UUID
  // adalah rancangan yang tak bisa dipakai — jadi pencarian mengembalikan
  // pilihan, dan id-nya diambil dari yang dipilih.
  const [cari, setCari] = useState("");
  const [pilihan, setPilihan] = useState<Array<{ id: string; code: string; name: string; unit_code: string }>>([]);
  const [terpilih, setTerpilih] = useState<{ id: string; code: string; name: string; unit_code: string } | null>(null);
  /** Permintaan pencarian yang sedang berjalan. `useRef`, bukan state:
   *  indikator "Mencari…" tak perlu memicu render tersendiri, dan setState
   *  di dalam efek pencarian memicu render berantai tiap ketikan. */
  const jalanRef = useRef(0);
  const [versiHasil, setVersiHasil] = useState(0);
  const [jumlah, setJumlah] = useState("");
  const [alasan, setAlasan] = useState("");
  const [berlaku, setBerlaku] = useState("");
  const [catatan, setCatatan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [err, setErr] = useState("");
  const kodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { kodeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  // Cari-sambil-ketik dengan jeda. Tanpa jeda, tiap huruf jadi satu permintaan
  // ke registry 2.400+ entri.
  useEffect(() => {
    const q = cari.trim();
    // Pengosongan TIDAK dilakukan di sini: `setPilihan([])` sinkron di badan
    // efek memicu render berantai tiap ketikan. Yang ditampilkan disaring saat
    // render (`tampilPilihan`) — daftar lama tak pernah terlihat karena
    // syaratnya sama.
    if (q.length < 2 || terpilih) return;
    let batal = false;
    const t = setTimeout(() => {
      jalanRef.current += 1;
      const seri = jalanRef.current;
      api.get<{ data: Array<{ id: string; code: string; name: string; unit_code: string }> }>(
        `/api/v1/cecep/resources?q=${encodeURIComponent(q)}&limit=20`)
        .then((r) => { if (!batal) setPilihan(r.data?.data ?? []); })
        .catch(() => { if (!batal) setPilihan([]); })
        // Hasil yang datang TERLAMBAT dari pencarian sebelumnya diabaikan:
        // tanpa ini, mengetik cepat bisa menampilkan hasil kata yang sudah
        // ditinggalkan — dan orangnya memilih resource yang salah.
        .finally(() => { if (!batal && seri === jalanRef.current) setVersiHasil((v) => v + 1); });
    }, 260);
    return () => { batal = true; clearTimeout(t); };
  }, [cari, terpilih]);

  /** Hasil yang boleh tampil — diturunkan, bukan di-set dalam efek. */
  const tampilPilihan = (cari.trim().length < 2 || terpilih) ? [] : pilihan;

  const simpan = async () => {
    const n = Number(jumlah.replace(/[^\d.-]/g, ""));
    if (!terpilih) { setErr("Pilih dulu resource dari hasil pencarian."); return; }
    if (!Number.isFinite(n) || n <= 0) { setErr("Harga harus angka lebih dari nol."); return; }
    if (!alasan.trim()) {
      setErr("Alasan wajib — angka yang menyimpang tanpa keterangan tak bisa dipertanggungjawabkan.");
      return;
    }
    setMenyimpan(true); setErr("");
    try {
      await api.post(`/api/v1/projects/${proyekId}/price-overrides`, {
        resource_id: terpilih.id,
        amount: n,
        reason: alasan.trim(),
        effective_date: berlaku || undefined,
        notes: catatan.trim() || undefined,
      });
      await onSimpan();
    } catch (e) {
      // Pesan server ditampilkan apa adanya — ia sudah menyebut sebabnya
      // (mis. sudah ada override pada tanggal berlaku yang sama), dan itu
      // informasi yang paling berguna di sini.
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(p ?? "Harga khusus tidak bisa disimpan.");
    } finally { setMenyimpan(false); }
  };

  const gaya = {
    input: { minHeight: 42, padding: "8px 12px", width: "100%", boxSizing: "border-box" as const,
      border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13,
      background: "var(--surface)", color: C.text, fontFamily: "inherit" },
    label: { fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 },
    bantu: { fontSize: 11, color: C.muted, lineHeight: 1.5, display: "block", marginTop: 4 },
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ovr-judul"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--pad-kartu-lega)" }}>
      <div style={{ background: "var(--surface)", borderRadius: 10, width: "100%", maxWidth: 460,
        maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "var(--naik-3)" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h3 id="ovr-judul" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
            Harga khusus proyek
          </h3>
          <button onClick={onTutup} aria-label="Tutup"
            style={{ border: "none", background: "none", cursor: "pointer", color: C.mid,
              minWidth: 34, minHeight: 34 }}>✕</button>
        </header>

        <div style={{ padding: "var(--pad-kartu-lega)", overflowY: "auto", display: "grid", gap: 12 }}>
          <div>
            <label htmlFor="ovr-kode" style={gaya.label}>Resource</label>
            {terpilih ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                border: `1px solid ${C.border}`, borderRadius: 6, background: "var(--surface-subtle)" }}>
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>
                  <strong>{terpilih.code}</strong> — {terpilih.name}
                  <span style={{ color: C.mid }}> / {terpilih.unit_code}</span>
                </span>
                <button
                  onClick={() => { setTerpilih(null); setCari(""); }}
                  style={{ ...btnGhost, minHeight: 30 }}
                >Ganti</button>
              </div>
            ) : (
              <>
                <input id="ovr-kode" ref={kodeRef} value={cari} style={gaya.input}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Ketik nama material, upah, atau alat" />

                {tampilPilihan.length > 0 && (
                  <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0,
                    maxHeight: 168, overflowY: "auto", border: `1px solid ${C.border}`,
                    borderRadius: 6 }}>
                    {tampilPilihan.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => { setTerpilih(r); setPilihan([]); }}
                          style={{ width: "100%", textAlign: "left", padding: "8px 12px",
                            border: "none", background: "none", cursor: "pointer",
                            fontSize: 13, color: C.text, fontFamily: "inherit" }}
                        >
                          <strong>{r.code}</strong> — {r.name}
                          <span style={{ color: C.mid }}> / {r.unit_code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {versiHasil > 0 && cari.trim().length >= 2 && tampilPilihan.length === 0 && (
                  <span style={gaya.bantu}>
                    Tak ada yang cocok. Harga khusus hanya bisa dipasang pada
                    resource yang sudah terdaftar — kalau memang baru, daftarkan
                    dulu di price book.
                  </span>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="ovr-harga" style={gaya.label}>Harga di proyek ini</label>
            <input id="ovr-harga" value={jumlah} style={gaya.input} inputMode="numeric"
              onChange={(e) => setJumlah(e.target.value)} placeholder="185000" />
          </div>

          <div>
            <label htmlFor="ovr-alasan" style={gaya.label}>Alasan</label>
            <textarea id="ovr-alasan" value={alasan} rows={2}
              style={{ ...gaya.input, minHeight: 62, resize: "vertical", lineHeight: 1.5 }}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Lokasi terpencil, ongkos angkut pasir naik 40%" />
            <span style={gaya.bantu}>
              Ikut ditampilkan di rincian perhitungan tiap kali harga ini
              dipakai. Tulis sebabnya, bukan &ldquo;harga khusus&rdquo;.
            </span>
          </div>

          <div>
            <label htmlFor="ovr-berlaku" style={gaya.label}>
              Berlaku sejak <span style={{ fontWeight: 400, color: C.muted }}>(boleh dikosongkan)</span>
            </label>
            <input id="ovr-berlaku" type="date" value={berlaku} style={gaya.input}
              onChange={(e) => setBerlaku(e.target.value)} />
          </div>

          <div>
            <label htmlFor="ovr-catatan" style={gaya.label}>
              Catatan <span style={{ fontWeight: 400, color: C.muted }}>(boleh dikosongkan)</span>
            </label>
            <input id="ovr-catatan" value={catatan} style={gaya.input}
              onChange={(e) => setCatatan(e.target.value)} placeholder="Penawaran supplier 12 Jul" />
          </div>

          {err && <p style={{ margin: 0, fontSize: 12, color: C.red, lineHeight: 1.5 }}>{err}</p>}
        </div>

        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 16px",
          borderTop: `1px solid ${C.border}`, background: "var(--surface-subtle)" }}>
          <button onClick={onTutup} disabled={menyimpan}
            style={{ minHeight: 40, padding: "0 15px", borderRadius: 6, fontSize: 13,
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid,
              cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
          <button onClick={() => void simpan()} disabled={menyimpan}
            style={{ minHeight: 40, padding: "0 15px", borderRadius: 6, fontSize: 13,
              border: "none", background: "var(--grad-aksen)", color: C.onNavy, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", opacity: menyimpan ? 0.6 : 1 }}>
            {menyimpan ? "Menyimpan…" : "Simpan"}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface ResourceTanpaHarga {
  resource_id: string; code: string; name: string; category: string
  unit_code: string; dipakai_analisa: number;
}

/**
 * Daftar bahan/upah tanpa harga, diurutkan DAMPAK — bukan abjad.
 *
 * "Sewa Tripot" sendiri memblokir 213 analisa; mengisi harganya langsung
 * menghidupkan 213 baris HSP sekaligus. Mengurutkan abjad berarti orang mengisi
 * yang dampaknya kecil dulu, sekadar karena namanya duluan di huruf A.
 */
function PrioritasHarga({ onIsi }: { onIsi: (r: { code: string; name: string; unit_code: string }) => void }) {
  const [buka, setBuka] = useState(true);

  /*
    Lapis cache bersama (F4-2). Panel ini muncul di layar harga yang sering
    dibuka-tutup saat estimator mengisi harga satu per satu — dedup-nya
    langsung terasa.

    Galatnya sengaja TETAP diam (`total === 0` menyembunyikan panel): ini
    panel BANTU, bukan sumber kebenaran. Panel bantu yang gagal memuat lalu
    menampilkan pesan merah justru mengalihkan perhatian dari daftar harga
    yang jadi pekerjaan utama halaman ini.
  */
  const sumber = useData<{ data: ResourceTanpaHarga[]; total_tanpa_harga: number }>(
    "/api/v1/cecep/prices/missing?limit=15");
  const data = useMemo(() => sumber.data?.data ?? [], [sumber.data]);
  const total = sumber.data?.total_tanpa_harga ?? 0;
  // Tak ada `muat()`: sesudah pindah ke `useData`, nol pemanggil tersisa.
  // Muat ulang manual, bila kelak dibutuhkan: `sumber.muatUlang()`.

  if (total === 0) return null; // tak ada gunanya menunjukkan daftar kosong

  return (
    <div style={{ ...GAYA_KARTU, marginBottom: 14, background: C.yellowBg, borderColor: C.yellow }}>
      <button onClick={() => setBuka(b => !b)} aria-expanded={buka}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 8,
                 padding: "12px var(--pad-kartu-lega)", background: "none", border: "none", cursor: "pointer",
                 textAlign: "left" }}>
        {buka ? <ChevronDown size={15} color={C.text} /> : <ChevronRight size={15} color={C.text} />}
        <CircleOff size={15} color={C.yellow} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          {total} bahan/upah belum punya harga
        </span>
        <span style={{ fontSize: 12, color: C.mid }}>
          — mengisi yang berdampak besar dulu menghidupkan lebih banyak analisa sekaligus
        </span>
      </button>

      {buka && (
        <div style={{ borderTop: `1px solid ${C.yellow}`, padding: "4px 12px 12px" }}>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.

              `kepalaBaris` di Bahan / upah: nama bahannya yang menamai baris.
              Urutan data SENGAJA tetap urut dampak (berapa analisa terblokir),
              bukan abjad — lihat catatan di kepala komponen ini. `Tabel` tidak
              mengurutkan ulang, jadi urutan itu utuh. */}
          <Tabel<ResourceTanpaHarga>
              berpermukaan
            caption="Pemakaian bahan dan upah: nama, kategori, dan jumlah yang dipakai."
            data={data}
            kunciBaris={r => r.resource_id}
            kolom={[
              { kunci: "nama", judul: "Bahan / upah", kepalaBaris: true, render: r => (
                <>
                  {r.name}
                  <span style={{ color: C.muted, marginLeft: 6, fontSize: 11 }}>{r.unit_code}</span>
                </>
              ) },
              { kunci: "kategori", judul: "Kategori", render: r => <span style={{ color: C.mid }}>{r.category}</span> },
              { kunci: "dipakai", judul: "Dipakai", rata: "kanan", render: r => (
                <span style={{ fontFamily: "monospace" }}>{r.dipakai_analisa} analisa</span>
              ) },
              { kunci: "aksi", judul: "", render: r => (
                <button
                  aria-label={`Isi harga untuk ${r.name}`}
                  onClick={() => onIsi({ code: r.code, name: r.name, unit_code: r.unit_code })}
                  style={{ ...btnGhost, whiteSpace: "nowrap" }}
                >
                  <Plus size={13} /> Isi harga
                </button>
              ) },
            ]}
          />
          {total > data.length && (
            <p style={{ fontSize: 11, color: C.mid, margin: "8px 2px 0" }}>
              Menampilkan {data.length} dari {total} — sisanya dampaknya lebih kecil.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NewPriceModal({ initial, onClose, onDone }: {
  initial?: { code: string; name: string; unit_code: string } | null;
  onClose: () => void; onDone: () => Promise<void>;
}) {
  // `initial` datang dari daftar prioritas — resource-nya sudah pasti dipilih,
  // jadi kolom cari langsung menampilkan hasilnya tanpa menunggu ketikan.
  const [query, setQuery] = useState(initial?.name ?? "");
  const [resources, setResources] = useState<{ code: string; name: string; unit_code: string }[]>(
    initial ? [initial] : []);
  const [resourceCode, setResourceCode] = useState(initial?.code ?? "");
  const [amount, setAmount] = useState("");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  const [expired, setExpired] = useState("");
  const [location, setLocation] = useState("");
  const [supplier, setSupplier] = useState("");
  const [confidence, setConfidence] = useState<"" | "high" | "medium" | "low">("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Registry resource penuh (2.400+ entri) — cari-sambil-ketik via /cecep/resources,
  // BUKAN union dari assembly (workaround lama; sekarang mencakup resource yang
  // belum dipakai assembly manapun tapi tetap perlu diberi harga).
  useEffect(() => {
    // Saat resource sudah dipastikan lewat prefill, ketikan pertama (nama
    // resource itu sendiri, yang dipakai untuk mengisi kolom cari) TIDAK boleh
    // memicu pencarian ulang — kalau nama itu tak cocok persis hasil server,
    // dropdown-nya berganti isi tanpa alasan yang terlihat pengguna, padahal
    // resource-nya sudah benar dipilih.
    if (initial && query === initial.name) return;
    const t = setTimeout(() => {
      const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=50` : "?limit=50";
      api.get<{ data: { code: string; name: string; unit_code: string }[] }>(`/api/v1/cecep/resources${q}`)
        .then(r => setResources(r.data.data ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <Modal title="Entry Harga Baru (lahir draft)" onClose={onClose}>
      {label("Cari resource")}
      <input className="isian-fokus" style={GAYA_ISIAN} value={query} onChange={e => setQuery(e.target.value)} placeholder="ketik nama resource… mis. semen" />
      {/* Daftar pilihan digambar sendiri, BUKAN `<select size={6}>`.
          `size={6}` menyerahkan penggambarannya ke sistem operasi: baris
          terpilih memakai biru bawaan Windows yang tak ada hubungannya dengan
          palet aplikasi, sudutnya siku, dan di mode gelap teksnya nyaris tak
          terbaca. Satu-satunya tempat di seluruh aplikasi yang tampak seperti
          dialog Windows 98.
          Yang menggantikannya tetap sebuah daftar ber-keyboard: `role=listbox`
          + `aria-selected`, jadi pembaca layar membacanya sama seperti
          sebelumnya. */}
      <div
        role="listbox"
        aria-label="Pilih resource"
        style={{
          marginTop: 6, maxHeight: 168, overflowY: "auto",
          border: `1px solid ${C.border}`, borderRadius: 8,
          background: "var(--surface)",
        }}
      >
        {resources.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 12.5, color: C.muted }}>
            — tidak ada hasil —
          </div>
        )}
        {resources.map(r => {
          const dipilih = r.code === resourceCode;
          return (
            <button
              key={r.code}
              type="button"
              role="option"
              aria-selected={dipilih}
              onClick={() => setResourceCode(r.code)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", fontSize: 12.5, lineHeight: 1.45,
                border: "none", cursor: "pointer",
                background: dipilih ? "var(--aksen-lembut)" : "transparent",
                color: dipilih ? "var(--aksen)" : C.text,
                fontWeight: dipilih ? 600 : 400,
              }}
            >
              {r.name}
              <span style={{ color: dipilih ? "var(--aksen)" : C.muted, fontWeight: 400 }}>
                {" "}({r.code}, per {r.unit_code})
              </span>
            </button>
          );
        })}
      </div>
      {label("Harga (Rp)")}
      <input className="isian-fokus" style={GAYA_ISIAN} type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>{label("Berlaku sejak")}
          <input className="isian-fokus" aria-label="Tanggal" style={GAYA_ISIAN} type="date" value={effective} onChange={e => setEffective(e.target.value)} /></div>
        <div>{label("Berlaku sampai (opsional)")}
          <input className="isian-fokus" aria-label="Tanggal" style={GAYA_ISIAN} type="date" value={expired} onChange={e => setExpired(e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>{label("Lokasi (kosong = umum)")}
          <input className="isian-fokus" style={GAYA_ISIAN} value={location} onChange={e => setLocation(e.target.value)} placeholder="mis. Bandung" /></div>
        <div>{label("Tingkat keyakinan")}
          <Pilihan className="isian-fokus" aria-label="Tingkat keyakinan harga" style={GAYA_ISIAN} value={confidence} onChange={e => setConfidence(e.target.value as typeof confidence)}>
            <option value="">— tak ditentukan —</option>
            <option value="high">Tinggi (mis. penawaran resmi supplier)</option>
            <option value="medium">Sedang (mis. survei pasar)</option>
            <option value="low">Rendah (mis. perkiraan/estimasi)</option>
          </Pilihan></div>
      </div>
      {label("Supplier (opsional)")}
      <input className="isian-fokus" style={GAYA_ISIAN} value={supplier} onChange={e => setSupplier(e.target.value)} />
      {err && <p style={{ color: C.red, fontSize: 12 }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button style={btnGhost} onClick={onClose}>Batal</button>
        <button style={btnPrimary} disabled={busy || !resourceCode || !amount} onClick={async () => {
          setBusy(true); setErr("");
          try {
            await api.post("/api/v1/cecep/price-book", {
              resource_code: resourceCode, amount: Number(amount), effective_date: effective,
              expired_date: expired || null, location: location || null, supplier: supplier || null,
              confidence_level: confidence || null,
            });
            await onDone();
          } catch (e) { setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Gagal menyimpan"); }
          finally { setBusy(false); }
        }}>Simpan (draft)</button>
      </div>
    </Modal>
  );
}

export default function PriceBookPage() {
  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div style={{ marginBottom: 14 }}>
        <KepalaHalaman
          judul="Price Book"
          keterangan="Harga satuan resource ber-tanggal-berlaku. Alur draft → verified → active; hanya active yang dipakai menghitung HSP."
          ikon={<Coins size={19} />}
        />
      </div>
      <HargaTab />
    </div>
  );
}
