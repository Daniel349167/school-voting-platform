// server/api/alumnos/add.post.ts
import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

function normalizeGrado(grado: string | number): number | null {
  if (!grado) return null
  const g = String(grado)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (/^\d+$/.test(g)) return Number(g)

  switch (g) {
    case 'primero':
      return 1
    case 'segundo':
      return 2
    case 'tercero':
      return 3
    case 'cuarto':
      return 4
    case 'quinto':
      return 5
    default:
      return null
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    dni: string
    nombres?: string | null
    apellidos?: string | null
    grado: string | number
    seccion: string
  }>(event)

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl
  const serviceKey = config.supabaseServiceRole

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, msg: 'Supabase no configurado' }
  }

  if (!body.dni || !body.grado || !body.seccion) {
    return { ok: false, msg: 'dni, grado y seccion son obligatorios' }
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const gradoNum = normalizeGrado(body.grado)
  if (!gradoNum) {
    return { ok: false, msg: 'Grado no válido' }
  }

  const { error } = await supabase
    .from('alumnos')
    .upsert(
      {
        dni: body.dni.trim(),
        nombres: (body.nombres ?? '').trim(),
        apellidos: (body.apellidos ?? '').trim(),
        grado: gradoNum,
        seccion: body.seccion.trim()
      },
      {
        onConflict: 'dni'
      }
    )

  if (error) {
    console.error(error)
    return { ok: false, msg: 'Error al guardar alumno' }
  }

  return { ok: true }
})
