import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { dni, grado, seccion } = await readBody<{ dni: string; grado: number; seccion: string }>(event)

  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  if (!dni || !grado || !seccion) return { ok:false, msg:'Faltan datos.' }

  // Alumno debe existir en ese salón y no haber votado
  const { data: al, error: e1 } = await supa
    .from('alumnos')
    .select('dni,nombres,apellidos,grado,seccion,ya_voto')
    .eq('dni', dni)
    .eq('grado', String(grado))  // tu columna es text, comparamos como string
    .eq('seccion', seccion)
    .maybeSingle()

  if (e1) return { ok:false, msg:'Error consultando alumno.' }
  if (!al) return { ok:false, msg:'No estás en este salón.' }
  if (al.ya_voto) return { ok:false, msg:'Este DNI ya votó.' }

  // Candidatos activos
  const { data: cands, error: e2 } = await supa
    .from('candidatos')
    .select('id,nombre,descripcion')
    .eq('activo', true)
    .order('id', { ascending: true })

  if (e2) return { ok:false, msg:'Error cargando candidatos.' }

  return { ok:true, alumno: al, candidatos: cands || [] }
})
