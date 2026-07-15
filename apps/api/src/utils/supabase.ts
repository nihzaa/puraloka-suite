import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

// Auth client: used only for auth.getUser() token verification
export const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Admin client: service role with explicit Authorization header to bypass RLS.
// We force the service-role key in every request so that even if the auth state
// from supabaseAuth.getUser() bleeds into shared memory, our data queries always
// present the service-role key to the database.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${supabaseKey}` },
  },
})
