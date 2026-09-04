"use client";

/**
 * PENOMORAN DOKUMEN — prefix & lebar nomor per jenis dokumen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MENENTUKAN RANCANGANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. CONTOH NOMOR adalah inti barisnya, bukan prefix-nya. Orang tak menyetel
 *    "prefix INV"; mereka menyetel "nomor invoice saya berbentuk begini".
 *    Contohnya ditampilkan besar dan berubah saat diketik — keputusannya
 *    terlihat sebelum disimpan.
 *
 * 2. NOMOR TERAKHIR ditampilkan apa adanya, dengan penjelasan bahwa ia tak
 *    pernah mundur. Tanpa kalimat itu, angka 1369 pada seri yang barisnya
 *    tinggal 40 terbaca sebagai kesalahan.
 *
 * 3. TAK ADA tombol reset. Bukan tombol berkonfirmasi, bukan tombol
 *    ber-izin — tak ada sama sekali. Nomor yang sudah terbit tak boleh lahir
 *    kembali, dan satu-satunya alasan orang menginginkannya adalah "supaya
 *    rapi", yang hasilnya dokumen kembar di tangan pihak ketiga.
 *
 * 4. PERIODE LAMA dilipat. Invoice punya 30 baris periode; menampilkan
 *    semuanya membuat halaman ini jadi daftar yang tak terbaca, sementara
 *    yang dicari selalu "bulan ini sampai nomor berapa".
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Hash, RefreshCw, Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel } from "@/components/dasar";

interface Periode {
  doc_type: string;
  period: string;
  prefix: string;
  padding: number;
  last_number: number | string;
  updated_at?: string;
}

interface Jenis {
  doc_type: string;
  label: string;
  prefix: string;
  padding: number;
  periode: Periode[];
  terbaru: Periode | null;
  totalTerbit: number;
  contoh_berikutnya: string | null;
}

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/**
 * Bentuk nomor untuk pratinjau saat diketik.
 *
 * Menyalin `contohNomor` dari `apps/api/src/lib/penomoran.ts` — dan itu risiko
 * yang disadari: dua salinan bisa berselisih, dan pratinjau yang berbohong
 * membuat orang menyetel prefix berdasarkan tampilan yang salah.
 *
 * Dipilih tetap begitu karena pratinjau harus berubah TIAP KETIKAN, dan
 * memanggil server tiap ketikan berarti puluhan permintaan untuk satu
 * keputusan. Yang menjaga keduanya tetap sama adalah test: bentuk yang sama
 * diuji di `lib/__tests__/penomoran.test.ts` dan diverifikasi ke fungsi basis
 * di `routes/v1/__tests__/penomoran.test.ts`.
 */
function contohNomor(prefix: string, periode: string, padding: number, urut: number): string {
  const p = prefix.trim();
  const lebar = Number.isFinite(padding) && padding > 0 ? Math.min(padding, 12) : 4;
  const nomor = String(Math.max(0, Math.trunc(urut))).padStart(lebar, "0");
  const berperiode = periode !== "" && periode !== "-";
  if (p === "") return berperiode ? `${periode}-${nomor}` : nomor;
  return berperiode ? `${p}-${periode}-${nomor}` : `${p}-${nomor}`;
}

export default function PenomoranPage() {
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  const bolehKelola = useSyncExternalStore(
    langganan, () => hasPermission("penomoran:kelola"), () => false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+AbortController+putaran.
    Menyimpan/mengubah status memakai `muatUlang()`, bukan `putaran` lagi.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ penomoran: Jenis[] }>("/api/v1/penomoran");
  const daftar = data?.penomoran ?? [];
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  /*
    Galat MUAT dan galat AKSI (simpan penomoran) sengaja dipisah — satu state
    untuk keduanya membuat gagal menyimpan menghapus pesan gagal memuat.
    `pesan` sudah ada sebagai jalur galat AKSI (dipakai `onGagal` di bawah),
    jadi galat muat ditambahkan sebagai lapis terpisah, bukan menumpang di sana.
  */
  const galat = galatMuat ? "Gagal memuat seri penomoran." : "";

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 6000);
    return () => clearTimeout(t);
  }, [pesan]);

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Penomoran Dokumen"
          keterangan="Bentuk nomor tiap jenis dokumen. Yang diubah di sini hanya berlaku untuk dokumen berikutnya — nomor yang sudah terbit tak pernah berubah."
          ikon={<Hash size={19} />}
        />
        <button
          type="button"
          onClick={() => void muat()}
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

      {/* Aturan yang tak bisa diubah — disebut di depan, bukan disembunyikan
          di balik penolakan saat orang mencoba. */}
      <div style={{
        marginBottom: "var(--gap-bagian)", padding: "10px 14px", borderRadius: 8,
        background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
        color: C.mid, fontSize: 12.5, lineHeight: 1.6,
        display: "flex", alignItems: "flex-start", gap: 8,
      }}>
        <Lock size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Nomor terakhir <strong>tak bisa dimundurkan</strong>, juga oleh admin. Nomor
          dokumen yang sudah terbit tak boleh lahir kembali — bahkan kalau dokumennya
          dibatalkan. Lubang pada urutan nomor adalah perilaku yang benar, dan itu yang
          diperiksa auditor.
        </span>
      </div>

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat seri penomoran…
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<Hash size={28} />}
          judul="Belum ada seri nomor"
          sebab={
            <>
              Seri lahir sendiri saat dokumen pertama tiap jenis diterbitkan — tak perlu
              dibuat lebih dulu. Terbitkan satu invoice, PO, atau permintaan material,
              lalu bentuk nomornya bisa diatur di sini.
            </>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {daftar.map((j) => (
            <KartuJenis
              key={j.doc_type}
              jenis={j}
              bolehKelola={bolehKelola}
              onSimpan={(teks) => {
                setPesan({ jenis: "ok", teks });
                void muat();
              }}
              onGagal={(teks) => setPesan({ jenis: "galat", teks })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KartuJenis({ jenis: j, bolehKelola, onSimpan, onGagal }: {
  jenis: Jenis;
  bolehKelola: boolean;
  onSimpan: (pesan: string) => void;
  onGagal: (pesan: string) => void;
}) {
  const [prefix, setPrefix] = useState(j.prefix);
  const [padding, setPadding] = useState(String(j.padding));
  const [sibuk, setSibuk] = useState(false);
  const [buka, setBuka] = useState(false);

  const berubah = prefix !== j.prefix || padding !== String(j.padding);
  const urutBerikut = Number(j.terbaru?.last_number ?? 0) + 1;
  const contoh = contohNomor(prefix, j.terbaru?.period ?? "-", Number(padding), urutBerikut);

  async function simpan() {
    setSibuk(true);
    try {
      const r = await api.patch<{ pesan?: string }>(`/api/v1/penomoran/${j.doc_type}`, {
        prefix: prefix.trim(),
        padding: padding.trim(),
      });
      onSimpan(r.data.pesan ?? `Penomoran ${j.label} disimpan.`);
    } catch (e) {
      onGagal(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menyimpan penomoran.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
      <div style={{ padding: "var(--pad-kartu-lega)" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14,
        }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
              {j.label}
            </h3>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {j.periode.length} periode ·{" "}
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{j.totalTerbit}</span>{" "}
              nomor pernah terbit
            </div>
          </div>

          {/* Contoh nomor — yang sebenarnya sedang disetel orang. */}
          <div style={{ textAlign: "right", minWidth: 0 }}>
            <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginBottom: 2 }}>
              Nomor berikutnya
            </div>
            <div style={{
              fontSize: 16, fontWeight: 700, color: berubah ? "var(--aksen)" : C.text,
              fontVariantNumeric: "tabular-nums", wordBreak: "break-all",
            }}>
              {contoh}
            </div>
          </div>
        </div>

        {bolehKelola ? (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr)) auto",
            gap: 12, alignItems: "end",
          }}>
            <div>
              <label
                htmlFor={`prefix-${j.doc_type}`}
                style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}
              >
                Awalan
              </label>
              <input
                id={`prefix-${j.doc_type}`}
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                maxLength={12}
                placeholder="kosongkan bila tanpa awalan"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 6,
                  border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box",
                  background: "var(--surface)", color: C.text,
                }}
              />
            </div>
            <div>
              <label
                htmlFor={`padding-${j.doc_type}`}
                style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}
              >
                Lebar nomor
              </label>
              <input
                id={`padding-${j.doc_type}`}
                type="number" inputMode="numeric" min={1} max={12}
                value={padding}
                onChange={(e) => setPadding(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 6,
                  border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box",
                  background: "var(--surface)", color: C.text,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => void simpan()}
              disabled={sibuk || !berubah}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: berubah ? "var(--aksen)" : "var(--surface-subtle)",
                color: berubah ? "var(--on-aksen)" : C.muted,
                fontSize: 13, fontWeight: 600,
                cursor: sibuk || !berubah ? "not-allowed" : "pointer",
                opacity: sibuk ? 0.6 : 1, whiteSpace: "nowrap",
              }}
            >
              <Check size={14} aria-hidden="true" />
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.mid }}>
            Awalan <strong>{j.prefix || "(tanpa awalan)"}</strong> · lebar {j.padding} digit
          </div>
        )}

        {berubah && bolehKelola && (
          <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Berlaku untuk <strong>{j.periode.length} periode</strong> jenis ini. Nomor yang
            sudah terbit tidak berubah.
          </div>
        )}
      </div>

      {/* Periode lama — dilipat. Invoice punya 30 baris; menampilkan semuanya
          membuat halaman ini jadi daftar yang tak terbaca. */}
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <button
          type="button"
          onClick={() => setBuka((x) => !x)}
          aria-expanded={buka}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 6,
            padding: "9px 14px", background: "none", border: "none",
            color: C.mid, fontSize: 12.5, cursor: "pointer", textAlign: "left",
          }}
        >
          {buka ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          Riwayat per periode ({j.periode.length})
        </button>

        {buka && (
          <Tabel
              berpermukaan            caption={`Riwayat nomor terakhir per periode untuk ${j.label}.`}
            data={j.periode}
            kunciBaris={(p) => p.period}
            kolom={[
              {
                kunci: "periode",
                judul: "Periode",
                kepalaBaris: true,
                render: (p) => (p.period === "-" ? "tanpa periode" : p.period),
              },
              {
                kunci: "awalan",
                judul: "Awalan",
                render: (p) => <span style={{ color: C.mid }}>{p.prefix || "—"}</span>,
              },
              {
                kunci: "terakhir",
                judul: "Nomor terakhir",
                rata: "kanan",
                render: (p) => String(p.last_number),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
