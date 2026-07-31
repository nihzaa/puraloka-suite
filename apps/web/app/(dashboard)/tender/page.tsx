"use client";

/**
 * REGISTER TENDER — halaman pra-konstruksi (ROADMAP #22).
 *
 * ── Yang dijawab halaman ini
 *
 * 1. **Kenapa tender kalah?** Kolom "selisih vs pemenang" membuat "kalah karena
 *    harga" bisa dibedakan dari "kalah karena syarat". Yang paling berguna
 *    justru angka NEGATIF: kalau kita lebih murah dan tetap kalah, menurunkan
 *    harga di tender berikutnya membuang margin tanpa menambah peluang.
 * 2. **Berapa backlog saat memutuskan ambil kerja?** Nilai yang sudah
 *    dimenangkan tapi belum selesai — beban kapasitas yang paling sering
 *    terlupa.
 *
 * ── Kenapa tabel, bukan kanban
 *
 * Kanban mengundang pemakaian sebagai pipeline CRM, dan CRM penuh sengaja
 * dicoret (PETA §"Sengaja tidak dibangun"). Tabel juga jauh lebih baik untuk
 * membandingkan angka antar-baris — dan membandingkan angka justru inti
 * halaman ini.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Trophy, XCircle, Clock, Wallet, AlertTriangle } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

const C = {
  navy: "var(--navy)", text: "var(--text-primary)", mid: "var(--text-secondary)",
  muted: "var(--text-muted)", border: "var(--border)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)", yellowBorder: "var(--warning-border)",
  blue: "var(--info)", blueBg: "var(--info-bg)", blueBorder: "var(--info-border)",
};

type Status = "prospek" | "go" | "no_go" | "diajukan" | "menang" | "kalah" | "batal";

interface Bid {
  id: string; bid_number: string | null; title: string;
  owner_name: string | null; location: string | null;
  bid_value: number | null; winner_value: number | null;
  submitted_at: string | null; decided_at: string | null;
  status: Status; decision_note: string | null; project_id: string | null;
}

interface Meta {
  backlogNilai: number; backlogJumlah: number;
  pipelineNilai: number; pipelineJumlah: number;
  menang: number; kalah: number;
  winRatePct: number | null;
  selisihHargaRataPct: number | null;
  kalahDenganPembanding: number;
}

const STATUS_LABEL: Record<Status, { teks: string; warna: string; bg: string; border: string }> = {
  prospek:  { teks: "Prospek",  warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
  go:       { teks: "Go",       warna: C.blue,   bg: C.blueBg,   border: C.blueBorder },
  no_go:    { teks: "No-Go",    warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
  diajukan: { teks: "Diajukan", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  menang:   { teks: "Menang",   warna: C.green,  bg: C.greenBg,  border: C.greenBorder },
  kalah:    { teks: "Kalah",    warna: C.red,    bg: C.redBg,    border: C.redBorder },
  batal:    { teks: "Batal",    warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
};

const fmtRp = (n: number | null) =>
  n == null ? "—"
  : n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export default function TenderPage() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState<string>("");
  const [formBuka, setFormBuka] = useState(false);

  const muat = useCallback((signal?: AbortSignal) => {
    const url = saring ? `/api/v1/bids?status=${saring}` : "/api/v1/bids";
    return api.get<{ data: Bid[]; meta: Meta }>(url, { signal })
      .then(({ data }) => { setBids(data.data ?? []); setMeta(data.meta); setGalat(null); })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat register tender"); })
      .finally(() => setMemuat(false));
  }, [saring]);

  useEffect(() => {
    const ac = makeAbortController();
    muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
            Register Tender
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.mid }}>
            Tender yang diikuti, alasan menang/kalah, dan backlog yang sudah dimenangkan.
          </p>
        </div>
        <button
          onClick={() => setFormBuka((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px",
            borderRadius: 9, border: "none", background: C.navy, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={15} aria-hidden="true" /> Tender baru
        </button>
      </header>

      {formBuka && <FormTender onSelesai={() => { setFormBuka(false); muat(); }} />}

      {meta && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Kartu Icon={Wallet} label="Backlog" nilai={fmtRp(meta.backlogNilai)}
            sub={`${meta.backlogJumlah} tender dimenangkan, belum selesai`}
            warna={C.green} bg={C.greenBg} border={C.greenBorder} />
          <Kartu Icon={Clock} label="Pipeline" nilai={fmtRp(meta.pipelineNilai)}
            sub={`${meta.pipelineJumlah} menunggu keputusan`}
            warna={C.blue} bg={C.blueBg} border={C.blueBorder} />
          <Kartu Icon={Trophy} label="Win rate"
            nilai={meta.winRatePct == null ? "—" : `${meta.winRatePct}%`}
            sub={meta.winRatePct == null
              // "belum pernah ikut" ≠ "selalu kalah" — 0% akan terbaca sebagai
              // yang kedua, jadi keadaan ini dinyatakan dengan kalimat.
              ? "belum ada tender yang diputuskan"
              : `${meta.menang} menang · ${meta.kalah} kalah`}
            warna={C.navy} bg="var(--navy-light)" border={C.border} />
          <Kartu Icon={XCircle} label="Selisih vs pemenang"
            nilai={meta.selisihHargaRataPct == null ? "—" : `${meta.selisihHargaRataPct > 0 ? "+" : ""}${meta.selisihHargaRataPct}%`}
            sub={meta.selisihHargaRataPct == null
              ? "nilai pemenang belum pernah diisi"
              : meta.selisihHargaRataPct > 0
                ? `rata-rata kita lebih mahal (${meta.kalahDenganPembanding} tender)`
                : `kita lebih murah tapi tetap kalah — bukan soal harga`}
            warna={meta.selisihHargaRataPct != null && meta.selisihHargaRataPct > 0 ? C.red : C.mid}
            bg={meta.selisihHargaRataPct != null && meta.selisihHargaRataPct > 0 ? C.redBg : "var(--surface-subtle)"}
            border={meta.selisihHargaRataPct != null && meta.selisihHargaRataPct > 0 ? C.redBorder : C.border} />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="saring-status" style={{ fontSize: 12, color: C.mid, marginRight: 8 }}>Status</label>
        <select id="saring-status" value={saring} onChange={(e) => { setMemuat(true); setSaring(e.target.value); }}
          style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13 }}>
          <option value="">Semua</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s].teks}</option>
          ))}
        </select>
      </div>

      {memuat && <div style={{ padding: 24, color: C.mid, fontSize: 13 }}>Memuat…</div>}
      {galat && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 16, fontSize: 13, color: C.red }}>
          <AlertTriangle size={15} aria-hidden="true" /> {galat}
        </div>
      )}

      {!memuat && !galat && bids.length === 0 && (
        <div style={{ padding: "28px 20px", textAlign: "center", borderRadius: 12, border: `1px dashed ${C.border}`, color: C.mid, fontSize: 13 }}>
          Belum ada tender tercatat. Mulai dengan mencatat tender yang sedang diikuti —
          termasuk yang akhirnya kalah, karena justru itu yang paling berguna dipelajari.
        </div>
      )}

      {!memuat && bids.length > 0 && (
        <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)" }}>
                {["Tender", "Pemberi kerja", "Nilai kami", "Nilai pemenang", "Selisih", "Diajukan", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: h.startsWith("Nilai") || h === "Selisih" ? "right" : "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bids.map((b) => {
                const s = STATUS_LABEL[b.status];
                const selisih = b.bid_value && b.winner_value
                  ? ((b.bid_value - b.winner_value) / b.winner_value) * 100 : null;
                return (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{b.title}</div>
                      {b.bid_number && <div style={{ fontSize: 11, color: C.muted, fontFamily: "ui-monospace, monospace" }}>{b.bid_number}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.mid }}>{b.owner_name ?? "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtRp(b.bid_value)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.mid }}>{fmtRp(b.winner_value)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: selisih == null ? C.muted : selisih > 0 ? C.red : C.green, fontWeight: selisih == null ? 400 : 600 }}>
                      {selisih == null ? "—" : `${selisih > 0 ? "+" : ""}${selisih.toFixed(1)}%`}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.mid, whiteSpace: "nowrap" }}>{fmtTgl(b.submitted_at)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {/* Status ditulis, bukan diwakili warna saja — WCAG 1.4.1. */}
                      <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.warna, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
                        {s.teks}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kartu({ Icon, label, nilai, sub, warna, bg, border }: {
  Icon: typeof Wallet; label: string; nilai: string; sub: string;
  warna: string; bg: string; border: string;
}) {
  return (
    <div style={{ padding: "13px 16px", borderRadius: 12, background: bg, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <Icon size={13} aria-hidden="true" /> {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: warna, fontFamily: "var(--font-display, inherit)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{nilai}</div>
      <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function FormTender({ onSelesai }: { onSelesai: () => void }) {
  const [judul, setJudul] = useState("");
  const [nomor, setNomor] = useState("");
  const [pemberi, setPemberi] = useState("");
  const [nilai, setNilai] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!judul.trim()) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/bids", {
        title: judul.trim(),
        bid_number: nomor.trim() || undefined,
        owner_name: pemberi.trim() || undefined,
        bid_value: nilai ? Number(nilai) : undefined,
      });
      onSelesai();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setGalat(e2.response?.data?.error ?? "Gagal menyimpan tender");
    } finally { setKirim(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${C.border}`, background: C.surface, color: C.text,
    fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: C.mid, marginBottom: 4 };

  return (
    <form onSubmit={simpan} style={{ padding: 18, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <div>
          <label htmlFor="t-judul" style={lbl}>Judul tender *</label>
          <input id="t-judul" value={judul} onChange={(e) => setJudul(e.target.value)} required style={inp} />
        </div>
        <div>
          <label htmlFor="t-nomor" style={lbl}>Nomor tender</label>
          <input id="t-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)} style={inp}
            placeholder="dari penyelenggara" />
        </div>
        <div>
          <label htmlFor="t-pemberi" style={lbl}>Pemberi kerja</label>
          <input id="t-pemberi" value={pemberi} onChange={(e) => setPemberi(e.target.value)} style={inp} />
        </div>
        <div>
          <label htmlFor="t-nilai" style={lbl}>Nilai penawaran (Rp)</label>
          <input id="t-nilai" type="number" min="0" value={nilai} onChange={(e) => setNilai(e.target.value)} style={inp} />
        </div>
      </div>
      {galat && <div style={{ marginTop: 10, fontSize: 12.5, color: C.red }}>{galat}</div>}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={kirim || !judul.trim()} style={{
          padding: "9px 18px", borderRadius: 9, border: "none",
          background: kirim || !judul.trim() ? C.muted : C.navy, color: "#fff",
          fontSize: 13, fontWeight: 600, cursor: kirim || !judul.trim() ? "not-allowed" : "pointer",
        }}>
          {kirim ? "Menyimpan…" : "Simpan tender"}
        </button>
      </div>
    </form>
  );
}
