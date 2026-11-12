import { defineEventHandler, readBody } from 'h3'
import { getDatabase } from '../../utils/database'
import { withPracticeDatabase } from '../../utils/practice-scope.mjs'
import changeElection from '../eleccion.post'

export default defineEventHandler(async (event) => {
  const body=await readBody(event)
  if (body?.reiniciar === true) {
    const {data,error}=await getDatabase().rpc('reiniciar_practica_2026')
    return error ? {ok:false,msg:'No se pudo reiniciar la práctica.'} : data
  }
  return withPracticeDatabase(()=>changeElection(event))
})
