"use client";

/**
 * KLAUSUL KONTRAK — menyunting bunyi pasal tanpa rilis kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LAYAR INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 450 memindahkan klausul dari kode ke basis. Tapi "kolom DB sudah
 * ada" BUKAN selesai (CHARTER §8): tanpa layar, satu-satunya cara mengubah
 * bunyi pasal tetap SQL langsung ke basis produksi — persis yang hendak
 * dihindari saat memindahkannya dari kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG HARUS TERLIHAT, DAN KENAPA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. ASAL tiap pasal — bawaan produk atau sudah ditimpa perusahaan ini.
 *    Tanpa itu, "sudah saya ubah kok tak berubah di kontrak" jadi keluhan
 *    yang tak bisa dijawab tanpa membuka basis.
 *
 * 2. Pasal yang DIRAKIT SISTEM disebutkan, bukan didiamkan. Yang membuka
 *    layar ini akan mencari "PASAL 3 NILAI KONTRAK" dan tak menemukannya;
 *    tanpa penjelasan ia menyimpulkan pasalnya hilang dari kontrak.
 *
 * ── Kenapa "Pulihkan bawaan", bukan "Hapus"
 *
 * Menghapus pasal sama sekali tidak disediakan. Menyembunyikan pasal
 * penyelesaian sengketa dari kontrak harus jadi tindakan yang disengaja dan
 * terlihat — bukan efek samping dari menekan tombol berlabel "hapus".
 *
 * Yang terjadi saat dipulihkan: timpaan dinonaktifkan, bunyi bawaan kembali
 * dipakai, riwayatnya tetap tersimpan.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Scale, Pencil, RotateCcw, Lock, Info, Loader2, Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, Rangka, Galat, Tombol, Medan, gayaInput, Lencana,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

interface Klausul {
  nomor: string;
  judul: string;
  isi: string;
  urutan: number;
  asal: "bawaan" | "tenant";
  id: string | null;
  versi: number | null;
  bisa_diubah: boolean;
}

interface Muatan {
  klausul: Klausul[];
  dirakit_kode: readonly string[];
  catatan_dirakit: string;
}

export default function HalamanKlausulKontrak() {
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>("/api/v1/klausul-kontrak");

  const [sunting, setSunting] = useState<Klausul | null>(null);
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [sibuk, setSibuk] = useState(false);
  // Galat AKSI terpisah dari galat MUAT: gagal menyimpan tak boleh menghapus
  // pesan "gagal memuat", dan sebaliknya.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const klausul = useMemo(() => data?.klausul ?? [], [data]);
  const galat = galatMuat ? "Gagal memuat klausul kontrak." : null;

  const buka = useCallback((k: Klausul) => {
    setSunting(k);
    setJudul(k.judul);
    setIsi(k.isi);
    setGalatAksi(null);
  }, []);

  async function simpan() {
    if (!sunting) return;
    setSibuk(true);
    setGalatAksi(null);
    try {
      await api.put(`/api/v1/klausul-kontrak/${sunting.nomor}`, {
        judul, isi, urutan: sunting.urutan,
      });
      setSunting(null);
      setKabar(`Pasal ${sunting.nomor} disimpan. Kontrak baru akan memakai bunyi ini.`);
      void muatUlang();
    } catch (e) {
      setGalatAksi(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal menyimpan klausul.",
      );
    } finally {
      setSibuk(false);
    }
  }

  async function pulihkan(k: Klausul) {
    setSibuk(true);
    setGalatAksi(null);
    try {
      await api.delete(`/api/v1/klausul-kontrak/${k.nomor}`);
      setKabar(`Pasal ${k.nomor} kembali memakai bunyi bawaan. Riwayat suntingan tetap tersimpan.`);
      void muatUlang();
    } catch (e) {
      setGalatAksi(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal memulihkan bawaan.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Scale size={20} aria-hidden="true" />}
        judul="Klausul Kontrak"
        keterangan={<>Bunyi pasal yang tercetak di kontrak perusahaan ini. Yang belum
          disunting memakai <strong>bawaan produk</strong> — dan bawaan itu selalu ikut
          tercetak, jadi kontrak tak pernah terbit tanpa pasal penyelesaian sengketa.</>}
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muatUlang()} />}
      {galatAksi && (
        <div role="alert" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galatAksi}</div>
      )}
      {kabar && !galatAksi && (
        <div role="status" style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          border: "1px solid var(--success-border)", background: "var(--success-bg)",
          color: "var(--success)",
        }}>
          <Check size={15} aria-hidden="true" />{kabar}
        </div>
      )}

      {/* Pasal yang dirakit sistem DISEBUTKAN. Yang mencarinya di daftar dan
          tak menemukannya akan menyimpulkan pasalnya hilang dari kontrak. */}
      {data && (
        <div style={{
          display: "flex", gap: 9, alignItems: "flex-start",
          padding: "11px 14px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
          border: `1px solid ${C.border}`, background: "var(--surface-subtle)", color: C.mid,
        }}>
          <Info size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: C.text }}>
              Pasal {data.dirakit_kode.join(", ")} tidak muncul di sini.
            </strong>{" "}
            {data.catatan_dirakit}
          </span>
        </div>
      )}

      {memuat && klausul.length === 0 && <Rangka tinggi={92} jumlah={6} />}

      <div style={{ display: "grid", gap: 12 }}>
        {klausul.map((k) => (
          <Kartu key={k.nomor} pad="sedang">
            <div style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              justifyContent: "space-between", flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                    Pasal {k.nomor} — {k.judul}
                  </h2>
                  {k.asal === "tenant"
                    ? <Lencana nada="info">disunting{k.versi ? ` · v${k.versi}` : ""}</Lencana>
                    : <Lencana nada="netral">bawaan</Lencana>}
                </div>
                <p style={{
                  fontSize: 12.5, color: C.mid, lineHeight: 1.6, margin: "6px 0 0",
                }}>{k.isi}</p>
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {k.bisa_diubah ? (
                  <>
                    <Tombol jenis="sekunder" kecil ikon={<Pencil size={13} />}
                      onClick={() => buka(k)}>Sunting</Tombol>
                    {k.asal === "tenant" && (
                      <Tombol jenis="sekunder" kecil ikon={<RotateCcw size={13} />}
                        disabled={sibuk}
                        onClick={() => void pulihkan(k)}>Pulihkan bawaan</Tombol>
                    )}
                  </>
                ) : (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, color: C.muted,
                  }}>
                    <Lock size={13} aria-hidden="true" /> dirakit sistem
                  </span>
                )}
              </div>
            </div>
          </Kartu>
        ))}
      </div>

      <DialogBersama
        terbuka={sunting !== null}
        onTutup={() => setSunting(null)}
        judul={sunting ? `Sunting Pasal ${sunting.nomor}` : ""}
        kaki={
          <Tombol jenis="utama" onClick={() => void simpan()}
            disabled={sibuk || judul.trim() === "" || isi.trim() === ""}
            ikon={sibuk ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            {sibuk ? "Menyimpan…" : "Simpan"}
          </Tombol>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Medan id="klausul-judul" label="Judul pasal" wajib anak={
            <input id="klausul-judul" value={judul} onChange={(e) => setJudul(e.target.value)}
              style={gayaInput} />
          } />
          <Medan
            id="klausul-isi"
            label="Bunyi pasal"
            wajib
            keterangan={"Yang disimpan menjadi versi baru; versi lama TIDAK dihapus. "
              + "Kontrak yang sudah ditandatangani harus tetap bisa dicetak ulang persis "
              + "seperti saat ditandatangani."}
            anak={
              <textarea id="klausul-isi" value={isi} onChange={(e) => setIsi(e.target.value)}
                rows={9}
                style={{ ...gayaInput, resize: "vertical", lineHeight: 1.6 }} />
            }
          />
        </div>
      </DialogBersama>
    </Halaman>
  );
}
