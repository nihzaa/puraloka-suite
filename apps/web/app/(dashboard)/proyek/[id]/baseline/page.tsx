"use client";

/**
 * BASELINE JADWAL — pembanding yang tidak ikut bergeser (G6b).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR YANG MENJAWAB "TERLAMBAT TERHADAP APA?"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `spi = ev / pv`, dan PV diturunkan dari tanggal rencana yang bisa digeser
 * kapan saja. Tanpa baseline, setiap penundaan yang dicatat di Gantt ikut
 * memundurkan PV, dan SPI kembali mendekati 1.
 *
 * Bentuk kegagalannya bukan angka yang salah, melainkan **angka yang selalu
 * benar** — dan itu jauh lebih sulit dilihat.
 *
 * ── Kenapa halaman sendiri, bukan tab di halaman proyek
 *
 * ARAH-VISUAL-2026 §6a: tab = data yang sama dilihat dari sudut lain; halaman
 * = entitas berbeda. Baseline adalah entitas tersendiri dengan riwayatnya —
 * bukan sudut pandang lain atas data proyek.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya spanduk "belum ada baseline". Sesudah baseline ada,
 * yang berwarna hanya angka mundur — dan itu memang yang dicari saat rapat.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, TriangleAlert, Info, Plus } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { formatTanggal } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, KartuAngka, gayaInput, type Kolom,
} from "@/components/dasar";

interface Baseline {
  id: string;
  nomor: number;
  nama: string;
  alasan: string;
  dasar_dokumen: string | null;
  aktif: boolean;
  ditetapkan_pada: string;
}

interface Geser {
  rab_item_id: string;
  uraian: string | null;
  baseline_start: string | null;
  baseline_end: string | null;
  sekarang_start: string | null;
  sekarang_end: string | null;
  geser_mulai_hari: number | null;
  geser_selesai_hari: number | null;
  bobot: number;
  hilang: boolean;
  baru: boolean;
}

interface Ringkas {
  total_item: number;
  bergeser: number;
  mundur: number;
  maju: number;
  hilang: number;
  baru: number;
  mundur_terparah_hari: number | null;
  bobot_mundur_pct: number;
  geser_tertimbang_hari: number | null;
}

type Saring = "semua" | "mundur" | "berubah";

export default function BaselinePage() {
  const params = useParams<{ id: string }>();
  const proyekId = params?.id ?? "";

  const [daftar, setDaftar] = useState<Baseline[]>([]);
  const [aktif, setAktif] = useState<Baseline | null>(null);
  const [geser, setGeser] = useState<Geser[]>([]);
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [alasanKosong, setAlasanKosong] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [saring, setSaring] = useState<Saring>("mundur");

  const [nama, setNama] = useState("");
  const [alasan, setAlasan] = useState("");
  const [dokumen, setDokumen] = useState("");

  const muat = useCallback(async (signal?: AbortSignal) => {
    if (!proyekId) return;
    setMemuat(true); setGalat(null);
    try {
      const [d, p] = await Promise.all([
        api.get<{ baseline: Baseline[] }>(`/api/v1/proyek/${proyekId}/baseline`, { signal }),
        api.get<{ baseline: Baseline | null; pergeseran: Geser[]; ringkas: Ringkas | null; alasan?: string }>(
          `/api/v1/proyek/${proyekId}/baseline/pergeseran`, { signal }),
      ]);
      setDaftar(d.data.baseline ?? []);
      setAktif(p.data.baseline);
      setGeser(p.data.pergeseran ?? []);
      setRingkas(p.data.ringkas);
      setAlasanKosong(p.data.alasan ?? null);
    } catch (e) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat baseline");
    } finally { setMemuat(false); }
  }, [proyekId]);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const tetapkan = useCallback(async () => {
    setMenyimpan(true); setGalat(null);
    try {
      await api.post(`/api/v1/proyek/${proyekId}/baseline`, {
        nama: nama.trim(),
        alasan: alasan.trim(),
        dasar_dokumen: dokumen.trim() || null,
      });
      setNama(""); setAlasan(""); setDokumen("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menetapkan baseline");
    } finally { setMenyimpan(false); }
  }, [proyekId, nama, alasan, dokumen, muat]);

  const tampil = useMemo(() => geser.filter((g) => {
    if (saring === "mundur") return (g.geser_selesai_hari ?? 0) > 0;
    if (saring === "berubah") return g.hilang || g.baru || (g.geser_selesai_hari ?? 0) !== 0;
    return true;
  }).sort((a, bb) => (bb.geser_selesai_hari ?? 0) - (a.geser_selesai_hari ?? 0)),
  [geser, saring]);

  /** Hari mundur diwarnai; maju dan tepat waktu TIDAK. */
  const hari = (n: number | null) => {
    if (n === null) return <span style={{ color: C.muted, fontSize: 12.5 }}>—</span>;
    if (n === 0) return <span style={{ color: C.mid, fontSize: 12.5 }}>tepat</span>;
    return (
      <span style={{
        fontSize: 12.5, fontWeight: 600,
        color: n > 0 ? "var(--danger)" : "var(--success)",
      }}>
        {n > 0 ? `+${n}` : n} hari
      </span>
    );
  };

  const kolom: Array<Kolom<Geser>> = [
    {
      kunci: "uraian", judul: "Pekerjaan", kepalaBaris: true,
      render: (g) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>
            {g.uraian ?? "(tanpa nama)"}
          </strong>
          {(g.hilang || g.baru) && (
            <span style={{ display: "block", marginTop: 2 }}>
              <Lencana nada={g.hilang ? "peringatan" : "info"}>
                {g.hilang ? "tak ada lagi di RAB" : "baru sesudah baseline"}
              </Lencana>
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "bobot", judul: "Bobot", rata: "kanan",
      render: (g) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>
          {g.bobot ? `${g.bobot.toLocaleString("id-ID")}%` : "—"}
        </span>
      ),
    },
    {
      kunci: "bl", judul: "Baseline (selesai)",
      render: (g) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>
          {g.baseline_end ? formatTanggal(g.baseline_end) : "—"}
        </span>
      ),
    },
    {
      kunci: "kini", judul: "Sekarang",
      render: (g) => (
        <span style={{ fontSize: 12.5, color: C.text }}>
          {g.sekarang_end ? formatTanggal(g.sekarang_end) : "—"}
        </span>
      ),
    },
    {
      kunci: "geser", judul: "Pergeseran", rata: "kanan",
      render: (g) => hari(g.geser_selesai_hari),
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<CalendarClock size={18} />}
        judul="Baseline Jadwal"
        keterangan={
          <>Rencana yang <strong>tidak ikut bergeser</strong>. Tanpanya, setiap
          penundaan yang dicatat di Gantt ikut memundurkan target — dan SPI
          kembali mendekati 1 meski proyek terlambat berbulan-bulan.</>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {/* ── SATU aksen: belum ada baseline (§3d) ──────────────────────────── */}
      {!memuat && !aktif && (
        <div role="alert" style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TriangleAlert size={15} aria-hidden="true" />
            Proyek ini belum punya baseline — keterlambatan tak bisa dibuktikan
          </strong>
          <span style={{ display: "block", fontSize: 12.5 }}>
            {alasanKosong ?? "Tetapkan baseline dari jadwal yang berlaku sekarang."}
          </span>
        </div>
      )}

      {ringkas && aktif && (
        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }}>
          <KartuAngka
            label="Mundur terparah"
            nilai={ringkas.mundur_terparah_hari === null ? "—" : `${ringkas.mundur_terparah_hari} hari`}
            sub={`${ringkas.mundur} dari ${ringkas.total_item} pekerjaan`}
          />
          <KartuAngka
            label="Rata-rata tertimbang"
            nilai={ringkas.geser_tertimbang_hari === null
              ? "—" : `${ringkas.geser_tertimbang_hari} hari`}
            // Kenapa tertimbang disebut: rata-rata biasa membuat satu item
            // besar tenggelam di antara seratus item kecil yang tepat waktu.
            sub="ditimbang bobot, bukan dirata-rata polos"
          />
          <KartuAngka
            label="Bobot yang mundur"
            nilai={`${ringkas.bobot_mundur_pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
            sub="porsi pekerjaan terdampak"
          />
          <KartuAngka
            label="Lingkup berubah"
            nilai={String(ringkas.hilang + ringkas.baru)}
            sub={`${ringkas.hilang} hilang · ${ringkas.baru} baru`}
          />
        </div>
      )}

      {aktif && (
        <Kartu pad="rapat">
          <JudulKartu
            sub={`ditetapkan ${formatTanggal(aktif.ditetapkan_pada)} · ${aktif.alasan}`}
            aksi={
              <div role="group" aria-label="Saring daftar pergeseran"
                style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  ["mundur", "Yang mundur"],
                  ["berubah", "Semua yang berubah"],
                  ["semua", `Semua (${geser.length})`],
                ] as Array<[Saring, string]>).map(([n, t]) => (
                  <button key={n} type="button" aria-pressed={saring === n}
                    onClick={() => setSaring(n)}
                    style={{
                      padding: "4px 10px", borderRadius: 999, fontSize: 11.5,
                      fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${saring === n ? "var(--aksen)" : C.border}`,
                      background: saring === n ? "var(--aksen)" : "transparent",
                      color: saring === n ? "var(--on-aksen)" : C.mid,
                    }}>{t}</button>
                ))}
              </div>
            }
          >
            Baseline #{aktif.nomor} — {aktif.nama}
          </JudulKartu>
          <Tabel
              berpermukaan            kolom={kolom}
            data={tampil}
            kunciBaris={(g) => g.rab_item_id}
            caption="Pergeseran jadwal tiap pekerjaan terhadap baseline yang berlaku"
            kosong={
              <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0 }}>
                {saring === "mundur"
                  ? "Tidak ada pekerjaan yang mundur dari baseline."
                  : "Tidak ada perubahan terhadap baseline."}
              </p>
            }
          />
        </Kartu>
      )}

      <Kartu pad="rapat">
        <JudulKartu sub="baseline lama TIDAK dihapus — ia tetap pembanding sah untuk periodenya">
          Tetapkan baseline baru
        </JudulKartu>
        <div style={{
          display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}>
          <div>
            <label htmlFor="bl-nama" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Nama
            </label>
            <input id="bl-nama" style={gayaInput} value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="mis. Kontrak awal" />
          </div>
          <div>
            <label htmlFor="bl-dok" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
              Dasar dokumen (opsional)
            </label>
            <input id="bl-dok" style={gayaInput} value={dokumen}
              onChange={(e) => setDokumen(e.target.value)}
              placeholder="mis. Adendum II / 2026" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label htmlFor="bl-alasan" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
            Alasan — minimal 10 huruf
          </label>
          <input id="bl-alasan" style={gayaInput} value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="mis. perpanjangan waktu disetujui karena perubahan lingkup lantai 3" />
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>
            Ini yang dicari saat klaim keterlambatan dibahas — &quot;kenapa
            jadwalnya berubah?&quot; harus punya jawaban tertulis.
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Tombol jenis="utama" ikon={<Plus size={13} aria-hidden="true" />}
            disabled={menyimpan || !nama.trim() || alasan.trim().length < 10}
            onClick={() => void tetapkan()}>
            {menyimpan ? "Menetapkan…" : "Tetapkan baseline"}
          </Tombol>
        </div>
      </Kartu>

      {memuat ? (
        <Rangka tinggi={52} jumlah={2} />
      ) : daftar.length > 0 && (
        <Kartu pad="rapat">
          <JudulKartu sub="terbaru di atas">Riwayat baseline</JudulKartu>
          <Tabel
            kolom={[
              {
                kunci: "nomor", judul: "Baseline", kepalaBaris: true,
                render: (b: Baseline) => (
                  <span style={{ display: "block" }}>
                    <strong style={{ fontSize: 12.5, color: C.text }}>
                      #{b.nomor} — {b.nama}
                    </strong>
                    <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1, maxWidth: "48ch", lineHeight: 1.45 }}>
                      {b.alasan}
                    </span>
                  </span>
                ),
              },
              {
                kunci: "dok", judul: "Dasar",
                render: (b: Baseline) => (
                  <span style={{ fontSize: 11.5, color: C.mid }}>{b.dasar_dokumen ?? "—"}</span>
                ),
              },
              {
                kunci: "tgl", judul: "Ditetapkan",
                render: (b: Baseline) => (
                  <span style={{ fontSize: 12.5, color: C.mid }}>
                    {formatTanggal(b.ditetapkan_pada)}
                  </span>
                ),
              },
              {
                kunci: "aktif", judul: "",
                render: (b: Baseline) => (
                  b.aktif
                    ? <Lencana nada="sukses">Dipakai menghitung SPI</Lencana>
                    : <span style={{ fontSize: 11.5, color: C.muted }}>riwayat</span>
                ),
              },
            ]}
            data={daftar}
            kunciBaris={(b) => b.id}
            caption="Riwayat baseline jadwal beserta alasan penetapannya"
          />
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Baseline <strong>tidak bisa disunting</strong> — ditegakkan basis,
          bukan layar ini. Pembanding yang bisa diubah bukan pembanding: kalau
          angkanya boleh dirapikan belakangan, laporan keterlambatan berhenti
          membuktikan apa pun.
        </span>
      </p>
    </Halaman>
  );
}
