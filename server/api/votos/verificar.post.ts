import { dbTable } from '../../utils/database'
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

  if (typeof dni !== 'string' || !/^[A-Z0-9-]{4,32}$/.test(dni)) return { ok:false, msg:'Ingresa un DNI o código válido.' }
  const { data: election, error: electionError } = await supa.from(dbTable('configuracion')).select('abierta,voto_blanco,inicia_en,termina_en').eq('id',1).single()
  if (electionError) return { ok:false, msg:'No se pudo consultar el estado de la votación.' }
  if (!election.abierta || (election.inicia_en && Date.now() < Date.parse(election.inicia_en)) || (election.termina_en && Date.now() >= Date.parse(election.termina_en))) return { ok:false, msg:'La votación está cerrada.' }

  // Buscar alumno SOLO por DNI (padrón del colegio)
  const { data: al, error: e1 } = await supa
    .from(dbTable('alumnos'))
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
    .from(dbTable('candidatos'))
    .select('id,nombre,descripcion,imagen')
    .eq('activo', true)
    .order('id', { ascending: true })

  if (e2) {
    return { ok: false, msg: 'Error cargando candidatos.' }
  }

  return {
    ok: true,
    alumno: { ...al, en_colegio: true },
    votoBlanco: election.voto_blanco,
    candidatos: cands || []
  }
})
