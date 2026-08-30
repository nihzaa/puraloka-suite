"use client";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ISIAN BEBAN — dipilih dari SNI & katalog material, bukan diketik
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Sebelum ini `bebanHidupKnM2` adalah kotak angka bebas, dan estimator
 * mengetik 2,5 karena "biasanya segitu". SNI 1727:2020 Tabel 4.3-1 sudah
 * menetapkannya per fungsi ruang, dan selisihnya besar:
 *
 *     hunian 1,92 · kantor 2,40 · ruang rapat 4,79 · rak perpustakaan 7,18
 *
 * Angka yang diketik dari ingatan tak punya "rasa salah": 2,5 untuk ruang
 * rapat terlihat wajar, dan baloknya LOLOS pemeriksaan dengan beban separuh
 * dari seharusnya. Tak ada galat — sampai lantainya dipakai rapat.
 *
 * ── Yang TIDAK diminta ke pengguna
 *
 * Berat sendiri balok dan berat pelat TIDAK ada di sini: keduanya dihitung
 * server dari `b × h × 24` dan `tebal × 24 × lebar pikul`. Memintanya lagi
 * berarti terhitung DUA KALI — dan dua kali beban mati menghasilkan balok
 * jauh lebih besar dari perlu, tanpa satu pun galat.
 *
 * Yang diminta hanya yang MEMANG tak bisa diturunkan dari geometri: lapisan
 * finishing (bergantung pilihan material) dan fungsi ruang (bergantung
 * peruntukan).
 *
 * ── Katalognya datang dari SERVER, tak dipaku di sini
 *
 * Daftar yang dipaku di dua tempat akan menyimpang, dan menyimpangnya tak
 * terlihat: layar menawarkan 4,79 sementara server menghitung 4,50, dan
 * keduanya "angka beban yang wajar".
 */

import { useMemo } from "react";
import { Weight, Info } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { PilihanKartu } from "@/components/pilihan-kartu";
import { Isian, PilihanIsian, KotakIsian } from "@/components/isian";

interface FungsiRuang {
  kunci: string;
  nama: string;
  bebanHidupKnM2: number;
  kelompok: string;
  catatan?: string;
}
interface LapisMati {
  kunci: string;
  nama: string;
  knM2: number;
  kelompok: string;
  catatan?: string;
}
interface JenisDinding {
  kunci: string;
  nama: string;
  knM2: number;
  catatan?: string;
}
interface Katalog {
  fungsiRuang: FungsiRuang[];
  lapisMati: LapisMati[];
  jenisDinding: JenisDinding[];
  acuan: string;
}

export interface NilaiBeban {
  fungsiRuangKunci?: string;
  lapisMati?: string[];
  jenisDinding?: string;
  tinggiDindingM?: number;
  /* Khusus KOLOM — beban aksial menumpuk dari lantai di atasnya. */
  luasTributariM2?: number;
  jumlahLantai?: number;
  tinggiLantaiM?: number;
}

export function IsianBeban({
  nilai, onUbah, nonaktif = false, mode = "balok",
}: {
  nilai: NilaiBeban;
  onUbah: (baru: NilaiBeban) => void;
  nonaktif?: boolean;
  /*
    Balok memikul beban LUASAN sepanjang bentangnya; kolom memikul beban
    TITIK yang menumpuk dari tiap lantai. Medannya karena itu berbeda —
    menyatukannya berarti menampilkan isian yang tak dipakai, dan isian yang
    tak dipakai tetap diisi orang.
  */
  mode?: "balok" | "kolom";
}) {
  const { data, galat } = useData<Katalog>("/api/v1/struktur/katalog-beban");

  /* Dikelompokkan supaya 24 fungsi tak jadi daftar rata yang dipilih asal. */
  const perKelompok = useMemo(() => {
    const p = new Map<string, FungsiRuang[]>();
    for (const f of data?.fungsiRuang ?? []) {
      if (!p.has(f.kelompok)) p.set(f.kelompok, []);
      p.get(f.kelompok)!.push(f);
    }
    return [...p.entries()];
  }, [data]);

  const lapisPerKelompok = useMemo(() => {
    const p = new Map<string, LapisMati[]>();
    for (const l of data?.lapisMati ?? []) {
      if (!p.has(l.kelompok)) p.set(l.kelompok, []);
      p.get(l.kelompok)!.push(l);
    }
    return [...p.entries()];
  }, [data]);

  /*
    Dibungkus useMemo — DIPERBAIKI 2026-08-31, bukan dibungkam.

    `?? []` membuat array BARU tiap render, jadi `useMemo` di bawah menerima
    dependensi yang selalu berbeda dan TAK PERNAH menahan hasilnya. Perhitungan
    di dalamnya berjalan ulang pada setiap render, termasuk render yang tak ada
    hubungannya dengan data ini.

    Jadi peringatan `exhaustive-deps` di sini menunjuk pemborosan yang nyata,
    bukan sekadar kerewelan aturan. Membungkus sumbernya membuat rujukannya
    stabil selama datanya sama, dan `useMemo` di bawah kembali bekerja.

    Perilakunya tidak berubah: nilai yang dihasilkan sama persis.
  */
  const terpilih = useMemo(() => nilai.lapisMati ?? [], [nilai.lapisMati]);
  const fungsi = (data?.fungsiRuang ?? []).find((f) => f.kunci === nilai.fungsiRuangKunci);

  /* Jumlah beban mati yang DIPILIH — supaya angkanya terlihat sebelum dihitung. */
  const totalMati = useMemo(
    () => (data?.lapisMati ?? [])
      .filter((l) => terpilih.includes(l.kunci))
      .reduce((a, l) => a + l.knM2, 0),
    [data, terpilih],
  );

  if (galat) {
    return (
      <div role="alert" style={{
        fontSize: "var(--teks-delta)", color: C.onDangerBg, background: C.dangerBg,
        border: `1px solid ${C.dangerBorder}`, borderRadius: "var(--radius-dense)",
        padding: "var(--pad-kartu)",
      }}>
        Katalog beban gagal dimuat — isi beban hidup dan beban mati secara manual
        di editor JSON. Ini BUKAN berarti bebannya nol.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <strong style={{
        display: "flex", gap: 6, alignItems: "center",
        fontSize: "var(--teks-label)", color: C.text,
      }}>
        <Weight size={14} aria-hidden="true" /> Beban (opsional)
      </strong>

      <p style={{ margin: 0, fontSize: "var(--teks-delta)", color: C.mid }}>
        {mode === "kolom"
          ? "Bila diisi, beban aksial Pu DIHITUNG dari lantai yang dipikul kolom ini "
            + "— termasuk berat sendiri kolom, dan dengan reduksi beban hidup SNI "
            + "1727 §4.7. Momen kolom tetap diketik: ia lahir dari kekakuan portal, "
            + "bukan dari beban lantai."
          : "Bila diisi, momen dan gaya lintang DIHITUNG dari beban — tak perlu "
            + "mengetik Mu/Vu sendiri. Berat sendiri balok dan pelat sudah dihitung "
            + "otomatis dari ukurannya, jadi tak perlu dimasukkan lagi di sini."}
      </p>

      {mode === "kolom" && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <Isian id="beban-tributari" label="Luas dipikul per lantai (m²)"
            bantuan="Kira-kira ¼ luas antar-4 kolom di sekitarnya.">
            <KotakIsian id="beban-tributari" type="number" step="any"
              value={nilai.luasTributariM2 ?? ""} disabled={nonaktif}
              onChange={(e) => onUbah({ ...nilai,
                luasTributariM2: e.target.value === "" ? undefined : Number(e.target.value) })}
              style={{ width: "100%" }} />
          </Isian>
          <Isian id="beban-lantai" label="Jumlah lantai dipikul"
            bantuan="Termasuk atap. Kolom lantai dasar memikul semuanya.">
            <KotakIsian id="beban-lantai" type="number" step="1"
              value={nilai.jumlahLantai ?? ""} disabled={nonaktif}
              onChange={(e) => onUbah({ ...nilai,
                jumlahLantai: e.target.value === "" ? undefined : Number(e.target.value) })}
              style={{ width: "100%" }} />
          </Isian>
          <Isian id="beban-tinggi-lantai" label="Tinggi antar-lantai (m)">
            <KotakIsian id="beban-tinggi-lantai" type="number" step="any"
              value={nilai.tinggiLantaiM ?? ""} disabled={nonaktif}
              onChange={(e) => onUbah({ ...nilai,
                tinggiLantaiM: e.target.value === "" ? undefined : Number(e.target.value) })}
              style={{ width: "100%" }} />
          </Isian>
        </div>
      )}

      {/* ── Beban hidup: fungsi ruang ─────────────────────────────────── */}
      <Isian
        id="beban-fungsi"
        label="Fungsi ruang (menentukan beban hidup)"
        bantuan={fungsi
          ? `${fungsi.bebanHidupKnM2} kN/m² — SNI 1727:2020 Tabel 4.3-1${
            fungsi.catatan ? `. ${fungsi.catatan}` : ""}`
          : "Pilih fungsi ruangnya; angkanya diambil dari tabel SNI."}
      >
        <PilihanIsian
          id="beban-fungsi"
          value={nilai.fungsiRuangKunci ?? ""}
          disabled={nonaktif}
          onChange={(e) => onUbah({ ...nilai, fungsiRuangKunci: e.target.value || undefined })}
          style={{ width: "100%" }}
        >
          <option value="">— tidak dihitung dari beban —</option>
          {perKelompok.map(([kelompok, daftar]) => (
            <optgroup key={kelompok} label={kelompok}>
              {daftar.map((f) => (
                <option key={f.kunci} value={f.kunci}>
                  {f.nama} — {f.bebanHidupKnM2} kN/m²
                </option>
              ))}
            </optgroup>
          ))}
        </PilihanIsian>
      </Isian>

      {/* ── Beban mati: lapisan finishing ─────────────────────────────── */}
      <fieldset style={{
        border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
        padding: "var(--pad-kartu)", margin: 0,
      }}>
        <legend style={{ fontSize: "var(--teks-delta)", color: C.mid, padding: "0 6px" }}>
          Lapisan di atas pelat {totalMati > 0 && `— ${totalMati.toFixed(2)} kN/m²`}
        </legend>

        <div style={{ display: "grid", gap: 10 }}>
          {lapisPerKelompok.map(([kelompok, daftar]) => (
            <div key={kelompok}>

              {/*
                `<PilihanKartu ganda>`, bukan `<input type="checkbox">` mentah.

                Checkbox bawaan peramban berukuran ~13px — jauh di bawah 44px
                (WCAG 2.5.5), dan di sini daftarnya panjang serta berjarak 4px,
                jadi salah-sentuh berarti lapis beban yang keliru ikut terhitung
                ke struktur. `PilihanKartu` membuat SELURUH kartu jadi sasaran
                sentuh, dan keterpilihannya terbaca pembaca layar.

                Angka beban (kN/m²) masuk `ringkas` supaya terbaca sebagai
                keterangan opsi, bukan menempel di judulnya.
              */}
              <PilihanKartu
                nama={`lapis-mati-${kelompok}`}
                /*
                  Nama kelompok jadi `label` komponen, bukan `<div>` lepas di
                  atasnya. `<div>` hanya terlihat MATA; sebagai label ia terbaca
                  pembaca layar sebagai judul kelompok pilihannya — pengguna tahu
                  "Lantai" dan "Atap" itu dua daftar berbeda, bukan satu daftar
                  panjang.
                */
                label={kelompok}
                ganda
                nonaktif={nonaktif}
                nilai={terpilih}
                onUbah={(k) => {
                  const baru = terpilih.includes(k)
                    ? terpilih.filter((x) => x !== k)
                    : [...terpilih, k];
                  onUbah({ ...nilai, lapisMati: baru });
                }}
                opsi={daftar.map((l) => ({
                  nilai: l.kunci,
                  label: l.nama,
                  ringkas: `${l.knM2} kN/m²`,
                  detail: l.catatan,
                }))}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {/*
        Dinding hanya untuk BALOK: ia beban GARIS di atas baloknya. Beban
        dinding pada kolom sampai lewat balok, jadi menghitungnya lagi di
        sini akan menghitungnya dua kali.
      */}
      {mode === "balok" && (<>
      {/* ── Dinding di atas balok ─────────────────────────────────────── */}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
        <Isian id="beban-dinding" label="Dinding di atas balok">
          <PilihanIsian
            id="beban-dinding"
            value={nilai.jenisDinding ?? ""}
            disabled={nonaktif}
            onChange={(e) => onUbah({ ...nilai, jenisDinding: e.target.value || undefined })}
            style={{ width: "100%" }}
          >
            <option value="">— tidak ada dinding —</option>
            {(data?.jenisDinding ?? []).map((d) => (
              <option key={d.kunci} value={d.kunci}>
                {d.nama} — {d.knM2} kN/m²
              </option>
            ))}
          </PilihanIsian>
        </Isian>
        <Isian id="beban-tinggi-dinding" label="Tinggi dinding (m)">
          <KotakIsian
            id="beban-tinggi-dinding"
            type="number"
            step="any"
            value={nilai.tinggiDindingM ?? ""}
            disabled={nonaktif || !nilai.jenisDinding}
            onChange={(e) => onUbah({
              ...nilai,
              tinggiDindingM: e.target.value === "" ? undefined : Number(e.target.value),
            })}
            style={{ width: "100%" }}
          />
        </Isian>
      </div>

      </>)}

      <p style={{
        margin: 0, display: "flex", gap: 6, alignItems: "flex-start",
        fontSize: "var(--teks-delta)", color: C.mid,
      }}>
        <Info size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          {data?.acuan ?? "Beban hidup mengikuti SNI 1727:2020 Tabel 4.3-1."}
        </span>
      </p>
    </div>
  );
}
