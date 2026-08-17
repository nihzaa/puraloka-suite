"use client";

/**
 * DATA KEPEGAWAIAN — pegawai beserta data pajak & jaminan sosialnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MENENTUKAN RANCANGANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. DATA KRITIS YANG KOSONG adalah angka utama halaman ini. NPWP dan status
 *    PTKP yang kosong membuat PPh 21 dihitung dengan tarif salah — itu uang
 *    yang keliru masuk ke kantong orang atau ke kas negara. Departemen yang
 *    kosong hanya membuat laporan kurang rapi.
 *
 * 2. YANG SUDAH KELUAR dipisah, tidak dihitung mendesak. Datanya memang tak
 *    akan dilengkapi lagi, dan menghitungnya membuat angka mendesak tak pernah
 *    bisa turun ke nol.
 *
 * 3. GAJI hanya muncul untuk yang berwenang — server memutuskannya, dan
 *    halaman ini hanya menampilkan apa yang dikirim.
 *
 * 4. PILIHAN PTKP & TER datang dari server, tidak diketik ulang di sini. Dua
 *    daftar untuk hal yang sama pasti berselisih suatu saat, dan yang
 *    berselisih di sini adalah tarif pajak.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  IdCard, RefreshCw, Plus, Pencil, AlertTriangle, UserMinus, Check,
} from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

interface Kelengkapan {
  lengkap: boolean;
  kurang: string[];
  kurangKritis: string[];
}

interface Pegawai {
  id: string;
  user_id: string;
  nomor_induk: string | null;
  jabatan: string | null;
  departemen: string | null;
  tanggal_masuk: string | null;
  tanggal_keluar: string | null;
  status_ptkp: string | null;
  kategori_ter: string | null;
  npwp: string | null;
  nomor_bpjs_tk: string | null;
  nomor_bpjs_kes: string | null;
  jam_standar: number | string;
  catatan: string | null;
  gaji_pokok?: number | string | null;
  user?: { id: string; name: string; email: string } | null;
  kelengkapan: Kelengkapan;
}

interface Ringkasan {
  total: number;
  aktif: number;
  keluar: number;
  kritisKosong: number;
}

interface Calon {
  id: string;
  name: string;
  email: string;
}

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === ""
    ? "—"
    : "Rp " + Math.round(Number(n)).toLocaleString("id-ID");

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export default function KaryawanPage() {
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [form, setForm] = useState<{ mode: "baru" } | { mode: "sunting"; p: Pegawai } | null>(null);

  const bolehKelola = useSyncExternalStore(
    langganan, () => hasPermission("sdm:pegawai:manage"), () => false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData` menggantikan `Promise.all` + AbortController + putaran.
    Daftar calon TETAP "gagal tak melumpuhkan" — `useData` kedua dibiarkan
    berdiri sendiri; kegagalannya (`galatCalon`) sengaja tak diperiksa di
    bawah, persis seperti versi lama yang menelan galatnya lewat `.catch(() =>
    null)`.
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<{
    pegawai: Pegawai[]; ringkasan: Ringkasan;
    pilihan: { status_ptkp: string[]; kategori_ter: string[] };
    boleh_lihat_gaji: boolean;
  }>("/api/v1/sdm/pegawai/kelola");
  const { data: dataCalon, muatUlang: muatUlangCalon } =
    useData<{ calon: Calon[] }>("/api/v1/sdm/pegawai/calon");

  // `useMemo` (bukan turunan biasa): `daftar` masuk dependensi `useMemo`
  // `urut` di bawah, dan `[] !== []` tiap render membuatnya berjalan ulang
  // tanpa henti.
  const daftar = useMemo(() => data?.pegawai ?? [], [data]);
  const ringkasan = data?.ringkasan ?? null;
  const pilihan = data?.pilihan ?? { status_ptkp: [], kategori_ter: [] };
  const bolehLihatGaji = data?.boleh_lihat_gaji ?? false;
  const calon = dataCalon?.calon ?? [];

  const muat = useCallback(async () => {
    await Promise.all([muatUlang(), muatUlangCalon()]);
  }, [muatUlang, muatUlangCalon]);

  /*
    Galat MUAT dan galat AKSI (simpan pegawai) sengaja dipisah — `pesan`
    sudah menjalankan peran galat AKSI (lihat `onSelesai`/galat form di
    bawah), jadi galat muat ditambahkan sebagai lapis terpisah supaya gagal
    menyimpan tidak menghapus pesan gagal memuat.
  */
  const galat = galatMuat ? "Gagal memuat data kepegawaian." : "";

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 6000);
    return () => clearTimeout(t);
  }, [pesan]);

  const hariIni = new Date().toISOString().slice(0, 10);

  // Yang butuh dilengkapi di atas — itu yang membuat halaman ini dibuka.
  const urut = useMemo(() => {
    const bobot = (p: Pegawai) => {
      const keluar = !!p.tanggal_keluar && p.tanggal_keluar <= hariIni;
      if (keluar) return 2;
      return p.kelengkapan.kurangKritis.length > 0 ? 0 : 1;
    };
    return [...daftar].sort((a, b) =>
      bobot(a) - bobot(b) || (a.nomor_induk ?? "zzz").localeCompare(b.nomor_induk ?? "zzz"));
  }, [daftar, hariIni]);

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Data Kepegawaian"
          keterangan="Data staf beserta NPWP, status PTKP, dan jaminan sosialnya — yang dipakai menghitung PPh 21 dan iuran BPJS."
          ikon={<IdCard size={19} />}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bolehKelola && (
            <button
              type="button"
              onClick={() => setForm({ mode: "baru" })}
              disabled={calon.length === 0}
              title={calon.length === 0 ? "Semua pengguna sudah punya data kepegawaian" : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none",
                // Gradasi, sama dengan tombol aksi utama di seluruh aplikasi.
                // `var(--aksen)` rata membuat tombol ini terlihat berbeda dari
                // "Buat" yang berdiri beberapa sentimeter di atasnya, di layar
                // yang SAMA — dan dua tombol utama bergaya berbeda dalam satu
                // pandangan terbaca sebagai dua tingkat kepentingan yang
                // sebenarnya tak ada.
                background: calon.length === 0 ? "var(--surface-subtle)" : "var(--grad-aksen)",
                color: calon.length === 0 ? C.muted : "var(--on-aksen)",
                cursor: calon.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Daftarkan pegawai
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

      {galat && (
        <div role="alert" style={{
          ...GAYA_KARTU, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {ringkasan && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "var(--gap-grid)", marginBottom: "var(--gap-bagian)",
        }}>
          <Angka label="Pegawai aktif" nilai={String(ringkasan.aktif)} />
          <Angka
            label="Data pajak belum lengkap"
            nilai={String(ringkasan.kritisKosong)}
            tekan={ringkasan.kritisKosong > 0}
            keterangan={ringkasan.kritisKosong > 0
              ? "PPh 21 akan dihitung dengan tarif salah"
              : "seluruh pegawai aktif lengkap"}
          />
          <Angka label="Sudah keluar" nilai={String(ringkasan.keluar)} />
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat data kepegawaian…
        </div>
      ) : urut.length === 0 ? (
        <Kosong
          ikon={<IdCard size={28} />}
          judul="Belum ada data kepegawaian"
          sebab={
            <>
              Akun pengguna sudah ada, tetapi data <strong>kepegawaian</strong>-nya belum —
              dan itu yang dipakai menghitung PPh 21, iuran BPJS, serta masa kerja untuk
              cuti. Tanpa itu, pengajuan cuti dan klaim perjalanan tak punya tujuan.
            </>
          }
          aksi={bolehKelola && calon.length > 0 ? (
            <button
              type="button" onClick={() => setForm({ mode: "baru" })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--grad-aksen)", color: "var(--on-aksen)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Daftarkan pegawai pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {urut.map((p) => (
            <KartuPegawai
              key={p.id}
              p={p}
              hariIni={hariIni}
              bolehKelola={bolehKelola}
              bolehLihatGaji={bolehLihatGaji}
              onSunting={() => setForm({ mode: "sunting", p })}
            />
          ))}
        </div>
      )}

      {form && (
        <FormPegawai
          mode={form.mode}
          awal={form.mode === "sunting" ? form.p : null}
          calon={calon}
          pilihan={pilihan}
          bolehLihatGaji={bolehLihatGaji}
          onTutup={() => setForm(null)}
          onSelesai={(teks) => {
            setForm(null);
            setPesan({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}
    </div>
  );
}

function Angka({ label, nilai, keterangan, tekan }: {
  label: string; nilai: string; keterangan?: string; tekan?: boolean;
}) {
  return (
    <div style={{
      ...GAYA_KARTU, padding: "var(--pad-kartu-lega)",
      borderColor: tekan ? "var(--warning-border)" : C.border,
      background: tekan ? "var(--warning-bg)" : "var(--surface)",
    }}>
      <div style={{ fontSize: 12, color: tekan ? "var(--warning-teks)" : C.mid, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
        {nilai}
      </div>
      {keterangan && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>
          {keterangan}
        </div>
      )}
    </div>
  );
}

function KartuPegawai({ p, hariIni, bolehKelola, bolehLihatGaji, onSunting }: {
  p: Pegawai;
  hariIni: string;
  bolehKelola: boolean;
  bolehLihatGaji: boolean;
  onSunting: () => void;
}) {
  const keluar = !!p.tanggal_keluar && p.tanggal_keluar <= hariIni;
  const kritis = p.kelengkapan.kurangKritis.length > 0 && !keluar;

  return (
    <div style={{
      ...GAYA_KARTU, overflow: "hidden",
      borderColor: kritis ? "var(--warning-border)" : C.border,
      opacity: keluar ? 0.72 : 1,
    }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {p.user?.name ?? "(tanpa nama)"}
            {p.nomor_induk && (
              <span style={{ color: C.muted, fontWeight: 500 }}> · {p.nomor_induk}</span>
            )}
            {keluar && (
              <span style={{
                marginInlineStart: 10, display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11.5, fontWeight: 700, color: C.mid,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                <UserMinus size={11} aria-hidden="true" /> keluar {p.tanggal_keluar}
              </span>
            )}
          </h3>
          <div style={{ fontSize: 12.5, color: C.mid, marginTop: 4 }}>
            {p.jabatan ?? "jabatan belum diisi"}
            {p.departemen && ` · ${p.departemen}`}
            {p.tanggal_masuk && ` · masuk ${p.tanggal_masuk}`}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {p.user?.email}
          </div>
        </div>

        <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 12 }}>
          {bolehLihatGaji && (
            <div>
              <div style={{ fontSize: 11, color: C.muted }}>Gaji pokok</div>
              <div style={{
                fontSize: 15, fontWeight: 700, color: C.text,
                fontVariantNumeric: "tabular-nums",
              }}>
                {rupiah(p.gaji_pokok)}
              </div>
            </div>
          )}
          {bolehKelola && (
            <button
              type="button" onClick={onSunting}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: "pointer",
              }}
            >
              <Pencil size={12} aria-hidden="true" /> Sunting
            </button>
          )}
        </div>
      </div>

      {/* Yang kritis dibedakan dari yang sekadar kurang rapi. */}
      {kritis && (
        <div style={{
          padding: "var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          background: "var(--warning-bg)", color: "var(--warning-teks)",
          fontSize: 12.5, lineHeight: 1.55,
          display: "flex", alignItems: "flex-start", gap: 7,
        }}>
          <AlertTriangle size={14} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            <strong>{p.kelengkapan.kurangKritis.join(", ")}</strong> belum diisi — PPh 21 dan
            masa kerjanya akan dihitung dengan dasar yang salah.
            {p.kelengkapan.kurang.length > 0 && (
              <span style={{ color: C.mid }}> Selain itu: {p.kelengkapan.kurang.join(", ")}.</span>
            )}
          </span>
        </div>
      )}

      {!kritis && p.kelengkapan.kurang.length > 0 && !keluar && (
        <div style={{
          padding: "var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          color: C.muted, fontSize: 12, lineHeight: 1.5,
        }}>
          Belum diisi: {p.kelengkapan.kurang.join(", ")}.
        </div>
      )}

      {p.kelengkapan.lengkap && !keluar && (
        <div style={{
          padding: "var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          color: "var(--success)", fontSize: 12,
          display: "inline-flex", alignItems: "center", gap: 5,
        }}>
          <Check size={12} aria-hidden="true" /> Data lengkap
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

function Label({ htmlFor, children, wajib, kritis }: {
  htmlFor: string; children: React.ReactNode; wajib?: boolean; kritis?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} style={{
      display: "block", fontSize: 12, fontWeight: 500,
      color: kritis ? "var(--warning-teks)" : C.mid, marginBottom: 4,
    }}>
      {children}
      {wajib && <span style={{ color: "var(--danger)" }} aria-hidden="true"> *</span>}
    </label>
  );
}

function FormPegawai({ mode, awal, calon, pilihan, bolehLihatGaji, onTutup, onSelesai }: {
  mode: "baru" | "sunting";
  awal: Pegawai | null;
  calon: Calon[];
  pilihan: { status_ptkp: string[]; kategori_ter: string[] };
  bolehLihatGaji: boolean;
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [isi, setIsi] = useState({
    nomor_induk: awal?.nomor_induk ?? "",
    jabatan: awal?.jabatan ?? "",
    departemen: awal?.departemen ?? "",
    tanggal_masuk: awal?.tanggal_masuk ?? "",
    tanggal_keluar: awal?.tanggal_keluar ?? "",
    gaji_pokok: awal?.gaji_pokok != null ? String(awal.gaji_pokok) : "",
    status_ptkp: awal?.status_ptkp ?? "",
    kategori_ter: awal?.kategori_ter ?? "",
    npwp: awal?.npwp ?? "",
    nomor_bpjs_tk: awal?.nomor_bpjs_tk ?? "",
    nomor_bpjs_kes: awal?.nomor_bpjs_kes ?? "",
    jam_standar: awal?.jam_standar != null ? String(awal.jam_standar) : "8",
    catatan: awal?.catatan ?? "",
  });
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const ubah = (k: keyof typeof isi, v: string) => setIsi((x) => ({ ...x, [k]: v }));
  const boleh = mode === "sunting" || userId !== "";

  // Terkunci bila sudah keluar — sesuai trigger basis. Tombolnya dimatikan di
  // sini supaya penolakannya tak datang sesudah semua kolom diisi ulang.
  const hariIni = new Date().toISOString().slice(0, 10);
  const terkunci = mode === "sunting"
    && !!awal?.tanggal_keluar && awal.tanggal_keluar <= hariIni;

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      // Nominal & teks kosong dikirim `null`, BUKAN "" atau 0 — server
      // menerjemahkannya jadi "belum diisi", dan itu berbeda dari "nol rupiah".
      const kosongJadiNull = (v: string) => (v.trim() === "" ? null : v.trim());
      const isian = {
        nomor_induk: kosongJadiNull(isi.nomor_induk),
        jabatan: kosongJadiNull(isi.jabatan),
        departemen: kosongJadiNull(isi.departemen),
        tanggal_masuk: kosongJadiNull(isi.tanggal_masuk),
        tanggal_keluar: kosongJadiNull(isi.tanggal_keluar),
        status_ptkp: kosongJadiNull(isi.status_ptkp),
        kategori_ter: kosongJadiNull(isi.kategori_ter),
        npwp: kosongJadiNull(isi.npwp),
        nomor_bpjs_tk: kosongJadiNull(isi.nomor_bpjs_tk),
        nomor_bpjs_kes: kosongJadiNull(isi.nomor_bpjs_kes),
        jam_standar: isi.jam_standar.trim() === "" ? null : Number(isi.jam_standar),
        catatan: kosongJadiNull(isi.catatan),
        // Gaji hanya dikirim oleh yang berwenang melihatnya — kalau tidak,
        // menyunting jabatan akan MENGHAPUS gaji orang.
        ...(bolehLihatGaji
          ? { gaji_pokok: isi.gaji_pokok.trim() === "" ? null : Number(isi.gaji_pokok) }
          : {}),
      };

      if (mode === "baru") {
        await api.post("/api/v1/sdm/pegawai", { user_id: userId, ...isian });
        onSelesai("Data kepegawaian tersimpan.");
      } else {
        await api.patch(`/api/v1/sdm/pegawai/${awal!.id}`, isian);
        onSelesai(`Data ${awal!.user?.name ?? "pegawai"} diperbarui.`);
      }
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menyimpan data kepegawaian.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul={mode === "baru" ? "Daftarkan pegawai" : `Sunting ${awal?.user?.name ?? "pegawai"}`}
      keterangan="NPWP dan status PTKP menentukan tarif PPh 21 — yang kosong membuat pajaknya dihitung dengan dasar yang salah."
      lebar={660}
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

      {terkunci && (
        <div style={{
          marginBottom: 14, padding: "10px 12px", borderRadius: 8,
          background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
          color: C.mid, fontSize: 12.5, lineHeight: 1.6,
        }}>
          Pegawai ini sudah keluar ({awal?.tanggal_keluar}), jadi data pokoknya
          <strong> terkunci</strong> — slip gaji dan timesheet lama merujuk data ini.
          Kosongkan tanggal keluarnya lebih dulu bila ia kembali bekerja.
        </div>
      )}

      {mode === "baru" && (
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor="peg-user" wajib>Pengguna</Label>
          <select
            id="peg-user" value={userId} onChange={(e) => setUserId(e.target.value)}
            style={GAYA_ISIAN}
          >
            <option value="">— pilih pengguna —</option>
            {calon.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.email}</option>
            ))}
          </select>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
            Hanya pengguna yang belum punya data kepegawaian yang muncul di sini.
          </div>
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 14, marginBottom: 14,
      }}>
        <div>
          <Label htmlFor="peg-nik">Nomor induk</Label>
          <input className="isian-fokus"
            id="peg-nik" value={isi.nomor_induk} onChange={(e) => ubah("nomor_induk", e.target.value)}
            placeholder="cth: P-001" maxLength={40} style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="peg-jabatan">Jabatan</Label>
          <input className="isian-fokus"
            id="peg-jabatan" value={isi.jabatan} onChange={(e) => ubah("jabatan", e.target.value)}
            placeholder="cth: Pelaksana Lapangan" style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="peg-dept">Departemen</Label>
          <input className="isian-fokus"
            id="peg-dept" value={isi.departemen} onChange={(e) => ubah("departemen", e.target.value)}
            placeholder="cth: Operasional" style={GAYA_ISIAN}
          />
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 14, marginBottom: 14,
      }}>
        <div>
          <Label htmlFor="peg-masuk" kritis>Tanggal masuk</Label>
          <input className="isian-fokus"
            id="peg-masuk" type="date" value={isi.tanggal_masuk}
            onChange={(e) => ubah("tanggal_masuk", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="peg-keluar">Tanggal keluar</Label>
          <input className="isian-fokus"
            id="peg-keluar" type="date" value={isi.tanggal_keluar}
            min={isi.tanggal_masuk || undefined}
            onChange={(e) => ubah("tanggal_keluar", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="peg-jam">Jam standar/hari</Label>
          <input className="isian-fokus"
            id="peg-jam" type="number" inputMode="numeric" min={1} max={24}
            value={isi.jam_standar} onChange={(e) => ubah("jam_standar", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
      </div>

      {/* Pajak & jaminan sosial — dikelompokkan karena inilah yang kritis. */}
      <div style={{
        padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
        background: "var(--surface-subtle)", marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Pajak & jaminan sosial
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14,
        }}>
          <div>
            <Label htmlFor="peg-ptkp" kritis>Status PTKP</Label>
            <select
              id="peg-ptkp" value={isi.status_ptkp}
              onChange={(e) => ubah("status_ptkp", e.target.value)}
              style={GAYA_ISIAN}
            >
              <option value="">— belum diisi —</option>
              {pilihan.status_ptkp.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="peg-ter">Kategori TER</Label>
            <select
              id="peg-ter" value={isi.kategori_ter}
              onChange={(e) => ubah("kategori_ter", e.target.value)}
              style={GAYA_ISIAN}
            >
              <option value="">— belum diisi —</option>
              {pilihan.kategori_ter.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="peg-npwp" kritis>NPWP</Label>
            <input className="isian-fokus"
              id="peg-npwp" value={isi.npwp} onChange={(e) => ubah("npwp", e.target.value)}
              placeholder="01.234.567.8-901.000" style={GAYA_ISIAN}
            />
          </div>
          <div>
            <Label htmlFor="peg-bpjstk">BPJS Ketenagakerjaan</Label>
            <input className="isian-fokus"
              id="peg-bpjstk" value={isi.nomor_bpjs_tk}
              onChange={(e) => ubah("nomor_bpjs_tk", e.target.value)}
              style={GAYA_ISIAN}
            />
          </div>
          <div>
            <Label htmlFor="peg-bpjskes">BPJS Kesehatan</Label>
            <input className="isian-fokus"
              id="peg-bpjskes" value={isi.nomor_bpjs_kes}
              onChange={(e) => ubah("nomor_bpjs_kes", e.target.value)}
              style={GAYA_ISIAN}
            />
          </div>
          {bolehLihatGaji && (
            <div>
              <Label htmlFor="peg-gaji">Gaji pokok (Rp)</Label>
              <input className="isian-fokus"
                id="peg-gaji" type="number" inputMode="numeric" min={0}
                value={isi.gaji_pokok} onChange={(e) => ubah("gaji_pokok", e.target.value)}
                style={GAYA_ISIAN}
              />
            </div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          Kosongkan bila belum ada datanya — <strong>kosong</strong> berbeda dari{" "}
          <strong>nol</strong>, dan yang kosong ditandai sebagai belum lengkap, bukan
          dihitung sebagai nol rupiah.
        </div>
      </div>

      <div>
        <Label htmlFor="peg-catatan">Catatan</Label>
        <textarea className="isian-fokus"
          id="peg-catatan" rows={2} value={isi.catatan}
          onChange={(e) => ubah("catatan", e.target.value)}
          placeholder="cth: Mutasi dari divisi estimasi per Maret 2026"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>
    </DialogBersama>
  );
}
