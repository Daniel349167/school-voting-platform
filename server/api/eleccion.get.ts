import { defineEventHandler } from 'h3'
import { dbTable, getDatabase } from '../utils/database'
export default defineEventHandler(async () => {
  const db = getDatabase()
  const [config, alumnos, votos] = await Promise.all([
    db.from(dbTable('configuracion')).select('abierta,voto_blanco,inicia_en,termina_en').eq('id',1).single(),
    db.from(dbTable('alumnos')).select('*',{count:'exact',head:true}),
    db.from(dbTable('votos')).select('*',{count:'exact',head:true})
  ])
  if (config.error || alumnos.error || votos.error) return { ok: false, msg: 'No se pudo consultar la elección. Revisa la conexión y la migración.' }
  return { ok: true, ...config.data, alumnos: alumnos.count, votos: votos.count }
})
