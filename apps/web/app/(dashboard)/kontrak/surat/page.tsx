"use client";

/**
 * SURAT MASUK/KELUAR — korespondensi lintas proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menu `kontrak-surat` sudah AKTIF di sidebar sejak migrasi 241, dan
 * halamannya tak pernah dibuat. Yang mengkliknya terlempar ke `/dashboard` —
 * tanpa galat, tanpa penjelasan. Backend-nya utuh sepanjang waktu itu
 * (`routes/v1/surat.ts`, migrasi 185); yang hilang hanya layarnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIJAWAB — dan kenapa bukan "daftar semua surat"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Surat mana yang WAJIB saya jawab hari ini, sebelum diamnya kita jadi
 * bukti melawan kita?"
 *
 * Karena itu dua angka teratas DIPISAH, bukan dijumlah jadi satu "lewat
 * batas":
 *
 *   · KITA belum menjawab  → pekerjaan hari ini. Tiap hari lewat menambah
 *                            dasar klaim LAWAN.
 *   · LAWAN belum menjawab → bukan pekerjaan, melainkan bahan penagihan.
 *
 * Keduanya menuntut tindakan yang BERLAWANAN — satu ditulis, satu ditagih.
 * Menggabungkannya menghasilkan satu angka yang tak menyuruh siapa pun
 * melakukan apa pun. Pemisahan ini sudah dikunci di sisi API
 * (`ringkasSurat`) dan diuji di `surat-endpoint.test.ts`; halaman ini
 * menampilkannya, bukan menghitung ulang.
 *
 * ── Satu aksen (ARAH-VISUAL §3d)
 *
 * Yang menonjol HANYA "kita belum menjawab". Surat yang ditunggu lawan
 * ditampilkan netral meski sama-sama lewat batas: menyalakan keduanya merah
 * membuat layar berteriak dua hal sekaligus, dan yang benar-benar mendesak
 * tenggelam.
 *
 * ── Arah ditulis, bukan hanya diwarnai (WCAG 1.4.1)
 *
 * Masuk/keluar dibedakan ikon DAN kata, bukan warna saja. Halaman ini dibuka
 * di lapangan pada layar murah di bawah matahari.
 */

import { useMemo, useState } from "react";
import {
  Mails, ArrowDownLeft, ArrowUpRight, Clock, RefreshCw,
} from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom, Galat, Rangka } from "@/components/dasar";

type KeadaanBatas = "lewat" | "mendesak" | "aman" | "tak_perlu";

type Batas = {
  keadaan: KeadaanBatas;
  siapaYangDitunggu: "kita" | "lawan" | null;
  sisaHari: number | null;
};

type Surat = {
  id: string;
  project_id: string;
  project_name: string;
  nomor: string;
  arah: "masuk" | "keluar";
  jenis: string | null;
  perihal: string;
  dari_pihak: string | null;
  kepada_pihak: string | null;
  tanggal_kirim: string | null;
  tanggal_terima: string | null;
  status: string;
  batas: Batas;
};

type Ringkas = {
  jumlah: number;
  masuk: number;
  keluar: number;
  kita_belum_menjawab: number;
  lawan_belum_menjawab: number;
  mendesak: number;
};

type Hasil = { data: Surat[]; proyek: Array<{ id: string; name: string }>; ringkas: Ringkas };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", terkirim: "Terkirim", diterima: "Diterima",
  dibalas: "Dibalas", selesai: "Selesai", arsip: "Arsip",
};

/** Tanggal Indonesia pendek. `null` jadi "—", bukan "Invalid Date". */
function tanggal(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

/** Satu angka besar + penjelasannya. Lapis 1 pola ARAH-VISUAL §5b. */
function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string | number; keterangan?: string; warna?: string;
}) {
  return (
    <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.mid,
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
        color: warna ?? C.text, fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      {keterangan && (
        <div style={{ fontSize: 12, color: C.mid, marginTop: 2, lineHeight: 1.4 }}>{keterangan}</div>
      )}
    </div>
  );
}

/**
 * Keadaan batas balas, dinyatakan lewat SIAPA yang ditunggu.
 *
 * "Lewat 12 hari" saja tak memberi tahu apa yang harus dilakukan. Yang
 * menentukan tindakan adalah pihak mana yang diam — dan itu yang ditulis.
 */
function LencanaBatas({ batas }: { batas: Batas }) {
  if (batas.keadaan === "tak_perlu") {
    return <span style={{ fontSize: 12, color: C.muted }}>tak perlu jawaban</span>;
  }

  const kita = batas.siapaYangDitunggu === "kita";
  const lewat = batas.keadaan === "lewat";

  // Hanya "kita lewat batas" yang merah. Lawan yang lewat batas adalah bahan
  // penagihan, bukan kelalaian kita — dan mewarnainya merah membuat layar
  // menuduh kita atas diamnya orang lain.
  const warna = lewat && kita ? "var(--danger)"
    : lewat ? "var(--text-secondary)"
      : batas.keadaan === "mendesak" ? "var(--warning)"
        : "var(--success)";

  const bg = lewat && kita ? "var(--danger-bg)"
    : lewat ? "var(--surface-subtle)"
      : batas.keadaan === "mendesak" ? "var(--warning-bg)"
        : "var(--success-bg)";

  const n = batas.sisaHari == null ? null : Math.abs(batas.sisaHari);
  const teks = batas.keadaan === "aman"
    ? (n == null ? "dalam batas" : `sisa ${n} hari`)
    : lewat
      ? (n == null ? "lewat batas" : `lewat ${n} hari`)
      : (n == null ? "mendesak" : `tinggal ${n} hari`);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span style={{
        padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
        color: warna, background: bg, whiteSpace: "nowrap", width: "fit-content",
      }}>
        {teks}
      </span>
      {batas.siapaYangDitunggu && (
        <span style={{ fontSize: 11, color: C.mid }}>
          {kita ? "kita belum menjawab" : "lawan belum menjawab"}
        </span>
      )}
    </span>
  );
}

export default function SuratPage() {
  const [proyekPilih, setProyekPilih] = useState<string>("");
  const [arahPilih, setArahPilih] = useState<string>("");

  const url = useMemo(() => {
    const q = new URLSearchParams();
    if (proyekPilih) q.set("project_id", proyekPilih);
    if (arahPilih) q.set("arah", arahPilih);
    const s = q.toString();
    return `/api/v1/letters${s ? `?${s}` : ""}`;
  }, [proyekPilih, arahPilih]);

  /*
    Lapis cache bersama (`useData`) — bukan useEffect+useState sendiri.
    Dijaga `audit-halaman-pakai-cache.mjs`.

    Halaman ini TAK punya galat aksi: ia hanya membaca. Karena itu `galatMuat`
    dipakai apa adanya tanpa state kedua — bukan karena lupa memisahkan,
    melainkan karena tak ada aksi yang bisa menimpanya. Begitu tombol tulis
    ditambahkan di sini, ia WAJIB punya state galatnya sendiri
    (`uji-galat-muat-terpisah.mjs`).
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<Hasil>(url);

  const surat = useMemo(() => data?.data ?? [], [data]);
  const proyek = useMemo(() => data?.proyek ?? [], [data]);
  const r = data?.ringkas;

  const kolom: Array<Kolom<Surat>> = useMemo(() => [
    {
      kunci: "surat", judul: "Surat", kepalaBaris: true,
      render: (s) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{s.perihal}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>
            {s.nomor}
            {s.jenis && ` · ${s.jenis}`}
          </span>
        </span>
      ),
    },
    {
      kunci: "arah", judul: "Arah",
      render: (s) => {
        const masuk = s.arah === "masuk";
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            {masuk
              ? <ArrowDownLeft size={13} aria-hidden="true" style={{ color: C.mid, flexShrink: 0 }} />
              : <ArrowUpRight size={13} aria-hidden="true" style={{ color: C.mid, flexShrink: 0 }} />}
            {/* Katanya ditulis, bukan hanya ikon — WCAG 1.4.1. */}
            <span style={{ fontSize: 12, color: C.text }}>{masuk ? "Masuk" : "Keluar"}</span>
          </span>
        );
      },
    },
    {
      kunci: "pihak", judul: "Pihak",
      render: (s) => (
        <span style={{ fontSize: 12, color: C.mid }}>
          {s.arah === "masuk" ? (s.dari_pihak ?? "—") : (s.kepada_pihak ?? "—")}
        </span>
      ),
    },
    {
      kunci: "proyek", judul: "Proyek",
      render: (s) => <span style={{ fontSize: 12, color: C.mid }}>{s.project_name}</span>,
    },
    {
      kunci: "tanggal", judul: "Tanggal", rata: "kanan",
      render: (s) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {/* Surat masuk diukur dari TERIMA, surat keluar dari KIRIM — dua
              tanggal acuan berbeda, dan memakai satu kolom untuk keduanya
              akan menampilkan "—" pada separuh daftar. */}
          {s.arah === "masuk" ? tanggal(s.tanggal_terima) : tanggal(s.tanggal_kirim)}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (s) => (
        <span style={{ fontSize: 12, color: C.mid }}>{STATUS_LABEL[s.status] ?? s.status}</span>
      ),
    },
    {
      kunci: "batas", judul: "Batas balas",
      render: (s) => <LencanaBatas batas={s.batas} />,
    },
  ], []);

  const gayaPilih: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, fontSize: 13,
    border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
  };

  return (
    <div style={{
      // Pembungkus BAKU halaman dashboard — 111 dari 143 halaman memakainya.
      // Tanpa ini isinya menempel ke tepi layar ("mepet") dan melebar tanpa
      // batas di monitor lebar, sementara halaman sebelahnya tidak — dan
      // ketaksamaan itu yang paling terasa saat berpindah menu.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
      display: "flex", flexDirection: "column", gap: "var(--gap-bagian)",
    }}>
      <KepalaHalaman
        judul="Surat Masuk/Keluar"
        ikon={<Mails size={19} />}
        keterangan="Korespondensi resmi seluruh proyek — dan siapa yang sedang ditunggu jawabannya."
        aksi={
          <button
            type="button"
            onClick={() => { void muatUlang(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Muat ulang
          </button>
        }
      />

      {galatMuat && (
        <Galat pesan="Gagal memuat daftar surat." onCobaLagi={() => { void muatUlang(); }} />
      )}

      {/* LAPIS 1 — KEADAAN (ARAH-VISUAL §5b) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--gap-grid)" }}>
        <Kpi
          label="Kita belum menjawab"
          nilai={r?.kita_belum_menjawab ?? "—"}
          keterangan="lewat batas — tiap hari menambah dasar klaim lawan"
          warna={r && r.kita_belum_menjawab > 0 ? "var(--danger)" : undefined}
        />
        <Kpi
          label="Lawan belum menjawab"
          nilai={r?.lawan_belum_menjawab ?? "—"}
          keterangan="bahan penagihan, bukan pekerjaan kita"
        />
        <Kpi
          label="Mendesak"
          nilai={r?.mendesak ?? "—"}
          keterangan="batasnya tinggal beberapa hari"
        />
        <Kpi
          label="Total surat"
          nilai={r?.jumlah ?? "—"}
          keterangan={r ? `${r.masuk} masuk · ${r.keluar} keluar` : undefined}
        />
      </div>

      {/* LAPIS 3 — DETAIL. Lapis 2 (pola) sengaja tak ada: yang menuntut
          tindakan di sini adalah DAFTARnya, dan grafik tren korespondensi
          tak menyuruh siapa pun melakukan apa pun. */}
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)" }}>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          marginBottom: "var(--gap-grid)",
        }}>
          <label htmlFor="saring-proyek" style={{ fontSize: 12, color: C.mid }}>Proyek</label>
          <select
            id="saring-proyek" value={proyekPilih} style={gayaPilih}
            onChange={(e) => setProyekPilih(e.target.value)}
          >
            <option value="">Semua proyek</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label htmlFor="saring-arah" style={{ fontSize: 12, color: C.mid, marginLeft: 8 }}>Arah</label>
          <select
            id="saring-arah" value={arahPilih} style={gayaPilih}
            onChange={(e) => setArahPilih(e.target.value)}
          >
            <option value="">Masuk &amp; keluar</option>
            <option value="masuk">Masuk saja</option>
            <option value="keluar">Keluar saja</option>
          </select>
        </div>

        {memuat ? (
          <Rangka tinggi={44} jumlah={5} />
        ) : surat.length === 0 ? (
          <Kosong
            ikon={<Mails size={22} />}
            judul="Belum ada surat tercatat"
            sebab={
              proyekPilih || arahPilih
                ? "Tak ada surat yang cocok dengan saringan ini."
                : "Surat dicatat dari halaman proyek. Yang tercatat di sini akan terpantau batas balasnya."
            }
          />
        ) : (
          <Tabel
            kolom={kolom}
            data={surat}
            kunciBaris={(s) => s.id}
            caption="Daftar surat masuk dan keluar seluruh proyek"
            tandaiBaris={(s) =>
              // Hanya yang MENUNTUT tindakan kita yang ditandai. Menandai
              // semua yang lewat batas membuat separuh tabel menyala, dan
              // yang benar-benar mendesak kehilangan penandanya.
              s.batas.keadaan === "lewat" && s.batas.siapaYangDitunggu === "kita"
                ? "var(--danger-bg)"
                : undefined}
          />
        )}
      </div>

      <p style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
        <Clock size={13} aria-hidden="true" />
        Status batas dihitung ulang tiap kali halaman dibuka — bukan disimpan, supaya tak pernah basi.
      </p>
    </div>
  );
}
