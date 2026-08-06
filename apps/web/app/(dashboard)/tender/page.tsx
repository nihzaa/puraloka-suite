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
import { Tabel } from "@/components/dasar";

import { C } from "@/lib/warna-ui";

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

/**
 * Selisih harga kami terhadap pemenang, dalam persen.
 *
 * Sengaja memakai uji KEBENARAN (`&&`), bukan `!= null`: nilai pemenang 0
 * berarti "belum diisi dengan benar", dan membaginya menghasilkan Infinity —
 * yang akan tampil sebagai "+Infinity%" dan terbaca seolah kita menawar tak
 * terhingga lebih mahal. Perilaku ini dibawa apa adanya dari versi tabel
 * mentahnya, di mana perhitungan ini menempel di dalam perulangan baris.
 */
const selisihPersen = (b: Bid): number | null =>
  b.bid_value && b.winner_value
    ? ((b.bid_value - b.winner_value) / b.winner_value) * 100
    : null;

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
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 10, border: "none", background: C.navy, color: C.onNavy,
            fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={15} aria-hidden="true" /> Tender baru
        </button>
      </header>

      {formBuka && <FormTender onSelesai={() => { setFormBuka(false); muat(); }} />}

      {meta && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
          {/* Warna DITURUNKAN dari angkanya, tidak dipaku hijau.
              Backlog nol bukan kabar baik untuk kontraktor — itu berarti
              tak ada pekerjaan di tangan setelah proyek berjalan selesai.
              Menampilkannya hijau membacanya sebagai "sehat", padahal ia
              justru keadaan yang paling perlu ditindaklanjuti.
              Pola yang sama sudah diperbaiki di /kas (saldo minus) dan
              /keuangan/profitabilitas (margin 100%). */}
          <Kartu Icon={Wallet} label="Backlog" nilai={fmtRp(meta.backlogNilai)}
            sub={meta.backlogJumlah > 0
              ? `${meta.backlogJumlah} tender dimenangkan, belum selesai`
              : "belum ada pekerjaan di tangan"}
            warna={meta.backlogJumlah > 0 ? C.green : C.mid}
            bg={meta.backlogJumlah > 0 ? C.greenBg : "var(--surface-subtle)"}
            border={meta.backlogJumlah > 0 ? C.greenBorder : C.border} />
          <Kartu Icon={Clock} label="Pipeline" nilai={fmtRp(meta.pipelineNilai)}
            sub={meta.pipelineJumlah > 0
              ? `${meta.pipelineJumlah} menunggu keputusan`
              : "tak ada tender yang sedang diikuti"}
            warna={meta.pipelineJumlah > 0 ? C.blue : C.mid}
            bg={meta.pipelineJumlah > 0 ? C.blueBg : "var(--surface-subtle)"}
            border={meta.pipelineJumlah > 0 ? C.blueBorder : C.border} />
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
          style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13 }}>
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
        <div style={{ padding: "28px 20px", textAlign: "center", borderRadius: 10, border: `1px dashed ${C.border}`, color: C.mid, fontSize: 13 }}>
          Belum ada tender tercatat. Mulai dengan mencatat tender yang sedang diikuti —
          termasuk yang akhirnya kalah, karena justru itu yang paling berguna dipelajari.
        </div>
      )}

      {!memuat && bids.length > 0 && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4) — caption sr-only,
              kolom pertama <th scope="row">, tabular-nums, dan pembungkus
              overflow-x kini dijamin komponen, bukan diingat per halaman.
              Yang paling penting di sini justru tabular-nums: seluruh alasan
              halaman ini berbentuk tabel adalah MEMBANDINGKAN angka antar-baris
              (lihat catatan kepala berkas), dan itu runtuh begitu digit "1"
              lebih sempit daripada "8". */}
          <Tabel<Bid>
            caption="Daftar tender: nama, pemberi kerja, nilai penawaran kami, nilai pemenang, selisih, tanggal diajukan, dan status."
            data={bids}
            kunciBaris={(b) => b.id}
            kolom={[
              {
                kunci: "tender", judul: "Tender", kepalaBaris: true,
                render: (b) => (
                  <>
                    <div style={{ fontWeight: 600, color: C.text }}>{b.title}</div>
                    {b.bid_number && <div style={{ fontSize: 11, color: C.muted, fontFamily: "ui-monospace, monospace" }}>{b.bid_number}</div>}
                  </>
                ),
              },
              {
                kunci: "pemberi", judul: "Pemberi kerja",
                render: (b) => <span style={{ color: C.mid }}>{b.owner_name ?? "—"}</span>,
              },
              {
                kunci: "nilai_kami", judul: "Nilai kami", rata: "kanan",
                render: (b) => fmtRp(b.bid_value),
              },
              {
                kunci: "nilai_pemenang", judul: "Nilai pemenang", rata: "kanan",
                render: (b) => <span style={{ color: C.mid }}>{fmtRp(b.winner_value)}</span>,
              },
              {
                kunci: "selisih", judul: "Selisih", rata: "kanan",
                render: (b) => {
                  const selisih = selisihPersen(b);
                  return (
                    <span style={{
                      color: selisih == null ? C.muted : selisih > 0 ? C.red : C.green,
                      fontWeight: selisih == null ? 400 : 600,
                    }}>
                      {selisih == null ? "—" : `${selisih > 0 ? "+" : ""}${selisih.toFixed(1)}%`}
                    </span>
                  );
                },
              },
              {
                kunci: "diajukan", judul: "Diajukan",
                render: (b) => <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{fmtTgl(b.submitted_at)}</span>,
              },
              {
                kunci: "status", judul: "Status",
                // Status ditulis, bukan diwakili warna saja — WCAG 1.4.1.
                render: (b) => {
                  const s = STATUS_LABEL[b.status];
                  return (
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.warna, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
                      {s.teks}
                    </span>
                  );
                },
              },
            ]}
          />
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
    <div style={{ padding: "12px 16px", borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
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
    width: "100%", padding: "8px 8px", borderRadius: 6,
    border: `1px solid ${C.border}`, background: C.surface, color: C.text,
    fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: C.mid, marginBottom: 4 };

  return (
    <form onSubmit={simpan} style={{ padding: 16, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20 }}>
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
      {galat && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>{galat}</div>}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={kirim || !judul.trim()} style={{
          padding: "8px 16px", borderRadius: 10, border: "none",
          background: kirim || !judul.trim() ? C.muted : C.navy, color: C.onNavy,
          fontSize: 13, fontWeight: 600, cursor: kirim || !judul.trim() ? "not-allowed" : "pointer",
        }}>
          {kirim ? "Menyimpan…" : "Simpan tender"}
        </button>
      </div>
    </form>
  );
}
