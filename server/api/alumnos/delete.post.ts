// server/api/alumnos/delete.post.ts
import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dni: string }>(event)

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl
  const serviceKey = config.supabaseServiceRole

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, msg: 'Supabase no configurado' }
  }

  if (!body.dni) {
    return { ok: false, msg: 'dni es obligatorio' }
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { error, count } = await supabase
    .from('alumnos')
    .delete({ count: 'exact' })
    .eq('dni', body.dni.trim())

  if (error) {
    console.error(error)
    return { ok: false, msg: 'Error al eliminar' }
  }

  if (!count) {
    return { ok: false, msg: 'No se encontró alumno con ese DNI' }
  }

  return { ok: true }
})
