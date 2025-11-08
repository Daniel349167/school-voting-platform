// server/api/salones/secciones.get.ts
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const grado = (q.grado ?? '').toString().trim()

  if (!grado) {
    return { ok: false, msg: 'Parametro "grado" es requerido.' }
  }

  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  // alumnos.grado es TEXT en tu SQL, por eso comparamos con string
  const { data, error } = await supa
    .from('alumnos')
    .select('seccion')
    .eq('grado', grado)

  if (error) {
    return { ok: false, msg: 'Error consultando secciones.' }
  }

  // Únicas + orden alfabético
  const secciones = Array.from(new Set((data ?? []).map(r => (r.seccion ?? '').trim())))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))

  return { ok: true, secciones }
})
