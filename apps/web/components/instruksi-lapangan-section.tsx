"use client";

/**
 * INSTRUKSI LAPANGAN — terutama PERINTAH LISAN. INTI #6 · migrasi 186.
 *
 * ── Produknya bukan pencatatan, melainkan KONFIRMASI
 *
 * Perintah lisan yang dicatat sepihak bukan bukti — ia versi kita. Yang
 * membuatnya berjejak adalah konfirmasi balik ke pemberi perintah, dan
 * konfirmasi itu punya UMUR: surat hari-yang-sama nyaris tak pernah dibantah,
 * surat tiga bulan kemudian terbaca sebagai rekonstruksi.
 *
 * Karena itu yang paling menonjol di layar ini bukan daftar instruksinya,
 * melainkan **berapa jam tersisa untuk mengonfirmasi**. Instruksi yang sudah
 * dikonfirmasi turun ke bawah; ia tak menuntut apa pun lagi.
 *
 * ── Tiga keadaan yang sengaja dibedakan
 *
 *   mendesak   masih bisa diselamatkan HARI INI
 *   lewat      utang bukti; makin lama makin sulit ditagih
 *   disangkal  sudah sengketa — butuh bukti LAIN, bukan konfirmasi
 *
 * Menyatukan yang ketiga ke dua pertama membuat orang mengira masih bisa
 * dikejar dengan surat, padahal yang dibutuhkan sudah berbeda.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Megaphone, Plus, AlertTriangle, ShieldCheck, ShieldAlert, Ban, Clock,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { PilihanKartu } from "@/components/pilihan-kartu";
import { Pilihan } from "@/components/pilihan";

const C = {
  navy: "var(--navy)", text: "var(--text-primary)", mid: "var(--text-secondary)",
  muted: "var(--text-muted)", border: "var(--border)", surface: "var(--surface)",
  subtle: "var(--surface-subtle)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
};

type Bentuk = "lisan" | "telepon" | "whatsapp" | "rapat" | "tertulis";
type KeadaanKonfirmasi =
  | "tak_perlu" | "terkonfirmasi_segera" | "terkonfirmasi_lambat"
  | "mendesak" | "lewat" | "disangkal" | "tak_terbaca";

interface Konfirmasi {
  keadaan: KeadaanKonfirmasi;
  jamBerlalu: number | null;
  sisaJam: number | null;
  pesan: string;
}

interface TindakLanjut {
  jalur: Array<"klaim" | "eot">;
  pesan: string;
}

interface Instruksi {
  id: string;
  nomor: string;
  pemberi_nama: string;
  pemberi_jabatan: string | null;
  pemberi_pihak: string;
  bentuk_perintah: Bentuk;
  isi_instruksi: string;
  lokasi: string | null;
  diterima_pada: string;
  dikonfirmasi_pada: string | null;
  dikonfirmasi_via: string | null;
  berdampak_biaya: boolean;
  berdampak_waktu: boolean;
  estimasi_biaya: number | string | null;
  status: string;
  klaim_id: string | null;
  konfirmasi: Konfirmasi;
  tindak_lanjut: TindakLanjut;
}

interface RingkasInstruksi {
  jumlah: number;
  konfirmasi_lewat: number;
  konfirmasi_mendesak: number;
  disangkal: number;
  berdampak_tanpa_klaim: number;
}

const BENTUK: Record<Bentuk, string> = {
  lisan: "Lisan di lokasi",
  telepon: "Telepon",
  whatsapp: "WhatsApp",
  rapat: "Rapat",
  tertulis: "Tertulis",
};

const fmtRp = (n: number) =>
  n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtWaktu = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

/** Lencana keadaan konfirmasi — ikon BERBEDA per keadaan, bukan hanya warna. */
function lencana(k: Konfirmasi): {
  teks: string; warna: string; bg: string; border: string; ikon: React.ReactNode;
} | null {
  switch (k.keadaan) {
    case "mendesak":
      return { teks: `Konfirmasi dalam ${k.sisaJam} jam`, warna: C.yellow,
        bg: C.yellowBg, border: C.yellowBorder, ikon: <Clock size={11} /> };
    case "lewat":
      return { teks: "Belum dikonfirmasi — lewat batas", warna: C.red,
        bg: C.redBg, border: C.redBorder, ikon: <ShieldAlert size={11} /> };
    case "terkonfirmasi_segera":
      return { teks: `Dikonfirmasi ${k.jamBerlalu} jam`, warna: C.green,
        bg: C.greenBg, border: C.greenBorder, ikon: <ShieldCheck size={11} /> };
    case "terkonfirmasi_lambat":
      return { teks: `Dikonfirmasi terlambat (${k.jamBerlalu} jam)`, warna: C.yellow,
        bg: C.yellowBg, border: C.yellowBorder, ikon: <ShieldCheck size={11} /> };
    case "disangkal":
      return { teks: "Disangkal pemberi perintah", warna: C.red,
        bg: C.redBg, border: C.redBorder, ikon: <Ban size={11} /> };
    default:
      return null;
  }
}

export function InstruksiLapanganSection({ projectId }: { projectId: string }) {
  const [daftar, setDaftar] = useState<Instruksi[]>([]);
  const [ringkas, setRingkas] = useState<RingkasInstruksi | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formBuka, setFormBuka] = useState(false);
  const [konfirmasiUntuk, setKonfirmasiUntuk] = useState<Instruksi | null>(null);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<{ data: Instruksi[]; ringkas: RingkasInstruksi }>(
        `/api/v1/projects/${projectId}/field-instructions`, { signal })
      .then((r) => {
        setDaftar(r.data.data ?? []);
        setRingkas(r.data.ringkas);
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat instruksi"); })
      .finally(() => setMemuat(false));
  }, [projectId]);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  if (memuat) {
    return <p style={{ color: C.muted, fontSize: 13, padding: "16px 0" }}>Memuat instruksi…</p>;
  }

  const mendesak = daftar.filter(
    (i) => i.konfirmasi.keadaan === "mendesak" || i.konfirmasi.keadaan === "lewat");

  return (
    <section style={{
      borderRadius: 12, border: `1px solid ${C.border}`,
      background: C.surface, padding: 18, marginTop: 20,
    }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", marginBottom: 14,
      }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 16, fontWeight: 700, color: C.text,
            fontFamily: "var(--font-display, inherit)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Megaphone size={16} aria-hidden="true" />
            Instruksi lapangan
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid, maxWidth: 500 }}>
            Perintah lisan dari pengawas atau owner — dicatat saat kejadian,
            lalu dikonfirmasi tertulis supaya tak bisa disangkal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormBuka((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            minHeight: 40, padding: "0 14px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={14} aria-hidden="true" /> Catat instruksi
        </button>
      </header>

      {galat && (
        <p role="alert" style={{
          margin: "0 0 12px", padding: "10px 12px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 13,
        }}>{galat}</p>
      )}

      {ringkas && (ringkas.konfirmasi_mendesak > 0 || ringkas.konfirmasi_lewat > 0
        || ringkas.disangkal > 0 || ringkas.berdampak_tanpa_klaim > 0) && (
        <div style={{
          display: "grid", gap: 10, marginBottom: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        }}>
          {ringkas.konfirmasi_mendesak > 0 && (
            <Peringatan warna={C.yellow} bg={C.yellowBg} border={C.yellowBorder}
              ikon={<Clock size={16} color={C.yellow} />}
              judul={`${ringkas.konfirmasi_mendesak} perlu dikonfirmasi`}
              isi="Masih dalam batas — bisa diselamatkan hari ini." />
          )}
          {ringkas.konfirmasi_lewat > 0 && (
            <Peringatan warna={C.red} bg={C.redBg} border={C.redBorder}
              ikon={<ShieldAlert size={16} color={C.red} />}
              judul={`${ringkas.konfirmasi_lewat} lewat batas konfirmasi`}
              isi="Makin lama, makin mudah disangkal." />
          )}
          {ringkas.disangkal > 0 && (
            <Peringatan warna={C.red} bg={C.redBg} border={C.redBorder}
              ikon={<Ban size={16} color={C.red} />}
              judul={`${ringkas.disangkal} disangkal`}
              isi="Butuh bukti lain — saksi, foto, notulen." />
          )}
          {ringkas.berdampak_tanpa_klaim > 0 && (
            <Peringatan warna={C.blue} bg={C.blueBg} border={C.blueBorder}
              ikon={<AlertTriangle size={16} color={C.blue} />}
              judul={`${ringkas.berdampak_tanpa_klaim} berbiaya, belum diklaim`}
              isi="Uang yang berhak ditagih tapi belum diajukan." />
          )}
        </div>
      )}

      {daftar.length === 0 ? (
        <div style={{
          padding: "28px 16px", textAlign: "center",
          border: `1px dashed ${C.border}`, borderRadius: 10, background: C.subtle,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 600 }}>
            Belum ada instruksi tercatat
          </p>
          <p style={{ margin: "6px auto 0", fontSize: 12, color: C.mid, maxWidth: 420, lineHeight: 1.55 }}>
            Catat begitu pengawas memberi perintah — sekalipun cuma lisan di
            lokasi. Enam bulan lagi, saat ditagih, jawaban &ldquo;kami tidak pernah
            menyuruh&rdquo; hanya bisa dibantah kalau ada catatannya.
          </p>
        </div>
      ) : (
        <>
          {mendesak.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h3 style={{
                margin: "0 0 8px", fontSize: 12, fontWeight: 700,
                color: C.red, textTransform: "uppercase", letterSpacing: ".04em",
              }}>Menunggu konfirmasi</h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {mendesak.map((i) => (
                  <Baris key={i.id} i={i} sorot onKonfirmasi={() => setKonfirmasiUntuk(i)} />
                ))}
              </ul>
            </div>
          )}

          <h3 style={{
            margin: "0 0 8px", fontSize: 12, fontWeight: 700,
            color: C.mid, textTransform: "uppercase", letterSpacing: ".04em",
          }}>Semua instruksi</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {daftar.map((i) => (
              <Baris key={i.id} i={i} onKonfirmasi={() => setKonfirmasiUntuk(i)} />
            ))}
          </ul>
        </>
      )}

      {formBuka && (
        <FormInstruksi
          projectId={projectId}
          onBatal={() => setFormBuka(false)}
          onSelesai={() => { setFormBuka(false); muatUlang(); }}
        />
      )}

      {konfirmasiUntuk && (
        <FormKonfirmasi
          projectId={projectId}
          instruksi={konfirmasiUntuk}
          onBatal={() => setKonfirmasiUntuk(null)}
          onSelesai={() => { setKonfirmasiUntuk(null); muatUlang(); }}
        />
      )}
    </section>
  );
}

function Peringatan({
  warna, bg, border, ikon, judul, isi,
}: {
  warna: string; bg: string; border: string;
  ikon: React.ReactNode; judul: string; isi: string;
}) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10, background: bg,
      border: `1px solid ${border}`, display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>{ikon}</span>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        <strong style={{ color: warna }}>{judul}</strong>
        <div style={{ color: C.text }}>{isi}</div>
      </div>
    </div>
  );
}

function Baris({
  i, sorot, onKonfirmasi,
}: { i: Instruksi; sorot?: boolean; onKonfirmasi: () => void }) {
  const l = lencana(i.konfirmasi);
  const belumKonfirmasi =
    i.konfirmasi.keadaan === "mendesak" || i.konfirmasi.keadaan === "lewat";

  return (
    <li style={{
      border: `1px solid ${sorot ? C.redBorder : C.border}`,
      borderRadius: 10, padding: 12,
      background: sorot ? C.redBg : C.surface,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", alignItems: "flex-start",
      }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: C.navy,
              fontVariantNumeric: "tabular-nums",
            }}>{i.nomor}</span>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
              color: C.mid, background: C.subtle, border: `1px solid ${C.border}`,
            }}>{BENTUK[i.bentuk_perintah] ?? i.bentuk_perintah}</span>
          </div>

          <p style={{
            margin: "5px 0 0", fontSize: 13.5, color: C.text, lineHeight: 1.45,
          }}>{i.isi_instruksi}</p>

          <p style={{ margin: "4px 0 0", fontSize: 11.5, color: C.mid }}>
            {i.pemberi_nama}
            {i.pemberi_jabatan && ` (${i.pemberi_jabatan})`}
            {" · "}{i.pemberi_pihak}
            {" · "}{fmtWaktu(i.diterima_pada)}
          </p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {l && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                color: l.warna, background: l.bg, border: `1px solid ${l.border}`,
              }}>{l.ikon}{l.teks}</span>
            )}
            {/* Jalur tindak lanjut ditampilkan sebagai lencana terpisah —
                satu instruksi bisa memicu DUA jalur, dan yang kedua paling
                sering terlupa. */}
            {i.tindak_lanjut.jalur.map((j) => (
              <span key={j} style={{
                padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                color: C.blue, background: C.blueBg, border: `1px solid ${C.blueBorder}`,
              }}>
                {j === "klaim" ? "Perlu klaim biaya" : "Perlu EOT"}
              </span>
            ))}
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {i.estimasi_biaya != null && (
            <div style={{
              fontSize: 14, fontWeight: 700, color: C.text,
              fontVariantNumeric: "tabular-nums",
              fontFamily: "var(--font-display, inherit)",
            }}>{fmtRp(Number(i.estimasi_biaya))}</div>
          )}
          {belumKonfirmasi && (
            <button
              type="button" onClick={onKonfirmasi}
              style={{
                marginTop: 8, minHeight: 40, padding: "0 12px", borderRadius: 8,
                border: `1px solid ${C.navy}`, background: C.surface,
                color: C.navy, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >Catat konfirmasi</button>
          )}
        </div>
      </div>
    </li>
  );
}

function FormInstruksi({
  projectId, onBatal, onSelesai,
}: { projectId: string; onBatal: () => void; onSelesai: () => void }) {
  const [nomor, setNomor] = useState("");
  const [bentuk, setBentuk] = useState<Bentuk>("lisan");
  const [isi, setIsi] = useState("");
  const [nama, setNama] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [pihak, setPihak] = useState("");
  const [waktu, setWaktu] = useState(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  });
  const [biaya, setBiaya] = useState(false);
  const [waktuDampak, setWaktuDampak] = useState(false);
  const [estimasi, setEstimasi] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${projectId}/field-instructions`, {
        nomor: nomor.trim(),
        bentuk_perintah: bentuk,
        isi_instruksi: isi.trim(),
        pemberi_nama: nama.trim(),
        pemberi_jabatan: jabatan.trim() || null,
        pemberi_pihak: pihak.trim(),
        diterima_pada: new Date(waktu).toISOString(),
        berdampak_biaya: biaya,
        berdampak_waktu: waktuDampak,
        estimasi_biaya: biaya && estimasi ? Number(estimasi) : null,
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan instruksi");
    } finally {
      setSimpan(false);
    }
  }

  return (
    <form onSubmit={kirim} style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      border: `1px solid ${C.border}`, background: C.subtle, display: "grid", gap: 10,
    }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Medan label="Nomor">
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            required placeholder="SI-001" style={gayaInput} />
        </Medan>
        <Medan label="Bentuk perintah" petunjuk="Menentukan batas konfirmasi">
          <Pilihan value={bentuk} onChange={(e) => setBentuk(e.target.value as Bentuk)}
            aria-label="Bentuk perintah" style={gayaInput}>
            {Object.entries(BENTUK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Pilihan>
        </Medan>
        <Medan label="Waktu diterima">
          <input type="datetime-local" value={waktu}
            onChange={(e) => setWaktu(e.target.value)} required style={gayaInput} />
        </Medan>
      </div>

      <Medan label="Apa yang diperintahkan" petunjuk="Cukup rinci untuk dibaca setahun lagi">
        <textarea value={isi} onChange={(e) => setIsi(e.target.value)}
          required minLength={10} rows={2}
          placeholder="Bongkar dinding partisi lantai 2 zona B, ganti bata ringan"
          style={{ ...gayaInput, minHeight: 60, padding: "8px 10px", resize: "vertical" }} />
      </Medan>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Medan label="Nama pemberi">
          <input value={nama} onChange={(e) => setNama(e.target.value)}
            required placeholder="Ir. Bambang" style={gayaInput} />
        </Medan>
        <Medan label="Jabatan" petunjuk="opsional">
          <input value={jabatan} onChange={(e) => setJabatan(e.target.value)}
            placeholder="Pengawas" style={gayaInput} />
        </Medan>
        <Medan label="Dari pihak">
          <input value={pihak} onChange={(e) => setPihak(e.target.value)}
            required placeholder="PT Owner Sejahtera" style={gayaInput} />
        </Medan>
      </div>

      <fieldset style={{
        border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", margin: 0,
      }}>
        <legend style={{ fontSize: 11.5, fontWeight: 600, color: C.mid, padding: "0 4px" }}>
          Dampaknya
        </legend>
        {/* DUA dampak yang bisa menyala bersamaan — instruksi lapangan sering
            menambah biaya DAN waktu sekaligus. Jadi daftar pilihan (kartu
            ganda), bukan dua saklar terpisah. */}
        <PilihanKartu
          nama="dampak-instruksi"
          label=""
          ganda
          nilai={[...(biaya ? ["biaya"] : []), ...(waktuDampak ? ["waktu"] : [])]}
          opsi={[
            { nilai: "biaya", label: "Menambah biaya" },
            { nilai: "waktu", label: "Menambah waktu" },
          ]}
          onUbah={(v) => {
            if (v === "biaya") setBiaya(!biaya);
            else setWaktuDampak(!waktuDampak);
          }}
        />
        {biaya && (
          <div style={{ marginTop: 10 }}>
            <Medan label="Estimasi biaya (Rp)">
              <input type="number" min={0} value={estimasi}
                onChange={(e) => setEstimasi(e.target.value)}
                placeholder="50000000" style={gayaInput} />
            </Medan>
          </div>
        )}
      </fieldset>

      {galat && (
        <p role="alert" style={{
          margin: 0, padding: "9px 11px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 12.5,
        }}>{galat}</p>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onBatal} style={{
          minHeight: 40, padding: "0 14px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: C.surface,
          color: C.mid, fontSize: 13, cursor: "pointer",
        }}>Batal</button>
        <button type="submit" disabled={simpan} style={{
          minHeight: 40, padding: "0 16px", borderRadius: 8, border: "none",
          background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 600,
          cursor: simpan ? "progress" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>{simpan ? "Menyimpan…" : "Simpan instruksi"}</button>
      </div>
    </form>
  );
}

/**
 * Form konfirmasi.
 *
 * Medan "cara konfirmasi" WAJIB dan tak berpetunjuk "opsional" — server pun
 * menolak yang kosong. Alasannya sama di kedua tempat: "sudah dikonfirmasi"
 * yang tak menyebut caranya adalah klaim tanpa bukti, persis keadaan yang
 * modul ini dibuat untuk menghindarinya.
 */
function FormKonfirmasi({
  projectId, instruksi, onBatal, onSelesai,
}: {
  projectId: string; instruksi: Instruksi;
  onBatal: () => void; onSelesai: () => void;
}) {
  const [via, setVia] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setGalat(null);
    try {
      await api.patch(`/api/v1/field-instructions/${instruksi.id}/konfirmasi`, {
        project_id: projectId,
        dikonfirmasi_via: via.trim(),
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan konfirmasi");
    } finally {
      setSimpan(false);
    }
  }

  const lewat = instruksi.konfirmasi.keadaan === "lewat";

  return (
    <form onSubmit={kirim} style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      border: `1px solid ${C.border}`, background: C.subtle, display: "grid", gap: 10,
    }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
        Catat konfirmasi — {instruksi.nomor}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>
        {lewat
          ? "Batas konfirmasi sudah lewat. Mencatatnya tetap lebih baik daripada tidak sama sekali — nilainya akan ditandai apa adanya."
          : `Instruksi ${BENTUK[instruksi.bentuk_perintah]?.toLowerCase()} dari ${instruksi.pemberi_nama}.`}
      </p>

      <Medan label="Dikonfirmasi lewat apa" petunjuk="Ini yang jadi buktinya">
        <input value={via} onChange={(e) => setVia(e.target.value)} required
          placeholder="Surat 012/PP/VIII · email 4 Agu · BA rapat mingguan"
          style={gayaInput} />
      </Medan>

      {galat && (
        <p role="alert" style={{
          margin: 0, padding: "9px 11px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 12.5,
        }}>{galat}</p>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onBatal} style={{
          minHeight: 40, padding: "0 14px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: C.surface,
          color: C.mid, fontSize: 13, cursor: "pointer",
        }}>Batal</button>
        <button type="submit" disabled={simpan} style={{
          minHeight: 40, padding: "0 16px", borderRadius: 8, border: "none",
          background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 600,
          cursor: simpan ? "progress" : "pointer", opacity: simpan ? 0.7 : 1,
        }}>{simpan ? "Menyimpan…" : "Simpan konfirmasi"}</button>
      </div>
    </form>
  );
}

const gayaInput: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "0 10px",
  borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 13,
};

function Medan({
  label, petunjuk, children,
}: { label: string; petunjuk?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{
        display: "block", fontSize: 11.5, fontWeight: 600,
        color: C.mid, marginBottom: 4,
      }}>
        {label}
        {petunjuk && <span style={{ fontWeight: 400, color: C.muted }}> · {petunjuk}</span>}
      </span>
      {children}
    </label>
  );
}
