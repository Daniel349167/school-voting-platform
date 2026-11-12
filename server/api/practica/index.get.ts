import { defineEventHandler } from 'h3'
import { getDatabase } from '../../utils/database'
import { summarize } from '../../../shared/results.mjs'

export default defineEventHandler(async () => {
  const db = getDatabase()
  const [config,students,candidates,votes] = await Promise.all([
    db.from('practica_2026_configuracion').select('abierta,voto_blanco').eq('id',1).single(),
    db.from('practica_2026_alumnos').select('dni,nombres,apellidos,grado,seccion,ya_voto').order('dni'),
    db.from('practica_2026_candidatos').select('id,nombre,descripcion,imagen').order('id'),
    db.from('practica_2026_votos').select('grado,candidato_id,en_blanco')
  ])
  if (config.error || students.error || candidates.error || votes.error) return {ok:false,msg:'No se pudo cargar la práctica. Comprueba su instalación.'}
  return {ok:true,practice:true,...config.data,alumnos:students.data,candidatos:candidates.data,totales:summarize(students.data,votes.data,candidates.data).totales}
})
