// Validasi tipe file dari magic bytes (file signature), bukan Content-Type header
// yang dikontrol client. Ini mencegah upload file berbahaya yang disamarkan.

interface MagicEntry {
  mime: string
  bytes: readonly number[]   // byte values, -1 = wildcard
  offset?: number            // byte offset untuk cek (default 0)
}

const SIGNATURES: readonly MagicEntry[] = [
  // PDF: %PDF
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  // WebP: RIFF????WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  // DOCX / XLSX / PPTX: PK\x03\x04 (ZIP-based Office formats)
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: [0x50, 0x4B, 0x03, 0x04],
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: [0x50, 0x4B, 0x03, 0x04],
  },
]

function matchSignature(buf: Buffer, entry: MagicEntry): boolean {
  const offset = entry.offset ?? 0
  if (buf.length < offset + entry.bytes.length) return false
  for (let i = 0; i < entry.bytes.length; i++) {
    if (entry.bytes[i] === -1) continue   // wildcard
    if (buf[offset + i] !== entry.bytes[i]) return false
  }
  return true
}

/**
 * Deteksi tipe MIME dari magic bytes buffer.
 * Untuk WebP, verifikasi juga substring "WEBP" di offset 8.
 * Mengembalikan null jika signature tidak dikenali.
 */
export function detectMimeFromBytes(buf: Buffer): string | null {
  for (const entry of SIGNATURES) {
    if (matchSignature(buf, entry)) {
      // WebP: RIFF signature sama dengan beberapa format lain, verifikasi WEBP marker
      if (entry.mime === 'image/webp') {
        if (buf.length < 12) continue
        const webpMark = buf.slice(8, 12).toString('ascii')
        if (webpMark !== 'WEBP') continue
      }
      return entry.mime
    }
  }
  return null
}

/**
 * Validasi apakah buffer merupakan salah satu tipe yang diizinkan.
 * Mengembalikan tipe yang terdeteksi, atau throw error jika tidak valid.
 */
export function validateMime(buf: Buffer, allowed: string[]): string {
  const detected = detectMimeFromBytes(buf)

  if (!detected) {
    throw new Error('Format file tidak dikenali. Pastikan file tidak corrupt.')
  }

  // Untuk Office formats (ZIP-based), detected selalu DOCX karena signature sama.
  // Normalisasi: jika allowed mengandung XLSX dan detected adalah DOCX (ZIP), izinkan.
  const effectiveMime = normalizeOfficeMime(detected, allowed)

  if (!allowed.includes(effectiveMime)) {
    throw new Error(`Tipe file tidak diizinkan (${effectiveMime}). File yang diizinkan: ${allowed.join(', ')}`)
  }

  return effectiveMime
}

function normalizeOfficeMime(detected: string, allowed: string[]): string {
  // ZIP signature bisa jadi DOCX atau XLSX — pakai yang ada di allowed list
  const ZIP_TYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]
  if (ZIP_TYPES.includes(detected)) {
    const match = allowed.find(a => ZIP_TYPES.includes(a))
    return match ?? detected
  }
  return detected
}
