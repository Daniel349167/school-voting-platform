import { createClient } from '@supabase/supabase-js'
import { createError } from 'h3'

export function dbTable(name: string) {
  return `${useRuntimeConfig().databasePrefix}${name}`
}

export function getDatabase() {
  const cfg = useRuntimeConfig()
  if (!cfg.public.supabaseUrl || !cfg.supabaseServiceRole) throw createError({ statusCode: 503, statusMessage: 'Base de datos sin configurar.' })
  return createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole, { auth: { persistSession: false, autoRefreshToken: false } })
}
