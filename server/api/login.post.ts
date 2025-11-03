import { defineEventHandler, readBody, setCookie } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<{ email: string; password: string }>(event)
  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  if (!email || !password) return { ok: false, msg: 'Completa usuario y contraseña.' }

  const { data: user, error } = await supa
    .from('usuarios')
    .select('id,email,role,password')
    .eq('email', email)
    .eq('password', password) // ⚠️ demo: en producción usa hash
    .maybeSingle()

  if (error || !user) return { ok: false, msg: 'Credenciales inválidas.' }

  // Guarda el rol en cookie (sesión simple)
  setCookie(event, 'user_role', user.role, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // secure: true, // en prod con https
    maxAge: 60 * 60 * 8 // 8 horas
  })

  return { ok: true, role: user.role }
})
