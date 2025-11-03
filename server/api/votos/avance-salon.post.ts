import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { grado, seccion } = await readBody<{ grado: number; seccion: string }>(event)
  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  if (!grado || !seccion) return { ok:false, msg:'Datos incompletos' }

  // total del salón
  const { count: total, error: e1 } = await supa
    .from('alumnos')
    .select('*', { count: 'exact', head: true })
    .eq('grado', String(grado))
    .eq('seccion', seccion)

  if (e1) return { ok:false, msg:'Error total' }

  // faltan por votar
  const { count: faltan, error: e2 } = await supa
    .from('alumnos')
    .select('*', { count: 'exact', head: true })
    .eq('grado', String(grado))
    .eq('seccion', seccion)
    .eq('ya_voto', false)

  if (e2) return { ok:false, msg:'Error faltantes' }

  return { ok:true, total: total ?? 0, faltan: faltan ?? 0 }
})
