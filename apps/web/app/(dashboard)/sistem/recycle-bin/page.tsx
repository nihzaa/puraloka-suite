"use client";

/**
 * RECYCLE BIN — memulihkan yang terhapus (TJS-P1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAYAR YANG JUJUR TENTANG BATASNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: dari 34 endpoint DELETE di seluruh API, **satu** tabel
 * yang punya soft delete (`projects`). Tiga puluh tiga penghapusan lain
 * bersifat permanen dan tak meninggalkan apa pun untuk dipulihkan.
 *
 * Layar ini tidak menyembunyikan itu. Daftar jenisnya pendek karena memang
 * pendek — dan yang membacanya berhak tahu bahwa "tak ada di sini" berarti
 * "tak bisa dipulihkan", bukan "belum pernah ada yang dihapus".
 *
 * ── Kenapa tombol pulih bisa tak ada meski itemnya terlihat
 *
 * Izin MELIHAT dan MEMULIHKAN dipisah. Memulihkan proyek mengembalikan
 * seluruh RAB, invoice, dan jadwal yang menggantung padanya — keputusan yang
 * lebih besar daripada membaca daftar.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya peringatan tentang batas modul. Daftarnya sendiri
 * tenang: item yang sudah lama ditandai lencana, bukan latar merah — daftar
 * yang seluruhnya berteriak tak menunjukkan apa pun.
 */

import { useCallback, useEffect, useState } from "react";
import { Trash2, Info, Undo2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { formatTanggalJam } from "@/lib/format";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, type Kolom,
} from "@/components/dasar";

interface Jenis { kunci: string; label: string; bisa_pulihkan: boolean }

interface Item {
  id: string;
  nama: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  umur_hari: number | null;
}

export default function RecycleBinPage() {
  const [aktif, setAktif] = useState<string>("");
  const [kabar, setKabar] = useState<string | null>(null);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kerja, setKerja] = useState<string | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua tingkat: daftar jenis dulu, lalu isi jenis aktif — pola
    `useData(kondisi ? url : null)`, sama seperti `jadwal`. Galat MUAT
    (kedua tingkat) dan galat AKSI (`pulihkan`) dipisah: satu state untuk
    keduanya membuat "gagal memulihkan" menghapus pesan "gagal memuat".
  */
  const { data: dataJenis, memuat: memuatJenis, galat: galatJenis } =
    useData<{ jenis: Jenis[]; ambang_lama_hari: number }>("/api/v1/recycle-bin");
  const jenis = dataJenis?.jenis ?? [];
  const ambangLama = dataJenis?.ambang_lama_hari ?? 30;

  const { data: dataIsi, memuat: memuatIsi, galat: galatIsi, muatUlang: muatUlangIsi } =
    useData<{ item: Item[]; bisa_pulihkan: boolean }>(aktif ? `/api/v1/recycle-bin/${aktif}` : null);
  const item = dataIsi?.item ?? [];
  const bisaPulih = dataIsi?.bisa_pulihkan ?? false;

  const memuat = memuatJenis || memuatIsi;
  const galat = galatAksi ?? (galatJenis
    ? "Gagal memuat recycle bin"
    : galatIsi ? "Gagal memuat isi recycle bin" : null);

  // Jenis pertama dibuka otomatis: daftar dengan satu pilihan yang harus
  // diklik dulu adalah langkah tambahan tanpa guna. Dipindah ke efek
  // tersendiri bergantung `data` saja, bukan dilakukan di badan render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (jenis.length > 0 && !aktif) setAktif(jenis[0].kunci);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataJenis]);

  const muatIsi = useCallback(async (kunci: string) => {
    if (kunci === aktif) { await muatUlangIsi(); return; }
    setAktif(kunci);
  }, [aktif, muatUlangIsi]);

  const pulihkan = useCallback(async (it: Item) => {
    setKerja(it.id); setGalatAksi(null); setKabar(null);
    try {
      await api.post(`/api/v1/recycle-bin/${aktif}/${it.id}/pulihkan`, {});
      setKabar(`"${it.nama ?? it.id}" dipulihkan.`);
      await muatUlangIsi();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal memulihkan");
    } finally { setKerja(null); }
  }, [aktif, muatUlangIsi]);

  const kolom: Array<Kolom<Item>> = [
    {
      kunci: "nama", judul: "Nama", kepalaBaris: true,
      render: (it) => (
        <strong style={{ fontSize: 12.5, color: C.text }}>
          {it.nama ?? <span style={{ color: C.muted }}>(tanpa nama)</span>}
        </strong>
      ),
    },
    {
      kunci: "dihapus", judul: "Dihapus",
      render: (it) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>
          {it.deleted_at ? formatTanggalJam(it.deleted_at) : "—"}
        </span>
      ),
    },
    {
      kunci: "umur", judul: "Umur", rata: "kanan",
      render: (it) => {
        if (it.umur_hari === null) return <span style={{ color: C.muted }}>—</span>;
        const lama = it.umur_hari >= ambangLama;
        return lama
          ? <Lencana nada="peringatan">{it.umur_hari} hari</Lencana>
          : (
            <span style={{ fontSize: 12.5, color: C.mid }}>
              {it.umur_hari === 0 ? "hari ini" : `${it.umur_hari} hari`}
            </span>
          );
      },
    },
    {
      kunci: "aksi", judul: "",
      render: (it) => (
        bisaPulih
          ? (
            <Tombol kecil jenis="sekunder" ikon={<Undo2 size={12} aria-hidden="true" />}
              disabled={kerja === it.id}
              onClick={() => void pulihkan(it)}>
              {kerja === it.id ? "Memulihkan…" : "Pulihkan"}
            </Tombol>
          )
          : <span style={{ fontSize: 11.5, color: C.muted }}>tak berhak</span>
      ),
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Trash2 size={18} />}
        judul="Recycle Bin"
        keterangan={
          <>Data yang dihapus dan <strong>masih bisa dikembalikan</strong>.
          Jejak siapa yang menghapus tetap tersimpan meski datanya dipulihkan —
          ia satu-satunya keterangan saat orang bertanya kenapa sesuatu sempat
          hilang.</>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muatIsi(aktif)} />}

      {kabar && (
        <div role="status" style={{
          padding: "11px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          border: "1px solid var(--success-border)", background: "var(--success-bg)",
          color: "var(--success)",
        }}>{kabar}</div>
      )}

      {/* ── SATU aksen: batas modul (§3d) ─────────────────────────────────── */}
      <div role="note" style={{
        padding: "12px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
        border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
        color: "var(--warning-teks)",
      }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <TriangleAlert size={14} aria-hidden="true" />
          Yang bisa dipulihkan hanya jenis di bawah
        </strong>
        Sebagian besar penghapusan di aplikasi ini <strong>permanen</strong> dan
        tak meninggalkan apa pun untuk dikembalikan. Kalau sebuah jenis tidak
        ada di sini, itu berarti tak bisa dipulihkan — bukan berarti belum
        pernah ada yang dihapus.
      </div>

      {memuat && jenis.length === 0 ? (
        <Rangka tinggi={56} jumlah={2} />
      ) : jenis.length === 0 ? (
        <Kartu pad="rapat">
          <p style={{ fontSize: 13, color: C.mid, margin: 0, lineHeight: 1.6 }}>
            Tidak ada jenis data yang bisa Anda lihat di recycle bin. Tiap jenis
            punya izinnya sendiri, dan daftar ini mengikuti izin itu.
          </p>
        </Kartu>
      ) : (
        <Kartu pad="rapat">
          <JudulKartu
            sub={`ditandai "lama" setelah ${ambangLama} hari — tidak dihapus otomatis`}
            aksi={
              jenis.length > 1 && (
                <div role="group" aria-label="Pilih jenis data"
                  style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {jenis.map((j) => (
                    <button key={j.kunci} type="button"
                      aria-pressed={aktif === j.kunci}
                      onClick={() => setAktif(j.kunci)}
                      style={{
                        padding: "4px 10px", borderRadius: 999, fontSize: 11.5,
                        fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${aktif === j.kunci ? "var(--aksen)" : C.border}`,
                        background: aktif === j.kunci ? "var(--aksen)" : "transparent",
                        color: aktif === j.kunci ? "var(--on-aksen)" : C.mid,
                      }}>{j.label}</button>
                  ))}
                </div>
              )
            }
          >
            {jenis.find((j) => j.kunci === aktif)?.label ?? "Isi"}
          </JudulKartu>

          {memuat ? (
            <Rangka tinggi={48} jumlah={3} />
          ) : (
            <Tabel
              berpermukaan              kolom={kolom}
              data={item}
              kunciBaris={(it) => it.id}
              caption="Data terhapus yang masih bisa dipulihkan"
              kosong={
                <p style={{ padding: "24px 4px", fontSize: 13, color: C.mid, margin: 0 }}>
                  Tidak ada yang terhapus di sini.
                </p>
              }
            />
          )}
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          <strong>Tidak ada penghapusan otomatis.</strong> Item yang sudah lama
          hanya ditandai, tak pernah dibuang sendiri — data yang hilang karena
          waktu berlalu biasanya baru disadari saat dicari, dan saat itu sudah
          terlambat.
        </span>
      </p>
    </Halaman>
  );
}
