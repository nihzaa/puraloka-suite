-- Link tabel clients ke users agar portal client bisa filter proyek milik sendiri
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
