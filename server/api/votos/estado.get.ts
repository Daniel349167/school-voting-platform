// server/api/votos/estado.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  try {
    const q = getQuery(event) as { grado?: string; seccion?: string }

    // Detectamos si llegaron filtros (aceptamos uno o ambos)
    const hasGrado   = typeof q.grado === 'string'   && q.grado.trim()   !== ''
    const hasSeccion = typeof q.seccion === 'string' && q.seccion.trim() !== ''

    const cfg = useRuntimeConfig()
    const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

    let total = 0
    let votaron = 0

    if (hasGrado || hasSeccion) {
      // ===== Conteo FILTRADO (por lo que llegue) =====
      const match: Record<string, string> = {}
      if (hasGrado)   match.grado   = String(q.grado).trim()   // tu columna grado es TEXT
      if (hasSeccion) match.seccion = String(q.seccion).trim()

      // Total
      const { count: totalCount, error: e1 } = await supa
        .from('alumnos')
        .select('dni', { count: 'exact', head: true })
        .match(match)

      if (e1) throw e1
      total = totalCount || 0

      // Votaron
      const { count: votaronCount, error: e2 } = await supa
        .from('alumnos')
        .select('dni', { count: 'exact', head: true })
        .match(match)
        .eq('ya_voto', true)

      if (e2) throw e2
      votaron = votaronCount || 0
    } else {
      // ===== Conteo GENERAL (todos los grados) =====
      const { count: totalCount, error: e1 } = await supa
        .from('alumnos')
        .select('dni', { count: 'exact', head: true })
      if (e1) throw e1
      total = totalCount || 0

      const { count: votaronCount, error: e2 } = await supa
        .from('alumnos')
        .select('dni', { count: 'exact', head: true })
        .eq('ya_voto', true)
      if (e2) throw e2
      votaron = votaronCount || 0
    }

    const faltan = Math.max(0, total - votaron)
    return { ok: true, total, votaron, faltan }
  } catch (err: any) {
    return { ok: false, msg: err?.message || 'Error en estado' }
  }
})
