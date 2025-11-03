// server/api/votos/realtime.get.ts
import { defineEventHandler } from 'h3'
import { createClient } from '@supabase/supabase-js'

type Voto = {
  dni: string
  grado: any
  seccion: string
  candidato_id: number | null
  en_blanco: boolean
  // created_at: string   // ❌ NO USAR
  creado_en: string      // ✅ CHANGED: usar esta columna real
}
type Alumno = { dni: string; grado: any; seccion: string }
type Candidato = { id: number; nombre: string }

const toNum = (v:any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export default defineEventHandler(async () => {
  try {
    const cfg = useRuntimeConfig()
    const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

    const candQ = await supa.from('candidatos').select('id,nombre')
    if (candQ.error) return { ok:false, msg:'Error leyendo candidatos' }
    const candidatos = (candQ.data || []) as Candidato[]

    const alQ = await supa.from('alumnos').select('dni,grado,seccion')
    if (alQ.error) return { ok:false, msg:'Error leyendo alumnos' }
    const alumnos = ((alQ.data || []) as Alumno[]).map(a => ({...a, grado: toNum(a.grado)}))

    // ✅ CHANGED: seleccionar creado_en, NO created_at
    const vtQ = await supa
      .from('votos')
      .select('dni,grado,seccion,candidato_id,en_blanco,creado_en') // CHANGED
      .order('creado_en', { ascending: true })                       // CHANGED
    if (vtQ.error) return { ok:false, msg:'Error leyendo votos' }

    const votos = ((vtQ.data || []) as Voto[]).map(v => ({...v, grado: toNum(v.grado)}))
    const totalAlumnos = alumnos.length
    const totalEmitidos = votos.length

    // Conteo por lista
    const keyBlanco = -1
    const counts: Record<number, number> = {}
    for (const v of votos) {
      const id = (v.en_blanco || v.candidato_id == null) ? keyBlanco : Number(v.candidato_id)
      counts[id] = (counts[id] || 0) + 1
    }

    const porLista = [
      ...candidatos.map(c => ({ id:c.id, nombre:c.nombre, conteo: counts[c.id] || 0 })),
      { id: keyBlanco, nombre: 'Voto en blanco', conteo: counts[keyBlanco] || 0 }
    ].sort((a,b)=> b.conteo - a.conteo)

    return { ok:true, totales: { totalAlumnos, totalEmitidos, porLista } }
  } catch (e:any) {
    return { ok:false, msg: e?.message || 'Error inesperado' }
  }
})
