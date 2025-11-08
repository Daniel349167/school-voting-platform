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

  const s = raw.toLowerCase()
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

/** Normaliza sección a una letra o cadena mayúscula sin tildes. */
function normalizeSeccion(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim().toUpperCase()
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Genera DNI si está vacío: 2 letras paterno + 2 materno + '1111'.
 *  Desambiguación: si ya existe en el batch, aumenta el sufijo numérico. */
function generarDniSiFalta(apellidos: string, usados: Set<string>): string {
  const parts = (apellidos || '').trim().split(/\s+/)
  const paterno = (parts[0] || 'XX').toUpperCase()
  const materno = (parts[1] || 'XX').toUpperCase()

  const p2 = (paterno.slice(0, 2) || 'XX').replace(/[^A-Z]/g, 'X')
  const m2 = (materno.slice(0, 2) || 'XX').replace(/[^A-Z]/g, 'X')

  let base = `${p2}${m2}1111` // 8 caracteres
  if (!usados.has(base)) {
    usados.add(base)
    return base
  }
  // desambiguar cambiando el último bloque numérico
  let n = 1112
  while (usados.has(`${p2}${m2}${n}`) && n <= 9999) n++
  const cand = `${p2}${m2}${String(n).padStart(4, '0')}`.slice(0, 8)
  usados.add(cand)
  return cand
}

export default defineEventHandler(async (event) => {
  // 1) Payload
  const body = await readBody<{ alumnos: AlumnoIn[]; totalRows?: number }>(event)
  const recibidos = Array.isArray(body?.alumnos) ? body.alumnos : []
  const totalRecibidos = typeof body?.totalRows === 'number' ? body.totalRows : recibidos.length

  // 2) Config Supabase
  const cfg = useRuntimeConfig()
  const supabaseUrl = cfg.public.supabaseUrl
  const serviceKey = cfg.supabaseServiceRole
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, msg: 'Supabase no configurado', total: totalRecibidos, inserted: 0, discarded: 0 }
  }
  const supa = createClient(supabaseUrl, serviceKey)

  // 3) Normalización + generación de DNI faltante
  const usadosEnBatch = new Set<string>()
  const limpiar = (v?: string | null) => (v ?? '').toString().trim()

  const preparados = recibidos.map((a) => {
    let dni = limpiar(a.dni)
    const nombres = limpiar(a.nombres)
    const apellidos = limpiar(a.apellidos)
    const gradoTxt = normalizeGradoToText(a.grado as any) // ← DB: TEXT NOT NULL
    const seccionTxt = normalizeSeccion(a.seccion)

    if (!dni) {
      dni = generarDniSiFalta(apellidos, usadosEnBatch)
    } else {
      // asegurar unicidad dentro del mismo batch
      if (usadosEnBatch.has(dni)) {
        dni = generarDniSiFalta(apellidos, usadosEnBatch)
      } else {
        usadosEnBatch.add(dni)
      }
    }

    return {
      dni,                                 // PK
      nombres: nombres || '',              // NOT NULL en tu schema
      apellidos: apellidos || '',          // NOT NULL en tu schema
      grado: gradoTxt,                     // TEXT NOT NULL ('' si no se reconoce)
      seccion: seccionTxt || '',           // NOT NULL
    }
  })

  // inválidos solo si POR ALGUNA RAZÓN quedó sin dni (no debería pasar)
  const validos = preparados.filter(a => a.dni.length > 0)

  if (validos.length === 0) {
    return {
      ok: false,
      msg: 'No había alumnos con DNI para procesar.',
      total: totalRecibidos,
      inserted: 0,
      discarded: totalRecibidos
    }
  }

  // 4) Upsert por lotes sobre PK (dni)
  //    IMPORTANTE: en tu tabla ya existe PRIMARY KEY (dni) → sirve como onConflict
  let afectados = 0

  for (let i = 0; i < validos.length; i += BATCH_SIZE) {
    const slice = validos.slice(i, i + BATCH_SIZE)

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
        discarded: totalRecibidos - (i + slice.length) // aproximación de lo que faltó procesar
      }
    }

    afectados += data?.length ?? 0
  }

  return {
    ok: true,
    msg: 'Alumnos importados/actualizados correctamente.',
    total: totalRecibidos,
    inserted: afectados,
    discarded: totalRecibidos - validos.length // los únicos descartados serían los sin DNI imposible (no debería ocurrir)
  }
})
