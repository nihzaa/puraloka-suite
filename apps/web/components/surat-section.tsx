"use client";

/**
 * SURAT MASUK/KELUAR — korespondensi proyek. INTI #5 · migrasi 185.
 *
 * ── Yang paling dijaga: ARAH memisahkan dua keadaan yang berlawanan
 *
 * Surat KELUAR lewat batas  → LAWAN belum menjawab → kita MENAGIH
 * Surat MASUK lewat batas   → KITA belum menjawab  → kita SEGERA JAWAB
 *
 * Dua-duanya "lewat batas", tapi tindakannya berlawanan. Menampilkannya
 * sebagai satu angka membuat daftar ini tak bisa dipakai — dan yang paling
 * merugikan: surat masuk yang kita abaikan terbaca seperti kelalaian lawan.
 *
 * Karena itu ringkasannya DUA KOTAK TERPISAH, dan yang menuntut pekerjaan
 * kita ditaruh lebih dulu — bukan diurutkan alfabetis atau by tanggal.
 *
 * ── Kenapa bukan tabel
 *
 * Tabel menjawab "apa saja yang ada". Pertanyaan yang dibawa orang ke sini
 * adalah "apa yang harus saya kerjakan hari ini" — dan itu antrean, bukan
 * arsip. Arsipnya tetap ada, di bawah, setelah yang mendesak.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Mail, MailOpen, Plus, AlertTriangle, CornerDownRight, Clock,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { Saklar } from "@/components/saklar";
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

type Arah = "masuk" | "keluar";
type StatusSurat = "draft" | "terkirim" | "diterima" | "dibalas" | "selesai" | "kedaluwarsa";
type KeadaanBatas =
  | "tak_perlu" | "tak_diatur" | "berjalan" | "mendesak" | "lewat" | "tak_terbaca";

interface Batas {
  keadaan: KeadaanBatas;
  sisaHari: number | null;
  siapaYangDitunggu: "kita" | "lawan" | null;
  pesan: string;
}

interface Surat {
  id: string;
  nomor: string;
  arah: Arah;
  jenis: string;
  perihal: string;
  dari_pihak: string;
  kepada_pihak: string;
  tanggal_kirim: string | null;
  tanggal_terima: string | null;
  membalas_id: string | null;
  butuh_balasan: boolean;
  batas_balas: string | null;
  status: StatusSurat;
  batas: Batas;
}

interface RingkasSurat {
  jumlah: number;
  masuk: number;
  keluar: number;
  kita_belum_menjawab: number;
  lawan_belum_menjawab: number;
  mendesak: number;
}

const JENIS: Record<string, string> = {
  pemberitahuan: "Pemberitahuan",
  permintaan: "Permintaan",
  teguran: "Teguran",
  peringatan: "Peringatan",
  klarifikasi: "Klarifikasi",
  instruksi: "Instruksi",
  balasan: "Balasan",
  lain_lain: "Lain-lain",
};

/** Jenis yang jadi dasar sengketa — ditandai supaya tak tenggelam. */
const JENIS_BERAT = new Set(["teguran", "peringatan"]);

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function SuratSection({ projectId }: { projectId: string }) {
  const [surat, setSurat] = useState<Surat[]>([]);
  const [ringkas, setRingkas] = useState<RingkasSurat | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formBuka, setFormBuka] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    return api
      .get<{ data: Surat[]; ringkas: RingkasSurat }>(
        `/api/v1/projects/${projectId}/letters`, { signal })
      .then((r) => {
        setSurat(r.data.data ?? []);
        setRingkas(r.data.ringkas);
        setGalat(null);
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat surat"); })
      .finally(() => setMemuat(false));
  }, [projectId]);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const muatUlang = useCallback(() => { setMemuat(true); return muat(); }, [muat]);

  if (memuat) {
    return <p style={{ color: C.muted, fontSize: 13, padding: "16px 0" }}>Memuat surat…</p>;
  }

  const perluDijawab = surat.filter(
    (s) => s.batas.siapaYangDitunggu === "kita" &&
      (s.batas.keadaan === "lewat" || s.batas.keadaan === "mendesak"));

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
            <Mail size={16} aria-hidden="true" />
            Surat masuk & keluar
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.mid, maxWidth: 480 }}>
            Korespondensi resmi dengan owner dan konsultan — yang jadi bukti saat
            sengketa.
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
          <Plus size={14} aria-hidden="true" /> Catat surat
        </button>
      </header>

      {galat && (
        <p role="alert" style={{
          margin: "0 0 12px", padding: "10px 12px", borderRadius: 8,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.red, fontSize: 13,
        }}>{galat}</p>
      )}

      {/* ── Dua angka yang menuntut tindakan BERLAWANAN, dipisah ───────────── */}
      {ringkas && (ringkas.kita_belum_menjawab > 0 || ringkas.lawan_belum_menjawab > 0) && (
        <div style={{
          display: "grid", gap: 10, marginBottom: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}>
          {ringkas.kita_belum_menjawab > 0 && (
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: C.redBg, border: `1px solid ${C.redBorder}`,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <AlertTriangle size={16} color={C.red} aria-hidden="true"
                style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: C.red }}>
                  {ringkas.kita_belum_menjawab} surat menunggu jawaban KITA
                </strong>
                <div style={{ color: C.text }}>
                  Tiap hari lewat menambah bukti melawan kita.
                </div>
              </div>
            </div>
          )}
          {ringkas.lawan_belum_menjawab > 0 && (
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Clock size={16} color={C.yellow} aria-hidden="true"
                style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: C.yellow }}>
                  {ringkas.lawan_belum_menjawab} surat belum dijawab lawan
                </strong>
                <div style={{ color: C.text }}>
                  Dasar untuk menagih jawaban tertulis.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {surat.length === 0 ? (
        <div style={{
          padding: "28px 16px", textAlign: "center",
          border: `1px dashed ${C.border}`, borderRadius: 10, background: C.subtle,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 600 }}>
            Belum ada surat tercatat
          </p>
          <p style={{ margin: "6px auto 0", fontSize: 12, color: C.mid, maxWidth: 400, lineHeight: 1.55 }}>
            Catat surat begitu dikirim atau diterima. Saat sengketa, yang
            menentukan bukan siapa yang benar — melainkan siapa yang bisa
            membuktikan kapan memberi tahu.
          </p>
        </div>
      ) : (
        <>
          {/* Yang menuntut jawaban KITA ditaruh di atas — bukan diurutkan
              tanggal. Ini antrean kerja, bukan arsip. */}
          {perluDijawab.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h3 style={{
                margin: "0 0 8px", fontSize: 12, fontWeight: 700,
                color: C.red, textTransform: "uppercase", letterSpacing: ".04em",
              }}>Perlu dijawab</h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {perluDijawab.map((s) => <BarisSurat key={s.id} s={s} sorot />)}
              </ul>
            </div>
          )}

          <h3 style={{
            margin: "0 0 8px", fontSize: 12, fontWeight: 700,
            color: C.mid, textTransform: "uppercase", letterSpacing: ".04em",
          }}>
            Semua surat
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              {" "}· {ringkas?.masuk ?? 0} masuk, {ringkas?.keluar ?? 0} keluar
            </span>
          </h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {surat.map((s) => <BarisSurat key={s.id} s={s} />)}
          </ul>
        </>
      )}

      {formBuka && (
        <FormSurat
          projectId={projectId}
          onBatal={() => setFormBuka(false)}
          onSelesai={() => { setFormBuka(false); muatUlang(); }}
        />
      )}
    </section>
  );
}

function BarisSurat({ s, sorot }: { s: Surat; sorot?: boolean }) {
  const masuk = s.arah === "masuk";
  const berat = JENIS_BERAT.has(s.jenis);
  const tunggu = s.batas.siapaYangDitunggu;
  const lewat = s.batas.keadaan === "lewat";

  return (
    <li style={{
      border: `1px solid ${sorot ? C.redBorder : C.border}`,
      borderRadius: 10, padding: 12,
      background: sorot ? C.redBg : C.surface,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Arah dibedakan IKON, bukan hanya warna (WCAG 1.4.1). */}
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: 8,
            display: "grid", placeItems: "center",
            background: masuk ? C.blueBg : C.subtle,
            border: `1px solid ${masuk ? C.blueBorder : C.border}`,
          }}
        >
          {masuk
            ? <MailOpen size={14} color={C.blue} />
            : <CornerDownRight size={14} color={C.mid} />}
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "var(--t-kecil)", fontWeight: 700, color: C.navy,
              fontVariantNumeric: "tabular-nums",
            }}>{s.nomor}</span>
            <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>
              {masuk ? "Masuk" : "Keluar"}
            </span>
            <span style={{
              fontSize: "var(--t-mikro)", fontWeight: 600, padding: "2px 7px", borderRadius: 999,
              color: berat ? C.red : C.mid,
              background: berat ? C.redBg : C.subtle,
              border: `1px solid ${berat ? C.redBorder : C.border}`,
            }}>{JENIS[s.jenis] ?? s.jenis}</span>
          </div>

          <p style={{
            margin: "4px 0 0", fontSize: 13.5, fontWeight: 600,
            color: C.text, lineHeight: 1.4,
          }}>{s.perihal}</p>

          <p style={{ margin: "3px 0 0", fontSize: "var(--t-kecil)", color: C.mid }}>
            {masuk ? `Dari ${s.dari_pihak}` : `Ke ${s.kepada_pihak}`}
            {" · "}
            {masuk ? `diterima ${fmtTgl(s.tanggal_terima)}` : `dikirim ${fmtTgl(s.tanggal_kirim)}`}
          </p>

          {tunggu && s.batas.keadaan !== "tak_perlu" && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7,
              padding: "3px 8px", borderRadius: 999, fontSize: "var(--t-kecil)", fontWeight: 600,
              color: lewat ? C.red : (tunggu === "kita" ? C.yellow : C.mid),
              background: lewat ? C.redBg : (tunggu === "kita" ? C.yellowBg : C.subtle),
              border: `1px solid ${lewat ? C.redBorder : C.border}`,
            }}>
              <Clock size={11} aria-hidden="true" />
              {lewat
                ? (tunggu === "kita" ? "Kita telat menjawab" : "Lawan belum menjawab")
                : s.batas.sisaHari != null
                  ? `Sisa ${s.batas.sisaHari} hari · ${tunggu === "kita" ? "kita" : "lawan"}`
                  : "Batas belum ditetapkan"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function FormSurat({
  projectId, onBatal, onSelesai,
}: { projectId: string; onBatal: () => void; onSelesai: () => void }) {
  const [arah, setArah] = useState<Arah>("keluar");
  const [nomor, setNomor] = useState("");
  const [jenis, setJenis] = useState("pemberitahuan");
  const [perihal, setPerihal] = useState("");
  const [dari, setDari] = useState("");
  const [kepada, setKepada] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [butuhBalas, setButuhBalas] = useState(false);
  const [batasBalas, setBatasBalas] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const masuk = arah === "masuk";

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true); setGalat(null);
    try {
      await api.post(`/api/v1/projects/${projectId}/letters`, {
        nomor: nomor.trim(), arah, jenis, perihal: perihal.trim(),
        dari_pihak: dari.trim(), kepada_pihak: kepada.trim(),
        // Tanggalnya SATU medan di form, tapi dipetakan sesuai arah — pemakai
        // tak perlu memikirkan kolom mana yang harus diisi.
        tanggal_kirim: masuk ? null : tanggal,
        tanggal_terima: masuk ? tanggal : null,
        status: masuk ? "diterima" : "terkirim",
        butuh_balasan: butuhBalas,
        batas_balas: butuhBalas && batasBalas ? batasBalas : null,
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2?.response?.data?.error ?? "Gagal menyimpan surat");
    } finally {
      setSimpan(false);
    }
  }

  return (
    <form onSubmit={kirim} style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      border: `1px solid ${C.border}`, background: C.subtle, display: "grid", gap: 10,
    }}>
      {/* Arah dipilih DULUAN karena ia mengubah arti medan di bawahnya. */}
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 6 }}>
          Arah surat
        </legend>
        <div style={{ display: "flex", gap: 8 }}>
          {(["keluar", "masuk"] as const).map((a) => (
            <button
              key={a} type="button" onClick={() => setArah(a)}
              aria-pressed={arah === a}
              style={{
                flex: 1, minHeight: 40, borderRadius: 8, cursor: "pointer",
                border: `1px solid ${arah === a ? C.navy : C.border}`,
                background: arah === a ? "var(--navy-light)" : C.surface,
                color: arah === a ? C.navy : C.mid,
                fontSize: 13, fontWeight: arah === a ? 600 : 400,
              }}
            >
              {a === "keluar" ? "Kita kirim" : "Kita terima"}
            </button>
          ))}
        </div>
      </fieldset>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Medan label="Nomor surat">
          <input value={nomor} onChange={(e) => setNomor(e.target.value)}
            required placeholder="012/PP/VIII/2026" style={gayaInput} />
        </Medan>
        <Medan label="Jenis">
          <Pilihan value={jenis} onChange={(e) => setJenis(e.target.value)}
            aria-label="Jenis surat" style={gayaInput}>
            {Object.entries(JENIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Pilihan>
        </Medan>
      </div>

      <Medan label="Perihal">
        <input value={perihal} onChange={(e) => setPerihal(e.target.value)}
          required minLength={5}
          placeholder="Permintaan penyerahan lahan blok B" style={gayaInput} />
      </Medan>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Medan label="Dari">
          <input value={dari} onChange={(e) => setDari(e.target.value)}
            required placeholder={masuk ? "PT Owner Sejahtera" : "PT Puraloka Persada"}
            style={gayaInput} />
        </Medan>
        <Medan label="Kepada">
          <input value={kepada} onChange={(e) => setKepada(e.target.value)}
            required placeholder={masuk ? "PT Puraloka Persada" : "PT Owner Sejahtera"}
            style={gayaInput} />
        </Medan>
        <Medan label={masuk ? "Tanggal terima" : "Tanggal kirim"}>
          <input type="date" value={tanggal}
            onChange={(e) => setTanggal(e.target.value)} required style={gayaInput} />
        </Medan>
      </div>

      <Saklar
        nyala={butuhBalas}
        onUbah={setButuhBalas}
        label="Surat ini menuntut balasan"
      />

      {/* Batas hanya muncul kalau memang menuntut balasan — medan yang selalu
          tampil mengundang pengisian yang tak bermakna, dan batas pada surat
          tanpa kewajiban jawab menghasilkan peringatan palsu. */}
      {butuhBalas && (
        <Medan label="Batas balas" petunjuk="Menurut surat / kontrak">
          <input type="date" value={batasBalas}
            onChange={(e) => setBatasBalas(e.target.value)} style={gayaInput} />
        </Medan>
      )}

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
        }}>{simpan ? "Menyimpan…" : "Simpan surat"}</button>
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
        display: "block", fontSize: "var(--t-kecil)", fontWeight: 600,
        color: C.mid, marginBottom: 4,
      }}>
        {label}
        {petunjuk && <span style={{ fontWeight: 400, color: C.muted }}> · {petunjuk}</span>}
      </span>
      {children}
    </label>
  );
}
