"use client";

/**
 * DOKUMEN PENAWARAN — surat, rinciannya, dan PDF-nya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Register tender menyimpan ANGKA penawaran — satu kolom `bid_value` — bukan
 * dokumennya. Suratnya karena itu disusun di Word/Excel, dan yang dikirim ke
 * owner berbeda dari yang tercatat di sini.
 *
 * Saat menang, RAB-nya disusun dari angka yang tak pernah dibandingkan dengan
 * yang ditawarkan — dan selisihnya baru ketahuan sebagai margin yang hilang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG LAYAR INI TOLAK LAKUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Tidak menghitung sendiri.** Subtotal, PPN, total, dan terbilang
 *    semuanya datang dari server (`lib/penawaran.ts`, 24 test). Menghitung
 *    ulang di sini berarti dua sumber untuk satu angka, dan yang tercetak di
 *    surat adalah yang dari server — jadi layar yang berbeda darinya hanya
 *    menyesatkan yang mengisinya.
 *
 *    Yang DIHITUNG layar hanya jumlah per baris, sebagai umpan balik saat
 *    mengetik. Ia tak pernah dikirim ke mana pun.
 *
 * 2. **Tidak menawarkan sunting pada yang sudah TERKIRIM.** Suratnya ada di
 *    tangan calon pemberi kerja; mengubah arsip kita membuat keduanya
 *    berbeda, dan yang mereka pegang yang mengikat.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  ModalDasar, TombolModal, KakiModal, gayaLabel, gayaInput, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";

export type Hitung = {
  subtotal: number; diskon: number; dpp: number; ppn: number;
  total: number; terbilang: string;
};

export type Penawaran = {
  id: string;
  bid_id: string | null;
  nomor: string;
  perihal: string;
  kepada: string | null;
  kepada_alamat: string | null;
  tanggal: string;
  berlaku_sampai: string | null;
  diskon: number | string;
  ppn_persen: number | string;
  syarat: string | null;
  catatan: string | null;
  status: string;
  dikirim_pada: string | null;
  jumlah_baris?: number;
  hitung?: Hitung;
};

export type ItemPenawaran = {
  uraian: string;
  satuan?: string | null;
  volume?: number | string | null;
  harga_satuan?: number | string | null;
};

const rupiah = (n: number | string) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(Number(n) || 0);

const STATUS: Array<{ nilai: string; teks: string; jelas: string }> = [
  { nilai: "draft", teks: "Draft", jelas: "masih disusun, belum dikirim" },
  { nilai: "terkirim", teks: "Terkirim", jelas: "sudah di tangan calon pemberi kerja" },
  { nilai: "menang", teks: "Menang", jelas: "penawaran diterima" },
  { nilai: "kalah", teks: "Kalah", jelas: "penawaran tidak diterima" },
  { nilai: "batal", teks: "Batal", jelas: "ditarik sebelum diputuskan" },
];

// ═══════════════════════════════════════════════════════════════════════════
// SURAT BARU / UBAH KEPALA
// ═══════════════════════════════════════════════════════════════════════════

export function ModalSuratPenawaran({ awal, bidId, onClose, onSukses }: {
  /** `null` = membuat baru. */
  awal: Penawaran | null;
  /** Tender yang penawarannya disusun. */
  bidId?: string | null;
  onClose: () => void;
  onSukses: (id: string) => void;
}) {
  const [nomor, setNomor] = useState(awal?.nomor ?? "");
  const [perihal, setPerihal] = useState(awal?.perihal ?? "");
  const [kepada, setKepada] = useState(awal?.kepada ?? "");
  const [alamat, setAlamat] = useState(awal?.kepada_alamat ?? "");
  const [tanggal, setTanggal] = useState(
    awal?.tanggal?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [berlaku, setBerlaku] = useState(awal?.berlaku_sampai?.slice(0, 10) ?? "");
  const [diskon, setDiskon] = useState(awal ? String(Number(awal.diskon) || "") : "");
  const [ppn, setPpn] = useState(awal ? String(Number(awal.ppn_persen) || "") : "11");
  const [syarat, setSyarat] = useState(awal?.syarat ?? "");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const berlakuTerbalik = !!berlaku && !!tanggal && berlaku < tanggal;

  const halangan =
    !nomor.trim() ? "Nomor surat wajib diisi."
    : !perihal.trim() ? "Perihal wajib diisi."
    : berlakuTerbalik ? "Masa berlaku berakhir sebelum tanggal suratnya sendiri."
    : null;

  async function simpan() {
    if (halangan || kirim) return;
    setKirim(true); setGalat(null);
    try {
      const muatan = {
        nomor: nomor.trim(),
        perihal: perihal.trim(),
        kepada: kepada.trim() || null,
        kepada_alamat: alamat.trim() || null,
        tanggal,
        // Kosong dikirim `null`, bukan "". Tanggal berstring kosong ditolak
        // basis sebagai tanggal tak terbaca, dan pesannya menyebut format —
        // bukan menyebut bahwa kolomnya memang sedang dikosongkan.
        berlaku_sampai: berlaku || null,
        diskon: diskon.trim() === "" ? 0 : Number(diskon),
        ppn_persen: ppn.trim() === "" ? 0 : Number(ppn),
        syarat: syarat.trim() || null,
        ...(awal ? {} : { bid_id: bidId ?? null }),
      };
      const r = awal
        ? await api.patch<{ data: Penawaran }>(`/api/v1/penawaran/${awal.id}`, muatan)
        : await api.post<{ data: Penawaran }>("/api/v1/penawaran", muatan);
      onSukses(r.data.data.id);
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menyimpan surat penawaran."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-surat-penawaran" lebar={640} onClose={onClose}
      judul={awal ? `Ubah ${awal.nomor}` : "Surat penawaran baru"}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <div>
          <label htmlFor="sp-nomor" style={gayaLabel}>Nomor surat</label>
          <input id="sp-nomor" value={nomor} style={gayaInput}
            placeholder="001/PEN/VIII/2026" onChange={(e) => setNomor(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sp-tanggal" style={gayaLabel}>Tanggal surat</label>
          <input id="sp-tanggal" type="date" value={tanggal} style={gayaInput}
            onChange={(e) => setTanggal(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="sp-perihal" style={gayaLabel}>Perihal</label>
        <input id="sp-perihal" value={perihal} style={gayaInput}
          placeholder="Penawaran Harga Pekerjaan Gedung Serbaguna Tahap 2"
          onChange={(e) => setPerihal(e.target.value)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <div>
          <label htmlFor="sp-kepada" style={gayaLabel}>Kepada</label>
          <input id="sp-kepada" value={kepada} style={gayaInput}
            placeholder="PT Sumber Makmur" onChange={(e) => setKepada(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sp-alamat" style={gayaLabel}>Alamat penerima</label>
          <input id="sp-alamat" value={alamat} style={gayaInput}
            onChange={(e) => setAlamat(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div>
          <label htmlFor="sp-berlaku" style={gayaLabel}>Berlaku sampai</label>
          <input id="sp-berlaku" type="date" value={berlaku} style={gayaInput}
            onChange={(e) => setBerlaku(e.target.value)} />
          <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
            Wajib sebelum bisa dikirim. Tanpa batas waktu, harga hari ini mengikat
            untuk pekerjaan tahun depan.
          </p>
        </div>
        <div>
          <label htmlFor="sp-diskon" style={gayaLabel}>Diskon (Rp)</label>
          <input id="sp-diskon" type="number" min="0" value={diskon} style={gayaInput}
            onChange={(e) => setDiskon(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sp-ppn" style={gayaLabel}>PPN (%)</label>
          <input id="sp-ppn" type="number" min="0" max="100" value={ppn} style={gayaInput}
            onChange={(e) => setPpn(e.target.value)} />
          <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
            Dikenakan SESUDAH diskon.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="sp-syarat" style={gayaLabel}>Syarat &amp; ketentuan</label>
        <textarea id="sp-syarat" rows={3} value={syarat}
          style={{ ...gayaInput, resize: "vertical" }}
          placeholder="mis. Harga belum termasuk biaya perizinan. Pembayaran termin sesuai progres."
          onChange={(e) => setSyarat(e.target.value)} />
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        {halangan && (
          <span style={{
            fontSize: 11.5, color: C.mid, marginRight: "auto",
            maxWidth: "42ch", lineHeight: 1.45, alignSelf: "center",
          }}>{halangan}</span>
        )}
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!!halangan || kirim}>
          {kirim ? "Menyimpan…" : awal ? "Simpan" : "Buat surat"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RINCIAN
// ═══════════════════════════════════════════════════════════════════════════

const BARIS_KOSONG: ItemPenawaran = { uraian: "", satuan: "", volume: "", harga_satuan: "" };

export function ModalRincianPenawaran({ penawaranId, onClose, onSukses }: {
  penawaranId: string; onClose: () => void; onSukses: () => void;
}) {
  const [surat, setSurat] = useState<Penawaran | null>(null);
  const [baris, setBaris] = useState<ItemPenawaran[]>([]);
  const [hitung, setHitung] = useState<Hitung | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback((signal?: AbortSignal) =>
    api.get<{ data: Penawaran; item: ItemPenawaran[]; hitung: Hitung }>(
      `/api/v1/penawaran/${penawaranId}`, { signal })
      .then((r) => {
        setSurat(r.data.data);
        setBaris(r.data.item.length > 0 ? r.data.item : [{ ...BARIS_KOSONG }]);
        setHitung(r.data.hitung);
      })
      .catch((e) => {
        if ((e as { name?: string })?.name === "CanceledError") return;
        setGalat(pesanGalat(e, "Gagal memuat rincian penawaran."));
      })
      .finally(() => setMemuat(false)),
    [penawaranId]);

  useEffect(() => {
    const ac = makeAbortController();
    void muat(ac.signal);
    return () => ac.abort();
  }, [muat]);

  const terkunci = !!surat && surat.status !== "draft";

  function ubah(i: number, patch: Partial<ItemPenawaran>) {
    setBaris((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  /**
   * Jumlah per baris — SATU-SATUNYA angka yang dihitung layar.
   *
   * Ia umpan balik saat mengetik, bukan sumber. Yang tercetak di surat datang
   * dari server, dan totalnya di bawah pun begitu — sengaja tak dijumlahkan
   * di sini supaya tak ada dua angka total yang bisa berbeda.
   */
  const jumlahBaris = (b: ItemPenawaran) => {
    const v = Number(b.volume); const h = Number(b.harga_satuan);
    if (!Number.isFinite(v) || !Number.isFinite(h)) return null;
    if (b.volume === "" || b.harga_satuan === "" || b.volume == null || b.harga_satuan == null) return null;
    return v * h;
  };

  const adaIsi = useMemo(() => baris.some((b) => b.uraian.trim()), [baris]);

  async function simpan() {
    if (kirim || terkunci) return;
    setKirim(true); setGalat(null);
    try {
      const r = await api.put<{ hitung: Hitung }>(
        `/api/v1/penawaran/${penawaranId}/item`,
        { item: baris.filter((b) => b.uraian.trim()) });
      setHitung(r.data.hitung);
      await muat();
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal menyimpan rincian."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-rincian-penawaran" lebar={860} onClose={onClose}
      judul={surat ? `Rincian ${surat.nomor}` : "Rincian penawaran"}>
      {memuat ? (
        <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Memuat…</p>
      ) : (
        <>
          {terkunci && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.55,
              background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
              color: "var(--on-warning-bg)",
            }}>
              Penawaran ini berstatus <strong>{surat?.status}</strong> — rinciannya
              terkunci. Suratnya sudah di tangan penerima, dan arsip yang berbeda
              dari yang mereka pegang tak bisa dipakai membuktikan apa pun. Untuk
              perubahan, buat penawaran revisi bernomor baru.
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640,
              fontVariantNumeric: "tabular-nums",
            }}>
              <caption className="sr-only">
                Rincian pekerjaan yang ditawarkan beserta volume dan harga satuannya
              </caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)" }}>
                  <th scope="col" style={{ textAlign: "left", padding: "6px 8px", width: "42%" }}>Uraian</th>
                  <th scope="col" style={{ textAlign: "left", padding: "6px 8px", width: 70 }}>Satuan</th>
                  <th scope="col" style={{ textAlign: "right", padding: "6px 8px", width: 90 }}>Volume</th>
                  <th scope="col" style={{ textAlign: "right", padding: "6px 8px", width: 130 }}>Harga satuan</th>
                  <th scope="col" style={{ textAlign: "right", padding: "6px 8px", width: 130 }}>Jumlah</th>
                  <th scope="col" style={{ padding: "6px 8px", width: 44 }}>
                    <span className="sr-only">Hapus</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b, i) => {
                  const j = jumlahBaris(b);
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      {/* URAIAN adalah `th scope="row"`, meski isinya kolom
                          isian. Ia yang menamai baris — tanpanya "Rp 4.500.000"
                          dibacakan tanpa menyebut pekerjaan mana, dan tabel ini
                          justru dibaca untuk memeriksa pasangan uraian↔harga. */}
                      <th scope="row" style={{ padding: "3px 4px", fontWeight: 400, textAlign: "left" }}>
                        <input aria-label={`Uraian baris ${i + 1}`} value={b.uraian}
                          disabled={terkunci} style={{ ...gayaInput, padding: "5px 7px" }}
                          placeholder={i === 0 ? "A. PEKERJAAN PERSIAPAN" : "uraian pekerjaan"}
                          onChange={(e) => ubah(i, { uraian: e.target.value })} />
                      </th>
                      <td style={{ padding: "3px 4px" }}>
                        <input aria-label={`Satuan baris ${i + 1}`} value={b.satuan ?? ""}
                          disabled={terkunci} style={{ ...gayaInput, padding: "5px 7px" }}
                          onChange={(e) => ubah(i, { satuan: e.target.value })} />
                      </td>
                      <td style={{ padding: "3px 4px" }}>
                        <input aria-label={`Volume baris ${i + 1}`} type="number" min="0"
                          value={b.volume ?? ""} disabled={terkunci}
                          style={{ ...gayaInput, padding: "5px 7px", textAlign: "right" }}
                          onChange={(e) => ubah(i, { volume: e.target.value })} />
                      </td>
                      <td style={{ padding: "3px 4px" }}>
                        <input aria-label={`Harga satuan baris ${i + 1}`} type="number" min="0"
                          value={b.harga_satuan ?? ""} disabled={terkunci}
                          style={{ ...gayaInput, padding: "5px 7px", textAlign: "right" }}
                          onChange={(e) => ubah(i, { harga_satuan: e.target.value })} />
                      </td>
                      <td style={{
                        padding: "3px 8px", textAlign: "right",
                        fontVariantNumeric: "tabular-nums", color: C.mid,
                      }}>
                        {/* Baris JUDUL sengaja kosong, bukan "Rp 0". Nol di
                            kolom jumlah membuat pembaca menjumlahkannya
                            sebagai pekerjaan yang diberikan gratis. */}
                        {j === null ? "" : rupiah(j)}
                      </td>
                      <td style={{ padding: "3px 4px", textAlign: "center" }}>
                        <button type="button" aria-label={`Hapus baris ${i + 1}`}
                          disabled={terkunci || baris.length === 1}
                          onClick={() => setBaris((x) => x.filter((_, k) => k !== i))}
                          style={{
                            padding: "3px 7px", borderRadius: 5, fontSize: 11,
                            border: `1px solid ${C.border}`, background: "var(--surface)",
                            color: terkunci || baris.length === 1 ? C.muted : C.red,
                            cursor: terkunci || baris.length === 1 ? "not-allowed" : "pointer",
                          }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!terkunci && (
            <button type="button"
              onClick={() => setBaris((b) => [...b, { ...BARIS_KOSONG }])}
              style={{
                alignSelf: "flex-start", padding: "6px 12px", borderRadius: 6,
                fontSize: 12, border: `1px solid ${C.border}`,
                background: "var(--surface)", color: C.text, cursor: "pointer",
              }}>+ Tambah baris</button>
          )}

          <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Baris tanpa volume &amp; harga jadi <strong>baris judul</strong> — dicetak
            tebal tanpa angka. Itu yang memisahkan kelompok pekerjaan di surat.
          </p>

          {/* ── Rekapitulasi: SELURUHNYA dari server ────────────────────── */}
          {hitung && (
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px",
              background: "var(--surface-subtle)", fontSize: 12.5,
            }}>
              <Baris label="Jumlah" nilai={hitung.subtotal} />
              {hitung.diskon > 0 && <Baris label="Diskon" nilai={-hitung.diskon} />}
              {hitung.ppn > 0 && (
                <>
                  <Baris label="Dasar Pengenaan Pajak" nilai={hitung.dpp} />
                  <Baris label={`PPN ${Number(surat?.ppn_persen ?? 0)}%`} nilai={hitung.ppn} />
                </>
              )}
              <Baris label="TOTAL PENAWARAN" nilai={hitung.total} tebal />
              {/* Terbilang datang dari server, dari angka yang SAMA yang
                  dicetak di PDF. Dalam praktik komersial yang tertulis huruf
                  yang dipegang saat keduanya berbeda. */}
              <div style={{
                marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}`,
                fontStyle: "italic", color: C.mid, lineHeight: 1.5,
              }}>
                Terbilang: {hitung.terbilang}
              </div>
            </div>
          )}

          {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

          <KakiModal>
            {!terkunci && !adaIsi && (
              <span style={{
                fontSize: 11.5, color: C.mid, marginRight: "auto",
                maxWidth: "42ch", lineHeight: 1.45, alignSelf: "center",
              }}>
                Isi minimal satu baris. Penawaran tanpa rincian hanya memuat angka
                total, dan yang tak tertulis akan jadi klaim tambah di tengah
                pekerjaan.
              </span>
            )}
            <TombolModal onClick={onClose}>Tutup</TombolModal>
            {!terkunci && (
              <TombolModal utama onClick={simpan} mati={kirim || !adaIsi}>
                {kirim ? "Menyimpan…" : "Simpan rincian"}
              </TombolModal>
            )}
          </KakiModal>
        </>
      )}
    </ModalDasar>
  );
}

function Baris({ label, nilai, tebal }: { label: string; nilai: number; tebal?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12,
      padding: "2px 0", fontWeight: tebal ? 700 : 400,
      color: tebal ? C.text : C.mid,
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(nilai)}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════

export function ModalStatusPenawaran({ penawaran, onClose, onSukses }: {
  penawaran: Penawaran; onClose: () => void; onSukses: () => void;
}) {
  const [status, setStatus] = useState(penawaran.status);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const halangan = status === penawaran.status ? "Status belum berubah." : null;

  async function simpan() {
    if (halangan || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/penawaran/${penawaran.id}/status`, { status });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal mengubah status penawaran."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-status-penawaran" lebar={520} onClose={onClose}
      judul={`Status ${penawaran.nomor}`}>
      <div>
        <label htmlFor="stp-status" style={gayaLabel}>Status</label>
        <select id="stp-status" value={status} style={gayaInput}
          onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map((s) => (
            <option key={s.nilai} value={s.nilai}>{s.teks} — {s.jelas}</option>
          ))}
        </select>
      </div>

      {status === "terkirim" && penawaran.status === "draft" && (
        <p style={{
          margin: 0, padding: "10px 12px", borderRadius: 6, fontSize: 12,
          lineHeight: 1.55, background: "var(--warning-bg)",
          border: "1px solid var(--warning-border)", color: "var(--on-warning-bg)",
        }}>
          Sesudah ditandai terkirim, <strong>rinciannya terkunci</strong> — suratnya
          dianggap sudah di tangan penerima. Server juga menolak bila nomor, masa
          berlaku, atau baris rinciannya belum lengkap.
        </p>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        {halangan && (
          <span style={{
            fontSize: 11.5, color: C.mid, marginRight: "auto",
            lineHeight: 1.45, alignSelf: "center",
          }}>{halangan}</span>
        )}
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!!halangan || kirim}>
          {kirim ? "Menyimpan…" : "Simpan status"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}
