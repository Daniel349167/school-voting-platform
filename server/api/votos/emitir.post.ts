import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

type EmitirBody = {
  dni: string
  candidatoId: number | null
  enBlanco: boolean
}

export default defineEventHandler(async (event) => {
  const { dni, candidatoId, enBlanco } = await readBody<EmitirBody>(event)

  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  if (!dni) {
    return { ok: false, msg: 'Falta DNI.' }
  }
  if (typeof enBlanco !== 'boolean' || (enBlanco === false && (candidatoId === undefined))) {
    return { ok: false, msg: 'Datos de voto incompletos.' }
  }

  // Re-validación: existencia en padrón y que NO haya votado
  const { data: al, error: e0 } = await supa
    .from('alumnos')
    .select('dni,ya_voto,grado,seccion')
    .eq('dni', dni)
    .maybeSingle()

  if (e0) return { ok: false, msg: 'Error verificando alumno.' }
  if (!al) return { ok: false, msg: 'No estás registrado en el padrón del colegio.' }
  if (al.ya_voto) return { ok: false, msg: 'Este DNI ya votó.' }

  // Insertar voto. Si tu tabla `votos` requiere grado/seccion, los tomamos del alumno
  const payload: Record<string, any> = {
    dni,
    candidato_id: enBlanco ? null : candidatoId,
    en_blanco: !!enBlanco
  }

  // Mantener compatibilidad si existen estas columnas
  if (typeof al.grado !== 'undefined') payload.grado = al.grado
  if (typeof al.seccion !== 'undefined') payload.seccion = al.seccion

  const { error: e1 } = await supa.from('votos').insert(payload)
  if (e1) return { ok: false, msg: 'No se pudo registrar el voto.' }

  // Marcar ya_voto = true
  const { error: e2 } = await supa
    .from('alumnos')
    .update({ ya_voto: true })
    .eq('dni', dni)

  if (e2) return { ok: false, msg: 'Voto guardado, pero no se pudo marcar ya_voto.' }

  return { ok: true }
})
