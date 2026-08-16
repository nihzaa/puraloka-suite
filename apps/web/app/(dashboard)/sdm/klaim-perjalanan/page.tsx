"use client";

/**
 * KLAIM PERJALANAN — penggantian biaya yang ditalangi karyawan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MENENTUKAN RANCANGANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. UTANG adalah angka utama halaman ini, bukan jumlah klaim. Klaim yang
 *    sudah disetujui tapi belum cair adalah uang karyawan yang masih dipegang
 *    perusahaan — dan yang menunggunya berhak tahu totalnya.
 *
 * 2. STATUS menentukan tombol yang muncul. Yang menunggu keputusan di atas;
 *    yang menunggu pencairan menyusul; sisanya riwayat.
 *
 * 3. RINCIAN ditampilkan, bukan hanya totalnya. Klaim Rp 850.000 tanpa
 *    rincian tak bisa dinilai penyetujunya — dan itulah yang membuat orang
 *    menyetujui tanpa membaca.
 *
 * 4. YANG DIPANGKAS terlihat. Kalau penyetuju menyetujui Rp 600.000 dari
 *    Rp 850.000 yang diajukan, selisihnya ditampilkan — pengaju berhak tahu
 *    bagian mana yang tak diganti.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Plane, RefreshCw, Plus, Check, X, Wallet, Clock, Trash2,
} from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type StatusKlaim = "diajukan" | "disetujui" | "ditolak" | "dibayar";
type JenisBiaya = "transport" | "penginapan" | "konsumsi" | "bbm" | "tol_parkir" | "lain";

interface Klaim {
  id: string;
  nomor: string;
  tujuan: string;
  keperluan: string;
  tanggal_berangkat: string;
  tanggal_kembali: string;
  total_diajukan: number | string;
  total_disetujui: number | string | null;
  status: StatusKlaim;
  alasan_tolak: string | null;
  catatan: string | null;
  dibayar_pada: string | null;
  pegawai?: { id: string; nomor_induk: string | null; jabatan: string | null; user?: { id: string; name: string } | null } | null;
  penyetuju?: { id: string; name: string } | null;
  proyek?: { id: string; name: string } | null;
}

interface Ringkasan {
  menunggu: number;
  utang: number;
  dibayar: number;
  jumlahMenunggu: number;
  jumlahUtang: number;
}

interface AkunKas {
  id: string;
  name: string;
}

const META: Record<StatusKlaim, { label: string; warna: string; bg: string; border: string }> = {
  diajukan:  { label: "Menunggu keputusan", warna: "var(--warning-teks)",   bg: "var(--warning-bg)",     border: "var(--warning-border)" },
  disetujui: { label: "Menunggu pencairan", warna: "var(--aksen)",          bg: "var(--surface-subtle)", border: "var(--border)" },
  dibayar:   { label: "Sudah dibayar",      warna: "var(--success)",        bg: "var(--success-bg)",     border: "var(--success-border)" },
  ditolak:   { label: "Ditolak",            warna: "var(--danger)",         bg: "var(--danger-bg)",      border: "var(--danger-border)" },
};

const LABEL_JENIS: Record<JenisBiaya, string> = {
  transport: "Transport",
  penginapan: "Penginapan",
  konsumsi: "Konsumsi",
  bbm: "BBM",
  tol_parkir: "Tol & parkir",
  lain: "Lain-lain",
};

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === ""
    ? "—"
    : "Rp " + Math.round(Number(n)).toLocaleString("id-ID");

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export default function KlaimPerjalananPage() {
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [formBuka, setFormBuka] = useState(false);
  const [formTolak, setFormTolak] = useState<Klaim | null>(null);
  const [formBayar, setFormBayar] = useState<Klaim | null>(null);

  const bolehAjukan = useSyncExternalStore(langganan, () => hasPermission("klaim:kelola"), () => false);
  const bolehSetujui = useSyncExternalStore(langganan, () => hasPermission("klaim:setujui"), () => false);
  const bolehBayar = useSyncExternalStore(langganan, () => hasPermission("klaim:bayar"), () => false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `putaran` (penghitung manual untuk memicu efek) DIBUANG — `muatUlang()`
    dari `useData` melakukan hal yang sama langsung, dengan `paksa: true`.

    Akun kas TETAP diminta terpisah dan TIDAK menggagalkan halaman: dulu
    `.catch(() => null)` di dalam `Promise.all` menahan galatnya supaya
    klaim (yang utama) tetap tampil. `useData` kedua memberi perilaku yang
    sama secara alami — galatnya berdiri sendiri, tak pernah menutupi galat
    memuat klaim.
  */
  const { data: dataKlaim, memuat, galat: galatMuat, muatUlang } =
    useData<{ klaim: Klaim[]; ringkasan: Ringkasan }>("/api/v1/klaim-perjalanan");
  const { data: dataAkun } = useData<{ accounts: AkunKas[] }>("/api/v1/cash/accounts");
  // `useMemo`: `daftar` masuk dependensi `useMemo` (`urut`) di bawah — tanpa
  // ini tiap render membuat array baru dan menembus ratchet `exhaustive-deps`.
  const daftar = useMemo(() => dataKlaim?.klaim ?? [], [dataKlaim]);
  const ringkasan = dataKlaim?.ringkasan ?? null;
  const akunKas = dataAkun?.accounts ?? [];
  const muat = muatUlang;

  const galat = galatMuat ? "Gagal memuat klaim perjalanan." : "";

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 6000);
    return () => clearTimeout(t);
  }, [pesan]);

  async function setujui(k: Klaim) {
    setSibuk(k.id);
    setPesan(null);
    try {
      // Tanpa `total_disetujui`, server menyetujui PENUH — kasus terbanyak,
      // dan memaksa mengetik ulang angka yang sama mengundang salah ketik.
      const r = await api.patch<{ pesan?: string }>(
        `/api/v1/klaim-perjalanan/${k.id}/putuskan`, { setujui: true });
      setPesan({ jenis: "ok", teks: r.data.pesan ?? `${k.nomor} disetujui.` });
      void muat();
    } catch (e) {
      setPesan({
        jenis: "galat",
        teks: (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menyetujui klaim.",
      });
    } finally {
      setSibuk(null);
    }
  }

  const urut = useMemo(() => {
    const bobot: Record<StatusKlaim, number> = {
      diajukan: 0, disetujui: 1, dibayar: 2, ditolak: 3,
    };
    return [...daftar].sort((a, b) =>
      bobot[a.status] - bobot[b.status]
      || b.tanggal_berangkat.localeCompare(a.tanggal_berangkat));
  }, [daftar]);

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Klaim Perjalanan"
          keterangan="Penggantian biaya perjalanan dinas yang ditalangi karyawan — berbeda dari kasbon, yang uangnya dicairkan lebih dulu."
          ikon={<Plane size={19} />}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bolehAjukan && (
            <button
              type="button"
              onClick={() => setFormBuka(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
                cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Ajukan klaim
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

      {/* UTANG — angka utama halaman ini. */}
      {ringkasan && (ringkasan.jumlahMenunggu > 0 || ringkasan.utang > 0) && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--gap-grid)", marginBottom: "var(--gap-bagian)",
        }}>
          <Angka
            ikon={<Clock size={15} />}
            label="Menunggu keputusan"
            nilai={rupiah(ringkasan.menunggu)}
            keterangan={`${ringkasan.jumlahMenunggu} klaim`}
          />
          <Angka
            ikon={<Wallet size={15} />}
            label="Utang ke karyawan"
            nilai={rupiah(ringkasan.utang)}
            keterangan={`${ringkasan.jumlahUtang} klaim disetujui, belum cair`}
            tekan={ringkasan.utang > 0}
          />
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat klaim…
        </div>
      ) : urut.length === 0 ? (
        <Kosong
          ikon={<Plane size={28} />}
          judul="Belum ada klaim perjalanan"
          sebab={
            <>
              Klaim adalah <strong>penggantian</strong>: karyawan menalangi lebih dulu,
              perusahaan mengganti sesudahnya. Berbeda dari kasbon, yang uangnya dicairkan
              sebelum belanja — dan karena itu tercatat sebagai piutang, bukan utang.
            </>
          }
          aksi={bolehAjukan ? (
            <button
              type="button" onClick={() => setFormBuka(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--grad-aksen)", color: "var(--on-aksen)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Ajukan klaim pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {urut.map((k) => (
            <KartuKlaim
              key={k.id}
              k={k}
              sibuk={sibuk === k.id}
              bolehSetujui={bolehSetujui}
              bolehBayar={bolehBayar}
              onSetujui={() => void setujui(k)}
              onTolak={() => setFormTolak(k)}
              onBayar={() => setFormBayar(k)}
            />
          ))}
        </div>
      )}

      {formBuka && (
        <FormAjukan
          onTutup={() => setFormBuka(false)}
          onSelesai={(teks) => {
            setFormBuka(false);
            setPesan({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}

      {formTolak && (
        <FormTolak
          klaim={formTolak}
          onTutup={() => setFormTolak(null)}
          onSelesai={(teks) => {
            setFormTolak(null);
            setPesan({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}

      {formBayar && (
        <FormBayar
          klaim={formBayar}
          akunKas={akunKas}
          onTutup={() => setFormBayar(null)}
          onSelesai={(teks) => {
            setFormBayar(null);
            setPesan({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}
    </div>
  );
}

function Angka({ ikon, label, nilai, keterangan, tekan }: {
  ikon: React.ReactNode;
  label: string;
  nilai: string;
  keterangan: string;
  tekan?: boolean;
}) {
  return (
    <div style={{
      ...GAYA_KARTU, padding: "var(--pad-kartu-lega)",
      borderColor: tekan ? "var(--warning-border)" : C.border,
      background: tekan ? "var(--warning-bg)" : "var(--surface)",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, color: tekan ? "var(--warning-teks)" : C.mid, marginBottom: 4,
      }}>
        {ikon} {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700, color: C.text,
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{keterangan}</div>
    </div>
  );
}

function KartuKlaim({ k, sibuk, bolehSetujui, bolehBayar, onSetujui, onTolak, onBayar }: {
  k: Klaim;
  sibuk: boolean;
  bolehSetujui: boolean;
  bolehBayar: boolean;
  onSetujui: () => void;
  onTolak: () => void;
  onBayar: () => void;
}) {
  const m = META[k.status];
  const diajukan = Number(k.total_diajukan ?? 0);
  const disetujui = k.total_disetujui === null ? null : Number(k.total_disetujui);
  const dipangkas = disetujui !== null && disetujui < diajukan ? diajukan - disetujui : 0;

  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden", borderColor: m.border }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        background: m.bg, display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {k.nomor}
            <span style={{
              marginInlineStart: 10, fontSize: 11.5, fontWeight: 700, color: m.warna,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {m.label}
            </span>
          </h3>
          <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>
            {k.tujuan} — {k.keperluan}
          </div>
          <div style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>
            {k.pegawai?.user?.name && <>{k.pegawai.user.name} · </>}
            {k.tanggal_berangkat} s.d. {k.tanggal_kembali}
            {k.proyek?.name && <> · {k.proyek.name}</>}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 17, fontWeight: 700, color: C.text,
            fontVariantNumeric: "tabular-nums",
          }}>
            {rupiah(disetujui ?? diajukan)}
          </div>
          {dipangkas > 0 && (
            // Pengaju berhak tahu bagian mana yang tak diganti.
            <div style={{ fontSize: 11.5, color: "var(--warning-teks)", marginTop: 2 }}>
              dipangkas {rupiah(dipangkas)} dari {rupiah(diajukan)}
            </div>
          )}
        </div>
      </div>

      {(k.alasan_tolak || k.catatan || k.penyetuju?.name) && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          {k.alasan_tolak && (
            <div style={{
              fontSize: 12.5, color: "var(--danger)", lineHeight: 1.55, marginBottom: 4,
            }}>
              Ditolak: {k.alasan_tolak}
            </div>
          )}
          {k.catatan && (
            <div style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55 }}>{k.catatan}</div>
          )}
          {k.penyetuju?.name && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
              Diputuskan {k.penyetuju.name}
              {k.dibayar_pada && ` · dibayar ${k.dibayar_pada.slice(0, 10)}`}
            </div>
          )}
        </div>
      )}

      {(bolehSetujui && k.status === "diajukan") || (bolehBayar && k.status === "disetujui") ? (
        <div style={{ padding: "9px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bolehSetujui && k.status === "diajukan" && (
            <>
              <button
                type="button" onClick={onSetujui} disabled={sibuk}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 14px", borderRadius: 7, border: "none",
                  background: "var(--success)", color: "var(--on-aksen)",
                  fontSize: 12.5, fontWeight: 600,
                  cursor: sibuk ? "not-allowed" : "pointer", opacity: sibuk ? 0.5 : 1,
                }}
              >
                <Check size={13} aria-hidden="true" /> Setujui penuh
              </button>
              <button
                type="button" onClick={onTolak} disabled={sibuk}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 14px", borderRadius: 7,
                  border: `1px solid ${C.border}`, background: "var(--surface)",
                  color: C.text, fontSize: 12.5, fontWeight: 600,
                  cursor: sibuk ? "not-allowed" : "pointer", opacity: sibuk ? 0.5 : 1,
                }}
              >
                <X size={13} aria-hidden="true" /> Tolak
              </button>
            </>
          )}
          {bolehBayar && k.status === "disetujui" && (
            <button
              type="button" onClick={onBayar} disabled={sibuk}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 7, border: "none",
                background: "var(--grad-aksen)", color: "var(--on-aksen)",
                fontSize: 12.5, fontWeight: 600,
                cursor: sibuk ? "not-allowed" : "pointer", opacity: sibuk ? 0.5 : 1,
              }}
            >
              <Wallet size={13} aria-hidden="true" /> Bayar {rupiah(disetujui)}
            </button>
          )}
        </div>
      ) : null}
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

interface BarisItem {
  jenis: JenisBiaya;
  uraian: string;
  tanggal: string;
  nominal: string;
  bukti_url: string;
}

/** Ambang bukti — sama dengan `AMBANG_BUKTI_DEFAULT` di lib. */
const AMBANG_BUKTI = 100_000;

function FormAjukan({ onTutup, onSelesai }: {
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const hariIni = new Date().toISOString().slice(0, 10);
  const [isi, setIsi] = useState({
    tujuan: "",
    keperluan: "",
    tanggal_berangkat: hariIni,
    tanggal_kembali: hariIni,
    catatan: "",
  });
  const [item, setItem] = useState<BarisItem[]>([
    { jenis: "transport", uraian: "", tanggal: hariIni, nominal: "", bukti_url: "" },
  ]);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const ubah = (k: keyof typeof isi, v: string) => setIsi((x) => ({ ...x, [k]: v }));
  const ubahItem = (i: number, k: keyof BarisItem, v: string) =>
    setItem((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const total = item.reduce((t, x) => {
    const n = Number(x.nominal);
    return t + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const lengkap = isi.tujuan.trim() !== "" && isi.keperluan.trim() !== ""
    && item.length > 0
    && item.every((x) => x.uraian.trim() !== "" && Number(x.nominal) > 0);

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      const r = await api.post<{ klaim: { nomor: string; total_diajukan: number } }>(
        "/api/v1/klaim-perjalanan", {
          tujuan: isi.tujuan.trim(),
          keperluan: isi.keperluan.trim(),
          tanggal_berangkat: isi.tanggal_berangkat,
          tanggal_kembali: isi.tanggal_kembali,
          catatan: isi.catatan.trim() || null,
          item: item.map((x) => ({
            jenis: x.jenis,
            uraian: x.uraian.trim(),
            tanggal: x.tanggal,
            nominal: x.nominal,
            bukti_url: x.bukti_url.trim() || null,
          })),
        });
      onSelesai(
        `${r.data.klaim.nomor} diajukan sebesar ${rupiah(r.data.klaim.total_diajukan)}. `
        + "Menunggu keputusan — belum ada uang yang bergerak.",
      );
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal mengajukan klaim.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul="Ajukan klaim perjalanan"
      keterangan="Rincikan biaya yang sudah Anda talangi. Total dihitung dari rinciannya — tak ada angka yang diketik terpisah."
      lebar={680}
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
            type="button" onClick={() => void kirim()} disabled={sibuk || !lengkap}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || !lengkap ? "not-allowed" : "pointer",
              opacity: sibuk || !lengkap ? 0.5 : 1,
            }}
          >
            {sibuk ? "Mengirim…" : `Ajukan ${rupiah(total)}`}
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
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 14, marginBottom: 14,
      }}>
        <div>
          <Label htmlFor="kl-tujuan" wajib>Tujuan</Label>
          <input className="isian-fokus"
            id="kl-tujuan" value={isi.tujuan} onChange={(e) => ubah("tujuan", e.target.value)}
            placeholder="cth: Jakarta" style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="kl-berangkat" wajib>Berangkat</Label>
          <input className="isian-fokus"
            id="kl-berangkat" type="date" value={isi.tanggal_berangkat}
            onChange={(e) => ubah("tanggal_berangkat", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="kl-kembali" wajib>Kembali</Label>
          <input className="isian-fokus"
            id="kl-kembali" type="date" value={isi.tanggal_kembali}
            min={isi.tanggal_berangkat || undefined}
            onChange={(e) => ubah("tanggal_kembali", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="kl-keperluan" wajib>Keperluan</Label>
        <textarea className="isian-fokus"
          id="kl-keperluan" rows={2} value={isi.keperluan}
          onChange={(e) => ubah("keperluan", e.target.value)}
          placeholder="cth: Rapat koordinasi dengan owner untuk pembahasan addendum"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
            Rincian biaya
          </span>
          <button
            type="button"
            onClick={() => setItem((xs) => [...xs, {
              jenis: "lain", uraian: "", tanggal: isi.tanggal_berangkat, nominal: "", bukti_url: "",
            }])}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 6, fontSize: 12,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: "pointer",
            }}
          >
            <Plus size={12} aria-hidden="true" /> Tambah baris
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {item.map((x, i) => {
            const perluBukti = Number(x.nominal) >= AMBANG_BUKTI;
            const kurangBukti = perluBukti && x.bukti_url.trim() === "";
            return (
              <div key={i} style={{
                padding: 10, borderRadius: 8,
                border: `1px solid ${kurangBukti ? "var(--warning-border)" : C.border}`,
                background: "var(--surface-subtle)",
              }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 8, marginBottom: 8,
                }}>
                  <div>
                    <Label htmlFor={`it-jenis-${i}`}>Jenis</Label>
                    <select
                      id={`it-jenis-${i}`} value={x.jenis}
                      onChange={(e) => ubahItem(i, "jenis", e.target.value)}
                      style={GAYA_ISIAN}
                    >
                      {(Object.keys(LABEL_JENIS) as JenisBiaya[]).map((j) => (
                        <option key={j} value={j}>{LABEL_JENIS[j]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`it-tgl-${i}`}>Tanggal</Label>
                    <input className="isian-fokus"
                      id={`it-tgl-${i}`} type="date" value={x.tanggal}
                      min={isi.tanggal_berangkat || undefined}
                      max={isi.tanggal_kembali || undefined}
                      onChange={(e) => ubahItem(i, "tanggal", e.target.value)}
                      style={GAYA_ISIAN}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`it-nom-${i}`}>Nominal (Rp)</Label>
                    <input className="isian-fokus"
                      id={`it-nom-${i}`} type="number" inputMode="numeric" min={1}
                      value={x.nominal}
                      onChange={(e) => ubahItem(i, "nominal", e.target.value)}
                      style={GAYA_ISIAN}
                    />
                  </div>
                </div>

                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end",
                }}>
                  <div>
                    <Label htmlFor={`it-ur-${i}`}>Uraian</Label>
                    <input className="isian-fokus"
                      id={`it-ur-${i}`} value={x.uraian}
                      onChange={(e) => ubahItem(i, "uraian", e.target.value)}
                      placeholder="cth: Tiket kereta Bandung–Jakarta PP"
                      style={GAYA_ISIAN}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`it-bukti-${i}`}>
                      Bukti {perluBukti && <span style={{ color: "var(--danger)" }}>*</span>}
                    </Label>
                    <input className="isian-fokus"
                      id={`it-bukti-${i}`} value={x.bukti_url}
                      onChange={(e) => ubahItem(i, "bukti_url", e.target.value)}
                      placeholder="tautan kuitansi"
                      style={GAYA_ISIAN}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setItem((xs) => xs.filter((_, j) => j !== i))}
                    disabled={item.length === 1}
                    aria-label={`Hapus rincian ${i + 1}`}
                    title={item.length === 1 ? "Minimal satu rincian" : "Hapus baris"}
                    style={{
                      padding: "8px 10px", borderRadius: 6,
                      border: `1px solid ${C.border}`, background: "var(--surface)",
                      color: item.length === 1 ? C.muted : "var(--danger)",
                      cursor: item.length === 1 ? "not-allowed" : "pointer",
                      opacity: item.length === 1 ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                {kurangBukti && (
                  <div style={{
                    fontSize: 11.5, color: "var(--warning-teks)", marginTop: 6, lineHeight: 1.5,
                  }}>
                    Bukti wajib untuk pengeluaran {rupiah(AMBANG_BUKTI)} ke atas.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Total — diturunkan, bukan diketik. */}
      <div style={{
        padding: "10px 12px", borderRadius: 8, marginBottom: 14,
        border: `1px solid ${C.border}`, background: "var(--surface-subtle)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 12.5, color: C.mid }}>
          Total diajukan <span style={{ color: C.muted }}>· dihitung dari rincian</span>
        </span>
        <strong style={{ fontSize: 16, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(total)}
        </strong>
      </div>

      <div>
        <Label htmlFor="kl-catatan">Catatan</Label>
        <textarea className="isian-fokus"
          id="kl-catatan" rows={2} value={isi.catatan}
          onChange={(e) => ubah("catatan", e.target.value)}
          placeholder="cth: Perjalanan atas permintaan owner, di luar rencana bulanan"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>
    </DialogBersama>
  );
}

function FormTolak({ klaim, onTutup, onSelesai }: {
  klaim: Klaim;
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      const r = await api.patch<{ pesan?: string }>(
        `/api/v1/klaim-perjalanan/${klaim.id}/putuskan`,
        { setujui: false, alasan: alasan.trim() });
      onSelesai(r.data.pesan ?? `${klaim.nomor} ditolak.`);
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menolak klaim.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul={`Tolak ${klaim.nomor}`}
      keterangan="Yang menalangi berhak tahu kenapa uangnya tak diganti. Alasannya tercatat permanen, dan klaim yang ditolak tak bisa dihidupkan kembali."
      lebar={470}
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
            type="button" onClick={() => void kirim()}
            disabled={sibuk || alasan.trim() === ""}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--danger)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || alasan.trim() === "" ? "not-allowed" : "pointer",
              opacity: sibuk || alasan.trim() === "" ? 0.5 : 1,
            }}
          >
            {sibuk ? "Memproses…" : "Tolak klaim"}
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

      <Label htmlFor="tolak-alasan" wajib>Alasan penolakan</Label>
      <textarea className="isian-fokus"
        id="tolak-alasan" rows={4} value={alasan} onChange={(e) => setAlasan(e.target.value)}
        placeholder="cth: Penginapan melebihi plafon kelas jabatan; ajukan ulang dengan tarif yang sesuai"
        style={{ ...GAYA_ISIAN, resize: "vertical" }}
      />
    </DialogBersama>
  );
}

function FormBayar({ klaim, akunKas, onTutup, onSelesai }: {
  klaim: Klaim;
  akunKas: AkunKas[];
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [akun, setAkun] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      await api.patch(`/api/v1/klaim-perjalanan/${klaim.id}/bayar`, { cash_account_id: akun });
      onSelesai(
        `${klaim.nomor} dibayar ${rupiah(klaim.total_disetujui)}. `
        + "Utang ke karyawan ini selesai.",
      );
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal membayar klaim.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul={`Bayar ${klaim.nomor}`}
      keterangan={`${rupiah(klaim.total_disetujui)} akan dicatat keluar dari akun kas yang dipilih. Sesudah dibayar, klaim ini tak bisa diubah lagi.`}
      lebar={470}
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
            type="button" onClick={() => void kirim()} disabled={sibuk || akun === ""}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || akun === "" ? "not-allowed" : "pointer",
              opacity: sibuk || akun === "" ? 0.5 : 1,
            }}
          >
            {sibuk ? "Memproses…" : "Bayar"}
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

      <Label htmlFor="bayar-akun" wajib>Akun kas</Label>
      <select
        id="bayar-akun" value={akun} onChange={(e) => setAkun(e.target.value)}
        style={GAYA_ISIAN}
      >
        <option value="">— pilih akun kas —</option>
        {akunKas.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
        Pembayaran tanpa sumber dana tak bisa direkonsiliasi — akun kas wajib dipilih.
      </div>
    </DialogBersama>
  );
}
