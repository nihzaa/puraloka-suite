"use client";

/**
 * Katalog AHSP — dipindahkan dari `/estimasi?tab=katalog`.
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

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { useVirtualList } from "@/lib/use-virtual-list";
import { PilihCari } from "@/components/pilih-cari";
import { C } from "@/lib/warna-ui";
import { Tabel, KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import {
  formatRupiah, formatAngka, formatKuantitas, formatTanggalJam,
} from "@/lib/format";
import {
  Check, ChevronDown, ChevronRight, Copy, Pencil, Plus, Search, X,
  AlertTriangle, BookOpen, Coins, CheckCircle2, PlayCircle, CircleOff,
  Clock, TrendingUp, Info,
} from "lucide-react";
import {
  Modal, label, StatusBadge, btnPrimary, btnGhost,
  type Project, type Edition, type Assembly, type AsmComponent,
  type PriceEntry, type CostCodeRingkas,
  th, td, lbl, tfLabel, tfAngka,
} from "../_cecep/dasar";

const fmtRp = formatRupiah;

interface HspKomponen {
  resource_code: string; resource_name: string; unit: string;
  coefficient: number; category: string;
  amount: number | null; subtotal: number | null;
  sumber: string | null; override_reason: string | null; effective_date: string | null;
}
interface HspLive {
  assembly: { id: string; code: string; name: string; output_unit: string; source: string; status: string };
  input: { price_date: string; location: string | null; buk_fraction: number };
  components: HspKomponen[];
  hsp_partial: boolean;
  missing_prices: string[];
  result: { groupTotals: Record<string, number>; subtotalD: number
            bukAmount: number; hspRaw: number; hspRounded: number } | null;
}

const GRUP_LABEL: Record<string, { huruf: string; judul: string }> = {
  labor:     { huruf: "A", judul: "Tenaga" },
  material:  { huruf: "B", judul: "Bahan" },
  equipment: { huruf: "C", judul: "Alat" },
};

function KatalogTab() {
  const [editions, setEditions] = useState<Edition[]>([]);
  /**
   * Satu nilai untuk seluruh penyaringan katalog:
   *   ""                → semua
   *   "company"         → analisa perusahaan saja
   *   "national"        → analisa nasional saja
   *   "edition:<kode>"  → satu edisi nasional
   */
  const [saring, setSaring] = useState("");
  const edition = saring.startsWith("edition:") ? saring.slice(8) : "";
  const sumber = saring === "company" || saring === "national" ? saring : "";
  const [cari, setCari] = useState("");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  /** { assembly_id: jumlah resource yang belum berharga } — hanya yang > 0. */
  const [kurangHarga, setKurangHarga] = useState<Record<string, number>>({});
  const [hanyaKurang, setHanyaKurang] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hsp, setHsp] = useState<Record<string, HspLive | "memuat" | "gagal">>({});
  const [adopsi, setAdopsi] = useState<Assembly | null>(null);
  const [editAsm, setEditAsm] = useState<Assembly | null>(null);
  const [aktivasi, setAktivasi] = useState<string | null>(null); // id sedang diaktifkan
  const [pesan, setPesan] = useState("");

  async function aktifkan(a: Assembly) {
    setAktivasi(a.id);
    try {
      await api.patch(`/api/v1/cecep/assemblies/${a.id}/activate`);
      setPesan(`Analisa "${a.code}" diaktifkan — sudah bisa dipakai di estimasi.`);
      muat();
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setPesan("");
      window.alert(x?.response?.data?.error ?? "Gagal mengaktifkan analisa");
    } finally { setAktivasi(null); }
  }

  useEffect(() => {
    // TIDAK memilih edisi secara otomatis. Sebelumnya edisi ber-`source_sha256`
    // dipilih sendiri saat halaman dibuka — akibatnya katalog terbuka dalam
    // keadaan TERSARING ("SE-47-2026 — nasional saja") tanpa pemakai memintanya,
    // dan 423 analisa perusahaan tak terlihat sejak awal. Default: tampilkan
    // semua, biarkan penyaringan jadi tindakan sadar.
    api.get<{ data: Edition[] }>("/api/v1/cecep/editions")
      .then(r => setEditions(r.data.data ?? []))
      .catch(() => {});
  }, []);

  // SELURUH katalog dimuat sekali (limit 5.000), lalu pencarian dilakukan di
  // memori — instan, tanpa bolak-balik server per ketikan.
  //
  // Beratnya dijaga di sisi render, bukan dengan memotong data: daftar
  // divirtualisasi sehingga browser hanya memegang ~30 baris kapan pun. Cara
  // lama (potong 200 + cari ke server) membuat analisa di baris ke-500 tak
  // pernah bisa DILIHAT oleh orang yang sedang mencari-cari justru karena
  // belum tahu kata kuncinya.
  const muat = useCallback(() => {
    const p = new URLSearchParams();
    if (edition) p.set("edition", edition);
    if (sumber) p.set("source", sumber);
    p.set("limit", "5000");
    api.get<{ data: Assembly[]; total: number | null }>(`/api/v1/cecep/assemblies?${p}`)
      .then(r => { setAssemblies(r.data.data ?? []); setTotal(r.data.total ?? null); })
      .catch(() => {});
  }, [edition, sumber]);

  useEffect(() => { muat(); }, [muat]);

  // Jumlah per pilihan saringan, supaya dropdown bisa menyebut angkanya sendiri
  // ("Analisa perusahaan saja (423)") alih-alih memaksa pemakai memilih dulu
  // untuk tahu ada isinya atau tidak.
  const [jumlahPerSaring, setJumlahPerSaring] = useState<Record<string, number>>({});
  useEffect(() => {
    let batal = false;
    void Promise.all([
      api.get<{ total: number | null }>("/api/v1/cecep/assemblies?limit=1"),
      api.get<{ total: number | null }>("/api/v1/cecep/assemblies?source=company&limit=1"),
      api.get<{ total: number | null }>("/api/v1/cecep/assemblies?source=national&limit=1"),
    ])
      .then(([s, c, n]) => {
        if (batal) return;
        setJumlahPerSaring({
          semua: s.data.total ?? 0, company: c.data.total ?? 0, national: n.data.total ?? 0,
        });
      })
      .catch(() => {});
    return () => { batal = true; };
  }, []);

  // Cakupan harga dimuat sekali per kombinasi filter — bukan per analisa dibuka.
  // Tanpa ini, analisa yang HSP-nya tak bisa dihitung baru ketahuan setelah
  // dipilih masuk RAB.
  useEffect(() => {
    let batal = false;
    const p = new URLSearchParams();
    if (edition) p.set("edition", edition);
    if (sumber) p.set("source", sumber);
    api.get<{ data: Record<string, number> }>(`/api/v1/cecep/assemblies/price-coverage?${p}`)
      .then(r => { if (!batal) setKurangHarga(r.data.data ?? {}); })
      .catch(() => { if (!batal) setKurangHarga({}); });
    return () => { batal = true; };
  }, [edition, sumber]);

  // HSP dimuat SAAT analisa dibuka, bukan untuk 3.038 baris sekaligus:
  // memuat semuanya berarti ribuan resolusi harga untuk data yang tak dilihat.
  function bukaAnalisa(a: Assembly) {
    if (open === a.id) return setOpen(null);
    setOpen(a.id);
    if (hsp[a.id] && hsp[a.id] !== "gagal") return;
    setHsp(h => ({ ...h, [a.id]: "memuat" }));
    api.get<HspLive>(`/api/v1/cecep/assemblies/${a.id}/hsp-live`)
      .then(r => setHsp(h => ({ ...h, [a.id]: r.data })))
      .catch(() => setHsp(h => ({ ...h, [a.id]: "gagal" })));
  }

  // Penyaringan di KLIEN — benar karena seluruh katalog memang ada di memori
  // (dimuat utuh, lalu divirtualisasi saat dirender). Instan, tanpa debounce,
  // tanpa panggilan server per ketikan.
  const terlihat = assemblies.filter(a => {
    if (hanyaKurang && !(kurangHarga[a.id] ?? 0)) return false;
    if (!cari.trim()) return true;
    const q = cari.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
  });
  // Terpotong hanya kalau katalog melebihi cap 5.000 — praktis tak terjadi
  // hari ini (3.043), tapi tetap dilaporkan supaya tak diam-diam menyesatkan
  // kalau katalognya tumbuh.
  const terpotong = total != null && total > assemblies.length;
  const jumlahKurang = assemblies.filter(a => (kurangHarga[a.id] ?? 0) > 0).length;

  // Tinggi baris seragam ~52px (kode + nama satu baris, padding 11px atas-bawah).
  const { pasang: pasangKatalog, mulai: vkMulai, akhir: vkAkhir, padTop: vkTop, padBottom: vkBawah, nonaktif: vkOff } = useVirtualList(terlihat.length, 52, { tinggiViewport: 560 });

  return (
    <div>
      {/* role=status: hasil salin analisa diumumkan pembaca layar, bukan hanya
          terlihat — pengguna yang tak melihat layar tetap tahu tindakannya
          berhasil. */}
      {pesan && (
        <div role="status" style={{ ...GAYA_KARTU, padding: "8px 12px", marginBottom: 12, display: "flex",
                      alignItems: "center", gap: 8, background: C.greenBg, borderColor: C.green }}>
          <CheckCircle2 size={15} color={C.green} />
          <span style={{ fontSize: 13, color: C.text }}>{pesan}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input className="isian-fokus"
          value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari nama atau kode analisa…"
          style={{ ...GAYA_ISIAN, flex: 1, minWidth: 220 }}
        />
        {/* SATU dropdown, bukan dua yang saling memengaruhi.
            Sebelumnya "sumber" dan "edisi" terpisah, dan salah satunya bisa
            mematikan yang lain — pemakai harus memahami hubungan keduanya
            sebelum bisa menyaring. Di sini tiap pilihan menyebutkan sendiri apa
            yang akan tampil, beserta jumlahnya. */}
        <select className="isian-fokus" value={saring} onChange={e => setSaring(e.target.value)}
          aria-label="Saring katalog" style={{ ...GAYA_ISIAN, minWidth: 300 }}>
          <option value="">Semua ({formatAngka(jumlahPerSaring.semua ?? 0)})</option>
          <option value="company">
            Analisa perusahaan saja ({formatAngka(jumlahPerSaring.company ?? 0)})
          </option>
          <option value="national">
            Analisa nasional saja ({formatAngka(jumlahPerSaring.national ?? 0)})
          </option>
          {editions.filter(e => (e.jumlah_analisa ?? 0) > 0).map(e => (
            <option key={e.id} value={`edition:${e.code}`}>
              Edisi {e.code} ({formatAngka(e.jumlah_analisa!)})
            </option>
          ))}
          {/* Edisi kosong tetap terlihat supaya jelas ia terdaftar tapi belum
              berisi — menyembunyikannya membuat pemakai mengira sistem hanya
              mendukung satu edisi. */}
          {editions.filter(e => (e.jumlah_analisa ?? 0) === 0).map(e => (
            <option key={e.id} value={`edition:${e.code}`} disabled>
              Edisi {e.code} — belum ada analisa
            </option>
          ))}
        </select>
        {/* Jujur soal pemotongan: label lama menulis "N analisa" seolah itu
            seluruhnya, padahal respons dibatasi 200 dari 3.043. Pemakai yang
            tak menemukan analisanya perlu tahu bahwa daftarnya memang dipotong,
            bukan menyimpulkan analisanya tidak ada. */}
        <span style={{ fontSize: 12, color: terpotong ? C.yellow : C.muted, whiteSpace: "nowrap" }}>
          {terpotong
            ? `${assemblies.length} dari ${formatAngka(total!)} — katalog melebihi batas muat`
            : cari.trim() || hanyaKurang
              ? `${formatAngka(terlihat.length)} dari ${formatAngka(assemblies.length)} analisa`
              : `${formatAngka(terlihat.length)} analisa`}
        </span>
        {jumlahKurang > 0 && (
          <button type="button" onClick={() => setHanyaKurang(v => !v)}
            aria-pressed={hanyaKurang}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 8px",
              fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              border: `1px solid ${hanyaKurang ? C.yellow : C.border}`,
              background: hanyaKurang ? C.yellowBg : C.surface,
              color: hanyaKurang ? C.yellow : C.mid, whiteSpace: "nowrap" }}>
            <AlertTriangle size={13} aria-hidden="true" />
            {hanyaKurang ? "Tampilkan semua" : `${jumlahKurang} harga belum lengkap`}
          </button>
        )}
      </div>

      {/* Wadah virtual: hanya baris yang terlihat + buffer yang dirender.
          Dua div berketinggian tetap menjaga panjang scrollbar tetap sesuai
          jumlah data sesungguhnya, sehingga posisi scroll terasa wajar.
          Saat data sedikit (<60), virtualisasi mati sendiri dan daftarnya
          dirender apa adanya. */}
      <div ref={pasangKatalog} style={{
        display: "grid", gap: 8,
        ...(vkOff ? {} : { maxHeight: 560, overflowY: "auto" as const, paddingRight: 4 }),
      }}>
        {vkTop > 0 && <div style={{ height: vkTop }} aria-hidden="true" />}
        {terlihat.slice(vkMulai, vkAkhir).map(a => {
          const h = hsp[a.id];
          const detail = h && h !== "memuat" && h !== "gagal" ? h : null;
          return (
            <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <button onClick={() => bukaAnalisa(a)}
                aria-expanded={open === a.id}
                aria-label={`${a.code} — ${a.name}. ${open === a.id ? "Tutup" : "Buka"} rincian harga.`}
                style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 8,
                         padding: "12px var(--pad-kartu-lega)", background: "none", border: "none",
                         cursor: "pointer", textAlign: "left" }}>
                <span style={{ paddingTop: 2 }}>
                  {open === a.id ? <ChevronDown size={15} color={C.mid} /> : <ChevronRight size={15} color={C.mid} />}
                </span>
                <code style={{ fontSize: 12, color: C.navy, fontWeight: 700, minWidth: 84, paddingTop: 1 }}>{a.code}</code>
                <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                  {a.name}
                  {/* Penanda di level DAFTAR, bukan hanya setelah dibuka:
                      analisa yang HSP-nya tak bisa dihitung penuh harus terlihat
                      sebelum dipilih masuk RAB, bukan sesudahnya. */}
                  {(kurangHarga[a.id] ?? 0) > 0 && (
                    <span title={`${kurangHarga[a.id]} bahan/upah/alat belum punya harga aktif`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 8,
                        padding: "0px 6px", borderRadius: 999, background: C.yellowBg,
                        color: C.yellow, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                      <AlertTriangle size={10} aria-hidden="true" />
                      {kurangHarga[a.id]} tanpa harga
                    </span>
                  )}
                  {a.source === "company" && (
                    <span style={{ marginLeft: 6, padding: "0px 6px", borderRadius: 999,
                      background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 700 }}>
                      perusahaan
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", paddingTop: 1 }}>
                  per {a.output_unit_code}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                  whiteSpace: "nowrap",
                  color: a.source === "national" ? C.mid : C.navy,
                  border: `1px solid ${C.border}`,
                }}>
                  {a.source === "national" ? "NASIONAL" : "PERUSAHAAN"}
                </span>
                {a.status === "draft" && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                    whiteSpace: "nowrap", color: C.yellow, border: `1px solid ${C.yellow}`,
                  }}>
                    DRAFT
                  </span>
                )}
              </button>

              {open === a.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 12px 12px" }}>
                  {h === "memuat" && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Menghitung…</p>}
                  {h === "gagal" && (
                    <p style={{ fontSize: 12, color: C.red, margin: 0 }}>
                      Gagal memuat rincian harga. Coba tutup dan buka lagi.
                    </p>
                  )}
                  {detail && <RincianAnalisa d={detail} />}

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {a.source === "national" && (
                      <>
                        <button onClick={() => setAdopsi(a)} style={btnGhost}>
                          <Plus size={13} /> Jadikan analisa perusahaan
                        </button>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                          Menyalin analisa ini supaya koefisiennya bisa Anda sesuaikan.
                          Analisa nasional tidak berubah.
                        </span>
                      </>
                    )}
                    <button onClick={() => setEditAsm(a)} style={btnGhost}>
                      <Pencil size={13} /> Edit (versi baru)
                    </button>
                    {a.status === "draft" && (
                      <button onClick={() => void aktifkan(a)} disabled={aktivasi === a.id}
                        style={{ ...btnGhost, color: C.green,
                                 cursor: aktivasi === a.id ? "wait" : "pointer",
                                 opacity: aktivasi === a.id ? 0.7 : 1 }}>
                        <PlayCircle size={13} /> {aktivasi === a.id ? "Mengaktifkan…" : "Aktifkan"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {vkBawah > 0 && <div style={{ height: vkBawah }} aria-hidden="true" />}
        {terlihat.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13 }}>
            {cari ? `Tidak ada analisa yang cocok dengan "${cari}".` : "Tidak ada analisa untuk filter ini."}
          </p>
        )}
      </div>

      {adopsi && (
        <AdopsiModal
          asal={adopsi}
          onClose={() => setAdopsi(null)}
          onDone={(kode) => {
            setAdopsi(null);
            setPesan(`Analisa "${kode}" dibuat di katalog perusahaan.`);
            muat();
          }}
        />
      )}

      {editAsm && (
        <EditAssemblyModal
          asal={editAsm}
          onClose={() => setEditAsm(null)}
          onDone={(sourceBaru) => {
            setEditAsm(null);
            setPesan(
              sourceBaru === "company"
                ? "Versi baru dibuat di katalog perusahaan (masih draft — aktifkan untuk dipakai)."
                : "Versi baru dibuat (masih draft — aktifkan untuk dipakai)."
            );
            muat();
          }}
        />
      )}
    </div>
  );
}

/**
 * Rincian satu analisa, disusun seperti lembar AHSP: band per grup, angka rata
 * kanan, garis ganda sebelum HSP.
 */
function RincianAnalisa({ d }: { d: HspLive }) {
  const perGrup = (["labor", "material", "equipment"] as const)
    .map(k => ({ k, label: GRUP_LABEL[k], rows: d.components.filter(c => c.category === k) }))
    .filter(g => g.rows.length > 0);

  return (
    <div>
      {d.hsp_partial && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px",
                      background: C.yellowBg, border: `1px solid ${C.yellow}`, borderRadius: 6,
                      marginBottom: 12 }}>
          <CircleOff size={14} color={C.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
            {d.missing_prices.length} bahan/upah belum punya harga, jadi HSP di bawah
            <strong> belum lengkap</strong>. Isi harganya di tab Harga:{" "}
            <span style={{ color: C.mid }}>{d.missing_prices.slice(0, 4).join(", ")}
              {d.missing_prices.length > 4 && ` +${d.missing_prices.length - 4} lagi`}</span>
          </span>
        </div>
      )}

      {/* TIDAK dipindahkan ke <Tabel> (diperiksa 2026-08-07, UI-0-4) — jangan
          dicoba lagi, dan alasannya tiga lapis:

          1. BARIS BERTINGKAT. Isinya dikelompokkan band A. Tenaga / B. Bahan /
             C. Alat, dan tiap band dibuka baris judul ber-`colSpan={5}`. `Tabel`
             merender satu <tr> seragam per elemen data; ia tak punya cara
             menyisipkan baris kelompok. Meratakannya jadi daftar datar akan
             MENGHAPUS pengelompokan A/B/C — dan itu bukan hiasan, itu bentuk
             lembar AHSP yang orangnya memang cari (lihat catatan di kepala
             tab Katalog).

          2. <tfoot> BERTINGKAT TIGA BARIS: D. Jumlah → BUK → HSP, dengan garis
             ganda (`3px double`) sebelum baris terakhir. Prop `total` milik
             `Tabel` merender SATU baris <tfoot>; tiga baris penutup lembar
             analisa tak bisa diwakili olehnya.

          3. Penutupnya juga bukan sekadar total kolom — "Keuntungan & overhead
             10%" adalah baris turunan, bukan jumlah dari kolom di atasnya.

          Yang penting: keempat jaminan `Tabel` sudah dipenuhi tangan di sini —
          caption sr-only ada, tabular-nums ada, pembungkus overflow-x ada.
          Yang belum: <th scope="row"> pada kolom Uraian. Itu perbaikan kecil
          yang berdiri sendiri, bukan alasan memaksakan komponennya. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only">Analisa harga satuan pekerjaan: uraian resource, satuan, koefisien, harga satuan, dan jumlah.</caption>
          <thead>
            <tr>
              <th style={{ ...th, width: "42%" }}>Uraian</th>
              <th style={th}>Sat</th>
              <th style={{ ...th, textAlign: "right" }}>Koefisien</th>
              <th style={{ ...th, textAlign: "right" }}>Harga satuan</th>
              <th style={{ ...th, textAlign: "right" }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {perGrup.map(g => (
              <Fragment key={g.k}>
                <tr>
                  <td colSpan={5} style={{
                    padding: "8px 6px 4px", fontSize: 11, fontWeight: 700,
                    color: C.mid, letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
                    {g.label.huruf}. {g.label.judul}
                  </td>
                </tr>
                {g.rows.map((c, i) => (
                  <tr key={`${g.k}-${i}`}>
                    {/* <th scope="row"> — jaminan keempat `Tabel` yang di tabel ini
                        harus dipasang tangan (lihat catatan di atas). Tanpa ini
                        pembaca layar membacakan "0,25 · Rp 150.000" tanpa menyebut
                        bahan apa. `fontWeight: 400` supaya tampilannya tak berubah. */}
                    <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 400, lineHeight: 1.45 }}>
                      {c.resource_name}
                      {c.sumber === "override_proyek" && (
                        <span title={c.override_reason ?? ""} style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.navy,
                          border: `1px solid ${C.border}`, borderRadius: 999, padding: "0px 6px",
                        }}>KHUSUS PROYEK</span>
                      )}
                    </th>
                    <td style={{ ...td, color: C.mid }}>{c.unit}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>
                      {Number(c.coefficient)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace",
                                 color: c.amount == null ? C.yellow : C.text }}>
                      {c.amount == null ? "belum ada" : fmtRp(c.amount)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace",
                                 color: c.subtotal == null ? C.muted : C.text }}>
                      {c.subtotal == null ? "—" : fmtRp(Math.round(c.subtotal))}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {d.result && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ ...tfLabel, borderTop: `1px solid ${C.border}` }}>
                  D. Jumlah
                </td>
                <td style={{ ...tfAngka, borderTop: `1px solid ${C.border}` }}>
                  {fmtRp(Math.round(d.result.subtotalD))}
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={tfLabel}>
                  Keuntungan &amp; overhead {Math.round(d.input.buk_fraction * 100)}%
                </td>
                <td style={tfAngka}>{fmtRp(Math.round(d.result.bukAmount))}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{
                  ...tfLabel, fontWeight: 700, color: C.text, fontSize: 13,
                  borderTop: `3px double ${C.border}`, paddingTop: 9,
                }}>
                  Harga satuan pekerjaan, per {d.assembly.output_unit}
                </td>
                <td style={{
                  ...tfAngka, fontWeight: 700, color: C.navy, fontSize: 13,
                  borderTop: `3px double ${C.border}`, paddingTop: 9,
                }}>
                  {fmtRp(Math.round(d.result.hspRounded))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p style={{ fontSize: 11, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
        Harga per {new Date(d.input.price_date).toLocaleDateString("id-ID",
          { day: "numeric", month: "long", year: "numeric" })}.
        Mengubah harga di tab Harga langsung mengubah angka di sini.
      </p>
    </div>
  );
}

/** Salin analisa nasional jadi milik perusahaan, koefisien bisa disesuaikan. */
function AdopsiModal({ asal, onClose, onDone }: {
  asal: Assembly; onClose: () => void; onDone: (kode: string) => void;
}) {
  const [kode, setKode] = useState(`${asal.code}-CO`);
  const [alasan, setAlasan] = useState("");
  const [koef, setKoef] = useState<Record<string, string>>({});
  const [simpan, setSimpan] = useState(false);
  const [err, setErr] = useState("");

  const komponen = [...asal.components].sort((a, b) => a.sort_order - b.sort_order);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setErr("");
    try {
      const diubah = komponen
        .filter(c => c.resource && koef[c.resource.code]?.trim())
        .map(c => ({ resource_code: c.resource!.code, coefficient: Number(koef[c.resource!.code]) }))
        .filter(x => Number.isFinite(x.coefficient) && x.coefficient > 0);

      const r = await api.post<{ data: { code: string } }>(
        `/api/v1/cecep/assemblies/${asal.id}/adopt`,
        { code: kode.trim(), reason: alasan.trim() || undefined,
          components: diubah.length ? diubah : undefined });
      onDone(r.data.data.code);
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Gagal menyalin analisa");
    } finally { setSimpan(false); }
  }

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Jadikan analisa perusahaan"
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
      {/*
        Backdrop = `<button>` SAUDARA, bukan `onClick` pada `<div role="dialog">`.

        Bentuk lama menaruh `onClick={onClose}` pada wadah ber-`role="dialog"`,
        dan formnya harus memasang `stopPropagation` hanya untuk menahan klik
        itu — handler yang tak melakukan apa pun tapi tetap membuat `<form>`
        terhitung sebagai elemen non-interaktif yang diberi interaksi.

        `tabIndex={-1}` + `aria-hidden`: klik-latar-untuk-tutup adalah
        kenyamanan tetikus. Papan tik sudah punya Esc (`onKeyDown` di atas),
        dan menambah perhentian Tab untuk area kosong justru memperpanjang
        jalan menuju isi dialognya.
      */}
      <button
        type="button" tabIndex={-1} aria-hidden onClick={onClose}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", padding: 0, cursor: "default" }}
      />
      <form onSubmit={kirim} style={{
        position: "relative", zIndex: 1,
        ...GAYA_KARTU, width: "100%", maxWidth: 660, maxHeight: "88vh", overflowY: "auto", padding: "var(--pad-kartu-lega)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
              Jadikan analisa perusahaan
            </h2>
            <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.55 }}>
              Menyalin <code style={{ color: C.navy }}>{asal.code}</code> ke katalog perusahaan.
              Analisa nasionalnya tidak berubah, dan tetap bisa dipakai seperti biasa.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={17} color={C.mid} />
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: "8px 12px", background: C.redBg,
                        border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>
            {err}
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <div>
            <label htmlFor="kode" style={lbl}>Kode analisa baru</label>
            <input className="isian-fokus" id="kode" value={kode} onChange={e => setKode(e.target.value)} required style={GAYA_ISIAN} />
          </div>
          <div>
            <label htmlFor="alasan" style={lbl}>Alasan menyesuaikan</label>
            <input className="isian-fokus" id="alasan" value={alasan} onChange={e => setAlasan(e.target.value)}
              placeholder="Mis. tim kami butuh waktu lebih lama untuk pekerjaan ini"
              style={GAYA_ISIAN} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
            Sesuaikan koefisien
          </p>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            Kosongkan yang tidak berubah — yang dikosongkan memakai angka aslinya.
          </p>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.

              `kepalaBaris` di Uraian: nama bahan/upah itulah yang menamai baris.
              Dua kolom lain angka koefisien — dan yang satu bahkan medan isian,
              jadi tak ada isinya sampai diketik.

              `data` disaring lebih dulu ke komponen ber-resource. Dulu penyaringan
              itu dilakukan di dalam map (`c.resource && (...)`) yang menghasilkan
              `false` sebagai anak <tbody>; sebagai daftar `data` ia harus sudah
              bersih supaya `kunciBaris` tak pernah menerima baris tanpa resource. */}
          <Tabel<AsmComponent & { resource: NonNullable<AsmComponent["resource"]> }>
              berpermukaan
            caption="Perbandingan koefisien sebelum dan sesudah penyesuaian, per uraian resource."
            data={komponen.filter((c): c is AsmComponent & { resource: NonNullable<AsmComponent["resource"]> } => Boolean(c.resource))}
            kunciBaris={c => c.resource.code}
            kolom={[
              { kunci: "uraian", judul: "Uraian", kepalaBaris: true, render: c => (
                <span style={{ lineHeight: 1.45 }}>
                  {c.resource.name}
                  <span style={{ color: C.muted, marginLeft: 6 }}>{c.resource.unit_code}</span>
                </span>
              ) },
              { kunci: "asli", judul: "Asli", rata: "kanan", render: c => (
                <span style={{ fontFamily: "monospace", color: C.mid }}>{Number(c.coefficient)}</span>
              ) },
              { kunci: "jadi", judul: "Jadi", rata: "kanan", lebar: 130, render: c => (
                <input className="isian-fokus"
                  aria-label={`Koefisien baru untuk ${c.resource.name}`}
                  value={koef[c.resource.code] ?? ""}
                  onChange={e => setKoef(k => ({ ...k, [c.resource.code]: e.target.value }))}
                  placeholder={String(Number(c.coefficient))}
                  inputMode="decimal"
                  style={{ ...GAYA_ISIAN, textAlign: "right", fontFamily: "monospace", padding: "6px 8px" }}
                />
              ) },
            ]}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="submit" disabled={simpan} style={{
            padding: "8px 16px", borderRadius: 10, border: "none", background: "var(--grad-aksen)",
            color: C.onNavy, fontSize: 13, fontWeight: 600,
            cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
          }}>
            {simpan ? "Menyalin…" : "Salin ke katalog perusahaan"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/**
 * Edit (versi baru) — correction (perbaikan, tetap berlabel sumber asal) atau
 * deviation (cara kerja sengaja beda; kalau asalnya nasional, otomatis jadi
 * milik perusahaan). Tak pernah mengubah baris asal — analisa yang sudah
 * dipakai estimasi tetap ke versi lama.
 */
function EditAssemblyModal({ asal, onClose, onDone }: {
  asal: Assembly; onClose: () => void; onDone: (sourceBaru: string) => void;
}) {
  const [editType, setEditType] = useState<"correction" | "deviation">("correction");
  const [alasan, setAlasan] = useState("");
  const [koef, setKoef] = useState<Record<string, string>>({});
  const [simpan, setSimpan] = useState(false);
  const [err, setErr] = useState("");

  const komponen = [...asal.components].sort((a, b) => a.sort_order - b.sort_order);
  const jadiCompany = editType === "deviation" && asal.source === "national";

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setErr("");
    try {
      const diubah = komponen
        .filter(c => c.resource && koef[c.resource.code]?.trim())
        .map(c => ({ resource_code: c.resource!.code, coefficient: Number(koef[c.resource!.code]) }))
        .filter(x => Number.isFinite(x.coefficient) && x.coefficient > 0);

      if (diubah.length === 0) {
        setErr("Ubah minimal satu koefisien — versi baru identik dengan asalnya tidak dibuat.");
        setSimpan(false);
        return;
      }
      if (!alasan.trim()) {
        setErr("Alasan wajib diisi — tercatat sebagai jejak audit.");
        setSimpan(false);
        return;
      }

      const r = await api.post<{ data: { source: string } }>(
        `/api/v1/cecep/assemblies/${asal.id}/edit`,
        { edit_type: editType, reason: alasan.trim(), components: diubah });
      onDone(r.data.data.source);
    } catch (e: unknown) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Gagal membuat versi baru");
    } finally { setSimpan(false); }
  }

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Edit analisa (versi baru)"
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
      {/*
        Backdrop = `<button>` SAUDARA, bukan `onClick` pada `<div role="dialog">`.

        Bentuk lama menaruh `onClick={onClose}` pada wadah ber-`role="dialog"`,
        dan formnya harus memasang `stopPropagation` hanya untuk menahan klik
        itu — handler yang tak melakukan apa pun tapi tetap membuat `<form>`
        terhitung sebagai elemen non-interaktif yang diberi interaksi.

        `tabIndex={-1}` + `aria-hidden`: klik-latar-untuk-tutup adalah
        kenyamanan tetikus. Papan tik sudah punya Esc (`onKeyDown` di atas),
        dan menambah perhentian Tab untuk area kosong justru memperpanjang
        jalan menuju isi dialognya.
      */}
      <button
        type="button" tabIndex={-1} aria-hidden onClick={onClose}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", padding: 0, cursor: "default" }}
      />
      <form onSubmit={kirim} style={{
        position: "relative", zIndex: 1,
        ...GAYA_KARTU, width: "100%", maxWidth: 660, maxHeight: "88vh", overflowY: "auto", padding: "var(--pad-kartu-lega)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
              Edit <code style={{ color: C.navy }}>{asal.code}</code> (versi baru)
            </h2>
            <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.55 }}>
              Membuat versi {asal.version_number + 1} berstatus draft. Analisa yang sudah
              dipakai di estimasi tetap memakai versi {asal.version_number} — tidak berubah.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={17} color={C.mid} />
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: "8px 12px", background: C.redBg,
                        border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 12, color: C.text }}>
            {err}
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <div>
            <span id="jenis-perubahan" style={lbl}>Jenis perubahan</span>
            <div role="group" aria-labelledby="jenis-perubahan" style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setEditType("correction")}
                style={{ ...btnGhost, flex: 1, justifyContent: "center",
                         background: editType === "correction" ? C.bg : "none",
                         borderColor: editType === "correction" ? C.navy : C.border,
                         color: editType === "correction" ? C.navy : C.mid }}>
                Perbaikan (correction)
              </button>
              <button type="button" onClick={() => setEditType("deviation")}
                style={{ ...btnGhost, flex: 1, justifyContent: "center",
                         background: editType === "deviation" ? C.bg : "none",
                         borderColor: editType === "deviation" ? C.navy : C.border,
                         color: editType === "deviation" ? C.navy : C.mid }}>
                Penyimpangan (deviation)
              </button>
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              {editType === "correction"
                ? `Angka semula salah (mis. salah baca sumber). Hasil tetap "${asal.source === "national" ? "nasional" : "perusahaan"}" — labelnya dipertahankan.`
                : jadiCompany
                  ? "Cara kerja tim ini sengaja berbeda dari standar nasional. Hasil OTOMATIS jadi milik perusahaan — katalog nasional tetap murni."
                  : "Cara kerja sengaja diubah dari versi sebelumnya."}
            </p>
          </div>
          <div>
            <label htmlFor="alasan-2" style={lbl}>Alasan</label>
            <input className="isian-fokus" id="alasan-2" value={alasan} onChange={e => setAlasan(e.target.value)}
              placeholder={editType === "correction"
                ? "Mis. koefisien terbaca 0,07, seharusnya 0,7"
                : "Mis. tim kami butuh waktu lebih lama untuk pekerjaan ini"}
              required style={GAYA_ISIAN} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
            Ubah koefisien
          </p>
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            Kosongkan yang tidak berubah. Minimal satu koefisien wajib diubah.
          </p>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              scope="row", tabular-nums, dan overflow-x dijamin komponen.
              `kepalaBaris` di Uraian, alasan sama dengan tabel adopsi di atas:
              nama bahan yang menamai baris, bukan angka koefisiennya. */}
          <Tabel<AsmComponent & { resource: NonNullable<AsmComponent["resource"]> }>
              berpermukaan
            caption="Perbandingan harga satuan yang berlaku sekarang dengan yang akan diterapkan, per uraian."
            data={komponen.filter((c): c is AsmComponent & { resource: NonNullable<AsmComponent["resource"]> } => Boolean(c.resource))}
            kunciBaris={c => c.resource.code}
            kolom={[
              { kunci: "uraian", judul: "Uraian", kepalaBaris: true, render: c => (
                <span style={{ lineHeight: 1.45 }}>
                  {c.resource.name}
                  <span style={{ color: C.muted, marginLeft: 6 }}>{c.resource.unit_code}</span>
                </span>
              ) },
              { kunci: "sekarang", judul: "Sekarang", rata: "kanan", render: c => (
                <span style={{ fontFamily: "monospace", color: C.mid }}>{Number(c.coefficient)}</span>
              ) },
              { kunci: "jadi", judul: "Jadi", rata: "kanan", lebar: 130, render: c => (
                <input className="isian-fokus"
                  aria-label={`Koefisien baru untuk ${c.resource.name}`}
                  value={koef[c.resource.code] ?? ""}
                  onChange={e => setKoef(k => ({ ...k, [c.resource.code]: e.target.value }))}
                  placeholder={String(Number(c.coefficient))}
                  inputMode="decimal"
                  style={{ ...GAYA_ISIAN, textAlign: "right", fontFamily: "monospace", padding: "6px 8px" }}
                />
              ) },
            ]}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="submit" disabled={simpan} style={{
            padding: "8px 16px", borderRadius: 10, border: "none", background: "var(--grad-aksen)",
            color: C.onNavy, fontSize: 13, fontWeight: 600,
            cursor: simpan ? "wait" : "pointer", opacity: simpan ? 0.7 : 1,
          }}>
            {simpan ? "Menyimpan…" : "Buat versi baru (draft)"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Batal</button>
        </div>
      </form>
    </div>,
    document.body
  );
}


export default function KatalogAhspPage() {
  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div style={{ marginBottom: 14 }}>
        <KepalaHalaman
          judul="Katalog AHSP"
          keterangan="Analisa harga satuan pekerjaan — nasional ber-edisi dan analisa perusahaan sendiri. Dipakai lintas proyek."
          ikon={<BookOpen size={19} />}
        />
      </div>
      <KatalogTab />
    </div>
  );
}
