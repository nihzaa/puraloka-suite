"use client";

/**
 * SURAT PERINTAH KERJA — perintah kerja resmi ke subkontraktor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * RANTAI YANG PUTUS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12:
 *
 *     tender & penawaran   3 tender, 1 pemenang        ADA
 *     ─────────────────────────────────────────────────────
 *     SPK                  perintah kerja resmi        TAK ADA
 *     ─────────────────────────────────────────────────────
 *     lingkup kerja        20 scope + pembayaran       ADA
 *
 * Nol dari 3 tender tersambung ke lingkup kerja. Dan lima kolom kontrak di
 * `work_scopes` — ada sejak 2024 — tak pernah terisi: 20 dari 20 berstatus
 * `unsigned`, termasuk yang bernilai Rp 280 juta.
 *
 * ── Yang menentukan rancangannya
 *
 * 1. STATUS + TANDA TANGAN adalah inti kartunya. Pertanyaan pembacanya selalu
 *    "mana yang belum ditandatangani" — bukan "berapa nilai totalnya".
 *
 * 2. DENDA ditampilkan hanya bila sudah TERLAMBAT, dan selalu dengan batas
 *    atasnya. Denda kotor Rp 31 juta yang sebenarnya terbatas di Rp 5 juta
 *    adalah angka yang menakuti tanpa alasan.
 *
 * 3. SPK GANDA diperingatkan, bukan dilarang — addendum adalah praktik yang
 *    sah saat lingkupnya bertambah.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  FileSignature, RefreshCw, PenLine, Check, X, Clock, Lock, Plus,
} from "lucide-react";
import { api, hasPermission, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type StatusSpk = "draf" | "diterbitkan" | "ditandatangani" | "dibatalkan";

interface Denda {
  hariTerlambat: number;
  dendaKotor: number;
  dendaTerbatas: number;
  terkenaBatas: boolean;
}

interface Spk {
  id: string;
  nomor: string;
  tanggal_terbit: string;
  lingkup_kerja: string;
  nilai_kontrak: number | string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  denda_per_hari: number | string | null;
  denda_maks_pct: number | string | null;
  syarat_khusus: string | null;
  status: StatusSpk;
  alasan_batal: string | null;
  ttd_penerbit_url: string | null;
  ttd_pelaksana_url: string | null;
  work_scope_id: string;
  penerbit?: { id: string; name: string } | null;
  scope?: { id: string; scope_name: string; payment_system: string } | null;
  /** Dihitung server saat baca — bukan disimpan. */
  denda: Denda | null;
}

const META: Record<StatusSpk, { label: string; warna: string; bg: string; border: string }> = {
  draf:           { label: "Draf",            warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  diterbitkan:    { label: "Diterbitkan",     warna: "var(--warning-teks)",   bg: "var(--warning-bg)",     border: "var(--warning-border)" },
  ditandatangani: { label: "Ditandatangani",  warna: "var(--success)",        bg: "var(--success-bg)",     border: "var(--success-border)" },
  dibatalkan:     { label: "Dibatalkan",      warna: "var(--danger)",         bg: "var(--danger-bg)",      border: "var(--danger-border)" },
};

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : "Rp " + Math.round(Number(n)).toLocaleString("id-ID");

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export default function SpkPage() {
  const [daftar, setDaftar] = useState<Spk[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [putaran, setPutaran] = useState(0);
  const [formTerbuka, setFormTerbuka] = useState(false);

  const bolehKelola = useSyncExternalStore(langganan, () => hasPermission("spk:kelola"), () => false);
  const bolehTtd = useSyncExternalStore(langganan, () => hasPermission("spk:tandatangan"), () => false);

  const muat = useCallback((signal: AbortSignal) => {
    setMemuat(true);
    setGalat("");
    return api.get<{ spk: Spk[] }>("/api/v1/spk", { signal })
      .then((r) => setDaftar(r.data.spk ?? []))
      .catch((e) => {
        if ((e as { code?: string })?.code === "ERR_CANCELED") return;
        setGalat(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Gagal memuat surat perintah kerja.",
        );
      })
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat, putaran]);

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 5000);
    return () => clearTimeout(t);
  }, [pesan]);

  async function kirim(id: string, body: Record<string, unknown>, sukses: string) {
    setSibuk(id);
    setPesan(null);
    try {
      await api.patch(`/api/v1/spk/${id}/status`, body);
      setPesan({ jenis: "ok", teks: sukses });
      setPutaran((x) => x + 1);
    } catch (e) {
      // Pesan server ditampilkan apa adanya — ia sudah ditulis untuk manusia
      // ("SPK bertanda tangan satu pihak adalah pemberitahuan, bukan
      // kesepakatan"), dan menggantinya membuang petunjuknya.
      setPesan({
        jenis: "galat",
        teks: (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal memproses SPK.",
      });
    } finally {
      setSibuk(null);
    }
  }

  // Yang menunggu tindakan di atas: draf & diterbitkan sebelum yang selesai.
  const urut = useMemo(() => {
    const bobot: Record<StatusSpk, number> = {
      diterbitkan: 0, draf: 1, ditandatangani: 2, dibatalkan: 3,
    };
    return [...daftar].sort((a, b) =>
      bobot[a.status] - bobot[b.status] || b.tanggal_terbit.localeCompare(a.tanggal_terbit));
  }, [daftar]);

  const terlambat = daftar.filter((s) => (s.denda?.hariTerlambat ?? 0) > 0);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Surat Perintah Kerja"
          keterangan="Perintah kerja resmi ke subkontraktor: lingkup, nilai, jangka waktu, dan sanksi keterlambatan — dengan tanda tangan kedua pihak."
          ikon={<FileSignature size={19} />}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {bolehKelola && (
          <button
            type="button"
            onClick={() => setFormTerbuka(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "none", background: "var(--aksen)", color: "var(--on-aksen)",
              cursor: "pointer",
            }}
          >
            <Plus size={14} aria-hidden="true" /> Terbitkan SPK
          </button>
        )}
        <button
          type="button"
          onClick={() => setPutaran((x) => x + 1)}
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

      {terlambat.length > 0 && (
        <div style={{
          marginBottom: "var(--gap-bagian)", padding: "10px 14px", borderRadius: 8,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          color: "var(--danger)", fontSize: 13, display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <Clock size={15} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            <strong>{terlambat.length}</strong> SPK melewati tenggat.
            Denda dihitung ulang tiap kali halaman ini dibuka — bukan disimpan, supaya tak basi.
          </span>
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat surat perintah kerja…
        </div>
      ) : urut.length === 0 ? (
        <Kosong
          ikon={<FileSignature size={28} />}
          judul="Belum ada surat perintah kerja"
          sebab={
            <>
              SPK adalah mata rantai antara <strong>memenangkan tender</strong> dan{" "}
              <strong>mulai bekerja</strong>: ia yang menyatakan lingkup, nilai, jangka waktu,
              dan sanksi keterlambatan secara tertulis. Tanpa itu, kesepakatannya hanya
              ada di ingatan kedua pihak — dan yang berbeda ingatannya adalah yang
              bersengketa belakangan.
            </>
          }
          aksi={bolehKelola ? (
            <button
              type="button" onClick={() => setFormTerbuka(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--aksen)", color: "var(--on-aksen)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Terbitkan SPK pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {urut.map((s) => (
            <KartuSpk
              key={s.id}
              spk={s}
              bolehKelola={bolehKelola}
              bolehTtd={bolehTtd}
              sibuk={sibuk === s.id}
              onTerbitkan={() => void kirim(s.id, { status: "diterbitkan" },
                `${s.nomor} diterbitkan — tinggal ditandatangani kedua pihak.`)}
              onTtd={(pihak) => void kirim(s.id,
                { ttd_url: `ttd-${pihak}-${Date.now()}.png`, pihak },
                `Tanda tangan ${pihak} dibubuhkan pada ${s.nomor}.`)}
              onTandatangani={() => void kirim(s.id, { status: "ditandatangani" },
                `${s.nomor} ditandatangani kedua pihak — kontraknya kini mengikat.`)}
            />
          ))}
        </div>
      )}

      {formTerbuka && (
        <FormTerbitSpk
          onTutup={() => setFormTerbuka(false)}
          onSelesai={(teks) => {
            setFormTerbuka(false);
            setPesan({ jenis: "ok", teks });
            setPutaran((x) => x + 1);
          }}
        />
      )}
    </div>
  );
}

function KartuSpk({ spk: s, bolehKelola, bolehTtd, sibuk, onTerbitkan, onTtd, onTandatangani }: {
  spk: Spk;
  bolehKelola: boolean;
  bolehTtd: boolean;
  sibuk: boolean;
  onTerbitkan: () => void;
  onTtd: (pihak: "penerbit" | "pelaksana") => void;
  onTandatangani: () => void;
}) {
  const m = META[s.status];
  const lengkapTtd = !!s.ttd_penerbit_url && !!s.ttd_pelaksana_url;

  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden", borderColor: m.border }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        background: m.bg, display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {s.nomor}
            <span style={{
              marginInlineStart: 10, fontSize: 11.5, fontWeight: 700, color: m.warna,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {m.label}
            </span>
          </h3>
          <div style={{ fontSize: 13, color: C.text, marginTop: 5 }}>{s.lingkup_kerja}</div>
          <div style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>
            {s.scope?.scope_name && <>{s.scope.scope_name} · </>}
            {s.tanggal_mulai} s.d. {s.tanggal_selesai}
            {s.penerbit?.name && <> · diterbitkan {s.penerbit.name}</>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {rupiah(s.nilai_kontrak)}
          </div>
          {s.denda_per_hari !== null && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              denda {rupiah(s.denda_per_hari)}/hari
              {s.denda_maks_pct !== null && ` · maks ${Number(s.denda_maks_pct)}%`}
            </div>
          )}
        </div>
      </div>

      {s.alasan_batal && (
        <div style={{
          padding: "10px var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
          background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, lineHeight: 1.55,
        }}>
          <strong>Alasan pembatalan:</strong> {s.alasan_batal}
        </div>
      )}

      {/* Denda hanya saat TERLAMBAT, dan selalu dengan batasnya. Denda kotor
          Rp 31 juta yang sebenarnya terbatas Rp 5 juta menakuti tanpa alasan. */}
      {s.denda && s.denda.hariTerlambat > 0 && (
        <div style={{
          padding: "10px var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
          background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13,
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        }}>
          <Clock size={14} aria-hidden="true" />
          <span>
            Terlambat <strong>{s.denda.hariTerlambat} hari</strong> · denda{" "}
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(s.denda.dendaTerbatas)}</strong>
            {s.denda.terkenaBatas && (
              <span style={{ color: C.mid }}>
                {" "}(dibatasi dari {rupiah(s.denda.dendaKotor)})
              </span>
            )}
          </span>
        </div>
      )}

      {/* Dua tanda tangan — inti yang membuat SPK mengikat. */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        padding: "12px var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        fontSize: 12.5,
      }}>
        <BarisTtd
          label="Penerbit (perusahaan)"
          ada={!!s.ttd_penerbit_url}
          bisa={bolehKelola && bolehTtd && (s.status === "draf" || s.status === "diterbitkan")}
          sibuk={sibuk}
          onKlik={() => onTtd("penerbit")}
          catatan={!bolehTtd ? "Butuh izin Tanda tangani SPK" : undefined}
        />
        <BarisTtd
          label="Pelaksana (subkontraktor)"
          ada={!!s.ttd_pelaksana_url}
          bisa={bolehKelola && (s.status === "draf" || s.status === "diterbitkan")}
          sibuk={sibuk}
          onKlik={() => onTtd("pelaksana")}
        />
      </div>

      {bolehKelola && s.status !== "dibatalkan" && s.status !== "ditandatangani" && (
        <div style={{
          padding: "12px var(--pad-kartu-lega)",
          display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center",
        }}>
          {s.status === "draf" && (
            <button
              type="button" onClick={onTerbitkan} disabled={sibuk}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.navy}`, background: C.navyLight, color: C.navy,
                cursor: sibuk ? "wait" : "pointer",
              }}
            >
              <FileSignature size={14} aria-hidden="true" /> Terbitkan
            </button>
          )}
          {s.status === "diterbitkan" && (
            <button
              type="button" onClick={onTandatangani} disabled={sibuk || !lengkapTtd}
              title={lengkapTtd ? undefined : "Butuh tanda tangan kedua pihak"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: C.navy, color: "var(--on-aksen)",
                cursor: sibuk || !lengkapTtd ? "not-allowed" : "pointer",
                opacity: sibuk || !lengkapTtd ? 0.5 : 1,
              }}
            >
              <Check size={14} aria-hidden="true" /> Sahkan kontrak
            </button>
          )}
        </div>
      )}

      {s.status === "ditandatangani" && (
        <div style={{
          padding: "10px var(--pad-kartu-lega)", background: "var(--surface-subtle)",
          fontSize: 12, color: C.mid, display: "flex", alignItems: "center", gap: 6,
        }}>
          <Lock size={12} aria-hidden="true" />
          Nilai, lingkup, jangka waktu, dan denda terkunci. Terbitkan addendum bila lingkupnya berubah.
        </div>
      )}
    </div>
  );
}

function BarisTtd({ label, ada, bisa, sibuk, onKlik, catatan }: {
  label: string; ada: boolean; bisa: boolean; sibuk: boolean;
  onKlik: () => void; catatan?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      {ada ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, color: "var(--success)" }}>
          <Check size={13} aria-hidden="true" /> Sudah ditandatangani
        </div>
      ) : bisa ? (
        <button
          type="button" onClick={onKlik} disabled={sibuk}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4,
            padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
            cursor: sibuk ? "wait" : "pointer",
          }}
        >
          <PenLine size={12} aria-hidden="true" /> Bubuhkan tanda tangan
        </button>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, color: C.muted, fontSize: 12 }}>
          <X size={12} aria-hidden="true" /> {catatan ?? "Belum ditandatangani"}
        </div>
      )}
    </div>
  );
}

/**
 * FORM TERBIT SPK — berangkat dari tender, bukan dari halaman kosong.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TENDER LEBIH DULU, BUKAN LINGKUP KERJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rute POST menerima `tender_id` dan `penawaran_id`, dan penjaga
 * `audit-kolom-tak-tersambung` menabrak versi pertama halaman ini karena
 * keduanya tak punya jalan pengisian: kolom yang API kenal tapi UI tak bisa
 * isi akan selamanya NULL, dan pertanyaan "SPK ini berasal dari tender mana"
 * tak pernah terjawab.
 *
 * Memperbaikinya dengan menambah dua kotak isian UUID akan menghijaukan
 * penjaga tanpa menolong siapa pun — tak seorang pun hafal UUID penawaran.
 *
 * Jadi urutannya mengikuti cara kerjanya di lapangan: pilih TENDER yang sudah
 * selesai, dan penawaran pemenangnya mengisi sendiri nilai kontrak beserta
 * lingkup kerjanya. Yang diketik manusia tinggal yang memang keputusan:
 * tanggal, denda, syarat khusus.
 *
 * SPK tanpa tender tetap boleh — penunjukan langsung dan pekerjaan darurat
 * nyata adanya. Itu sebabnya pilihan "tanpa tender" ada di daftar, bukan
 * disembunyikan.
 */
interface TenderRingkas {
  id: string;
  nomor: string;
  judul: string;
  status: string;
  proyek?: { id: string; name: string } | null;
}

interface PenawaranRingkas {
  id: string;
  nilai_penawaran: number | string;
  waktu_kerja_hari: number | null;
  tidak_menawar: boolean | null;
  status: string | null;
  workers?: { id: string; name: string } | null;
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

function FormTerbitSpk({ onTutup, onSelesai }: {
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [tender, setTender] = useState<TenderRingkas[]>([]);
  const [tenderId, setTenderId] = useState("");
  const [penawaran, setPenawaran] = useState<PenawaranRingkas[]>([]);
  const [penawaranId, setPenawaranId] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const [isi, setIsi] = useState({
    tanggal_terbit: new Date().toISOString().slice(0, 10),
    lingkup_kerja: "",
    nilai_kontrak: "",
    tanggal_mulai: "",
    tanggal_selesai: "",
    denda_per_hari: "",
    denda_maks_pct: "",
    syarat_khusus: "",
  });
  const ubahIsi = (k: keyof typeof isi, v: string) => setIsi((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => {
      void api.get<{ tender: TenderRingkas[] }>("/api/v1/tender-subkon", { signal: ac.signal })
        .then((r) => setTender(r.data.tender ?? []))
        .catch((e) => {
          if ((e as { code?: string })?.code === "ERR_CANCELED") return;
          // Gagal memuat tender TIDAK melumpuhkan form: SPK tanpa tender sah.
          setGalat("Daftar tender gagal dimuat. SPK tanpa rujukan tender tetap bisa diterbitkan.");
        });
    });
    return () => ac.abort();
  }, []);

  // Detail tender: penawarannya, dan `work_scope_id` yang tak ikut di daftar.
  useEffect(() => {
    if (!tenderId) { setPenawaran([]); setPenawaranId(""); return; }
    const ac = makeAbortController();
    queueMicrotask(() => {
      void api.get<{
        tender: { work_scope_id: string | null; lingkup_kerja: string | null };
        penawaran: PenawaranRingkas[];
      }>(`/api/v1/tender-subkon/${tenderId}`, { signal: ac.signal })
        .then((r) => {
          const daftar = r.data.penawaran ?? [];
          setPenawaran(daftar);
          if (r.data.tender?.work_scope_id) setScopeId(r.data.tender.work_scope_id);
          const lk = r.data.tender?.lingkup_kerja;
          if (lk) setIsi((x) => (x.lingkup_kerja ? x : { ...x, lingkup_kerja: lk }));
          // Pemenang terpilih otomatis — ia satu-satunya yang masuk akal jadi
          // dasar SPK. Yang lain tetap bisa dipilih: tender bisa dimenangkan
          // ulang, dan memaksa pengguna kembali ke layar tender untuk itu
          // membuat form ini buntu.
          const menang = daftar.find((p) => p.status === "menang");
          if (menang) {
            setPenawaranId(menang.id);
            setIsi((x) => (x.nilai_kontrak ? x : { ...x, nilai_kontrak: String(menang.nilai_penawaran) }));
          }
        })
        .catch((e) => {
          if ((e as { code?: string })?.code === "ERR_CANCELED") return;
          setGalat("Penawaran tender ini gagal dimuat.");
        });
    });
    return () => ac.abort();
  }, [tenderId]);

  // `scopeId` datang dari tender. Tanpa tender ia kosong — dan tanpa lingkup
  // kerja, rute menolak dengan 400. Tombolnya dimatikan lebih dulu supaya
  // penolakannya tak jadi kejutan sesudah semua kolom diisi.
  const bolehKirim = scopeId !== "" && isi.lingkup_kerja.trim() !== ""
    && isi.nilai_kontrak.trim() !== "" && isi.tanggal_mulai !== "" && isi.tanggal_selesai !== "";

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      // Nominal kosong dikirim `null`, BUKAN 0: `Number('') === 0`, dan
      // "belum diputuskan" yang berubah jadi "tak ada denda" adalah keputusan
      // yang tak pernah diambil siapa pun.
      const angka = (v: string) => (v.trim() === "" ? null : Number(v));
      const r = await api.post<{ spk: { nomor: string }; peringatan?: string }>("/api/v1/spk", {
        work_scope_id: scopeId,
        tender_id: tenderId || null,
        penawaran_id: tenderId ? (penawaranId || null) : null,
        tanggal_terbit: isi.tanggal_terbit,
        lingkup_kerja: isi.lingkup_kerja.trim(),
        nilai_kontrak: Number(isi.nilai_kontrak),
        tanggal_mulai: isi.tanggal_mulai,
        tanggal_selesai: isi.tanggal_selesai,
        denda_per_hari: angka(isi.denda_per_hari),
        denda_maks_pct: angka(isi.denda_maks_pct),
        syarat_khusus: isi.syarat_khusus.trim() || null,
      });
      const p = r.data.peringatan;
      onSelesai(
        `${r.data.spk.nomor} tersimpan sebagai draf.`
        + (p ? ` ${p}` : " Terbitkan setelah isinya dicek — sesudah ditandatangani, nilainya terkunci."),
      );
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menerbitkan SPK.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul="Terbitkan Surat Perintah Kerja"
      keterangan="Pilih tender yang sudah selesai — nilai dan lingkupnya terisi dari penawaran pemenang. SPK tersimpan sebagai draf lebih dulu, belum mengikat siapa pun."
      lebar={640}
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
            type="button" onClick={() => void kirim()} disabled={sibuk || !bolehKirim}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || !bolehKirim ? "not-allowed" : "pointer",
              opacity: sibuk || !bolehKirim ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menyimpan…" : "Simpan sebagai draf"}
          </button>
        </>
      }
    >
      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "8px 12px", borderRadius: 6,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          color: "var(--danger)", fontSize: 12.5, lineHeight: 1.5,
        }}>
          {galat}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="spk-tender">Tender asal</Label>
        <select
          id="spk-tender" value={tenderId} onChange={(e) => setTenderId(e.target.value)}
          style={GAYA_ISIAN}
        >
          <option value="">Tanpa tender (penunjukan langsung)</option>
          {tender.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nomor} — {t.judul}{t.proyek?.name ? ` · ${t.proyek.name}` : ""}
            </option>
          ))}
        </select>
        {tenderId === "" && (
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
            Tanpa tender, lingkup kerjanya belum ditentukan — pilih tender yang
            terhubung ke lingkup kerja, atau terbitkan SPK dari halaman lingkup kerja.
          </div>
        )}
      </div>

      {tenderId !== "" && (
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor="spk-penawaran">Penawaran yang dipakai</Label>
          <select
            id="spk-penawaran" value={penawaranId}
            onChange={(e) => {
              setPenawaranId(e.target.value);
              const p = penawaran.find((x) => x.id === e.target.value);
              if (p) ubahIsi("nilai_kontrak", String(p.nilai_penawaran));
            }}
            style={GAYA_ISIAN}
          >
            <option value="">Tanpa merujuk penawaran</option>
            {penawaran.filter((p) => !p.tidak_menawar).map((p) => (
              <option key={p.id} value={p.id}>
                {p.workers?.name ?? "Tanpa nama"} · {rupiah(p.nilai_penawaran)}
                {p.status === "menang" ? " · PEMENANG" : ""}
              </option>
            ))}
          </select>
          {penawaran.length === 0 && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
              Tender ini belum punya penawaran. SPK tetap bisa dibuat tanpa merujuk penawaran.
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="spk-lingkup" wajib>Lingkup kerja</Label>
        <textarea
          id="spk-lingkup" rows={2} value={isi.lingkup_kerja}
          onChange={(e) => ubahIsi("lingkup_kerja", e.target.value)}
          placeholder="cth: Pekerjaan struktur beton lantai 2 — kolom, balok, pelat"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 14, marginBottom: 14,
      }}>
        <div>
          <Label htmlFor="spk-nilai" wajib>Nilai kontrak (Rp)</Label>
          <input
            id="spk-nilai" type="number" inputMode="numeric" min={1} value={isi.nilai_kontrak}
            onChange={(e) => ubahIsi("nilai_kontrak", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="spk-terbit" wajib>Tanggal terbit</Label>
          <input
            id="spk-terbit" type="date" value={isi.tanggal_terbit}
            onChange={(e) => ubahIsi("tanggal_terbit", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="spk-mulai" wajib>Mulai kerja</Label>
          <input
            id="spk-mulai" type="date" value={isi.tanggal_mulai}
            onChange={(e) => ubahIsi("tanggal_mulai", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        <div>
          <Label htmlFor="spk-selesai" wajib>Selesai kerja</Label>
          <input
            id="spk-selesai" type="date" value={isi.tanggal_selesai}
            min={isi.tanggal_mulai || undefined}
            onChange={(e) => ubahIsi("tanggal_selesai", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
      </div>

      <div style={{
        padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
        background: "var(--surface-subtle)", marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Sanksi keterlambatan
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          <div>
            <Label htmlFor="spk-denda">Denda per hari (Rp)</Label>
            <input
              id="spk-denda" type="number" inputMode="numeric" min={0} value={isi.denda_per_hari}
              onChange={(e) => ubahIsi("denda_per_hari", e.target.value)}
              style={GAYA_ISIAN}
            />
          </div>
          <div>
            <Label htmlFor="spk-maks">Batas maksimum (% nilai)</Label>
            <input
              id="spk-maks" type="number" inputMode="decimal" min={0} max={100}
              value={isi.denda_maks_pct}
              onChange={(e) => ubahIsi("denda_maks_pct", e.target.value)}
              // Batas tanpa tarif harian adalah aturan yang tak bisa dihitung,
              // dan rutenya menolaknya. Dimatikan di sini supaya penolakannya
              // tak datang sesudah semuanya diisi.
              disabled={isi.denda_per_hari.trim() === ""}
              style={{ ...GAYA_ISIAN, opacity: isi.denda_per_hari.trim() === "" ? 0.5 : 1 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          Batas dihitung dari <strong>nilai kontrak</strong>, bukan dari denda yang
          menumpuk — itulah yang membuat batas 5% tetap berarti saat keterlambatannya
          panjang. Kosongkan keduanya bila belum diputuskan.
        </div>
      </div>

      <div>
        <Label htmlFor="spk-syarat">Syarat khusus</Label>
        <textarea
          id="spk-syarat" rows={2} value={isi.syarat_khusus}
          onChange={(e) => ubahIsi("syarat_khusus", e.target.value)}
          placeholder="cth: Material disediakan kontraktor; pembayaran per progres 25%"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>
    </DialogBersama>
  );
}
