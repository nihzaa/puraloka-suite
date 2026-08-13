"use client";

/**
 * OPNAME BERSAMA — berita acara pengukuran yang mengunci pembayaran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 044 (2024) menambahkan `progress_payments.requires_opname` dengan
 * DEFAULT true dan `opname_report_id` di sebelahnya. Tabel yang ditunjuknya
 * TAK PERNAH TERBENTUK (ledger-diff: TERCATAT-TAPI-ARTEFAK-HILANG), dan kedua
 * kolom itu tak pernah dibaca satu baris kode pun.
 *
 * Diukur 2026-08-12: 17 dari 20 lingkup kerja wajib opname, 5 dari 5
 * pembayaran bertanda wajib, NOL punya berita acara. Gerbang yang dijanjikan
 * schema selama dua tahun, tak pernah menjaga apa pun — pembayaran ke mandor
 * lolos tanpa ada yang mengukur apa yang sudah terpasang.
 *
 * ── Yang menentukan rancangannya
 *
 * 1. STATUS paling menonjol. Pertanyaan pembacanya selalu "mana yang menunggu
 *    verifikasi saya" — bukan "berapa banyak opname bulan ini". Karena itu
 *    dikelompokkan per status, yang menunggu di atas.
 *
 * 2. DUA PIHAK terlihat di tiap kartu. Yang membuat berita acara ini bernilai
 *    adalah pengukur dan penyetuju yang BERBEDA; menyembunyikan salah satunya
 *    membuat pemisahan itu tak terlihat sebagai fitur.
 *
 * 3. SENGKETA bukan kegagalan. Ia jalan keluar yang sah saat angka tak
 *    disepakati, jadi tombolnya sejajar dengan Setujui — bukan disembunyikan
 *    di menu tambahan.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ClipboardCheck, RefreshCw, Check, X, AlertTriangle, Ruler, Lock,
} from "lucide-react";
import { api, hasPermission, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { KepalaHalaman } from "@/components/dasar";

interface ItemOpname {
  id: string;
  uraian: string;
  satuan: string;
  volume_rencana: number | string | null;
  volume_terukur: number | string;
  pct_selesai: number | string;
  catatan: string | null;
  urutan: number;
}

interface Opname {
  id: string;
  nomor: string;
  tanggal_opname: string;
  status: "diajukan" | "diverifikasi" | "disengketakan";
  catatan: string | null;
  alasan_sengketa: string | null;
  foto_url: string[];
  project_id: string;
  work_scope_id: string;
  diukur_oleh: string;
  diverifikasi_oleh: string | null;
  diverifikasi_pada: string | null;
  pengukur: { id: string; name: string } | null;
  penyetuju: { id: string; name: string } | null;
  opname_bersama_item: ItemOpname[];
  /** Dihitung server: rata-rata tertimbang, bukan disimpan. */
  pct_selesai: number | null;
  dasar_pct: "nilai" | "volume" | "rata";
}

const META_STATUS: Record<Opname["status"], { label: string; warna: string; bg: string; border: string }> = {
  diajukan:      { label: "Menunggu verifikasi", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  diverifikasi:  { label: "Terverifikasi",       warna: "var(--success)",      bg: "var(--success-bg)", border: "var(--success-border)" },
  disengketakan: { label: "Disengketakan",       warna: "var(--danger)",       bg: "var(--danger-bg)",  border: "var(--danger-border)" },
};

const DASAR_ARTI: Record<Opname["dasar_pct"], string> = {
  nilai: "ditimbang nilai (volume × harga)",
  volume: "ditimbang volume",
  rata: "rata-rata polos — item belum bervolume",
};

const angka = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("id-ID");

const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

export default function OpnamePage() {
  const [data, setData] = useState<Opname[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [sengketaId, setSengketaId] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [putaran, setPutaran] = useState(0);

  const bolehVerifikasi = useSyncExternalStore(
    langganan, () => hasPermission("opname:verifikasi"), () => false);

  const muat = useCallback((signal: AbortSignal) => {
    setMemuat(true);
    setGalat("");
    return api.get<{ opname: Opname[] }>("/api/v1/opname", { signal })
      .then((r) => setData(r.data.opname ?? []))
      .catch((e) => {
        if ((e as { code?: string })?.code === "ERR_CANCELED") return;
        setGalat(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Gagal memuat berita acara opname.",
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

  async function putuskan(id: string, setujui: boolean, alasanSengketa?: string) {
    setSibuk(id);
    setPesan(null);
    try {
      const { data: hasil } = await api.patch<{ opname: { nomor: string; status: string } }>(
        `/api/v1/opname/${id}/verifikasi`,
        setujui ? { setujui: true } : { setujui: false, alasan: alasanSengketa },
      );
      setPesan({
        jenis: "ok",
        teks: setujui
          ? `${hasil.opname.nomor} diverifikasi — pembayaran sampai persen ini kini terbuka.`
          : `${hasil.opname.nomor} disengketakan. Pembayaran tertahan sampai sengketanya selesai.`,
      });
      setSengketaId(null);
      setAlasan("");
      setPutaran((x) => x + 1);
    } catch (e) {
      // Pesan server ditampilkan apa adanya — ia sudah ditulis untuk manusia
      // ("Anda yang mengukur berita acara ini…"), dan menggantinya dengan
      // "gagal" membuang satu-satunya petunjuk yang bisa ditindaklanjuti.
      setPesan({
        jenis: "galat",
        teks: (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal memproses berita acara.",
      });
    } finally {
      setSibuk(null);
    }
  }

  // Yang MENUNGGU di atas — itu pertanyaan pembacanya.
  const urut = useMemo(() => {
    const bobot: Record<Opname["status"], number> = { diajukan: 0, disengketakan: 1, diverifikasi: 2 };
    return [...data].sort((a, b) =>
      bobot[a.status] - bobot[b.status] || b.tanggal_opname.localeCompare(a.tanggal_opname));
  }, [data]);

  const menunggu = data.filter((o) => o.status === "diajukan").length;

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Opname Bersama"
          keterangan="Berita acara pengukuran volume terpasang. Pembayaran borongan dan progres tak bisa dirilis sebelum ada yang terverifikasi."
          ikon={<ClipboardCheck size={19} />}
        />
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

      {menunggu > 0 && (
        <div style={{
          marginBottom: "var(--gap-bagian)", padding: "10px 14px", borderRadius: 8,
          background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
          color: "var(--warning-teks)", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={15} aria-hidden="true" />
          <span>
            <strong>{menunggu}</strong> berita acara menunggu verifikasi.
            Pembayaran untuk lingkup kerjanya tertahan sampai diputuskan.
          </span>
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat berita acara…
        </div>
      ) : urut.length === 0 ? (
        <Kosong
          ikon={<Ruler size={28} />}
          judul="Belum ada berita acara opname"
          sebab={
            <>
              Opname adalah pengukuran volume terpasang yang disaksikan dua pihak:
              pelaksana yang mengukur, dan penyetuju yang memverifikasi. Selama belum
              ada yang terverifikasi, pembayaran borongan dan progres untuk lingkup
              kerja itu <strong>tertahan</strong> — dan itu memang gunanya.
            </>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {urut.map((o) => (
            <KartuOpname
              key={o.id}
              opname={o}
              bolehVerifikasi={bolehVerifikasi}
              sibuk={sibuk === o.id}
              onSetujui={() => void putuskan(o.id, true)}
              onSengketa={() => { setSengketaId(o.id); setAlasan(""); }}
            />
          ))}
        </div>
      )}

      {sengketaId && (
        <ModalSengketa
          nomor={data.find((o) => o.id === sengketaId)?.nomor ?? ""}
          alasan={alasan}
          setAlasan={setAlasan}
          sibuk={sibuk === sengketaId}
          onBatal={() => { setSengketaId(null); setAlasan(""); }}
          onKirim={() => void putuskan(sengketaId, false, alasan)}
        />
      )}
    </div>
  );
}

function KartuOpname({ opname: o, bolehVerifikasi, sibuk, onSetujui, onSengketa }: {
  opname: Opname;
  bolehVerifikasi: boolean;
  sibuk: boolean;
  onSetujui: () => void;
  onSengketa: () => void;
}) {
  const m = META_STATUS[o.status];
  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden", borderColor: m.border }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        background: m.bg, display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {o.nomor}
            <span style={{
              marginInlineStart: 10, fontSize: 11.5, fontWeight: 700,
              color: m.warna, textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {m.label}
            </span>
          </h3>
          <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
            Diukur {o.tanggal_opname} oleh <strong>{o.pengukur?.name ?? "—"}</strong>
            {/* Penyetuju ditampilkan meski null: kolom yang kosong justru
                menjelaskan kenapa pembayarannya masih tertahan. */}
            {o.penyetuju
              ? <> · diverifikasi <strong>{o.penyetuju.name}</strong></>
              : o.status === "diajukan" ? <> · menunggu pihak kedua</> : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 26, fontWeight: 700, color: m.warna,
            fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
          }}>
            {o.pct_selesai === null ? "—" : `${o.pct_selesai}%`}
          </div>
          {/* Dasar perhitungan disebutkan: rata-rata polos dan tertimbang
              nilai bisa berbeda jauh, dan pembacanya berhak tahu yang mana. */}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{DASAR_ARTI[o.dasar_pct]}</div>
        </div>
      </div>

      {o.alasan_sengketa && (
        <div style={{
          padding: "10px var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
          background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, lineHeight: 1.55,
        }}>
          <strong>Alasan sengketa:</strong> {o.alasan_sengketa}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 90px 110px 110px 80px", gap: 12,
        padding: "10px var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        <div>Uraian</div><div>Satuan</div>
        <div style={{ textAlign: "right" }}>Rencana</div>
        <div style={{ textAlign: "right" }}>Terukur</div>
        <div style={{ textAlign: "right" }}>Selesai</div>
      </div>

      {[...o.opname_bersama_item].sort((a, b) => a.urutan - b.urutan).map((it, i, arr) => (
        <div key={it.id} style={{
          display: "grid", gridTemplateColumns: "1fr 90px 110px 110px 80px", gap: 12,
          padding: "10px var(--pad-kartu-lega)", alignItems: "center", fontSize: 13,
          borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{ color: C.text }}>
            {it.uraian}
            {it.catatan && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{it.catatan}</div>}
          </div>
          <div style={{ color: C.mid }}>{it.satuan}</div>
          <div style={{ textAlign: "right", color: C.mid, fontVariantNumeric: "tabular-nums" }}>
            {angka(it.volume_rencana)}
          </div>
          <div style={{ textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {angka(it.volume_terukur)}
          </div>
          <div style={{ textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {angka(it.pct_selesai)}%
          </div>
        </div>
      ))}

      {o.status === "diajukan" && (
        <div style={{
          padding: "12px var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center",
        }}>
          {!bolehVerifikasi ? (
            <span style={{ fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Lock size={12} aria-hidden="true" />
              Verifikasi butuh izin tersendiri — yang mengukur bukan yang menyetujui.
            </span>
          ) : (
            <>
              {/* Sengketa SEJAJAR dengan Setujui: ia jalan keluar yang sah,
                  bukan kegagalan yang perlu disembunyikan. */}
              <button
                type="button" onClick={onSengketa} disabled={sibuk}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "1px solid var(--danger-border)", background: "var(--surface)",
                  color: "var(--danger)", cursor: sibuk ? "wait" : "pointer",
                }}
              >
                <X size={14} aria-hidden="true" /> Sengketakan
              </button>
              <button
                type="button" onClick={onSetujui} disabled={sibuk}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "none", background: C.navy, color: "var(--on-aksen)",
                  cursor: sibuk ? "wait" : "pointer", opacity: sibuk ? 0.6 : 1,
                }}
              >
                <Check size={14} aria-hidden="true" /> {sibuk ? "Memproses…" : "Verifikasi"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModalSengketa({ nomor, alasan, setAlasan, sibuk, onBatal, onKirim }: {
  nomor: string; alasan: string; setAlasan: (v: string) => void;
  sibuk: boolean; onBatal: () => void; onKirim: () => void;
}) {
  // `DialogBersama`, bukan div bertumpuk sendiri.
  //
  // `<dialog>` bawaan memberi tiga hal yang paling sering salah kalau ditulis
  // tangan, dan salahnya tak terlihat sampai seseorang memakai keyboard:
  // fokus terkunci di dalam dialog, lapisan teratas tanpa perang z-index, dan
  // Esc yang menutup. Penjaga `audit-modal-dialog` menabrak versi pertama
  // komponen ini karena memakai overlay tangan.
  return (
    <DialogBersama
      terbuka
      onTutup={onBatal}
      judul={`Sengketakan ${nomor}`}
      keterangan="Pembayaran untuk lingkup kerja ini akan tertahan sampai sengketanya selesai. Tuliskan apa yang tak disepakati supaya pelaksana tahu persis apa yang harus diukur ulang."
      lebar={470}
      kaki={
        <>
          <button
            type="button" onClick={onBatal}
            style={{
              padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button" onClick={onKirim} disabled={sibuk || alasan.trim() === ""}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--danger)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || alasan.trim() === "" ? "not-allowed" : "pointer",
              opacity: sibuk || alasan.trim() === "" ? 0.5 : 1,
            }}
          >
            {sibuk ? "Memproses…" : "Sengketakan"}
          </button>
        </>
      }
    >
      <label htmlFor="alasan-sengketa" style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
        Alasan (wajib)
      </label>
      <textarea
        id="alasan-sengketa" value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={4}
        placeholder="cth: Volume pasangan bata di as-3 tercatat 40 m² tetapi hasil ukur ulang 32 m²"
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 6,
          border: `1px solid ${C.border}`, fontSize: 13, resize: "vertical",
          boxSizing: "border-box", background: "var(--surface)", color: C.text,
          fontFamily: "inherit",
        }}
      />
    </DialogBersama>
  );
}
