"use client";

/**
 * OPERASIONAL ALAT (TUNDA kelompok B)
 *
 * ── Yang dijawab halaman ini
 *
 * "Alat mana yang harus diservis MINGGU INI, dan mana yang biayanya sudah
 * tak masuk akal dibanding jam kerjanya?"
 *
 * ── Tiga hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Alat yang "belum waktunya" menurut kalender.** Excavator yang bekerja
 *    300 jam sebulan butuh ganti oli, meski jadwal 180-harinya baru jalan
 *    dua minggu. Kolom "pemicu" menyebut MANA yang tercapai lebih dulu —
 *    karena "servis karena sudah 260 jam" dan "karena sudah 6 bulan" adalah
 *    dua percakapan berbeda dengan mekanik.
 *
 * 2. **Biaya per jam pada alat yang belum pernah dipakai.** Nol jam operasi
 *    membuat pembagian jadi tak terhingga. Di sini nilainya &ldquo;—&rdquo;,
 *    bukan angka besar yang terlihat masuk akal.
 *
 * 3. **"Sering dirawat" yang sebenarnya "sering rusak".** Alat dengan 2
 *    servis terjadwal dan 4 mendadak terlihat rajin diservis. Yang
 *    sebenarnya terjadi: preventifnya tidak mencegah apa pun.
 *
 * Ketiganya dikunci di `apps/api/src/lib/alat-operasional.ts` — 17 test,
 * 7 mutasi tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Tata letak: tiga lapis (ARAH-VISUAL §5b)
 *
 * KEADAAN (4 KPI) → POLA (yang menuntut tindakan) → DETAIL (tabel).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wrench, RefreshCw, TriangleAlert, Clock, Gauge } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

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

type Riwayat = {
  id: string;
  tanggal: string | null;
  biaya: number | string;
  bengkel: string | null;
  uraian: string | null;
  tak_terjadwal: boolean;
};

type Alat = {
  id: string;
  asset_code: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  status: string;
  condition: string;
  meter: number | null;
  jamOperasi: number;
  hariDipakai: number;
  perawatan: Perawatan[];
  palingMendesak: Perawatan | null;
  biaya: {
    total: number;
    perJenis: Record<string, number>;
    perJam: number | null;
    bbmPerJam: number | null;
  };
  kesehatan: {
    servisTerjadwal: number;
    servisMendadak: number;
    rasioMendadak: number | null;
    preventifGagal: boolean;
  };
  riwayat: Riwayat[];
  penyusutan: Array<{
    periode: string;
    nilai: number | string;
    akumulasi: number | string;
    journal_entry_id: string | null;
  }>;
};

const STATUS_META: Record<StatusPerawatan, { label: string; warna: string; bg: string }> = {
  aman:            { label: "Aman",         warna: "var(--success)", bg: "var(--success-bg)" },
  segera:          { label: "Segera",       warna: "var(--warning)", bg: "var(--warning-bg)" },
  jatuh_tempo:     { label: "Jatuh tempo",  warna: "var(--danger)",  bg: "var(--danger-bg)" },
  belum_ada_acuan: { label: "Belum ada acuan", warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
};

const rupiah = (n: number | string | null | undefined) => {
  const v = n == null ? null : Number(n);
  if (v == null || !Number.isFinite(v)) return "—";
  return "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
};

const angkaJam = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jam";

const kartu: React.CSSProperties = {
  background: "var(--surface)",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  boxShadow: "var(--naik-1)",
};

/** Satu angka besar dengan penjelasannya. Lapis 1 pola ARAH-VISUAL §5b. */
function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string; keterangan?: string; warna?: string;
}) {
  return (
    <div style={{ ...kartu, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, marginTop: 4,
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
 * Sisa menuju jatuh tempo, dinyatakan lewat pemicunya.
 *
 * Ikonnya membedakan JAM (meter) dari HARI (kalender) — bukan pengulangan
 * warna, karena warna sendirian tak boleh jadi satu-satunya pembawa makna
 * (WCAG 1.4.1). Yang membaca "260 jam terlewat" akan menelepon mekanik hari
 * ini; yang membaca "sudah 6 bulan" akan menjadwalkan minggu depan.
 */
function SisaJatuhTempo({ jt }: { jt: JatuhTempo }) {
  const m = STATUS_META[jt.status];
  const lewat = jt.status === "jatuh_tempo";
  const pakaiJam = jt.pemicu === "jam" || (jt.pemicu == null && jt.sisaJam != null);

  const nilai = pakaiJam
    ? (jt.sisaJam == null ? null : Math.abs(jt.sisaJam))
    : (jt.sisaHari == null ? null : Math.abs(jt.sisaHari));
  const satuan = pakaiJam ? "jam" : "hari";

  if (jt.status === "belum_ada_acuan") {
    return (
      <span style={{ fontSize: 12, color: C.muted }}>
        belum pernah diservis
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {pakaiJam
        ? <Gauge size={13} aria-hidden="true" style={{ color: m.warna, flexShrink: 0 }} />
        : <Clock size={13} aria-hidden="true" style={{ color: m.warna, flexShrink: 0 }} />}
      <span style={{ fontWeight: 600, color: m.warna, fontVariantNumeric: "tabular-nums" }}>
        {nilai == null ? "—" : `${lewat ? "lewat " : "sisa "}${nilai.toLocaleString("id-ID", { maximumFractionDigits: 0 })} ${satuan}`}
      </span>
    </span>
  );
}

export default function OperasionalAlatPage() {
  const [alat, setAlat] = useState<Alat[]>([]);
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat putaran yang datanya sudah tiba, bukan bendera
  // boolean yang dinyalakan di badan efek — bendera memicu render bertingkat.
  const [putaranTiba, setPutaranTiba] = useState(-1);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ alat: Alat[] }>("/api/v1/alat-operasional", { signal: ac.signal })
      .then((r) => { setAlat(r.data.alat ?? []); setGalat(""); })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat data operasional alat"); })
      .finally(() => { if (!ac.signal.aborted) setPutaranTiba(muatUlangKe); });
    return () => ac.abort();
  }, [muatUlangKe]);

  const memuat = putaranTiba !== muatUlangKe;
  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);

  const ringkas = useMemo(() => {
    const jatuhTempo = alat.filter((a) => a.palingMendesak?.jatuhTempo.status === "jatuh_tempo").length;
    // Alat yang lewat ambang JAM padahal kalendernya masih longgar. Ini yang
    // paling mudah luput: jadwal harian terlihat hijau, mesinnya tidak.
    const lewatKarenaJam = alat.filter((a) =>
      a.perawatan.some((p) =>
        p.jatuhTempo.status === "jatuh_tempo" &&
        p.jatuhTempo.pemicu === "jam" &&
        (p.jatuhTempo.sisaHari == null || p.jatuhTempo.sisaHari > 0))).length;
    const segera = alat.filter((a) => a.palingMendesak?.jatuhTempo.status === "segera").length;
    const preventifGagal = alat.filter((a) => a.kesehatan.preventifGagal).length;
    const biayaTotal = alat.reduce((s, a) => s + a.biaya.total, 0);
    return { jatuhTempo, lewatKarenaJam, segera, preventifGagal, biayaTotal };
  }, [alat]);

  const kolom: Array<Kolom<Alat>> = useMemo(() => [
    {
      kunci: "alat", judul: "Alat", kepalaBaris: true,
      render: (a) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{a.name}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>
            {a.asset_code}
            {a.brand && ` · ${a.brand}${a.model ? " " + a.model : ""}`}
          </span>
        </span>
      ),
    },
    {
      kunci: "meter", judul: "Meter", rata: "kanan",
      render: (a) => (
        <span style={{ color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {angkaJam(a.meter)}
        </span>
      ),
    },
    {
      kunci: "perawatan", judul: "Perawatan terdekat",
      render: (a) => {
        if (!a.palingMendesak) {
          return <span style={{ fontSize: 12, color: C.muted }}>tak ada yang mendesak</span>;
        }
        const m = STATUS_META[a.palingMendesak.jatuhTempo.status];
        return (
          <span>
            <span style={{
              padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              color: m.warna, background: m.bg, whiteSpace: "nowrap",
            }}>
              {m.label}
            </span>
            <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 3 }}>
              {a.palingMendesak.nama}
            </span>
          </span>
        );
      },
    },
    {
      kunci: "sisa", judul: "Sisa", rata: "kanan",
      render: (a) => a.palingMendesak
        ? <SisaJatuhTempo jt={a.palingMendesak.jatuhTempo} />
        : <span style={{ color: C.muted }}>—</span>,
    },
    {
      kunci: "perjam", judul: "Biaya / jam", rata: "kanan",
      render: (a) => (
        // Alat yang belum pernah dipakai TIDAK menampilkan angka di sini.
        // Menampilkan apa pun selain "—" berarti membagi dengan nol lalu
        // menyebut hasilnya masuk akal.
        <span style={{ fontVariantNumeric: "tabular-nums", color: a.biaya.perJam == null ? C.muted : C.text, fontWeight: a.biaya.perJam == null ? 400 : 600 }}>
          {a.biaya.perJam == null ? "—" : rupiah(a.biaya.perJam)}
          {a.biaya.perJam == null && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 400 }}>belum ada jam operasi</span>
          )}
        </span>
      ),
    },
    {
      kunci: "kesehatan", judul: "Pola perawatan", rata: "kanan",
      render: (a) => {
        const k = a.kesehatan;
        if (k.rasioMendadak == null) {
          return <span style={{ fontSize: 12, color: C.muted }}>belum ada servis</span>;
        }
        return (
          <span>
            <span style={{
              fontWeight: 600, fontVariantNumeric: "tabular-nums",
              color: k.preventifGagal ? "var(--danger)" : C.text,
            }}>
              {k.rasioMendadak.toLocaleString("id-ID", { maximumFractionDigits: 0 })}% mendadak
            </span>
            <span style={{ display: "block", fontSize: 11, color: C.mid }}>
              {k.servisTerjadwal} terjadwal · {k.servisMendadak} mendadak
            </span>
          </span>
        );
      },
    },
    {
      kunci: "biaya", judul: "Biaya operasional", rata: "kanan",
      render: (a) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: C.text }}>
          {rupiah(a.biaya.total)}
          {a.biaya.bbmPerJam != null && (
            <span style={{ display: "block", fontSize: 11, color: C.mid, fontWeight: 400 }}>
              {a.biaya.bbmPerJam.toLocaleString("id-ID", { maximumFractionDigits: 1 })} L/jam
            </span>
          )}
        </span>
      ),
    },
  ], []);

  const kolomJadwal: Array<Kolom<Perawatan & { alat: string; kode: string }>> = useMemo(() => [
    {
      kunci: "alat", judul: "Alat", kepalaBaris: true,
      render: (p) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{p.alat}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>{p.kode}</span>
        </span>
      ),
    },
    {
      kunci: "nama", judul: "Pekerjaan",
      render: (p) => <span style={{ color: C.text }}>{p.nama}</span>,
    },
    {
      kunci: "interval", judul: "Interval", rata: "kanan",
      render: (p) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {[p.setiap_jam ? `${Number(p.setiap_jam).toLocaleString("id-ID")} jam` : null,
            p.setiap_hari ? `${p.setiap_hari} hari` : null]
            .filter(Boolean).join(" atau ")}
        </span>
      ),
    },
    {
      kunci: "pemicu", judul: "Dipicu oleh",
      render: (p) =>
        // Dinyatakan, bukan disembunyikan di balik kata "jatuh tempo".
        p.jatuhTempo.pemicu == null
          ? <span style={{ color: C.muted }}>—</span>
          : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}>
              {p.jatuhTempo.pemicu === "jam"
                ? <><Gauge size={13} aria-hidden="true" /> jam meter</>
                : <><Clock size={13} aria-hidden="true" /> kalender</>}
            </span>
          ),
    },
    {
      kunci: "sisa", judul: "Sisa", rata: "kanan",
      render: (p) => <SisaJatuhTempo jt={p.jatuhTempo} />,
    },
    {
      kunci: "biaya", judul: "Perkiraan biaya", rata: "kanan",
      render: (p) => (
        <span style={{ color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(p.perkiraan_biaya)}
        </span>
      ),
    },
  ], []);

  const jadwalMendesak = useMemo(
    () => alat.flatMap((a) => a.perawatan
      .filter((p) => p.jatuhTempo.status === "jatuh_tempo" || p.jatuhTempo.status === "segera")
      .map((p) => ({ ...p, alat: a.name, kode: a.asset_code })))
      .sort((x, y) => {
        const bobot = (s: StatusPerawatan) => (s === "jatuh_tempo" ? 0 : 1);
        return bobot(x.jatuhTempo.status) - bobot(y.jatuhTempo.status)
          || (x.jatuhTempo.sisaJam ?? 9e9) - (y.jatuhTempo.sisaJam ?? 9e9);
      }),
    [alat]);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            Operasional Alat
          </h2>
          <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
            Alat mana yang <strong>harus diservis minggu ini</strong>, dan berapa
            biayanya per jam kerja. Jadwal kalender saja tak cukup — excavator yang
            bekerja 300 jam sebulan butuh ganti oli meski jadwal 180-harinya baru
            jalan dua minggu.
          </p>
        </div>
        <button
          type="button"
          onClick={muatUlang}
          disabled={memuat}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, cursor: memuat ? "default" : "pointer", opacity: memuat ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Muat ulang
        </button>
      </div>

      {galat && (
        <div role="alert" style={{
          ...kartu, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat data operasional alat…
        </div>
      ) : alat.length === 0 ? (
        <Kosong
          ikon={<Wrench size={28} />}
          judul="Belum ada alat terdaftar"
          sebab={
            <>
              Halaman ini membaca jam pakai, jadwal servis, dan biaya operasional
              dari register aset. Tambahkan alat lebih dulu di Register Aset, lalu
              catat pemakaian hariannya — jatuh tempo servis dihitung dari
              pembacaan meter, bukan dari tanggal saja.
            </>
          }
        />
      ) : (
        <>
          {/* Lapis 1 — keadaan */}
          <div className="rise rise-2" style={{
            display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
          }}>
            <Kpi
              label="Jatuh tempo servis"
              nilai={String(ringkas.jatuhTempo)}
              warna={ringkas.jatuhTempo > 0 ? "var(--danger)" : "var(--success)"}
              keterangan={`dari ${alat.length} alat terdaftar`}
            />
            <Kpi
              label="Lewat karena JAM"
              nilai={String(ringkas.lewatKarenaJam)}
              warna={ringkas.lewatKarenaJam > 0 ? "var(--danger)" : undefined}
              keterangan={
                ringkas.lewatKarenaJam > 0
                  ? "kalendernya masih hijau — mesinnya tidak"
                  : "tak ada yang tersembunyi"
              }
            />
            <Kpi
              label="Preventif tak bekerja"
              nilai={String(ringkas.preventifGagal)}
              warna={ringkas.preventifGagal > 0 ? "var(--warning)" : undefined}
              keterangan="separuh servisnya kerusakan mendadak"
            />
            <Kpi
              label="Biaya operasional"
              nilai={rupiah(ringkas.biayaTotal)}
              keterangan="BBM, operator, sewa, suku cadang"
            />
          </div>

          {/* Lapis 2 — pola: yang menuntut tindakan */}
          {ringkas.lewatKarenaJam > 0 && (
            <div className="rise rise-3" style={{
              ...kartu, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <TriangleAlert size={16} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--danger)" }}>
                  {ringkas.lewatKarenaJam} alat melewati ambang JAM, padahal jadwal kalendernya masih longgar
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Kalau yang dipakai cuma tanggal, alat-alat ini akan terlihat aman
                  sampai mesinnya berhenti di tengah proyek. Biayanya bukan
                  servisnya — melainkan pekerjaan yang ikut berhenti.
                </div>
              </div>
            </div>
          )}

          {ringkas.preventifGagal > 0 && (
            <div className="rise rise-3" style={{
              ...kartu, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Wrench size={16} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--warning)" }}>
                  {ringkas.preventifGagal} alat: separuh servisnya atau lebih adalah kerusakan mendadak
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Alat yang &ldquo;sering dirawat&rdquo; belum tentu terawat. Rasio mendadak
                  yang tinggi berarti jadwal preventifnya tidak mencegah apa pun —
                  intervalnya kemungkinan terlalu longgar.
                </div>
              </div>
            </div>
          )}

          {jadwalMendesak.length > 0 && (
            <div className="rise rise-3" style={{ ...kartu, marginBottom: "var(--gap-bagian)", overflow: "hidden" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Perawatan yang menuntut tindakan
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Diurutkan dari yang sudah lewat, bukan menurut abjad alat.
                </p>
              </div>
              <Tabel
                caption="Jadwal perawatan yang sudah jatuh tempo atau segera jatuh tempo, beserta pemicunya"
                kolom={kolomJadwal}
                data={jadwalMendesak}
                kunciBaris={(p) => p.id}
                tandaiBaris={(p) =>
                  p.jatuhTempo.status === "jatuh_tempo" ? "var(--danger-bg)" : undefined}
              />
            </div>
          )}

          {/* Lapis 3 — detail */}
          <div className="rise rise-4" style={{ ...kartu, overflow: "hidden" }}>
            <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                Seluruh alat
              </h3>
              <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                Meter terkini, perawatan terdekat, dan biaya sesungguhnya per jam kerja.
              </p>
            </div>
            <Tabel
              caption="Daftar alat beserta meter, perawatan terdekat, biaya per jam, dan pola perawatannya"
              kolom={kolom}
              data={alat}
              kunciBaris={(a) => a.id}
            />
          </div>
        </>
      )}
    </div>
  );
}
