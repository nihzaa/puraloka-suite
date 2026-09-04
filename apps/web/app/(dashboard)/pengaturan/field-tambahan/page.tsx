"use client";

/**
 * PENGATURAN — FIELD TAMBAHAN (TJS-P5).
 *
 * Tiap perusahaan konstruksi punya data yang tak ada di manapun kecuali di
 * kepala mereka sendiri: kode internal proyek, nomor BPJS pegawai, kode
 * gudang lama yang belum sempat dimigrasi. Halaman ini tempat mereka
 * menambahkannya sendiri.
 *
 * ── Yang SENGAJA dibatasi, dan kenapa batasnya ditampilkan
 *
 * Lima entitas, enam tipe, maksimum 20 field per entitas. Batas itu bukan
 * kekurangan yang menunggu diperbaiki — ia yang memisahkan "custom field
 * terbatas" dari EAV penuh (Never Build List).
 *
 * Karena itu sisa kuota DITAMPILKAN, bukan disembunyikan sampai tertabrak.
 * Pengguna yang melihat "14 dari 20 terpakai" menata field-nya; pengguna yang
 * baru tahu saat ditolak menganggapnya bug.
 *
 * ── Kenapa tak ada tombol Hapus
 *
 * Menghapus definisi ikut menghapus seluruh NILAI-nya (ON DELETE CASCADE) —
 * data yang diisi orang selama berbulan-bulan, hilang dari satu klik di
 * layar pengaturan. Yang tersedia: menonaktifkan. Field nonaktif hilang dari
 * formulir, nilainya tetap terbaca.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { useData } from "@/lib/data-cache";
import { SlidersHorizontal, Plus, Check, AlertTriangle, EyeOff, Eye } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { Saklar } from "@/components/saklar";
import { Pilihan } from "@/components/pilihan";

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 14, boxShadow: "var(--naik-1)",
};

interface Definisi {
  id: string;
  entitas: string;
  tipe: string;
  kunci: string;
  label: string;
  wajib: boolean;
  opsi: string[];
  urutan: number;
  aktif: boolean;
}

interface Katalog {
  entitas: string[];
  tipe: string[];
  batas_per_entitas: number;
}

/** Nama entitas dalam bahasa yang dipakai orang, bukan nama tabel. */
const NAMA_ENTITAS: Record<string, string> = {
  projects: "Proyek",
  suppliers: "Pemasok",
  materials: "Material",
  pegawai: "Pegawai",
  clients: "Klien",
};

const NAMA_TIPE: Record<string, string> = {
  teks: "Teks",
  angka: "Angka",
  tanggal: "Tanggal",
  boolean: "Ya/Tidak",
  pilihan: "Pilihan",
  uang: "Uang (Rp)",
};



export default function Konten() {
  const bolehKelola = useIzin("settings:customfield:manage");
  const [entitas, setEntitas] = useState("projects");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua endpoint independen (katalog, definisi) → dua `useData` terpisah,
    menggantikan `Promise.all` manual. `loading` gabungan keduanya supaya
    halaman tak berkedip menampilkan tabel kosong sebelum katalog datang.
  */
  const { data: katalog, memuat: memuatKatalog, galat: galatKatalog } = useData<Katalog>("/api/v1/custom-field/katalog");
  const { data: dataDef, memuat: memuatDef, galat: galatDef, muatUlang: muatUlangDef } =
    useData<{ definisi: Definisi[] }>("/api/v1/custom-field/def?all=true");
  const loading = memuatKatalog || memuatDef;
  const galatMuat = galatKatalog || galatDef;
  const load = async () => { await muatUlangDef(); };
  const rows = dataDef?.definisi ?? [];

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const rowsEntitas = rows.filter(r => r.entitas === entitas);
  const terpakai = rowsEntitas.length;
  const batas = katalog?.batas_per_entitas ?? 20;
  const penuh = terpakai >= batas;

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {toast && (
        <div
          role="alert"
          style={{
            position: "fixed", top: 20, right: 24, zIndex: 9999,
            background: toast.type === "success" ? C.greenBg : C.redBg,
            border: `1px solid ${toast.type === "success" ? C.greenBorder : C.redBorder}`,
            borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "center",
            gap: 8, boxShadow: "var(--naik-2)", fontSize: 13, maxWidth: 420,
            color: toast.type === "success" ? C.green : C.red,
          }}
        >
          {toast.type === "success" ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          <span style={{ lineHeight: 1.45 }}>{toast.msg}</span>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <KepalaHalaman
          judul="Field Tambahan"
          keterangan="Data yang khas perusahaan Anda dan tak ada di formulir bawaan — kode internal, nomor registrasi, kategori sendiri."
          ikon={<SlidersHorizontal size={19} />}
        />
      </div>

      {!bolehKelola && (
        <div style={{ marginBottom: 20, padding: "8px 12px", borderRadius: 6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 12, color: "var(--warning-teks)" }}>
          Anda dapat melihat daftar, tetapi hanya pengguna dengan izin <strong>Kelola field tambahan</strong> yang bisa mengubahnya.
        </div>
      )}

      {/* Pemilih entitas. Tab-per-entitas, bukan halaman terpisah: yang
          dilihat sama (daftar field), yang berbeda hanya penyaringnya —
          ARAH-VISUAL-2026 §6a. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {(katalog?.entitas ?? []).map(e => {
          const n = rows.filter(r => r.entitas === e).length;
          const aktif = e === entitas;
          return (
            <button
              key={e}
              onClick={() => setEntitas(e)}
              aria-pressed={aktif}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: 13,
                fontWeight: aktif ? 600 : 500, cursor: "pointer",
                border: `1px solid ${aktif ? C.navy : C.border}`,
                background: aktif ? C.navyLight : "var(--surface)",
                color: aktif ? C.navy : C.mid,
              }}
            >
              {NAMA_ENTITAS[e] ?? e}
              {n > 0 && (
                <span style={{ marginInlineStart: 6, fontSize: "var(--t-kecil)", color: aktif ? C.navy : C.muted, fontVariantNumeric: "tabular-nums" }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Kuota ditampilkan SEBELUM tertabrak, bukan sesudah. */}
      <div style={{ marginBottom: 14, fontSize: 12, color: penuh ? "var(--warning-teks)" : C.muted, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{terpakai} dari {batas} field terpakai</span>
        {penuh && (
          <span>
            — batas tercapai. Nonaktifkan yang tak terpakai sebelum menambah;
            batas ini yang menjaga formulir tetap bisa dibaca.
          </span>
        )}
      </div>

      {bolehKelola && katalog && !penuh && (
        <KartuTambah
          katalog={katalog}
          entitas={entitas}
          adaKunci={rowsEntitas.map(r => r.kunci)}
          onDone={() => { void load(); setToast({ type: "success", msg: "Field ditambahkan" }); }}
          onError={(m) => setToast({ type: "error", msg: m })}
        />
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 13 }}>Memuat…</div>
      ) : galatMuat ? (
        // Galat MUAT dipisah dari `toast` (dipakai untuk galat AKSI simpan
        // field) — satu state untuk keduanya membuat gagal menyimpan
        // menghapus pesan gagal memuat.
        <div role="alert" style={{ ...card, padding: 40, textAlign: "center", color: C.red, fontSize: 13 }}>
          Gagal memuat daftar field tambahan.{" "}
          <button onClick={() => void load()} style={{ color: C.navy, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
            Coba lagi.
          </button>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 110px 90px", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <div>Label</div><div>Kunci</div><div>Tipe</div><div style={{ textAlign: "right" }}>Status</div>
          </div>
          {rowsEntitas.map(r => (
            <Baris
              key={r.id} row={r} bolehKelola={bolehKelola}
              onSaved={(pesan) => { void load(); setToast({ type: "success", msg: pesan }); }}
              onError={(m) => setToast({ type: "error", msg: m })}
            />
          ))}
          {rowsEntitas.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
              Belum ada field tambahan untuk {NAMA_ENTITAS[entitas] ?? entitas}.
              <br />
              <span style={{ fontSize: 12 }}>
                Formulir bawaan sudah memuat yang umum — tambahkan di sini hanya yang khas perusahaan Anda.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KartuTambah({ katalog, entitas, adaKunci, onDone, onError }: {
  katalog: Katalog;
  entitas: string;
  adaKunci: string[];
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [label, setLabel] = useState("");
  const [tipe, setTipe] = useState("teks");
  const [opsi, setOpsi] = useState("");
  const [wajib, setWajib] = useState(false);
  const [simpan, setSimpan] = useState(false);

  // Kunci diturunkan dari label, tidak diminta terpisah.
  //
  // Meminta dua isian yang salah satunya bisa dihitung membuat pengguna
  // memikirkan hal yang bukan urusannya — dan kunci yang diketik manual
  // hampir selalu berakhir sebagai "field1", "field2".
  const kunci = label.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  const kembar = adaKunci.includes(kunci);
  const daftarOpsi = opsi.split("\n").map(s => s.trim()).filter(Boolean);

  async function kirim() {
    if (!label.trim()) { onError("Label wajib diisi"); return; }
    if (kunci.length < 2) { onError("Label harus memuat minimal 2 huruf/angka"); return; }
    if (kembar) { onError(`Kunci "${kunci}" sudah dipakai di entitas ini`); return; }
    if (tipe === "pilihan" && daftarOpsi.length === 0) {
      onError("Tipe Pilihan butuh minimal satu opsi — dropdown kosong tak bisa diisi siapa pun");
      return;
    }
    setSimpan(true);
    try {
      await api.post("/api/v1/custom-field/def", {
        entitas, tipe, kunci, label: label.trim(), wajib,
        opsi: tipe === "pilihan" ? daftarOpsi : [],
      });
      setLabel(""); setOpsi(""); setWajib(false); setTipe("teks"); setBuka(false);
      onDone();
    } catch (err) {
      onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menambah field");
    } finally {
      setSimpan(false);
    }
  }

  if (!buka) {
    return (
      <button
        onClick={() => setBuka(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", marginBottom: 18, borderRadius: 10, border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        <Plus size={14} aria-hidden="true" /> Tambah field
      </button>
    );
  }

  return (
    <div style={{ ...card, padding: 18, marginBottom: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
        <div>
          <label htmlFor="cf-label" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
            Nama field
          </label>
          <input className="isian-fokus"
            id="cf-label" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="cth: Kode Internal"
            style={GAYA_ISIAN}
          />
          {kunci && (
            <div style={{ marginTop: 4, fontSize: "var(--t-kecil)", color: kembar ? C.red : C.muted }}>
              kunci: <code>{kunci}</code>{kembar && " — sudah dipakai"}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="cf-tipe" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
            Tipe
          </label>
          <Pilihan id="cf-tipe" value={tipe} onChange={e => setTipe(e.target.value)} style={GAYA_ISIAN}>
            {katalog.tipe.map(t => <option key={t} value={t}>{NAMA_TIPE[t] ?? t}</option>)}
          </Pilihan>
        </div>
      </div>

      {tipe === "pilihan" && (
        <div>
          <label htmlFor="cf-opsi" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
            Opsi — satu per baris
          </label>
          <textarea className="isian-fokus"
            id="cf-opsi" value={opsi} onChange={e => setOpsi(e.target.value)} rows={4}
            placeholder={"Utara\nSelatan\nTimur"}
            style={{ ...GAYA_ISIAN, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      )}

      <Saklar nyala={wajib} onUbah={setWajib} label="Wajib diisi" />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={() => { setBuka(false); setLabel(""); setOpsi(""); }}
          style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer" }}
        >
          Batal
        </button>
        <button
          onClick={() => void kirim()} disabled={simpan || kembar}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600, cursor: simpan || kembar ? "not-allowed" : "pointer", opacity: simpan || kembar ? 0.5 : 1 }}
        >
          {simpan ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

function Baris({ row, bolehKelola, onSaved, onError }: {
  row: Definisi;
  bolehKelola: boolean;
  onSaved: (pesan: string) => void;
  onError: (m: string) => void;
}) {
  const [sibuk, setSibuk] = useState(false);

  async function ubahAktif() {
    setSibuk(true);
    try {
      await api.patch(`/api/v1/custom-field/def/${row.id}`, { aktif: !row.aktif });
      onSaved(row.aktif
        ? `"${row.label}" dinonaktifkan — hilang dari formulir, nilainya tetap tersimpan`
        : `"${row.label}" diaktifkan kembali`);
    } catch (err) {
      onError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal menyimpan");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 110px 90px", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center", fontSize: 13, opacity: row.aktif ? 1 : 0.55 }}>
      <div style={{ color: C.text }}>
        {row.label}
        {row.wajib && <span style={{ marginInlineStart: 6, fontSize: "var(--t-kecil)", color: "var(--warning-teks)" }}>wajib</span>}
        {row.tipe === "pilihan" && row.opsi.length > 0 && (
          <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 2 }}>{row.opsi.join(" · ")}</div>
        )}
      </div>
      <div><code style={{ fontSize: 12, color: C.muted }}>{row.kunci}</code></div>
      <div style={{ color: C.mid }}>{NAMA_TIPE[row.tipe] ?? row.tipe}</div>
      <div style={{ textAlign: "right" }}>
        {bolehKelola ? (
          <button
            onClick={() => void ubahAktif()} disabled={sibuk}
            title={row.aktif ? "Nonaktifkan" : "Aktifkan"}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid, fontSize: 12, cursor: sibuk ? "wait" : "pointer" }}
          >
            {row.aktif ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
            {row.aktif ? "Aktif" : "Nonaktif"}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: C.muted }}>{row.aktif ? "Aktif" : "Nonaktif"}</span>
        )}
      </div>
    </div>
  );
}
