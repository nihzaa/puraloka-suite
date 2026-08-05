"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { api, makeAbortController, hasPermission } from "@/lib/api";
import {
  BookOpen, Plus, X, Check, Ban, Loader2, AlertTriangle,
  Scale, FileText, ChevronRight, Trash2, Landmark,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════════
// GL-1d — Buku Besar: bagan akun, jurnal, dan neraca saldo.
//
// ── Pilihan desain, dan alasannya
//
// **Debit & kredit sebagai DUA kolom, bukan satu angka bertanda.** Sama dengan
// keputusan di skema (migrasi 167): akuntan membaca buku besar sebagai dua
// kolom, dan satu angka bertanda memaksa setiap pembaca menebak konvensi
// tandanya.
//
// **Selisih ditampilkan MENYOLOK saat jurnal belum seimbang** — bukan hanya
// tombol yang mati. Tombol mati tanpa alasan membuat orang menebak; angka
// selisih memberi tahu persis berapa yang kurang dan di sisi mana.
//
// **Nama akun ditampilkan bersama kodenya.** Kontraktor tak menghafal '1122';
// mereka mengenal 'Uang Muka Mandor'. Kode tetap ditampilkan karena itu yang
// dipakai saat berbicara dengan konsultan pajak.
//
// **Jurnal yang sudah di-posting tampil dengan gembok, bukan disembunyikan.**
// Menyembunyikan yang tak bisa diubah membuat orang mengira datanya hilang.
// ═════════════════════════════════════════════════════════════════════════════

import { C } from "@/lib/warna-ui";
import { BukuBesar } from "@/components/buku-besar";

const card: React.CSSProperties = {
  background: "var(--surface)", border: `1px solid ${C.border}`,
  borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

type Akun = {
  id: string; code: string; name: string; type: string
  parent_id: string | null; is_active: boolean
};
type Jurnal = {
  id: string; entry_number: string; entry_date: string; description: string
  source: string; status: "draft" | "posted" | "void"; posted_at: string | null; notes: string | null
};
type BarisNeraca = {
  account_id: string; code: string; name: string; type: string
  debit: number; credit: number; saldo: number
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const TIPE_LABEL: Record<string, string> = {
  asset: "Aset", liability: "Liabilitas", equity: "Ekuitas",
  revenue: "Pendapatan", expense: "Beban",
};

const STATUS_META: Record<string, { label: string; warna: string; bg: string; border: string }> = {
  draft: { label: "Draft", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  posted: { label: "Terposting", warna: C.green, bg: C.greenBg, border: C.greenBorder },
  void: { label: "Dibatalkan", warna: C.mid, bg: "var(--bg)", border: C.border },
};

export default function AkuntansiPage() {
  const [tab, setTab] = useState<"jurnal" | "akun" | "neraca" | "besar">("jurnal");
  const [akun, setAkun] = useState<Akun[]>([]);
  const [jurnal, setJurnal] = useState<Jurnal[]>([]);
  const [neraca, setNeraca] = useState<BarisNeraca[]>([]);
  const [neracaMeta, setNeracaMeta] = useState<{ total_debit: number; total_credit: number; selisih: number } | null>(null);
  const [muat, setMuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [bukaModal, setBukaModal] = useState(false);

  const bolehKelola = hasPermission("gl:manage");
  const bolehPosting = hasPermission("gl:post");
  const bolehBatal = hasPermission("gl:void");

  const ambil = useCallback(async () => {
    const ac = makeAbortController();
    setMuat(true);
    setGalat(null);
    try {
      const [a, j, n] = await Promise.all([
        api.get<{ data: Akun[] }>("/api/v1/gl/accounts", { signal: ac.signal }),
        api.get<{ data: Jurnal[] }>("/api/v1/gl/journal-entries", { signal: ac.signal }),
        api.get<{ data: BarisNeraca[]; meta: typeof neracaMeta }>("/api/v1/gl/trial-balance", { signal: ac.signal }),
      ]);
      setAkun(a.data.data ?? []);
      setJurnal(j.data.data ?? []);
      setNeraca(n.data.data ?? []);
      setNeracaMeta(n.data.meta ?? null);
    } catch (e) {
      // Kegagalan muat DITAMPILKAN, bukan jadi halaman kosong: daftar kosong
      // tak bisa dibedakan dari "belum ada jurnal" — dan itu membuat orang
      // menyimpulkan datanya hilang.
      const pesan = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (!ac.signal.aborted) setGalat(pesan ?? "Gagal memuat data buku besar.");
    } finally {
      setMuat(false);
    }
    return () => ac.abort();
  }, []);

  // `queueMicrotask`, bukan `void ambil()` langsung: `ambil()` memanggil
  // `setMuat(true)` di baris pertamanya, dan setState SINKRON di dalam effect
  // memicu render kedua sebelum yang pertama selesai (`react-hooks/
  // set-state-in-effect`). Menunda satu microtask memindahkannya keluar dari
  // fase render tanpa menambah jeda yang terlihat.
  useEffect(() => { queueMicrotask(() => { void ambil(); }); }, [ambil]);

  const posting = async (id: string) => {
    try {
      await api.patch(`/api/v1/gl/journal-entries/${id}/post`);
      await ambil();
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(pesan ?? "Gagal memposting jurnal.");
    }
  };

  const batalkan = async (id: string) => {
    const alasan = window.prompt("Alasan pembatalan (wajib — pembatalan tanpa alasan tak bisa ditelusuri):");
    if (!alasan?.trim()) return;
    try {
      await api.patch(`/api/v1/gl/journal-entries/${id}/void`, { alasan: alasan.trim() });
      await ambil();
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(pesan ?? "Gagal membatalkan jurnal.");
    }
  };

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/* Header */}
      <div className="rise" style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
          Buku Besar
        </h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0" }}>
          Bagan akun, jurnal, dan neraca saldo badan usaha ini.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          ...card, borderColor: C.redBorder, background: C.redBg,
          padding: "12px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.red }}>{galat}</span>
        </div>
      )}

      {/* Tab */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {([
          ["jurnal", "Jurnal", FileText],
          ["akun", "Bagan Akun", BookOpen],
          ["neraca", "Neraca Saldo", Scale],
          ["besar", "Buku Besar", Landmark],
        ] as const).map(([k, label, Ikon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 10, cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              border: `1px solid ${tab === k ? C.navy : C.border}`,
              background: tab === k ? C.navy : "var(--surface)",
              color: tab === k ? "#fff" : C.mid,
            }}
          >
            <Ikon size={15} /> {label}
          </button>
        ))}

        {tab === "jurnal" && bolehKelola && (
          <button
            type="button"
            onClick={() => setBukaModal(true)}
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 10, cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              border: "none", background: C.navy, color: "#fff",
            }}
          >
            <Plus size={15} /> Jurnal Baru
          </button>
        )}
      </div>

      {muat ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid }}>
          <Loader2 size={22} className="spin" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Memuat buku besar…</p>
        </div>
      ) : (
        <>
          {tab === "jurnal" && (
            <TabJurnal
              jurnal={jurnal}
              bolehPosting={bolehPosting}
              bolehBatal={bolehBatal}
              onPosting={posting}
              onBatal={batalkan}
            />
          )}
          {tab === "akun" && <TabAkun akun={akun} />}
          {tab === "neraca" && <TabNeraca baris={neraca} meta={neracaMeta} />}
          {tab === "besar" && <BukuBesar akun={akun} />}
        </>
      )}

      {bukaModal && (
        <ModalJurnal
          akun={akun}
          onTutup={() => setBukaModal(false)}
          onSimpan={async () => { setBukaModal(false); await ambil(); }}
        />
      )}
    </div>
  );
}

// ── Tab: Jurnal ─────────────────────────────────────────────────────────────
function TabJurnal({
  jurnal, bolehPosting, bolehBatal, onPosting, onBatal,
}: {
  jurnal: Jurnal[]
  bolehPosting: boolean
  bolehBatal: boolean
  onPosting: (id: string) => void
  onBatal: (id: string) => void
}) {
  if (jurnal.length === 0) {
    return (
      <div style={{ ...card, padding: 40, textAlign: "center" }}>
        <FileText size={26} color={C.muted} style={{ marginBottom: 10 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
          Belum ada jurnal
        </p>
        <p style={{ fontSize: 12.5, color: C.mid, margin: 0 }}>
          Jurnal manual dicatat di sini. Pencatatan otomatis dari kasbon,
          pembayaran, dan pembelian menyusul di tahap berikutnya.
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {["Nomor", "Tanggal", "Keterangan", "Status", ""].map((h, i) => (
                <th key={h || i} style={{
                  padding: "10px 14px", textAlign: i === 4 ? "right" : "left",
                  fontSize: 11.5, fontWeight: 700, color: C.mid,
                  textTransform: "uppercase", letterSpacing: 0.3,
                  borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jurnal.map(j => {
              const st = STATUS_META[j.status] ?? STATUS_META.draft;
              return (
                <tr key={j.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
                    {j.entry_number}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12.5, color: C.mid, whiteSpace: "nowrap" }}>
                    {new Date(j.entry_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12.5, color: C.text }}>
                    {j.description}
                    {j.notes && (
                      <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 2 }}>
                        {j.notes}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20,
                      fontSize: 11, fontWeight: 700,
                      color: st.warna, background: st.bg, border: `1px solid ${st.border}`,
                      whiteSpace: "nowrap",
                    }}>{st.label}</span>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {j.status === "draft" && bolehPosting && (
                      <button
                        type="button"
                        onClick={() => onPosting(j.id)}
                        style={tombolKecil(C.green, C.greenBg, C.greenBorder)}
                      >
                        <Check size={12} /> Posting
                      </button>
                    )}
                    {j.status === "posted" && bolehBatal && (
                      <button
                        type="button"
                        onClick={() => onBatal(j.id)}
                        style={tombolKecil(C.red, C.redBg, C.redBorder)}
                      >
                        <Ban size={12} /> Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tombolKecil = (warna: string, bg: string, border: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 11px", borderRadius: 8, cursor: "pointer",
  fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
  color: warna, background: bg, border: `1px solid ${border}`,
});

// ── Tab: Bagan Akun ─────────────────────────────────────────────────────────
function TabAkun({ akun }: { akun: Akun[] }) {
  // Dikelompokkan per tipe: akuntan membaca bagan akun menurut kelompok
  // laporan (neraca vs laba-rugi), bukan menurut urutan kode mentah.
  const perTipe = useMemo(() => {
    const m = new Map<string, Akun[]>();
    for (const a of akun) {
      if (!m.has(a.type)) m.set(a.type, []);
      m.get(a.type)!.push(a);
    }
    return m;
  }, [akun]);

  const urutan = ["asset", "liability", "equity", "revenue", "expense"];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {urutan.filter(t => perTipe.has(t)).map(tipe => (
        <div key={tipe} style={{ ...card, overflow: "hidden" }}>
          <div style={{
            padding: "11px 16px", background: "var(--bg)",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              {TIPE_LABEL[tipe] ?? tipe}
            </span>
            <span style={{ fontSize: 11.5, color: C.mid }}>
              {perTipe.get(tipe)!.length} akun
            </span>
          </div>
          <div>
            {perTipe.get(tipe)!.map(a => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 16px", borderBottom: `1px solid ${C.border}`,
                // Akun anak dimundurkan supaya hirarkinya terbaca sekilas.
                paddingLeft: a.parent_id ? 34 : 16,
              }}>
                {a.parent_id && <ChevronRight size={13} color={C.muted} style={{ flexShrink: 0 }} />}
                <span style={{
                  fontSize: 12, fontWeight: 700, color: C.navy,
                  fontVariantNumeric: "tabular-nums", minWidth: 46,
                }}>{a.code}</span>
                <span style={{ fontSize: 12.5, color: C.text }}>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Neraca Saldo ───────────────────────────────────────────────────────
function TabNeraca({
  baris, meta,
}: {
  baris: BarisNeraca[]
  meta: { total_debit: number; total_credit: number; selisih: number } | null
}) {
  if (baris.length === 0) {
    return (
      <div style={{ ...card, padding: 40, textAlign: "center" }}>
        <Scale size={26} color={C.muted} style={{ marginBottom: 10 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
          Neraca saldo masih kosong
        </p>
        <p style={{ fontSize: 12.5, color: C.mid, margin: 0 }}>
          Hanya jurnal yang sudah <strong>diposting</strong> masuk ke sini.
          Jurnal draft belum dihitung.
        </p>
      </div>
    );
  }

  const seimbang = (meta?.selisih ?? 0) === 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Selisih ditampilkan MENYOLOK kalau tak nol: neraca yang tak seimbang
          berarti invarian database bocor, dan itu harus terlihat — bukan
          disamarkan jadi angka kecil di pojok. */}
      <div style={{
        ...card,
        borderColor: seimbang ? C.greenBorder : C.redBorder,
        background: seimbang ? C.greenBg : C.redBg,
        padding: "13px 18px",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        {seimbang
          ? <Check size={17} color={C.green} style={{ flexShrink: 0 }} />
          : <AlertTriangle size={17} color={C.red} style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: seimbang ? C.green : C.red }}>
          {seimbang ? "Neraca seimbang" : `Neraca TIDAK seimbang — selisih ${rupiah(Math.abs(meta?.selisih ?? 0))}`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          Debit {rupiah(meta?.total_debit ?? 0)} · Kredit {rupiah(meta?.total_credit ?? 0)}
        </span>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                {["Kode", "Nama Akun", "Debit", "Kredit", "Saldo"].map((h, i) => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: i >= 2 ? "right" : "left",
                    fontSize: 11.5, fontWeight: 700, color: C.mid,
                    textTransform: "uppercase", letterSpacing: 0.3,
                    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.map(b => (
                <tr key={b.account_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: C.navy, fontVariantNumeric: "tabular-nums" }}>
                    {b.code}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: C.text }}>
                    {b.name}
                    <span style={{ fontSize: 11, color: C.muted, marginLeft: 7 }}>
                      {TIPE_LABEL[b.type] ?? b.type}
                    </span>
                  </td>
                  {/* Angka rata KANAN + tabular-nums: kolom uang harus sejajar
                      digitnya, kalau tidak mata sulit membandingkan besarannya. */}
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
                    {b.debit ? rupiah(b.debit) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
                    {b.credit ? rupiah(b.credit) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                    {rupiah(b.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Jurnal Baru ──────────────────────────────────────────────────────
type BarisDraf = { account_id: string; sisi: "debit" | "credit"; jumlah: string; keterangan: string };

function ModalJurnal({
  akun, onTutup, onSimpan,
}: {
  akun: Akun[]
  onTutup: () => void
  onSimpan: () => void | Promise<void>
}) {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [keterangan, setKeterangan] = useState("");
  const [baris, setBaris] = useState<BarisDraf[]>([
    { account_id: "", sisi: "debit", jumlah: "", keterangan: "" },
    { account_id: "", sisi: "credit", jumlah: "", keterangan: "" },
  ]);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useTutupEsc(onTutup);

  // Hanya akun POSTING (tak punya anak) yang boleh menerima jurnal — akun
  // induk hanya untuk pengelompokan laporan.
  const akunPosting = useMemo(() => {
    const punyaAnak = new Set(akun.map(a => a.parent_id).filter(Boolean));
    return akun.filter(a => !punyaAnak.has(a.id) && a.is_active);
  }, [akun]);

  const totalDebit = baris.reduce((s, b) => s + (b.sisi === "debit" ? Number(b.jumlah) || 0 : 0), 0);
  const totalKredit = baris.reduce((s, b) => s + (b.sisi === "credit" ? Number(b.jumlah) || 0 : 0), 0);
  const selisih = totalDebit - totalKredit;
  const bisaSimpan = keterangan.trim() && baris.filter(b => b.account_id && Number(b.jumlah) > 0).length >= 2;

  const ubah = (i: number, patch: Partial<BarisDraf>) =>
    setBaris(b => b.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const simpan = async () => {
    setKirim(true);
    setGalat(null);
    try {
      await api.post("/api/v1/gl/journal-entries", {
        entry_date: tanggal,
        description: keterangan.trim(),
        lines: baris
          .filter(b => b.account_id && Number(b.jumlah) > 0)
          .map(b => ({
            account_id: b.account_id,
            debit: b.sisi === "debit" ? Number(b.jumlah) : 0,
            credit: b.sisi === "credit" ? Number(b.jumlah) : 0,
            description: b.keterangan || null,
          })),
      });
      await onSimpan();
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(pesan ?? "Gagal menyimpan jurnal.");
      setKirim(false);
    }
  };

  return (
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onTutup(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.42)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jurnal baru"
        style={{
          ...card, width: "100%", maxWidth: 760,
          maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "16px 22px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Jurnal Baru</h2>
          <button
            type="button"
            aria-label="Tutup dialog jurnal"
            onClick={onTutup}
            style={{
              width: 30, height: 30, borderRadius: 8, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, marginBottom: 18 }}>
            <div>
              <label htmlFor="jv-tanggal" style={labelStyle}>Tanggal</label>
              <input
                id="jv-tanggal" type="date" value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="jv-ket" style={labelStyle}>Keterangan</label>
              <input
                id="jv-ket" type="text" value={keterangan}
                onChange={e => setKeterangan(e.target.value)}
                placeholder="mis. Pembayaran sewa kantor Agustus"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {baris.map((b, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 110px 150px 34px",
                gap: 8, alignItems: "end",
              }}>
                <div>
                  {i === 0 && <label htmlFor={`jv-akun-${i}`} style={labelStyle}>Akun</label>}
                  <select
                    id={`jv-akun-${i}`}
                    aria-label={`Akun baris ${i + 1}`}
                    value={b.account_id}
                    onChange={e => ubah(i, { account_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">— pilih akun —</option>
                    {akunPosting.map(a => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <label htmlFor={`jv-sisi-${i}`} style={labelStyle}>Sisi</label>}
                  <select
                    id={`jv-sisi-${i}`}
                    aria-label={`Sisi baris ${i + 1}`}
                    value={b.sisi}
                    onChange={e => ubah(i, { sisi: e.target.value as "debit" | "credit" })}
                    style={inputStyle}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Kredit</option>
                  </select>
                </div>
                <div>
                  {i === 0 && <label htmlFor={`jv-jml-${i}`} style={labelStyle}>Jumlah</label>}
                  <input
                    id={`jv-jml-${i}`}
                    aria-label={`Jumlah baris ${i + 1}`}
                    type="number" min="0" inputMode="numeric"
                    value={b.jumlah}
                    onChange={e => ubah(i, { jumlah: e.target.value })}
                    style={{ ...inputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Hapus baris ${i + 1}`}
                  onClick={() => setBaris(x => x.filter((_, k) => k !== i))}
                  disabled={baris.length <= 2}
                  style={{
                    height: 38, width: 34, borderRadius: 8,
                    cursor: baris.length <= 2 ? "not-allowed" : "pointer",
                    border: `1px solid ${C.border}`, background: "var(--surface)",
                    color: baris.length <= 2 ? C.muted : C.red,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: baris.length <= 2 ? 0.45 : 1,
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBaris(b => [...b, { account_id: "", sisi: "debit", jumlah: "", keterangan: "" }])}
            style={{
              marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 13px", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              border: `1px dashed ${C.border}`, background: "transparent", color: C.mid,
            }}
          >
            <Plus size={13} /> Tambah baris
          </button>

          {/* Selisih ditampilkan sebagai ANGKA, bukan cuma tombol yang mati.
              Tombol mati tanpa alasan memaksa orang menebak; angka ini memberi
              tahu persis berapa yang kurang dan di sisi mana. */}
          <div style={{
            marginTop: 16, padding: "11px 15px", borderRadius: 10,
            border: `1px solid ${selisih === 0 ? C.greenBorder : C.yellowBorder}`,
            background: selisih === 0 ? C.greenBg : C.yellowBg,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: selisih === 0 ? C.green : C.yellow }}>
              {selisih === 0
                ? "Seimbang"
                : selisih > 0
                  ? `Kurang kredit ${rupiah(selisih)}`
                  : `Kurang debit ${rupiah(-selisih)}`}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
              Debit {rupiah(totalDebit)} · Kredit {rupiah(totalKredit)}
            </span>
          </div>

          {galat && (
            <div role="alert" style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 9,
              border: `1px solid ${C.redBorder}`, background: C.redBg,
              fontSize: 12.5, color: C.red,
            }}>{galat}</div>
          )}
        </div>

        <div style={{
          padding: "14px 22px", borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button
            type="button" onClick={onTutup}
            style={{
              padding: "9px 17px", borderRadius: 9, cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid,
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={simpan}
            disabled={!bisaSimpan || kirim}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 19px", borderRadius: 9,
              cursor: !bisaSimpan || kirim ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              border: "none", background: C.navy, color: "#fff",
              opacity: !bisaSimpan || kirim ? 0.5 : 1,
            }}
          >
            {kirim ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            Simpan sebagai Draft
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 700, color: C.mid,
  marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: "var(--surface)",
  fontSize: 13, color: C.text, fontFamily: "inherit", boxSizing: "border-box",
};
