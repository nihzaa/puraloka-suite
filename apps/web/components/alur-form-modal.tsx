"use client";

/**
 * FORMULIR ALUR OTOMASI — mendaftarkan / mengubah satu alur dari UI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIBUAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder: "bahkan bisa punya workflow yang bisa dibuat di ui". Sampai S7,
 * katalog hanya bisa diisi lewat `POST /api/v1/otomasi/alur` — rutenya sudah
 * ada dan bergerbang izin, tetapi tak ada satu pun layar yang memanggilnya.
 * Endpoint tanpa layar adalah fitur yang hanya bisa dipakai orang yang bisa
 * mengetik curl, dan itu bukan siapa pun yang menjalankan perusahaan ini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIPILIH DARI DAFTAR, BUKAN DIKETIK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `n8n_id` diisi lewat DAFTAR workflow yang benar-benar ada di n8n
 * (`GET /api/v1/otomasi/n8n/workflow`), bukan kotak teks bebas. Alasannya
 * sama dengan chip variabel di template WhatsApp: id yang diketik ulang
 * adalah cara utama salah ketik masuk, dan alur ber-id salah TIDAK
 * menghasilkan galat — ia hanya diam selamanya, karena yang dipanggil memang
 * tak pernah ada.
 *
 * Kalau n8n belum tersambung, daftarnya kosong dan kotaknya tetap bisa diisi
 * manual — mendaftarkan alur sebelum membuatnya di n8n adalah urutan kerja
 * yang sah, dan memaksanya terbalik hanya memindahkan pekerjaan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KODE TAK BISA DIUBAH SESUDAH TERSIMPAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `kode` adalah yang dipakai memanggil dan mencatat jejak. Mengubahnya
 * memutus seluruh jejak jalan dari induknya — dan yang terputus tak
 * mengumumkan dirinya terputus, ia hanya jadi riwayat yang tiba-tiba kosong.
 * Saat mengubah, kotaknya dikunci dan alasannya dinyatakan.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { DialogBersama } from "@/components/dialog-bersama";
import { Tombol } from "@/components/dasar";
import { PilihanKartu } from "@/components/pilihan-kartu";

export interface AlurUntukForm {
  id?: string;
  kode?: string;
  nama?: string;
  keterangan?: string | null;
  n8n_id?: string | null;
  jalur_webhook?: string | null;
  pemicu?: string;
  jadwal_cron?: string | null;
  kategori?: string;
  aktif?: boolean;
}

interface WorkflowN8n {
  id: string;
  name: string;
  active: boolean;
  terdaftar: boolean;
}

const POLA_KODE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

const PEMICU = [
  { nilai: "jadwal", label: "Terjadwal", ringkas: "Berjalan sendiri pada waktu tertentu." },
  { nilai: "webhook", label: "Otomatis", ringkas: "Dipicu peristiwa dari sistem ini." },
  { nilai: "manual", label: "Manual", ringkas: "Hanya jalan kalau tombolnya ditekan." },
];

const KATEGORI = ["umum", "keuangan", "proyek", "gudang", "mutu", "lapangan", "dokumen"];

/** `nama` → `kode` yang sah. Mengetik kode dua kali adalah pekerjaan mesin. */
function kodeDariNama(nama: string): string {
  return nama
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 4,
};
const isian: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`,
  borderRadius: 8, fontSize: 13, background: "var(--surface)", color: C.text,
  fontFamily: "inherit", boxSizing: "border-box",
};
const bantu: React.CSSProperties = {
  fontSize: 11.5, color: C.muted, margin: "4px 0 0", lineHeight: 1.5,
};

export function AlurFormModal({
  terbuka,
  awal,
  onTutup,
  onSimpan,
}: {
  terbuka: boolean;
  /** Diisi = mode UBAH; kosong = mode DAFTAR BARU. */
  awal?: AlurUntukForm | null;
  onTutup: () => void;
  onSimpan: () => void;
}) {
  const ubah = Boolean(awal?.id);

  const [nama, setNama] = useState("");
  const [kode, setKode] = useState("");
  const [kodeDisentuh, setKodeDisentuh] = useState(false);
  const [keterangan, setKeterangan] = useState("");
  const [pemicu, setPemicu] = useState("manual");
  const [cron, setCron] = useState("");
  const [webhook, setWebhook] = useState("");
  const [n8nId, setN8nId] = useState("");
  const [kategori, setKategori] = useState("umum");
  const [aktif, setAktif] = useState(true);

  const [katalogN8n, setKatalogN8n] = useState<WorkflowN8n[] | null>(null);
  const [sedang, setSedang] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Muat ulang tiap dialog dibuka — bukan sekali di mount. Dialog yang
  // menyimpan sisa isian sebelumnya membuat orang mendaftarkan alur dengan
  // nilai yang tak pernah ia ketik.
  useEffect(() => {
    if (!terbuka) return;
    setNama(awal?.nama ?? "");
    setKode(awal?.kode ?? "");
    setKodeDisentuh(Boolean(awal?.kode));
    setKeterangan(awal?.keterangan ?? "");
    setPemicu(awal?.pemicu ?? "manual");
    setCron(awal?.jadwal_cron ?? "");
    setWebhook(awal?.jalur_webhook ?? "");
    setN8nId(awal?.n8n_id ?? "");
    setKategori(awal?.kategori ?? "umum");
    // Alur baru lahir AKTIF; yang diubah memakai nilainya sendiri.
    setAktif(awal?.aktif ?? true);
    setGalat(null);

    api
      .get<{ data: WorkflowN8n[] }>("/api/v1/otomasi/n8n/workflow")
      .then((r) => setKatalogN8n(r.data.data ?? []))
      // n8n mati BUKAN galat formulir. Daftarnya jadi kosong, kotak id tetap
      // bisa diisi manual, dan itu dinyatakan di bawah kotaknya.
      .catch(() => setKatalogN8n([]));
  }, [terbuka, awal]);

  const kodeEfektif = kodeDisentuh ? kode : kodeDariNama(nama);
  const kodeSah = POLA_KODE.test(kodeEfektif);
  const bisaSimpan = nama.trim().length > 0 && (ubah || kodeSah) && !sedang;

  async function simpan() {
    setSedang(true);
    setGalat(null);
    try {
      await api.post("/api/v1/otomasi/alur", {
        ...(ubah ? { id: awal!.id } : { kode: kodeEfektif }),
        nama: nama.trim(),
        keterangan: keterangan.trim() || undefined,
        pemicu,
        jadwal_cron: pemicu === "jadwal" ? cron.trim() || undefined : undefined,
        jalur_webhook: pemicu === "webhook" ? webhook.trim() || undefined : undefined,
        n8n_id: n8nId.trim() || undefined,
        kategori,
        // Hanya dikirim saat MENGUBAH. Alur baru selalu lahir aktif, dan
        // mengirim `aktif` untuk pendaftaran akan menimpa bawaan basis
        // dengan nilai yang belum pernah dilihat siapa pun di layar.
        ...(ubah ? { aktif } : {}),
      });
      onSimpan();
      onTutup();
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menyimpan alur",
      );
    } finally {
      setSedang(false);
    }
  }

  return (
    <DialogBersama
      terbuka={terbuka}
      onTutup={onTutup}
      judul={ubah ? `Ubah "${awal?.nama}"` : "Daftarkan alur otomasi"}
      keterangan={
        ubah
          ? "Kode tak bisa diubah — ia yang menautkan jejak jalan ke alur ini."
          : "Mendaftarkan alur di sini membuat statusnya terlihat tanpa membuka n8n."
      }
      lebar={560}
      kaki={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Tombol jenis="hantu" onClick={onTutup}>Batal</Tombol>
          <Tombol jenis="utama" onClick={simpan} disabled={!bisaSimpan}>
            {sedang ? "Menyimpan…" : ubah ? "Simpan perubahan" : "Daftarkan"}
          </Tombol>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={label} htmlFor="alur-nama">Nama alur</label>
          <input
            id="alur-nama"
            style={isian}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Pengingat invoice jatuh tempo"
          />
        </div>

        <div>
          <label style={label} htmlFor="alur-kode">Kode</label>
          <input
            id="alur-kode"
            style={{
              ...isian,
              fontFamily: "var(--font-mono, monospace)",
              ...(ubah && { background: "var(--surface-2)", color: C.muted }),
              ...(!ubah && kodeEfektif && !kodeSah && { borderColor: C.danger }),
            }}
            value={kodeEfektif}
            disabled={ubah}
            aria-invalid={!ubah && Boolean(kodeEfektif) && !kodeSah}
            onChange={(e) => { setKodeDisentuh(true); setKode(e.target.value); }}
            placeholder="pengingat-invoice-jatuh-tempo"
          />
          <p style={bantu}>
            {ubah ? (
              // Dinyatakan, bukan sekadar dikunci: kotak mati tanpa penjelasan
              // membuat orang mengira sistemnya rusak.
              <>Tak bisa diubah — mengubahnya memutus seluruh jejak jalan dari alur ini.</>
            ) : !kodeEfektif ? (
              <>Terisi otomatis dari nama. Huruf kecil, angka, dan strip.</>
            ) : kodeSah ? (
              <>Dipakai untuk memanggil dan mencatat jejak. Tak bisa diubah nanti.</>
            ) : (
              <span style={{ color: C.danger }}>
                Hanya huruf kecil, angka, dan strip (3–50 karakter).
              </span>
            )}
          </p>
        </div>

        <div>
          <label style={label} htmlFor="alur-ket">Keterangan</label>
          <textarea
            id="alur-ket"
            style={{ ...isian, resize: "vertical", lineHeight: 1.55 }}
            rows={2}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Apa yang dikerjakan alur ini, dan untuk siapa."
          />
        </div>

        {/* Kartu bersama (`PilihanKartu`), bukan radio buatan sendiri.
            Sebelum 2026-08-14 berkas ini punya bentuk radionya sendiri —
            salah satu dari LIMA bentuk berbeda di repo ini. */}
        <PilihanKartu
          nama="pemicu"
          label="Pemicu"
          opsi={PEMICU}
          nilai={pemicu}
          onUbah={setPemicu}
        />

        {/* Kotak yang hanya relevan untuk pemicu terpilih. Menampilkan
            semuanya sekaligus membuat orang mengisi kolom yang diabaikan
            sistem — dan yang diabaikan diam-diam tak pernah dipertanyakan. */}
        {pemicu === "jadwal" && (
          <div>
            <label style={label} htmlFor="alur-cron">Jadwal (cron)</label>
            <input
              id="alur-cron"
              style={{ ...isian, fontFamily: "var(--font-mono, monospace)" }}
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 8 * * 1-6"
            />
            <p style={bantu}>
              Menit jam tanggal bulan hari. <code>0 8 * * 1-6</code> = tiap Senin–Sabtu
              pukul 08:00. Daftar alur membacakannya jadi kalimat.
            </p>
          </div>
        )}

        {pemicu === "webhook" && (
          <div>
            <label style={label} htmlFor="alur-webhook">Jalur webhook</label>
            <input
              id="alur-webhook"
              style={{ ...isian, fontFamily: "var(--font-mono, monospace)" }}
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="puraloka/invoice-jatuh-tempo"
            />
            <p style={bantu}>
              Sesuai path node Webhook di n8n, tanpa <code>/webhook/</code> di depan.
            </p>
          </div>
        )}

        <div>
          <label style={label} htmlFor="alur-n8n">Workflow di n8n</label>
          {katalogN8n === null ? (
            <p style={bantu}>Memuat daftar dari n8n…</p>
          ) : katalogN8n.length > 0 ? (
            <>
              <select
                id="alur-n8n"
                style={isian}
                value={n8nId}
                onChange={(e) => setN8nId(e.target.value)}
              >
                <option value="">— belum tersambung —</option>
                {katalogN8n.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.active ? "" : " (nonaktif di n8n)"}
                    {w.terdaftar && w.id !== awal?.n8n_id ? " — sudah dipakai alur lain" : ""}
                  </option>
                ))}
              </select>
              <p style={bantu}>
                Dipilih dari daftar, bukan diketik: id yang salah ketik tak menghasilkan
                galat — alurnya hanya diam selamanya.
              </p>
            </>
          ) : (
            <>
              <input
                id="alur-n8n"
                style={{ ...isian, fontFamily: "var(--font-mono, monospace)" }}
                value={n8nId}
                onChange={(e) => setN8nId(e.target.value)}
                placeholder="kosongkan kalau belum dibuat di n8n"
              />
              <p style={bantu}>
                n8n belum tersambung, jadi daftarnya tak bisa diambil. Boleh dikosongkan —
                alur akan ditandai <strong>belum tersambung</strong> sampai id-nya diisi.
              </p>
            </>
          )}
        </div>

        <div>
          <label style={label} htmlFor="alur-kategori">Kategori</label>
          <select
            id="alur-kategori"
            style={isian}
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
          >
            {KATEGORI.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        {/*
          Saklar AKTIF — hanya saat mengubah.

          API menerima `aktif` sejak awal (`otomasi-alur.ts`), tetapi tak ada
          satu pun kendali di layar yang mengirimnya. Akibatnya alur yang
          sudah tak dipakai TIDAK BISA dimatikan dari UI sama sekali — satu-
          satunya jalan lewat SQL langsung.

          Tidak ditampilkan saat mendaftar baru: alur yang lahir nonaktif
          adalah pekerjaan yang langsung terlupakan, dan kotaknya cuma
          menambah keputusan yang tak perlu diambil saat itu.
        */}
        {ubah && (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${aktif ? C.border : C.danger}`,
              background: aktif ? "var(--surface)" : "var(--surface-2, var(--surface))",
            }}
          >
            <input
              type="checkbox"
              id="alur-aktif"
              checked={aktif}
              onChange={(e) => setAktif(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
            />
            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="alur-aktif"
                style={{ ...label, marginBottom: 2, cursor: "pointer" }}
              >
                {aktif ? "Aktif" : "Nonaktif"}
              </label>
              <p style={{ ...bantu, margin: 0 }}>
                {aktif
                  ? "Alur ini ikut dijalankan dan statusnya dipantau."
                  : "Alur ini TIDAK akan dijalankan. Riwayat jalannya tetap tersimpan."}
              </p>
            </div>
          </div>
        )}

        {galat && (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: C.danger, lineHeight: 1.5 }}>
            {galat}
          </p>
        )}
      </div>
    </DialogBersama>
  );
}
