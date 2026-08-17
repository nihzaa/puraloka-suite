"use client";

/**
 * JADWAL PERAWATAN — satu baris per JADWAL, bukan per alat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA, PADAHAL /aset/operasional SUDAH MENAMPILKAN PERAWATAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menu `aset-perawatan` sudah AKTIF sejak migrasi 241 dan halamannya tak
 * pernah dibuat — yang mengkliknya terlempar ke `/dashboard`. Tabelnya
 * (`jadwal_perawatan`, `riwayat_perawatan`, migrasi 211) dan endpoint-nya
 * (`GET /api/v1/alat-operasional`) sudah ada sepanjang waktu itu.
 *
 * Tapi menyalin `/aset/operasional` ke sini akan salah, dan bedanya bukan
 * kosmetik — bedanya UNIT BARIS:
 *
 *   /aset/operasional   satu baris = satu ALAT. Pertanyaannya "alat mana
 *                       yang mahal, dan mana yang pola servisnya buruk".
 *                       Perawatan muncul sebagai kolom "yang paling
 *                       mendesak" — SATU jadwal, yang lain tersembunyi.
 *
 *   halaman ini         satu baris = satu JADWAL. Pertanyaannya "servis apa
 *                       yang harus dipesan minggu ini".
 *
 * Bedanya nyata pada alat dengan banyak jadwal: excavator yang punya ganti
 * oli, servis hidrolik, dan ganti filter sekaligus tampil SATU baris di
 * halaman operasional, dan yang terlihat cuma satu yang paling mendesak.
 * Dua jadwal lain yang juga sudah jatuh tempo tak terlihat siapa pun sampai
 * seseorang membuka detail alatnya satu per satu.
 *
 * Halaman ini meratakan (`flatMap`) jadwalnya, jadi tak ada yang tersembunyi
 * di balik saudaranya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PEMICU DITULIS — "kenapa jatuh tempo" menentukan percakapan dengan mekanik
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jadwal punya DUA ambang yang berjalan bersamaan: jam meter dan hari
 * kalender. Yang tercapai lebih dulu itulah pemicunya, dan keduanya
 * menghasilkan percakapan berbeda — "sudah 260 jam" vs "sudah 6 bulan".
 *
 * Alat yang lewat ambang JAM sementara kalendernya masih longgar adalah yang
 * paling mudah luput: jadwal harian terlihat hijau, mesinnya tidak. Karena
 * itu ia punya KPI sendiri.
 *
 * Aritmetikanya dikunci di `apps/api/src/lib/alat-operasional.ts` — halaman
 * ini menampilkan, tidak menghitung ulang.
 *
 * ── Satu aksen (ARAH-VISUAL §3d) · warna bukan satu-satunya pembawa makna
 *
 * Yang merah hanya yang JATUH TEMPO. Status ditulis sebagai kata dan
 * pemicunya diberi ikon berbeda (Gauge = jam, Clock = hari) — WCAG 1.4.1,
 * karena halaman ini dibuka di lapangan pada layar murah.
 */

import { useMemo, useState } from "react";
import { Wrench, Gauge, Clock, RefreshCw, CalendarClock } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom, Galat, Rangka } from "@/components/dasar";

type StatusPerawatan = "aman" | "segera" | "jatuh_tempo" | "belum_ada_acuan";

type JatuhTempo = {
  status: StatusPerawatan;
  sisaJam: number | null;
  sisaHari: number | null;
  pemicu: "jam" | "hari" | null;
};

type Perawatan = {
  id: string;
  nama: string;
  jenis: string;
  setiap_jam: number | string | null;
  setiap_hari: number | null;
  perkiraan_biaya: number | string | null;
  jatuhTempo: JatuhTempo;
};

type Alat = {
  id: string;
  asset_code: string;
  name: string;
  brand: string | null;
  model: string | null;
  status: string;
  meter: number | null;
  perawatan: Perawatan[];
};

/** Satu jadwal yang sudah membawa identitas alatnya — unit baris halaman ini. */
type BarisJadwal = Perawatan & {
  alatId: string;
  alatNama: string;
  alatKode: string;
  alatMerek: string | null;
  meter: number | null;
};

const STATUS_META: Record<StatusPerawatan, { label: string; warna: string; bg: string; urut: number }> = {
  jatuh_tempo:     { label: "Jatuh tempo",     warna: "var(--danger)",         bg: "var(--danger-bg)",     urut: 0 },
  segera:          { label: "Segera",          warna: "var(--warning)",        bg: "var(--warning-bg)",    urut: 1 },
  aman:            { label: "Aman",            warna: "var(--success)",        bg: "var(--success-bg)",    urut: 2 },
  belum_ada_acuan: { label: "Belum ada acuan", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", urut: 3 },
};

const rupiah = (n: number | string | null | undefined) => {
  const v = n == null ? null : Number(n);
  if (v == null || !Number.isFinite(v)) return "—";
  return "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
};

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
 * Sisa menuju jatuh tempo, dinyatakan lewat PEMICUNYA.
 *
 * Ikon membedakan jam-meter dari hari-kalender. Ini bukan hiasan: yang
 * membaca "lewat 260 jam" menelepon mekanik hari ini, yang membaca "lewat 12
 * hari" menjadwalkan minggu depan.
 */
function SisaJatuhTempo({ jt }: { jt: JatuhTempo }) {
  const m = STATUS_META[jt.status];

  if (jt.status === "belum_ada_acuan") {
    return <span style={{ fontSize: 12, color: C.muted }}>belum pernah diservis</span>;
  }

  const pakaiJam = jt.pemicu === "jam" || (jt.pemicu == null && jt.sisaJam != null);
  const nilai = pakaiJam
    ? (jt.sisaJam == null ? null : Math.abs(jt.sisaJam))
    : (jt.sisaHari == null ? null : Math.abs(jt.sisaHari));
  const satuan = pakaiJam ? "jam" : "hari";
  const lewat = jt.status === "jatuh_tempo";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {pakaiJam
        ? <Gauge size={13} aria-hidden="true" style={{ color: m.warna, flexShrink: 0 }} />
        : <Clock size={13} aria-hidden="true" style={{ color: m.warna, flexShrink: 0 }} />}
      <span style={{ fontWeight: 600, color: m.warna, fontVariantNumeric: "tabular-nums" }}>
        {nilai == null
          ? "—"
          : `${lewat ? "lewat " : "sisa "}${nilai.toLocaleString("id-ID", { maximumFractionDigits: 0 })} ${satuan}`}
      </span>
    </span>
  );
}

export default function JadwalPerawatanPage() {
  const [saring, setSaring] = useState<"" | StatusPerawatan>("");

  /*
    Lapis cache bersama (`audit-halaman-pakai-cache.mjs`). Endpoint yang sama
    dengan /aset/operasional — SENGAJA: dua layar yang menampilkan jatuh tempo
    dari dua panggilan berbeda akan menyebut angka berbeda saat servis dicatat
    di antara keduanya, dan tak ada cara menebak mana yang benar.

    Halaman ini hanya MEMBACA, jadi tak ada galat aksi yang bisa menimpa galat
    muat. Begitu tombol "catat servis" ditambahkan, ia WAJIB punya state
    galatnya sendiri (`uji-galat-muat-terpisah.mjs`).
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ alat: Alat[] }>("/api/v1/alat-operasional");

  const alat = useMemo(() => data?.alat ?? [], [data]);

  /*
    Diratakan jadi satu baris per JADWAL — inilah yang membedakan halaman ini
    dari /aset/operasional. Lihat header berkas.
  */
  const jadwal: BarisJadwal[] = useMemo(() => {
    const semua = alat.flatMap((a) =>
      (a.perawatan ?? []).map((p) => ({
        ...p,
        alatId: a.id,
        alatNama: a.name,
        alatKode: a.asset_code,
        alatMerek: a.brand ? `${a.brand}${a.model ? " " + a.model : ""}` : null,
        meter: a.meter,
      })));

    // Diurutkan menurut MENDESAKNYA, bukan menurut nama alat. Daftar kerja
    // yang diurut alfabet menuntut pembacanya memindai seluruhnya untuk
    // menemukan yang jatuh tempo.
    return semua.sort((x, y) => {
      const d = STATUS_META[x.jatuhTempo.status].urut - STATUS_META[y.jatuhTempo.status].urut;
      if (d !== 0) return d;
      // Dalam status yang sama: yang paling jauh terlewat lebih dulu.
      const sx = x.jatuhTempo.sisaJam ?? x.jatuhTempo.sisaHari ?? 9e9;
      const sy = y.jatuhTempo.sisaJam ?? y.jatuhTempo.sisaHari ?? 9e9;
      return sx - sy;
    });
  }, [alat]);

  const terlihat = useMemo(
    () => (saring ? jadwal.filter((j) => j.jatuhTempo.status === saring) : jadwal),
    [jadwal, saring]);

  const ringkas = useMemo(() => {
    const jatuhTempo = jadwal.filter((j) => j.jatuhTempo.status === "jatuh_tempo").length;
    const segera = jadwal.filter((j) => j.jatuhTempo.status === "segera").length;

    // Lewat ambang JAM sementara kalendernya masih longgar — yang paling
    // mudah luput, karena jadwal harian terlihat hijau.
    const lewatKarenaJam = jadwal.filter((j) =>
      j.jatuhTempo.status === "jatuh_tempo" &&
      j.jatuhTempo.pemicu === "jam" &&
      (j.jatuhTempo.sisaHari == null || j.jatuhTempo.sisaHari > 0)).length;

    // Biaya yang MENUNGGU dikeluarkan — hanya yang sudah/hampir jatuh tempo.
    // Menjumlah seluruh jadwal akan menyebut angka setahun penuh dan
    // membuatnya terbaca seperti tagihan minggu ini.
    const biayaMenunggu = jadwal
      .filter((j) => j.jatuhTempo.status === "jatuh_tempo" || j.jatuhTempo.status === "segera")
      .reduce((s, j) => {
        const v = j.perkiraan_biaya == null ? 0 : Number(j.perkiraan_biaya);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0);

    return { jatuhTempo, segera, lewatKarenaJam, biayaMenunggu, alatTerjadwal: alat.filter((a) => (a.perawatan ?? []).length > 0).length };
  }, [jadwal, alat]);

  const kolom: Array<Kolom<BarisJadwal>> = useMemo(() => [
    {
      kunci: "jadwal", judul: "Perawatan", kepalaBaris: true,
      render: (j) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{j.nama}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>{j.jenis}</span>
        </span>
      ),
    },
    {
      kunci: "alat", judul: "Alat",
      render: (j) => (
        <span>
          <span style={{ fontSize: 12, color: C.text }}>{j.alatNama}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>
            {j.alatKode}{j.alatMerek && ` · ${j.alatMerek}`}
          </span>
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (j) => {
        const m = STATUS_META[j.jatuhTempo.status];
        return (
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            color: m.warna, background: m.bg, whiteSpace: "nowrap",
          }}>
            {m.label}
          </span>
        );
      },
    },
    {
      kunci: "sisa", judul: "Sisa", rata: "kanan",
      render: (j) => <SisaJatuhTempo jt={j.jatuhTempo} />,
    },
    {
      kunci: "interval", judul: "Setiap", rata: "kanan",
      render: (j) => {
        // Kedua ambang ditulis kalau dua-duanya ada — yang berlaku adalah
        // mana yang tercapai lebih dulu, dan menyembunyikan salah satunya
        // membuat kolom "sisa" terlihat tak nyambung dengan intervalnya.
        const bagian: string[] = [];
        if (j.setiap_jam != null && Number.isFinite(Number(j.setiap_jam))) {
          bagian.push(`${Number(j.setiap_jam).toLocaleString("id-ID")} jam`);
        }
        if (j.setiap_hari != null) bagian.push(`${j.setiap_hari} hari`);
        return (
          <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
            {bagian.length === 0 ? "—" : bagian.join(" / ")}
          </span>
        );
      },
    },
    {
      kunci: "meter", judul: "Meter kini", rata: "kanan",
      render: (j) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {j.meter == null ? "—" : `${j.meter.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`}
        </span>
      ),
    },
    {
      kunci: "biaya", judul: "Perkiraan biaya", rata: "kanan",
      render: (j) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(j.perkiraan_biaya)}
        </span>
      ),
    },
  ], []);

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
        judul="Jadwal Perawatan"
        ikon={<Wrench size={19} />}
        keterangan="Servis yang harus dipesan — satu baris per jadwal, bukan per alat."
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
        <Galat pesan="Gagal memuat jadwal perawatan." onCobaLagi={() => { void muatUlang(); }} />
      )}

      {/* LAPIS 1 — KEADAAN (ARAH-VISUAL §5b) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--gap-grid)" }}>
        <Kpi
          label="Jatuh tempo"
          nilai={ringkas.jatuhTempo}
          keterangan="sudah lewat ambangnya"
          warna={ringkas.jatuhTempo > 0 ? "var(--danger)" : undefined}
        />
        <Kpi
          label="Lewat karena JAM"
          nilai={ringkas.lewatKarenaJam}
          keterangan="kalendernya masih longgar — paling mudah luput"
        />
        <Kpi
          label="Segera"
          nilai={ringkas.segera}
          keterangan="mendekati ambang, pesan sekarang"
        />
        <Kpi
          label="Biaya menunggu"
          nilai={rupiah(ringkas.biayaMenunggu)}
          keterangan="perkiraan untuk yang jatuh tempo & segera"
        />
      </div>

      {/* LAPIS 3 — DETAIL */}
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)" }}>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          marginBottom: "var(--gap-grid)",
        }}>
          <label htmlFor="saring-status" style={{ fontSize: 12, color: C.mid }}>Status</label>
          <select
            id="saring-status"
            value={saring}
            onChange={(e) => setSaring(e.target.value as "" | StatusPerawatan)}
            style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 13,
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
            }}
          >
            <option value="">Semua status</option>
            <option value="jatuh_tempo">Jatuh tempo</option>
            <option value="segera">Segera</option>
            <option value="aman">Aman</option>
            <option value="belum_ada_acuan">Belum ada acuan</option>
          </select>
          <span style={{ fontSize: 12, color: C.muted }}>
            {terlihat.length} dari {jadwal.length} jadwal · {ringkas.alatTerjadwal} alat terjadwal
          </span>
        </div>

        {memuat ? (
          <Rangka tinggi={44} jumlah={5} />
        ) : terlihat.length === 0 ? (
          <Kosong
            ikon={<CalendarClock size={22} />}
            judul={saring ? "Tak ada jadwal berstatus ini" : "Belum ada jadwal perawatan"}
            sebab={
              saring
                ? "Coba longgarkan saringan status."
                : "Alat yang belum punya jadwal perawatan tak akan pernah mengingatkan siapa pun — jadwalnya dibuat dari halaman alat."
            }
          />
        ) : (
          <Tabel
            kolom={kolom}
            data={terlihat}
            kunciBaris={(j) => j.id}
            caption="Jadwal perawatan seluruh alat, diurut menurut mendesaknya"
            tandaiBaris={(j) =>
              j.jatuhTempo.status === "jatuh_tempo" ? "var(--danger-bg)" : undefined}
          />
        )}
      </div>
    </div>
  );
}
