// server/api/votos/resultados.get.ts
import { defineEventHandler } from 'h3'
import { createClient } from '@supabase/supabase-js'

/** Tipos simples y 100% serializables */
type Voto = {
  dni: string
  grado: any
  seccion: string
  candidato_id: number | null
  en_blanco: boolean
  // En BD existe creado_en; internamente normalizaremos a created_at
  created_at?: string | null
  creado_en?: string | null
}
type Alumno = { dni: string; grado: any; seccion: string }
type Candidato = { id: number; nombre: string }

const GRADOS = [1, 2, 3, 4, 5]
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Tamaño de bloque desde runtimeConfig.public o default 3 */
function getBlockSize(cfg: any): number {
  const n =
    Number(cfg?.public?.PUBLIC_RESULT_BLOCK) ||
    Number(cfg?.PUBLIC_RESULT_BLOCK) ||
    Number(process.env.PUBLIC_RESULT_BLOCK)
  return Number.isFinite(n) && n > 0 ? n : 3
}

/** Conteo por lista serializable */
function contarPorLista(votosArr: Voto[], candidatos: Candidato[]) {
  const keyBlanco = -1
  const counts: Record<number, number> = {}
  for (const v of votosArr) {
    const id =
      v.en_blanco || v.candidato_id == null ? keyBlanco : Number(v.candidato_id)
    counts[id] = (counts[id] || 0) + 1
  }
  return [
    ...candidatos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      conteo: counts[c.id] || 0,
    })),
    { id: keyBlanco, nombre: 'Voto en blanco', conteo: counts[keyBlanco] || 0 },
  ]
}

function buildZeroPayload(
  totalAlumnos: number,
  alumnosN: Array<{ grado: number }>,
  candidatos: Candidato[],
  block: number
) {
  const porListaCero = contarPorLista([], candidatos)
  const porGrado: any = {}
  for (const g of GRADOS) {
    const totalAlG = alumnosN.filter((a) => a.grado === g).length
    porGrado[g] = { totalAlumnos: totalAlG, emitidos: 0, porLista: porListaCero }
  }
  return {
    ok: true,
    meta: { block },
    totales: { totalAlumnos, totalEmitidos: 0, porLista: porListaCero },
    porGrado,
  }
}

export default defineEventHandler(async () => {
  try {
    const cfg = useRuntimeConfig()
    const BLOCK = getBlockSize(cfg)

    const supabaseUrl = cfg?.public?.supabaseUrl
    const serviceRole = cfg?.supabaseServiceRole
    if (!supabaseUrl || !serviceRole) {
      return { ok: false, msg: 'Config de Supabase faltante (URL o SERVICE_ROLE)' }
    }

    const supa = createClient(supabaseUrl, serviceRole)

    // === Catálogos ===
    const candQ = await supa.from('candidatos').select('id,nombre')
    if (candQ.error) return { ok: false, msg: `Error leyendo candidatos: ${candQ.error.message}` }
    const candidatos = (candQ.data || []) as Candidato[]

    const alQ = await supa.from('alumnos').select('dni,grado,seccion')
    if (alQ.error) return { ok: false, msg: `Error leyendo alumnos: ${alQ.error.message}` }
    const alumnos = (alQ.data || []) as Alumno[]
    const alumnosN = alumnos.map((a) => ({ ...a, grado: toNum(a.grado) }))
    const totalAlumnos = alumnosN.length

    // Totales por grado (actuales) para inyectar siempre
    const totalAlumnosPorGrado: Record<number, number> = {}
    for (const g of GRADOS) {
      totalAlumnosPorGrado[g] = alumnosN.filter((a) => a.grado === g).length
    }

    // === Votos (ordenados por creado_en; tolerante a esquema) ===
    let votos: Voto[] = []
    let vtQ = await supa
      .from('votos')
      .select('dni,grado,seccion,candidato_id,en_blanco,creado_en')
      .order('creado_en', { ascending: true })

    if (vtQ.error) {
      // Tabla no existe
      if (vtQ.error.code === '42P01') {
        return buildZeroPayload(totalAlumnos, alumnosN, candidatos, BLOCK)
      }
      // Falta columna (no debería pasar con tu esquema actual), intentamos sin order
      if (vtQ.error.code === '42703') {
        vtQ = await supa
          .from('votos')
          .select('dni,grado,seccion,candidato_id,en_blanco,creado_en')
        if (vtQ.error) {
          return { ok: false, msg: `Error leyendo votos: ${vtQ.error.message}` }
        }
        votos = (vtQ.data || []) as Voto[]
      } else {
        return { ok: false, msg: `Error leyendo votos: ${vtQ.error.message}` }
      }
    } else {
      votos = (vtQ.data || []) as Voto[]
    }

    // Normaliza grado y expone created_at desde creado_en (por compatibilidad interna)
    const votosN = votos.map((v) => ({
      ...v,
      grado: toNum(v.grado),
      created_at: v.created_at ?? v.creado_en ?? null,
    }))

    // === CLAMP general + desbloqueo final ===
    const totalEmitidosLive = votosN.length
    const isFinalGeneral = totalAlumnos > 0 && totalEmitidosLive >= totalAlumnos
    const cutoffGeneral = isFinalGeneral
      ? totalEmitidosLive
      : Math.floor(totalEmitidosLive / BLOCK) * BLOCK
    const votosGeneralK = votosN.slice(0, cutoffGeneral)

    // === CLAMP por grado + desbloqueo final por grado ===
    const porGradoClamped: any = {}
    for (const g of GRADOS) {
      const alG = alumnosN.filter((a) => a.grado === g)
      const vtG = votosN.filter((v) => toNum(v.grado) === g)
      const isFinalG = alG.length > 0 && vtG.length >= alG.length
      const cutoffG = isFinalG ? vtG.length : Math.floor(vtG.length / BLOCK) * BLOCK
      const vtGK = vtG.slice(0, cutoffG)
      porGradoClamped[g] = {
        totalAlumnos: alG.length,
        emitidos: vtGK.length,
        porLista: contarPorLista(vtGK, candidatos),
      }
    }

    const payloadClamped = {
      ok: true,
      meta: { block: BLOCK },
      totales: {
        totalAlumnos,
        totalEmitidos: votosGeneralK.length,
        porLista: contarPorLista(votosGeneralK, candidatos),
      },
      porGrado: porGradoClamped,
    }

    // === Snapshot (auto-reclamp si cambió block) ===
    const snapQ = await supa
      .from('resultados_publicos')
      .select('id,last_public_total,payload')
      .eq('id', 'general')
      .maybeSingle()

    // Si la tabla no existe → devuelve clamped sin romper
    if (snapQ.error && snapQ.error.code === '42P01') {
      return payloadClamped
    }
    if (snapQ.error && !snapQ.data) {
      return payloadClamped
    }

    const last = snapQ.data?.last_public_total ?? 0
    const snapBlock = Number(snapQ.data?.payload?.meta?.block)
    const blockChanged = snapBlock && snapBlock !== BLOCK

    // Si cambió el tamaño de bloque → reescribe snapshot con el nuevo clamp
    if (blockChanged) {
      await supa.from('resultados_publicos').upsert({
        id: 'general',
        last_public_total: payloadClamped.totales.totalEmitidos,
        payload: payloadClamped as any,
        updated_at: new Date().toISOString(),
      })
      return payloadClamped
    }

    // Publica cuando avanzamos al siguiente múltiplo (o final)
    const shouldPublish = payloadClamped.totales.totalEmitidos > last
    if (shouldPublish) {
      await supa.from('resultados_publicos').upsert({
        id: 'general',
        last_public_total: payloadClamped.totales.totalEmitidos,
        payload: payloadClamped as any,
        updated_at: new Date().toISOString(),
      })
      return payloadClamped
    }

    // === Si no hay nuevo múltiplo, devolvemos snapshot parcheando totales actuales de alumnos
    if (snapQ.data?.payload) {
      const p = snapQ.data.payload as any

      // Parche de totales generales
      const totalesPatched = {
        ...(p?.totales ?? {}),
        totalAlumnos,
      }

      // Parche por grado (inyecta total de alumnos actuales por grado)
      const porGradoPatched: any = {}
      for (const g of GRADOS) {
        const snapG = p?.porGrado?.[g] ?? {}
        porGradoPatched[g] = {
          ...snapG,
          totalAlumnos: totalAlumnosPorGrado[g],
        }
      }

      return {
        ok: true,
        meta: p?.meta ?? { block: BLOCK },
        totales: totalesPatched,
        porGrado: porGradoPatched,
      }
    }

    // Si no hay snapshot y hay algo de datos, devuelve clamped
    if (payloadClamped.totales.totalEmitidos > 0) {
      return payloadClamped
    }

    // Todo en cero (pero con totales de alumnos correctos)
    return buildZeroPayload(totalAlumnos, alumnosN, candidatos, BLOCK)
  } catch (e: any) {
    const msg =
      (e && e.message) ||
      (typeof e === 'string' ? e : 'Error inesperado en resultados')
    return { ok: false, msg }
  }
})
