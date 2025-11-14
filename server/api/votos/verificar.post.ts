import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

type VerificarBody = {
  dni: string
}

export default defineEventHandler(async (event) => {
  const { dni } = await readBody<VerificarBody>(event)

  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  if (!dni) {
    return { ok: false, msg: 'Falta DNI.' }
  }

  // Buscar alumno SOLO por DNI (padrón del colegio)
  const { data: al, error: e1 } = await supa
    .from('alumnos')
    .select('dni,nombres,apellidos,grado,seccion,ya_voto')
    .eq('dni', dni)
    .maybeSingle()

  if (e1) {
    return { ok: false, msg: 'Error consultando alumno.' }
  }

  // Si no existe en el padrón -> en_colegio = false (frontend mostrará mensaje)
  if (!al) {
    return {
      ok: true,
      alumno: {
        dni,
        nombres: '',
        apellidos: '',
        ya_voto: false,
        en_colegio: false
      },
      candidatos: []
    }
  }

  // Si ya votó, devolvemos la marca para que el frontend bloquee
  if (al.ya_voto) {
    return {
      ok: true,
      alumno: { ...al, en_colegio: true }, // existe en padrón
      candidatos: []
    }
  }

  // Cargar candidatos activos
  const { data: cands, error: e2 } = await supa
    .from('candidatos')
    .select('id,nombre,descripcion')
    .eq('activo', true)
    .order('id', { ascending: true })

  if (e2) {
    return { ok: false, msg: 'Error cargando candidatos.' }
  }

  return {
    ok: true,
    alumno: { ...al, en_colegio: true },
    candidatos: cands || []
  }
})
