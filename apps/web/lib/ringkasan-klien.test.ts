import { describe, it, expect } from "vitest";
import {
  identitasPajakTerisi, klienTakLengkap, medanKurang, ringkasKlien,
  type KlienRingkas,
} from "./ringkasan-klien";

const klien = (p: Partial<KlienRingkas> = {}): KlienRingkas => ({
  id: "k1", contact_person: "Budi", company_name: null,
  phone: "08123456789", email: "budi@contoh.id",
  npwp: null, id_number: "3204010101900001",
  client_type: "perorangan", is_active: true,
  ...p,
});

const perusahaan = (p: Partial<KlienRingkas> = {}): KlienRingkas => klien({
  client_type: "perusahaan", company_name: "PT Contoh",
  npwp: "01.234.567.8-901.000", id_number: null,
  ...p,
});

describe("identitasPajakTerisi — diperiksa menurut TIPE kliennya", () => {
  it("perusahaan dinilai dari NPWP, bukan NIK", () => {
    expect(identitasPajakTerisi(perusahaan({ npwp: "01.234.567.8-901.000" }))).toBe(true);
    expect(identitasPajakTerisi(perusahaan({ npwp: null }))).toBe(false);
  });

  it("perorangan dinilai dari NIK, bukan NPWP", () => {
    // Menuntut NPWP dari klien perorangan akan menandai hampir semuanya tak
    // lengkap — dan tuduhan yang selalu muncul akan diabaikan, termasuk saat
    // ia benar.
    expect(identitasPajakTerisi(klien({ id_number: "3204010101900001" }))).toBe(true);
    expect(
      identitasPajakTerisi(klien({ id_number: null, npwp: null })),
      "perorangan tanpa NIK dianggap lengkap",
    ).toBe(false);
  });

  it("perorangan tanpa NPWP tetap lengkap selama NIK-nya ada", () => {
    expect(identitasPajakTerisi(klien({ npwp: null, id_number: "320401" }))).toBe(true);
  });

  it("spasi belaka tidak dihitung terisi", () => {
    // Impor massal sering meninggalkan kolom berisi " " — yang lolos uji
    // `!= null` tapi sama tak bergunanya dengan kosong.
    expect(identitasPajakTerisi(klien({ id_number: "   " }))).toBe(false);
  });
});

describe("medanKurang", () => {
  it("klien lengkap tak punya kekurangan", () => {
    expect(medanKurang(klien())).toEqual([]);
  });

  it("menyebut medan yang kurang dengan nama yang benar per tipe", () => {
    expect(medanKurang(klien({ email: null, id_number: null }))).toEqual(["email", "NIK"]);
    expect(medanKurang(perusahaan({ email: null, npwp: null }))).toEqual(["email", "NPWP"]);
  });

  it("telepon kosong ikut terdeteksi meski API mewajibkannya", () => {
    // Baris lama sebelum validasi itu ada, dan impor massal, bisa menembusnya.
    expect(medanKurang(klien({ phone: "" }))).toContain("telepon");
  });
});

describe("klienTakLengkap — hanya yang AKTIF", () => {
  it("klien nonaktif tak ditagih kelengkapannya", () => {
    // Kalau nonaktif ikut dihitung, angkanya tak pernah bisa mencapai nol —
    // dan angka yang tak pernah nol berhenti dibaca.
    const hasil = klienTakLengkap([
      klien({ id: "mati", is_active: false, email: null, id_number: null }),
      klien({ id: "hidup", email: null }),
    ]);
    expect(hasil.map((k) => k.id)).toEqual(["hidup"]);
  });

  it("daftar yang seluruhnya lengkap menghasilkan array kosong", () => {
    expect(klienTakLengkap([klien(), perusahaan()])).toEqual([]);
  });
});

describe("ringkasKlien", () => {
  it("memisahkan aktif, nonaktif, dan tipe", () => {
    const r = ringkasKlien([
      klien({ id: "1" }),
      perusahaan({ id: "2" }),
      klien({ id: "3", is_active: false }),
    ]);
    expect(r.total).toBe(3);
    expect(r.aktif).toBe(2);
    expect(r.nonaktif).toBe(1);
    expect(r.perorangan).toBe(2);
    expect(r.perusahaan).toBe(1);
  });

  it("tanpaEmail & tanpaIdentitasPajak hanya menghitung yang aktif", () => {
    const r = ringkasKlien([
      klien({ id: "1", email: null }),
      klien({ id: "2", email: null, is_active: false }),
      perusahaan({ id: "3", npwp: null }),
    ]);
    expect(r.tanpaEmail).toBe(1);
    expect(r.tanpaIdentitasPajak).toBe(1);
  });

  it("takLengkap menghitung KLIEN, bukan jumlah medan yang kosong", () => {
    // Satu klien yang kurang tiga medan tetap satu klien. Menghitung medan
    // akan melaporkan "3 klien belum lengkap" untuk satu orang.
    const r = ringkasKlien([klien({ email: null, id_number: null, phone: "" })]);
    expect(r.takLengkap).toBe(1);
  });

  it("daftar kosong menghasilkan nol di semua angka", () => {
    const r = ringkasKlien([]);
    expect(r).toEqual({
      total: 0, aktif: 0, nonaktif: 0, perorangan: 0, perusahaan: 0,
      takLengkap: 0, tanpaEmail: 0, tanpaIdentitasPajak: 0,
    });
  });
});
