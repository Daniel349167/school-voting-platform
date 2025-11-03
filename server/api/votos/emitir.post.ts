import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { dni, grado, seccion, candidatoId, enBlanco } = await readBody<{
    dni: string; grado: number; seccion: string; candidatoId: number | null; enBlanco: boolean
  }>(event)

  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  if (!dni || !grado || !seccion) return { ok:false, msg:'Faltan datos.' }

  // Reválida
  const { data: al, error: e0 } = await supa
    .from('alumnos')
    .select('dni,ya_voto')
    .eq('dni', dni)
    .eq('grado', String(grado))
    .eq('seccion', seccion)
    .maybeSingle()

  if (e0) return { ok:false, msg:'Error verificando alumno.' }
  if (!al) return { ok:false, msg:'No estás en este salón.' }
  if (al.ya_voto) return { ok:false, msg:'Este DNI ya votó.' }

  // Guarda voto
  const { error: e1 } = await supa.from('votos').insert({
    dni, grado, seccion,
    candidato_id: candidatoId,
    en_blanco: !!enBlanco
  })
  if (e1) return { ok:false, msg:'No se pudo registrar el voto.' }

  // Marca ya_voto
  const { error: e2 } = await supa
    .from('alumnos')
    .update({ ya_voto: true })
    .eq('dni', dni)

  if (e2) return { ok:false, msg:'Voto guardado, pero no se pudo marcar ya_voto.' }

  return { ok:true }
})
