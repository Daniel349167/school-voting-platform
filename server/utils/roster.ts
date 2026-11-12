import { dbTable, getDatabase } from './database'
export async function rosterEditable() {
  const db = getDatabase()
  const [c,v] = await Promise.all([
    db.from(dbTable('configuracion')).select('abierta').eq('id',1).single(),
    db.from(dbTable('votos')).select('*',{count:'exact',head:true})
  ])
  return !c.error && !v.error && c.data?.abierta === false && v.count === 0
}
