# 40 — AI Governance & Agent Engineering Standard

> **Maturity:** 🔵 Designed — nol AI product agent live hari ini (AI Gateway, Prompt Management, dan seluruh AI Agent Registry berstatus `Later` di [06-agentic-ai-and-automation-architecture.md](../../06-agentic-ai-and-automation-architecture.md)). Kontrak masa depan, berlaku penuh sejak commit pertama yang menyentuh domain AI product agent — **tidak** menunggu Phase 6 dimulai untuk *ditulis*, hanya menunggu Phase 6 untuk *diterapkan pada kode nyata* (Documentation Driven Development: standar siap sebelum baris kode agent pertama ditulis).

**Kedudukan:** Batch K — v1.1 Improvement Plan item G1 (Critical). Berbeda domain dari [36-ai-coding-guideline.md](36-ai-coding-guideline.md) — file itu mengatur AI *coding assistant* (Claude Code, menulis kode Puraloka Suite); file ini mengatur AI *product agent* (14 agent katalog [06-agentic-ai-and-automation-architecture.md § Katalog 14 Agent](../../06-agentic-ai-and-automation-architecture.md#katalog-14-agent), yang **akan menjadi bagian produk** yang dijalankan pengguna Puraloka Suite — AI CFO, AI Auditor, WhatsApp Executive Copilot, dst). Mengoperasionalkan arsitektur [06-agentic-ai-and-automation-architecture.md](../../06-agentic-ai-and-automation-architecture.md) (AI Gateway, Prompt Management, Tool Calling Framework, Section 8 Security & Governance) menjadi Mandatory Rule yang mengikat kode — doc06 sendiri eksplisit "mendefinisikan arsitektur, bukan isi prompt"; file ini mengisi lapisan yang doc06 sengaja tidak isi: bagaimana agent **dibangun, diuji, diawasi, dan diaudit**.

---

## 1. Purpose

Menjamin setiap AI product agent yang menyentuh data finansial atau berinteraksi dengan pengguna (kasbon, invoice, WhatsApp Executive Copilot) beroperasi dengan akuntabilitas yang **setara** dengan yang sudah diwajibkan untuk aksi manusia (`audit_logs`, `requirePermission`) — bukan lapisan otomasi yang bergerak tanpa jejak, tanpa versi yang bisa dilacak, dan tanpa batas biaya yang bisa lepas kendali.

## 2. Background

Audit v1.1 (verifikasi 16 topik AI Governance terhadap seluruh corpus) mengonfirmasi: **0 dari 16 topik mencapai status enforceable EC rule.** Enam topik (Prompt Versioning, Prompt Registry, AI Cost Budget, AI Model Routing Policy, AI Audit Log, AI Safety Guardrails) sudah dijelaskan matang sebagai **arsitektur** di [06-agentic-ai-and-automation-architecture.md](../../06-agentic-ai-and-automation-architecture.md) — skema `ai_prompts`, `ai_agent_audit_logs`, tiering approval limit ([06 § Approval Limits & Spending Limits](../../06-agentic-ai-and-automation-architecture.md#approval-limits--spending-limits)) — tapi tidak satu pun pernah menjadi Mandatory Rule di Engineering Constitution. `38-security-checklist.md`, gate pre-rilis EC yang sesungguhnya, dikonfirmasi nol item terkait AI dari pembacaan penuh sebelum v1.1. Tujuh topik lain (Prompt Approval Workflow, AI Evaluation Dataset, AI Benchmark, AI Response Traceability, AI Privacy Policy, AI Data Retention, dan AI Provider Failover — yang terakhir doc06 eksplisit **menolak** by design untuk task finansial/reasoning, bukan sekadar belum dibangun) tidak punya jejak sama sekali di manapun.

File ini juga menutup Gap #1 dari audit v1.1 pertama (testing tool-calling agent, mekanisme versioning prompt konkret, cost governance) — digabung dengan AI Governance sesuai instruksi eksplisit: "bukan sebagai dokumen yang berdiri sendiri, tetapi sebagai perluasan standar AI Engineering."

## 3. Principles

1. **AI agent tunduk pada permission engine yang sama dengan manusia, tanpa jalur pintas.** [06 § Role Limits](../../06-agentic-ai-and-automation-architecture.md#role-limits) eksplisit: "tidak ada sistem permission kedua untuk AI/WhatsApp" — satu tabel `roles`/`permissions`/`role_permissions` yang sama. Prinsip ini **MUST** dipegang di setiap Mandatory Rule file ini, bukan diperlakukan sebagai detail implementasi opsional.
2. **Setiap output agent bisa ditelusuri balik ke prompt version + model + input yang menghasilkannya.** Tanpa ini, "kenapa AI bilang begini" tidak pernah bisa dijawab presisi — persis kondisi yang [06 § AI Explainability](../../06-agentic-ai-and-automation-architecture.md#ai-explainability) tuntut ("bukan hanya JSON diff teknis... tapi ringkasan yang bisa dibaca").
3. **Aksi finansial ireversibel tidak pernah dieksekusi otonom, tanpa kecuali skala nominal.** [06 § Approval Limits & Spending Limits](../../06-agentic-ai-and-automation-architecture.md#approval-limits--spending-limits) mendesain tiering eksplisit (Tier 1-4) — bahkan Tier 4 (>Rp100 juta) **secara sengaja menolak** kenyamanan penuh otomasi, wajib kembali ke dashboard web. Prinsip ini lebih ketat dari HITL umum di [36-ai-coding-guideline.md](36-ai-coding-guideline.md) karena skala dampak finansial produk jauh lebih besar dari dampak satu commit kode.
4. **Prompt adalah data versioned, bukan string di kode.** [06 § Prompt Management](../../06-agentic-ai-and-automation-architecture.md#prompt-management) sudah mendesain ini sebagai arsitektur (`ai_prompts` table) — prinsip ini menegaskan **kenapa**: iterasi cepat tanpa deploy, dan rollback sebagai operasi konfigurasi (`is_active` flag), bukan revert kode.
5. **Biaya AI adalah anggaran yang diawasi, bukan biaya operasional tak terbatas.** Satu agent yang salah konfigurasi (loop tool-calling, prompt yang memicu output panjang berulang) bisa menghasilkan tagihan API yang signifikan dalam hitungan jam — [06 § AI Gateway](../../06-agentic-ai-and-automation-architecture.md#ai-gateway) menyatakan cost tracking per agent sebagai "syarat wajib sebelum agent apa pun live," prinsip ini menegaskan itu bukan pilihan.
6. **Data yang dikirim ke provider AI eksternal adalah keputusan sadar per data class, bukan default "kirim semua konteks yang relevan."** Sistem menangani data finansial dan PII klien (kasbon, invoice, data kontak) — mengirim data ini ke provider eksternal (OpenAI, Anthropic) tanpa klasifikasi eksplisit adalah risiko privasi dan potensi pelanggaran kontraktual dengan klien.

## 4. Mandatory Rules

**Prompt Versioning, Registry & Approval:**
1. Prompt untuk agent apa pun **MUST** disimpan sebagai data versioned di `ai_prompts` (`agent_id`, `version`, `template`, `is_active`) sesuai desain [06 § Prompt Management](../../06-agentic-ai-and-automation-architecture.md#prompt-management) — **MUST NOT** di-hardcode sebagai string literal di kode aplikasi, bahkan untuk prompt sederhana atau agent pilot pertama.
2. Perubahan pada prompt version yang **sudah live** (dipakai agent yang sudah menerima trafik nyata) **MUST** melalui review manusia sebelum `is_active` diaktifkan — setara [15-code-review-checklist.md](../05-team-process/15-code-review-checklist.md) untuk perubahan kode, karena prompt adalah logic yang mengontrol perilaku agent sama seriusnya dengan kode — **MUST NOT** di-deploy langsung ke production tanpa jejak siapa yang menyetujui.

**AI Evaluation & Benchmark:**
3. Prompt version baru **MUST** dijalankan terhadap eval dataset (golden set — kumpulan input representatif dengan output yang diharapkan/diverifikasi) sebelum `is_active` diaktifkan untuk agent yang menyentuh data finansial atau menghasilkan aksi ke pengguna — **MUST NOT** rollout prompt version baru berdasarkan "kelihatannya lebih baik" tanpa perbandingan terukur terhadap versi sebelumnya.
4. Setiap agent **MUST** punya baseline benchmark minimal (akurasi terhadap eval dataset, latency p95, biaya rata-rata per query) yang dicatat sebelum dianggap "live" — **MUST NOT** agent baru live tanpa baseline yang bisa dijadikan pembanding regresi di masa depan.

**Hallucination & Explainability:**
5. Output agent yang berisi klaim finansial/analitik **MUST** menyertakan sumber data terstruktur (bukan hanya teks bebas) sesuai [06 § AI Explainability](../../06-agentic-ai-and-automation-architecture.md#ai-explainability) — **MUST NOT** agent menyampaikan angka/kesimpulan tanpa metadata sumber yang bisa diverifikasi balik ke data asal.
6. Agent **MUST** eksplisit menyatakan ketidakpastian ("saya tidak punya cukup data untuk menjawab ini dengan yakin") saat confidence rendah — **MUST NOT** ada tool/prompt design yang mendorong agent selalu memberi jawaban percaya diri meski data tidak cukup ([06 § Prinsip 6](../../06-agentic-ai-and-automation-architecture.md#prinsip-6--explainability-requirements)).

**Cost Governance:**
7. Setiap agent **MUST** punya cost tracking per panggilan (token in/out, biaya estimasi) dicatat ke `ai_agent_audit_logs` sejak commit pertama yang membuatnya live — **MUST NOT** ada agent yang dipanggil tanpa jejak biaya, konsisten [06 § AI Gateway tanggung jawab #2](../../06-agentic-ai-and-automation-architecture.md#ai-gateway).
8. Setiap agent **MUST** punya ambang budget (harian/bulanan, dikonfigurasi per agent) yang memicu alert atau auto-pause saat terlampaui — **MUST NOT** agent dibiarkan memanggil API provider tanpa batas atas yang terukur.

**Model Routing:**
9. Pemilihan model per agent/tugas **MUST** melalui Model Router terkonfigurasi ([06 § Model Router](../../06-agentic-ai-and-automation-architecture.md#model-router)), bukan hardcode nama model di kode agent — **MUST NOT** mengganti model provider memerlukan perubahan kode, harus jadi perubahan konfigurasi.

**Human-in-the-Loop (Operasional):**
10. Automation dengan HITL `Command` atau `On-loop` yang menyentuh nilai finansial **MUST** tunduk tiering approval limit [06 § Approval Limits & Spending Limits](../../06-agentic-ai-and-automation-architecture.md#approval-limits--spending-limits) (Tier 1-4) — **MUST NOT** ada agent yang mengeksekusi aksi finansial Tier 3-4 tanpa approval manusia eksplisit sesuai tier-nya, tanpa pengecualian "karena sudah terpercaya" atau "karena volume kecil berulang."

**AI Audit Log & Traceability:**
11. Setiap panggilan agent **MUST** dicatat ke `ai_agent_audit_logs` (input, output, user context, prompt version, model yang dipakai) — **MUST NOT** ada panggilan agent yang tidak tercatat, terlepas apakah panggilan tersebut menghasilkan perubahan data atau hanya menjawab pertanyaan.
12. Output agent yang menghasilkan perubahan data **MUST** tetap tercatat ganda ke `audit_logs` (perubahan data) **DAN** `ai_agent_audit_logs` (proses reasoning) sesuai desain dua-lapis [06 § Audit Trails](../../06-agentic-ai-and-automation-architecture.md#audit-trails) — **MUST NOT** mengandalkan satu tabel saja untuk kasus ini.

**Safety Guardrails & Prompt Injection:**
13. Tool call agent **MUST** divalidasi ulang terhadap permission engine **saat eksekusi**, bukan hanya saat tool didaftarkan ke agent — **MUST NOT** ada tool yang dieksekusi berdasarkan asumsi "sudah diverifikasi saat registrasi," konsisten [06 § Tool Calling Framework Prinsip keamanan kritis](../../06-agentic-ai-and-automation-architecture.md#tool-calling-framework) dan [06 § Prompt Injection Defense poin 1](../../06-agentic-ai-and-automation-architecture.md#prompt-injection-defense).
14. Instruksi sistem (system prompt) **MUST** dipisahkan tegas secara arsitektural dari input pengguna — **MUST NOT** ada mekanisme yang memungkinkan input pengguna (pesan WhatsApp, form input) meng-override atau membaca instruksi sistem, konsisten [06 § Prompt Injection Defense poin 3](../../06-agentic-ai-and-automation-architecture.md#prompt-injection-defense).

**Fallback & Reliability (Bukan Failover Multi-Provider):**
15. Saat provider AI utama gagal/timeout, sistem **MUST** memberi tahu pengguna secara eksplisit bahwa proses gagal — **MUST NOT** otomatis failover diam-diam ke provider sekunder untuk task finansial/reasoning kritis, konsisten keputusan sadar [06 § AI Gateway tanggung jawab #5](../../06-agentic-ai-and-automation-architecture.md#ai-gateway) dan [06 § Rollback Strategy](../../06-agentic-ai-and-automation-architecture.md#rollback-strategy) — **catatan eksplisit:** ini **bukan** ketiadaan fallback strategy, ini keputusan arsitektur sadar bahwa transparansi kegagalan lebih penting daripada continuity semu untuk domain finansial.

**Privacy & Data Retention:**
16. Data yang dikirim ke provider AI eksternal **MUST** diklasifikasi eksplisit per agent sebelum agent live — data finansial-kritis (nominal kasbon, data rekening) dan PII klien (nama lengkap, kontak, alamat) **MUST** diminimalkan atau di-mask sebelum dikirim ke provider kecuali benar-benar diperlukan untuk fungsi agent tersebut, dan keputusan "diperlukan" **MUST** didokumentasikan per agent, bukan diasumsikan.
17. Log percakapan mentah (WhatsApp, chat AI Assistant) **MUST** punya retensi terbatas eksplisit (bukan tanpa batas) terpisah dari `audit_logs` transaksional — **MUST** mengikuti pola [06 § Audit Trails — Tambahan khusus WhatsApp](../../06-agentic-ai-and-automation-architecture.md#audit-trails) (retensi indikatif 90 hari) — **MUST NOT** menyimpan transkrip mentah selamanya tanpa justifikasi kepatuhan eksplisit.

## 5. Recommended Rules

1. Eval dataset (Mandatory Rule #3) **SHOULD** diperluas seiring waktu dengan kasus nyata yang ditemukan gagal di production — bukan dataset statis yang ditulis sekali di awal.
2. Cost budget (Mandatory Rule #8) **SHOULD** ditinjau ulang tiap kuartal begitu ada data pemakaian nyata — ambang awal boleh berupa estimasi konservatif.
3. Automation Tier 1 (Micro, <Rp500rb, auto-approve dengan notifikasi per [06 § Approval Limits](../../06-agentic-ai-and-automation-architecture.md#approval-limits--spending-limits)) **SHOULD** tetap disertai anomaly detection ringan (volume tidak wajar dalam periode singkat) meski tidak butuh approval aktif per transaksi.

## 6. Anti-Pattern

**Prompt Hardcode "Sementara"** — menulis prompt sebagai string literal di kode dengan niat "nanti dipindah ke `ai_prompts` setelah MVP," pola yang sama persis dengan Anti-Pattern "Any dulu, benerin nanti" di [01-coding-standards.md](../01-foundations/01-coding-standards.md#6-anti-pattern) — nyaris tidak pernah benar-benar dipindah, dan prompt hardcode tersebar di banyak file menjadi debt yang mahal diperbaiki retroaktif begitu ada 5+ agent live.

**Agent Live Tanpa Baseline Benchmark** — meluncurkan agent karena "kelihatannya jalan baik saat dicoba manual beberapa kali," tanpa eval dataset atau metrik terukur — begitu prompt diubah untuk perbaikan, tidak ada cara mengetahui apakah perubahan itu benar-benar perbaikan atau regresi tersembunyi di kasus yang tidak dicoba manual.

**Auto-Failover Provider untuk Task Finansial** — mengimplementasikan fallback otomatis ke provider AI kedua "supaya sistem tetap jalan" untuk task yang menghasilkan keputusan finansial — bertentangan langsung Mandatory Rule #15, karena model berbeda bisa menghasilkan reasoning berbeda untuk kasus ambigu yang sama, dan pengguna tidak pernah tahu keputusan itu dibuat model mana.

**Data Sensitif Dikirim ke Provider Tanpa Klasifikasi** — mengirim seluruh konteks proyek (termasuk nominal kasbon dan data kontak klien) ke prompt AI CFO "karena mungkin relevan," tanpa mempertimbangkan apakah field spesifik itu benar-benar diperlukan agent untuk menjawab — melanggar Mandatory Rule #16, memperbesar blast radius jika terjadi kebocoran di sisi provider.

## 7. Example Good

```sql
-- ai_prompts (target, kontrak Designed) — pola versioned, bukan hardcode
INSERT INTO ai_prompts (agent_id, version, template, is_active)
VALUES ('ai-cfo', 3, 'Anda adalah AI CFO Puraloka Suite...', false);
-- rollback = flip is_active ke versi sebelumnya, bukan revert kode (Mandatory Rule #1)
```

```ts
// Pola tool call tervalidasi ulang saat eksekusi (target, konsisten Mandatory Rule #13)
async function executeTool(toolName: string, args: unknown, userContext: UserContext) {
  const tool = getRegisteredTool(toolName, userContext.agentId);
  // validasi ulang permission SAAT eksekusi, bukan hanya saat tool didaftarkan
  if (!hasPermission(userContext.role, tool.requiredPermission)) {
    throw new ForbiddenError(`Tool ${toolName} ditolak untuk role ${userContext.role}`);
  }
  const result = await tool.execute(args);
  await logAgentCall({ toolName, args, result, userContext, promptVersion: userContext.promptVersion });
  return result;
}
```
Permission dicek ulang di titik eksekusi (bukan diasumsikan dari registrasi), dan panggilan tercatat lengkap dengan prompt version — konsisten Mandatory Rule #11 dan #13.

## 8. Example Bad

```ts
// Anti-pattern hipotetis — TIDAK ditemukan di codebase (belum ada agent live), dicantumkan sebagai pencegahan
const AI_CFO_PROMPT = "Anda adalah AI CFO Puraloka Suite. Analisis data berikut..."; // hardcode, melanggar Mandatory Rule #1

async function askAICFO(question: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4", // hardcode model, melanggar Mandatory Rule #9
    messages: [{ role: "system", content: AI_CFO_PROMPT }, { role: "user", content: question }],
  });
  return response.choices[0].message.content; // tidak ada cost tracking, tidak ada audit log — melanggar Mandatory Rule #7, #11
}
```
Prompt hardcode, model hardcode, nol audit trail, nol cost tracking — empat pelanggaran sekaligus dalam satu fungsi kecil, menunjukkan kenapa Mandatory Rules ini perlu ditegakkan sejak commit pertama, bukan retrofit setelah pola buruk terlanjur menyebar ke banyak agent.

## 9. Migration Strategy

**Seluruh Mandatory Rules di file ini** — 🔵 Designed murni, N/A untuk migrasi mundur karena nol AI product agent live hari ini (AI Gateway sendiri berstatus `Later`, prasyarat keras sebelum agent pertama apa pun dibangun — [06 § AI Gateway Now/Next/Later](../../06-agentic-ai-and-automation-architecture.md#ai-gateway)). Berlaku penuh sejak commit pertama yang membuat AI Gateway atau agent pertama — **tidak ada masa transisi**, karena tidak ada kode existing yang perlu dimigrasikan; menulis agent pertama tanpa Mandatory Rules ini sejak awal adalah mengulang pola debt yang persis ingin dicegah file ini (lihat Anti-Pattern "Prompt Hardcode Sementara").

**Prasyarat implementasi (bukan prasyarat penulisan standar ini):** Sesuai [Master-Delivery-Blueprint/02-master-dependency-graph.md § 2, B→E](../../Master-Delivery-Blueprint/02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit), AI Agent Registry **MUST NOT** mulai diimplementasikan sebelum Program A (Permission Engine) dan Program B (Workflow Engine) selesai — guardrail Mandatory Rule #10/#13 di file ini bergantung penuh pada permission engine yang sudah konsisten. File ini ditulis sekarang (Documentation Driven Development), diterapkan pada kode nanti (Phase 6).

## 10. Checklist

- [ ] Prompt agent baru disimpan sebagai data versioned di `ai_prompts`, bukan hardcode
- [ ] Prompt version live baru direview manusia sebelum `is_active`
- [ ] Prompt version baru diverifikasi terhadap eval dataset sebelum rollout
- [ ] Agent baru punya baseline benchmark (akurasi, latency, biaya) tercatat
- [ ] Output finansial/analitik menyertakan sumber data terstruktur
- [ ] Agent menyatakan ketidakpastian eksplisit saat confidence rendah
- [ ] Cost tracking per panggilan aktif sejak agent pertama live
- [ ] Ambang budget dikonfigurasi dan memicu alert/auto-pause
- [ ] Model dipilih lewat Model Router, bukan hardcode
- [ ] Automation finansial Tier 3-4 tunduk approval limit sesuai tier
- [ ] Setiap panggilan agent tercatat ke `ai_agent_audit_logs`
- [ ] Perubahan data oleh agent tercatat ganda (`audit_logs` + `ai_agent_audit_logs`)
- [ ] Tool call divalidasi ulang terhadap permission engine saat eksekusi
- [ ] System prompt terisolasi tegas dari input pengguna
- [ ] Tidak ada auto-failover multi-provider untuk task finansial/reasoning
- [ ] Data sensitif ke provider AI diklasifikasi eksplisit per agent
- [ ] Log percakapan mentah punya retensi terbatas terpisah dari `audit_logs`

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Agent live dengan prompt hardcode (bukan `ai_prompts`) | 0 | Code review checklist + audit `ai_prompts` table |
| Panggilan agent tanpa entry `ai_agent_audit_logs` | 0 | Audit completeness log vs jumlah panggilan API provider |
| Prompt version baru di-rollout tanpa eval dataset (untuk agent finansial) | 0 | Review PR + `ai_prompts` version history |
| Aksi finansial Tier 3-4 dieksekusi tanpa approval sesuai tier | 0 | Audit `ai_agent_audit_logs` vs `approval_limits` |
| Agent yang melampaui budget tanpa alert/pause terpicu | 0 | Monitoring cost tracking per agent |
| Data PII/finansial dikirim ke provider tanpa klasifikasi terdokumentasi | 0 | Audit per-agent data classification |

## 12. References

- [06-agentic-ai-and-automation-architecture.md](../../06-agentic-ai-and-automation-architecture.md) (arsitektur AI Gateway, Prompt Management, Model Router, Tool Calling Framework, Section 8 Security & Governance)
- [06-agentic-ai-and-automation-architecture.md § Prompt Management](../../06-agentic-ai-and-automation-architecture.md#prompt-management)
- [06-agentic-ai-and-automation-architecture.md § Approval Limits & Spending Limits](../../06-agentic-ai-and-automation-architecture.md#approval-limits--spending-limits)
- [06-agentic-ai-and-automation-architecture.md § Audit Trails](../../06-agentic-ai-and-automation-architecture.md#audit-trails)
- [06-agentic-ai-and-automation-architecture.md § Prompt Injection Defense](../../06-agentic-ai-and-automation-architecture.md#prompt-injection-defense)
- [06-agentic-ai-and-automation-architecture.md § Rollback Strategy](../../06-agentic-ai-and-automation-architecture.md#rollback-strategy)
- [03-platform-and-intelligence-architecture.md § AI Architecture](../../03-platform-and-intelligence-architecture.md#ai-architecture)
- [36-ai-coding-guideline.md](36-ai-coding-guideline.md) (domain berbeda — AI coding assistant, bukan AI product agent)
- [Master-Delivery-Blueprint/02-master-dependency-graph.md § 2](../../Master-Delivery-Blueprint/02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)
- [08-metrics-and-closing/38-security-checklist.md](../08-metrics-and-closing/38-security-checklist.md)
- [GLOSSARY.md — HITL](../GLOSSARY.md)

---

*Batch K — Engineering Constitution v1.1 Improvement Plan item G1, selesai.*
