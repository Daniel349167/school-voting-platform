// server/api/alumnos/import.post.ts
import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

type AlumnoIn = {
  dni?: string
  nombres?: string
  apellidos?: string
  grado?: number | string | null
  seccion?: string | null
}

const BATCH_SIZE = 500

/** Normaliza grado a texto '1'..'5' cuando sea posible.
 *  Si no se reconoce, retorna cadena no vacía (o '' si viene vacío/null). */
function normalizeGradoToText(v: unknown): string {
  if (v === null || v === undefined) return ''
  const raw = String(v).trim()

  if (/^[1-5]$/.test(raw)) return raw

  const s = raw
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')

  const map: Record<string, string> = {
    'primero': '1', '1ro': '1', '1°': '1', '1er': '1',
    'segundo': '2', '2do': '2', '2°': '2',
    'tercero': '3', '3ro': '3', '3°': '3',
    'cuarto':  '4', '4to': '4', '4°': '4',
    'quinto':  '5', '5to': '5', '5°': '5',
  }
  if (map[s]) return map[s]

  // intenta extraer primer dígito 1..5
  const d = s.match(/[1-5]/)?.[0]
  if (d) return d

  // como la columna es NOT NULL, devolvemos '' (vacío ≠ null)
  return raw || ''
}

/** Normaliza sección a mayúsculas sin tildes. */
function normalizeSeccion(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim().toUpperCase()
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export default defineEventHandler(async (event) => {
  // 1) Payload
  const body = await readBody<{ alumnos: AlumnoIn[]; totalRows?: number }>(event)
  const recibidos = Array.isArray(body?.alumnos) ? body.alumnos : []
  const totalRecibidos =
    typeof body?.totalRows === 'number' ? body.totalRows : recibidos.length

  // 2) Config Supabase
  const cfg = useRuntimeConfig()
  const supabaseUrl = cfg.public.supabaseUrl
  const serviceKey = cfg.supabaseServiceRole
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      msg: 'Supabase no configurado',
      total: totalRecibidos,
      inserted: 0,
      discarded: 0,
    }
  }
  const supa = createClient(supabaseUrl, serviceKey)

  // 3) Normalización (SIN generar DNIs)
  const limpiar = (v?: string | null) => (v ?? '').toString().trim()

  // Dedup por dni dentro del batch para evitar conflictos en un mismo lote
  const seen = new Set<string>()
  const preparados = []
  for (const a of recibidos) {
    const dni = limpiar(a.dni) // ← viene del frontend (DNI real o código de estudiante)
    if (!dni) continue // descartamos filas sin DNI/código

    if (seen.has(dni)) continue
    seen.add(dni)

    const nombres = limpiar(a.nombres)
    const apellidos = limpiar(a.apellidos)
    const gradoTxt = normalizeGradoToText(a.grado as any)
    const seccionTxt = normalizeSeccion(a.seccion)

    preparados.push({
      dni,                                 // PK
      nombres: nombres || '',              // NOT NULL
      apellidos: apellidos || '',          // NOT NULL
      grado: gradoTxt,                     // TEXT NOT NULL ('' si no se reconoce)
      seccion: seccionTxt || '',           // NOT NULL
    })
  }

  if (preparados.length === 0) {
    return {
      ok: false,
      msg: 'No hay alumnos válidos con DNI/código para procesar.',
      total: totalRecibidos,
      inserted: 0,
      discarded: totalRecibidos,
    }
  }

  // 4) Upsert por lotes sobre PK (dni)
  let afectados = 0

  for (let i = 0; i < preparados.length; i += BATCH_SIZE) {
    const slice = preparados.slice(i, i + BATCH_SIZE)

    const { data, error } = await supa
      .from('alumnos')
      .upsert(slice, { onConflict: 'dni', ignoreDuplicates: false })
      .select('dni') // contar filas afectadas

    if (error) {
      console.error('Upsert error (lote', i / BATCH_SIZE, '):', error)
      return {
        ok: false,
        msg: 'Error al insertar/actualizar alumnos.',
        total: totalRecibidos,
        inserted: afectados,
        discarded: totalRecibidos - (i + slice.length), // aproximación
      }
    }

    afectados += data?.length ?? 0
  }

  return {
    ok: true,
    msg: 'Alumnos importados/actualizados correctamente.',
    total: totalRecibidos,
    inserted: afectados,
    discarded: totalRecibidos - preparados.length,
  }
})
