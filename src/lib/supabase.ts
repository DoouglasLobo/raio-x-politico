import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const hasUrl = Boolean(supabaseUrl)
const hasPublishableKey = Boolean(supabasePublishableKey)
const isValidUrl = (() => {
  if (!supabaseUrl) return false
  try {
    const url = new URL(supabaseUrl)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
})()

export const supabaseConfigurationError = hasUrl !== hasPublishableKey
  ? 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY juntas em .env.local.'
  : hasUrl && !isValidUrl
    ? 'VITE_SUPABASE_URL deve ser uma URL HTTP ou HTTPS válida.'
    : null

export const supabase =
  supabaseUrl && supabasePublishableKey && !supabaseConfigurationError
    ? createClient<Database>(supabaseUrl, supabasePublishableKey)
    : null
