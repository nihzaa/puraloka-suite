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
import { api, makeAbortController } from "@/lib/api";
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
  const [jenis, setJenis] = useState<Jenis[]>([]);
  const [ambangLama, setAmbangLama] = useState(30);
  const [aktif, setAktif] = useState<string>("");
  const [item, setItem] = useState<Item[]>([]);
  const [bisaPulih, setBisaPulih] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [kerja, setKerja] = useState<string | null>(null);

  const muatJenis = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<{ jenis: Jenis[]; ambang_lama_hari: number }>(
        "/api/v1/recycle-bin", { signal });
      setJenis(r.data.jenis ?? []);
      setAmbangLama(r.data.ambang_lama_hari);
      // Jenis pertama dibuka otomatis: daftar dengan satu pilihan yang harus
      // diklik dulu adalah langkah tambahan tanpa guna.
      if (r.data.jenis?.length && !aktif) setAktif(r.data.jenis[0].kunci);
    } catch (e) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat recycle bin");
    } finally { setMemuat(false); }
  }, [aktif]);

  const muatIsi = useCallback(async (kunci: string, signal?: AbortSignal) => {
    if (!kunci) return;
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<{ item: Item[]; bisa_pulihkan: boolean }>(
        `/api/v1/recycle-bin/${kunci}`, { signal });
      setItem(r.data.item ?? []);
      setBisaPulih(r.data.bisa_pulihkan);
    } catch (e) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat isi recycle bin");
      setItem([]);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muatJenis(ac.signal); });
    return () => ac.abort();
    // `muatJenis` sengaja tak masuk deps: ia bergantung `aktif`, dan
    // memasukkannya membuat daftar jenis dimuat ulang tiap kali tab berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aktif) return;
    const ac = makeAbortController();
    queueMicrotask(() => { void muatIsi(aktif, ac.signal); });
    return () => ac.abort();
  }, [aktif, muatIsi]);

  const pulihkan = useCallback(async (it: Item) => {
    setKerja(it.id); setGalat(null); setKabar(null);
    try {
      await api.post(`/api/v1/recycle-bin/${aktif}/${it.id}/pulihkan`, {});
      setKabar(`"${it.nama ?? it.id}" dipulihkan.`);
      await muatIsi(aktif);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memulihkan");
    } finally { setKerja(null); }
  }, [aktif, muatIsi]);

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
              kolom={kolom}
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
