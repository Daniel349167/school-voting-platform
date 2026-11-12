import { defineEventHandler, readBody } from 'h3'
import { dbTable, getDatabase } from '../utils/database'
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (typeof body?.abierta !== 'boolean') return { ok: false, msg: 'Estado inválido.' }
  const db = getDatabase()
  if (body.abierta) {
    const [alumnos, candidatos] = await Promise.all([
      db.from(dbTable('alumnos')).select('*',{count:'exact',head:true}),
      db.from(dbTable('candidatos')).select('id').eq('activo',true)
    ])
    if (alumnos.error || candidatos.error || !alumnos.count || candidatos.data?.length !== 2) return { ok: false, msg: 'Carga el padrón y las dos listas antes de abrir la votación.' }
  }
  const { error } = await db.from(dbTable('configuracion')).update({ abierta: body.abierta }).eq('id',1)
  return error ? { ok: false, msg: 'No se pudo cambiar el estado.' } : { ok: true }
})
