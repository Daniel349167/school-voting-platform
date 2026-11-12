import { defineEventHandler } from 'h3'
import { dbTable, getDatabase } from '../../utils/database'
import { summarize } from '../../../shared/results.mjs'

export default defineEventHandler(async () => {
  try {
    const db = getDatabase()
    const [config, alumnos, votos, candidatos] = await Promise.all([
      db.from(dbTable('configuracion')).select('abierta,termina_en').eq('id',1).single(),
      db.from(dbTable('alumnos')).select('grado'),
      db.from(dbTable('votos')).select('grado,candidato_id,en_blanco'),
      db.from(dbTable('candidatos')).select('id,nombre').order('id')
    ])
    if (config.error || alumnos.error || votos.error || candidatos.error) return { ok:false, msg:'No se pudieron consultar los resultados. Revisa la conexión con la base de datos.' }
    const hidden = config.data.abierta && (!config.data.termina_en || Date.now() < Date.parse(config.data.termina_en))
    return summarize(alumnos.data, votos.data, candidatos.data, { hidden })
  } catch {
    return { ok:false, msg:'La base de datos no está disponible. No se muestran resultados simulados.' }
  }
})
