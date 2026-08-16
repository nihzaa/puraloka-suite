"use client";

/**
 * GUDANG & LOKASI — tempat penyimpanan sebagai entitas tersendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MENENTUKAN RANCANGANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. ISI GUDANG adalah angka utama tiap kartu. Gudang kosong dan gudang
 *    berisi 800 sak terlihat sama tanpa itu — dan yang membedakan keduanya
 *    adalah apakah ia boleh dinonaktifkan.
 *
 * 2. MENONAKTIFKAN bukan menghapus. `gudang_stok` ber-CASCADE: menghapus
 *    gudang memusnahkan seluruh catatan stoknya, dan itu dasar rekonsiliasi.
 *    Yang disediakan hanya menonaktifkan — dan itu pun ditolak selama masih
 *    berisi, karena barang di lokasi nonaktif tak bisa dikeluarkan dari
 *    mana pun.
 *
 * 3. PENJAGA ditampilkan, bukan hanya disimpan. Gudang tanpa penanggung
 *    jawab adalah gudang yang selisih stoknya tak bisa ditanyakan ke siapa
 *    pun.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Warehouse, RefreshCw, Plus, Pencil, Package, UserCheck, PowerOff, Power,
} from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

interface Gudang {
  id: string;
  kode: string;
  nama: string;
  alamat: string | null;
  aktif: boolean;
  catatan: string | null;
  penjaga_id: string | null;
  penjaga?: { id: string; name: string } | null;
  jenis_material: number;
  total_qty: number;
}

interface Anggota {
  id: string;
  name: string;
}

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export default function GudangLokasiPage() {
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "baru" } | { mode: "sunting"; g: Gudang } | null>(null);

  const bolehKelola = useSyncExternalStore(
    langganan, () => hasPermission("gudang:manage"), () => false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua permintaan lama (gudang + pegawai) dipisah jadi dua `useData`. Yang
    kedua (daftar penjaga) TETAP tidak boleh melumpuhkan halaman kalau gagal —
    itu sebabnya `anggota` diturunkan dengan fallback array kosong, bukan
    membaca `galatAnggota`.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ gudang: Gudang[] }>("/api/v1/gudang");
  const { data: dataPegawai } =
    useData<{ pegawai: Array<{ user?: { id: string; name: string } | null }> }>("/api/v1/sdm/pegawai");

  // `useMemo` di sini bukan optimisasi — ia menstabilkan rujukan array
  // supaya `useMemo` lain (baris `urut` di bawah) yang bergantung padanya
  // tak menghitung ulang tiap render. `data?.gudang ?? []` sebagai ekspresi
  // langsung melahirkan array baru tiap render, yang bikin dependensi
  // hook di bawahnya berubah "terus-menerus" (react-hooks/exhaustive-deps).
  const daftar = useMemo(() => data?.gudang ?? [], [data]);
  const anggota = useMemo(
    () => (dataPegawai?.pegawai ?? []).map((x) => x.user).filter((u): u is Anggota => !!u),
    [dataPegawai],
  );

  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI (pesan sukses/gagal dari tombol) sengaja
    dipisah — pola yang sama tiga kali ditemukan di halaman lain di F4-2.
    Satu state `galat` untuk keduanya membuat gagal menyimpan menghapus
    pesan gagal memuat, dan sebaliknya.
  */
  const [pesanAksi, setPesanAksi] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const pesan = pesanAksi ?? (galatMuat
    ? { jenis: "galat" as const, teks: "Gagal memuat daftar gudang." }
    : null);

  // Pesan aksi hilang sendiri sesudah 6 detik. Ini efek samping yang tak bisa
  // masuk `useData`, jadi tetap `useEffect` tersendiri — bergantung hanya
  // pada `pesanAksi`.
  useEffect(() => {
    if (!pesanAksi) return;
    const t = setTimeout(() => setPesanAksi(null), 6000);
    return () => clearTimeout(t);
  }, [pesanAksi]);

  async function ubahAktif(g: Gudang) {
    setSibuk(g.id);
    setPesanAksi(null);
    try {
      await api.patch(`/api/v1/gudang/${g.id}`, { aktif: !g.aktif });
      setPesanAksi({
        jenis: "ok",
        teks: g.aktif
          ? `${g.kode} dinonaktifkan — ia tak lagi muncul sebagai pilihan lokasi.`
          : `${g.kode} diaktifkan kembali.`,
      });
      await muat();
    } catch (e) {
      setPesanAksi({
        jenis: "galat",
        teks: (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal mengubah status gudang.",
      });
    } finally {
      setSibuk(null);
    }
  }

  // Yang aktif di atas; yang nonaktif jadi riwayat di bawah.
  const urut = useMemo(
    () => [...daftar].sort((a, b) =>
      Number(b.aktif) - Number(a.aktif) || a.kode.localeCompare(b.kode)),
    [daftar],
  );

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Gudang & Lokasi"
          keterangan="Tempat penyimpanan material beserta penanggung jawabnya — berbeda dari stok per-proyek, yang mengikuti lokasi pekerjaannya."
          ikon={<Warehouse size={19} />}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bolehKelola && (
            <button
              type="button"
              onClick={() => setForm({ mode: "baru" })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
                cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Tambah gudang
            </button>
          )}
          <button
            type="button"
            onClick={() => void muat()}
            disabled={memuat}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: memuat ? "default" : "pointer", opacity: memuat ? 0.5 : 1,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Muat ulang
          </button>
        </div>
      </div>

      {pesan && (
        <div role="alert" style={{
          ...GAYA_KARTU, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: pesan.jenis === "ok" ? "var(--success-border)" : "var(--danger-border)",
          background: pesan.jenis === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
          color: pesan.jenis === "ok" ? "var(--success)" : "var(--danger)",
          fontSize: 13, lineHeight: 1.55,
        }}>
          {pesan.teks}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat daftar gudang…
        </div>
      ) : urut.length === 0 ? (
        <Kosong
          ikon={<Warehouse size={28} />}
          judul="Belum ada gudang tercatat"
          sebab={
            <>
              Stok material kini mengikuti <strong>proyek</strong>, bukan lokasi fisiknya.
              Gudang sebagai entitas tersendiri dibutuhkan saat material disimpan
              terpusat lalu dikirim ke beberapa proyek — dan saat selisih stok perlu
              ditanyakan ke penanggung jawab yang jelas.
            </>
          }
          aksi={bolehKelola ? (
            <button
              type="button" onClick={() => setForm({ mode: "baru" })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--grad-aksen)", color: "var(--on-aksen)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Tambah gudang pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {urut.map((g) => (
            <KartuGudang
              key={g.id}
              g={g}
              sibuk={sibuk === g.id}
              bolehKelola={bolehKelola}
              onSunting={() => setForm({ mode: "sunting", g })}
              onUbahAktif={() => void ubahAktif(g)}
            />
          ))}
        </div>
      )}

      {form && (
        <FormGudang
          mode={form.mode}
          awal={form.mode === "sunting" ? form.g : null}
          anggota={anggota}
          onTutup={() => setForm(null)}
          onSelesai={(teks) => {
            setForm(null);
            setPesanAksi({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}
    </div>
  );
}

function KartuGudang({ g, sibuk, bolehKelola, onSunting, onUbahAktif }: {
  g: Gudang;
  sibuk: boolean;
  bolehKelola: boolean;
  onSunting: () => void;
  onUbahAktif: () => void;
}) {
  const berisi = g.jenis_material > 0;

  return (
    <div style={{
      ...GAYA_KARTU, overflow: "hidden",
      borderColor: g.aktif ? C.border : "var(--border)",
      opacity: g.aktif ? 1 : 0.72,
    }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {g.kode}
            <span style={{ color: C.mid, fontWeight: 500 }}> · {g.nama}</span>
            {!g.aktif && (
              <span style={{
                marginInlineStart: 10, fontSize: 11.5, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                nonaktif
              </span>
            )}
          </h3>
          {g.alamat && (
            <div style={{ fontSize: 12.5, color: C.mid, marginTop: 4 }}>{g.alamat}</div>
          )}
          <div style={{
            fontSize: 12, marginTop: 4,
            color: g.penjaga?.name ? C.mid : "var(--warning-teks)",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            <UserCheck size={12} aria-hidden="true" />
            {g.penjaga?.name
              ? `Penjaga: ${g.penjaga.name}`
              : "Belum ada penanggung jawab — selisih stok tak bisa ditanyakan ke siapa pun"}
          </div>
        </div>

        {/* Isi gudang — yang menentukan boleh-tidaknya dinonaktifkan. */}
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 16, fontWeight: 700, color: C.text,
            fontVariantNumeric: "tabular-nums",
          }}>
            <Package size={14} aria-hidden="true" />
            {g.jenis_material}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            jenis material
            {berisi && (
              <>
                {" · "}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {g.total_qty.toLocaleString("id-ID")}
                </span>{" "}
                unit
              </>
            )}
          </div>
        </div>
      </div>

      {/* Baris di bawah kepala kartu memakai `--pad-kartu-lega` yang SAMA
          dengan kepalanya.

          Founder: "di halaman gudang & lokasi juga ini kok mepet banget".
          Diukur: satu kartu memakai TIGA padding berbeda — kepala 16px
          (token), catatan 8px/14px, baris aksi 9px/14px. Selisih vertikal
          8px terhadap 16px membuat baris bawahnya terasa terjepit ke garis
          pemisah, dan karena tiap baris tampak wajar sendiri-sendiri,
          penyebabnya tak pernah menunjuk dirinya. */}
      {g.catatan && (
        <div style={{
          padding: "var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          fontSize: 12.5, color: C.mid, lineHeight: 1.55,
        }}>
          {g.catatan}
        </div>
      )}

      {bolehKelola && (
        <div style={{
          padding: "var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <button
            type="button" onClick={onSunting} disabled={sibuk}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: sibuk ? "not-allowed" : "pointer", opacity: sibuk ? 0.5 : 1,
            }}
          >
            <Pencil size={12} aria-hidden="true" /> Sunting
          </button>

          <button
            type="button" onClick={onUbahAktif}
            disabled={sibuk || (g.aktif && berisi)}
            title={g.aktif && berisi
              ? "Pindahkan isinya lebih dulu — barang di gudang nonaktif tak bisa dikeluarkan"
              : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: g.aktif ? "var(--danger)" : "var(--success)",
              cursor: sibuk || (g.aktif && berisi) ? "not-allowed" : "pointer",
              opacity: sibuk || (g.aktif && berisi) ? 0.45 : 1,
            }}
          >
            {g.aktif
              ? <><PowerOff size={12} aria-hidden="true" /> Nonaktifkan</>
              : <><Power size={12} aria-hidden="true" /> Aktifkan</>}
          </button>

          {g.aktif && berisi && (
            <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>
              Masih menyimpan {g.jenis_material} jenis material.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const GAYA_ISIAN: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 6,
  border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box",
  background: "var(--surface)", color: C.text,
};

function Label({ htmlFor, children, wajib }: {
  htmlFor: string; children: React.ReactNode; wajib?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} style={{
      display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4,
    }}>
      {children}
      {wajib && <span style={{ color: "var(--danger)" }} aria-hidden="true"> *</span>}
    </label>
  );
}

function FormGudang({ mode, awal, anggota, onTutup, onSelesai }: {
  mode: "baru" | "sunting";
  awal: Gudang | null;
  anggota: Anggota[];
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [isi, setIsi] = useState({
    kode: awal?.kode ?? "",
    nama: awal?.nama ?? "",
    alamat: awal?.alamat ?? "",
    penjaga_id: awal?.penjaga_id ?? "",
    catatan: awal?.catatan ?? "",
  });
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const ubah = (k: keyof typeof isi, v: string) => setIsi((x) => ({ ...x, [k]: v }));
  const boleh = (mode === "sunting" || isi.kode.trim() !== "") && isi.nama.trim() !== "";

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      if (mode === "baru") {
        const r = await api.post<{ gudang: { kode: string } }>("/api/v1/gudang", {
          kode: isi.kode.trim(),
          nama: isi.nama.trim(),
          alamat: isi.alamat.trim() || null,
          penjaga_id: isi.penjaga_id || null,
          catatan: isi.catatan.trim() || null,
        });
        onSelesai(`Gudang ${r.data.gudang.kode} ditambahkan.`);
      } else {
        // Kode TIDAK dikirim saat menyunting: ia identitas gudang, dan
        // mengubahnya membuat dokumen lama menunjuk kode yang tak ada lagi.
        await api.patch(`/api/v1/gudang/${awal!.id}`, {
          nama: isi.nama.trim(),
          alamat: isi.alamat.trim() || null,
          penjaga_id: isi.penjaga_id || null,
          catatan: isi.catatan.trim() || null,
        });
        onSelesai(`Gudang ${awal!.kode} diperbarui.`);
      }
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menyimpan gudang.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul={mode === "baru" ? "Tambah gudang" : `Sunting ${awal?.kode}`}
      keterangan="Gudang adalah lokasi fisik penyimpanan — berbeda dari stok per-proyek, yang mengikuti lokasi pekerjaannya."
      lebar={520}
      kaki={
        <>
          <button
            type="button" onClick={onTutup}
            style={{
              padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button" onClick={() => void kirim()} disabled={sibuk || !boleh}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || !boleh ? "not-allowed" : "pointer",
              opacity: sibuk || !boleh ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menyimpan…" : "Simpan"}
          </button>
        </>
      }
    >
      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "8px 12px", borderRadius: 6,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          color: "var(--danger)", fontSize: 12.5, lineHeight: 1.55,
        }}>
          {galat}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 14, marginBottom: 14,
      }}>
        <div>
          <Label htmlFor="gd-kode" wajib>Kode</Label>
          <input className="isian-fokus"
            id="gd-kode" value={isi.kode} onChange={(e) => ubah("kode", e.target.value)}
            placeholder="cth: GD-PUSAT"
            disabled={mode === "sunting"}
            style={{ ...GAYA_ISIAN, opacity: mode === "sunting" ? 0.6 : 1 }}
          />
          {mode === "sunting" && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Kode tak bisa diubah — dokumen lama menunjuk kode ini.
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="gd-nama" wajib>Nama</Label>
          <input className="isian-fokus"
            id="gd-nama" value={isi.nama} onChange={(e) => ubah("nama", e.target.value)}
            placeholder="cth: Gudang Pusat Cimahi" style={GAYA_ISIAN}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="gd-alamat">Alamat</Label>
        <input className="isian-fokus"
          id="gd-alamat" value={isi.alamat} onChange={(e) => ubah("alamat", e.target.value)}
          placeholder="cth: Jl. Raya Cimahi No. 45" style={GAYA_ISIAN}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="gd-penjaga">Penanggung jawab</Label>
        <select
          id="gd-penjaga" value={isi.penjaga_id}
          onChange={(e) => ubah("penjaga_id", e.target.value)}
          style={GAYA_ISIAN}
        >
          <option value="">— belum ditentukan —</option>
          {anggota.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          Gudang tanpa penanggung jawab adalah gudang yang selisih stoknya tak bisa
          ditanyakan ke siapa pun.
        </div>
      </div>

      <div>
        <Label htmlFor="gd-catatan">Catatan</Label>
        <textarea className="isian-fokus"
          id="gd-catatan" rows={2} value={isi.catatan}
          onChange={(e) => ubah("catatan", e.target.value)}
          placeholder="cth: Hanya untuk material curah; semen disimpan terpisah"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>
    </DialogBersama>
  );
}
