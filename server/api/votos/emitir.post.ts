import { defineEventHandler, readBody } from 'h3'
import { validateVote } from '../../../shared/security.mjs'
import { getDatabase, getVoteFunction } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const cfg = useRuntimeConfig()
  const allowBlank = /^(si|sí|yes|true|1|on)$/i.test(String(cfg.public.VOTO_BLANCO))
  const invalid = validateVote(body, allowBlank)
  if (invalid) return { ok: false, msg: invalid }
  const { data, error } = await getDatabase().rpc(getVoteFunction(), { p_dni: body.dni, p_candidato_id: body.candidatoId, p_en_blanco: body.enBlanco })
  if (error) return { ok: false, msg: 'No se pudo registrar el voto. Comprueba tu conexión e intenta de nuevo.' }
  return data
})
