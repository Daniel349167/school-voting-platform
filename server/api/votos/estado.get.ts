// server/api/votos/estado.get.ts
import { defineEventHandler } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const grado = Number(query.grado)
    const seccion = String(query.seccion || '')

    if (!grado || !seccion) {
      return { ok: false, msg: 'Parámetros inválidos' }
    }

    const cfg = useRuntimeConfig()
    const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

    // Total alumnos
    const { count: total, error: e1 } = await supa
      .from('alumnos')
      .select('*', { count: 'exact', head: true })
      .eq('grado', grado)
      .eq('seccion', seccion)

    if (e1) throw e1

    // Votaron
    const { count: votaron, error: e2 } = await supa
      .from('alumnos')
      .select('*', { count: 'exact', head: true })
      .eq('grado', grado)
      .eq('seccion', seccion)
      .eq('ya_voto', true)

    if (e2) throw e2

    const faltan = (total || 0) - (votaron || 0)

    return { ok: true, total: total || 0, votaron: votaron || 0, faltan: Math.max(faltan, 0) }
  } catch (err: any) {
    return { ok: false, msg: err?.message || 'Error en estado' }
  }
})
