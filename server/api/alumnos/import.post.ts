// server/api/alumnos/import.post.ts
import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

function normalizeGrado(grado: string | number): number | null {
  if (!grado) return null

  const g = String(grado)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (/^\d+$/.test(g)) {
    return Number(g)
  }

  switch (g) {
    case 'primero':
    case '1ro':
    case '1°':
      return 1
    case 'segundo':
    case '2do':
    case '2°':
      return 2
    case 'tercero':
    case '3ro':
    case '3°':
      return 3
    case 'cuarto':
    case '4to':
    case '4°':
      return 4
    case 'quinto':
    case '5to':
    case '5°':
      return 5
    default:
      return null
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    alumnos: any[]
    totalRows?: number
  }>(event)

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl
  const serviceKey = config.supabaseServiceRole

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, msg: 'Supabase no configurado' }
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const recibidosValidos = Array.isArray(body.alumnos) ? body.alumnos : []

  // 👇 este es el total REAL que leyó el front (válidos + vacíos)
  const totalRecibidos = typeof body.totalRows === 'number'
    ? body.totalRows
    : recibidosValidos.length

  // preparamos los que se van a insertar
  const alumnosParaInsertar = recibidosValidos.map((a) => ({
    dni: String(a.dni).trim(),
    nombres: a.nombres || '',
    apellidos: a.apellidos || '',
    grado: normalizeGrado(a.grado),
    seccion: a.seccion || ''
  }))

  const descartados = totalRecibidos - alumnosParaInsertar.length

  // 1. borrar todo (padrón nuevo)
  // ⚠️ aquí supongo que la tabla se llama "alumnos"
  const { error: delError } = await supabase
    .from('alumnos')
    .delete()
    .neq('dni', '') // si quieres borrar TODO-TODO, cambia esto

  if (delError) {
    console.error(delError)
    return {
      ok: false,
      msg: 'No se pudo limpiar la tabla de alumnos',
      total: totalRecibidos,
      inserted: 0,
      discarded: descartados
    }
  }

  if (!alumnosParaInsertar.length) {
    return {
      ok: false,
      msg: 'No había alumnos con número de documento.',
      total: totalRecibidos,
      inserted: 0,
      discarded: descartados
    }
  }

  const { error: insError } = await supabase
    .from('alumnos')
    .insert(alumnosParaInsertar)

  if (insError) {
    console.error(insError)
    return {
      ok: false,
      msg: 'Error al insertar los alumnos.',
      total: totalRecibidos,
      inserted: 0,
      discarded: descartados
    }
  }

  return {
    ok: true,
    msg: 'Alumnos importados correctamente.',
    total: totalRecibidos,
    inserted: alumnosParaInsertar.length,
    discarded: descartados
  }
})
