import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_placeholder'
export const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export const supabase = createClient(url, key)
