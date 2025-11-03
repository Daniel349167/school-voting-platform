// server/api/votar.post.ts
import { defineEventHandler, readBody } from 'h3'
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dni: string; lista_id: number }>(event)

  if (!body.dni || !body.lista_id) {
    return { ok: false, msg: 'Datos incompletos' }
  }

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl,
    config.supabaseServiceRole
  )

  // 1. alumno
  const { data: alumno, error: errAlumno } = await supabase
    .from('alumnos')
    .select('dni, ya_voto')
    .eq('dni', body.dni)
    .single()

  if (errAlumno || !alumno) {
    return { ok: false, msg: 'DNI no registrado' }
  }

  if (alumno.ya_voto) {
    return { ok: false, msg: 'Este DNI ya votó' }
  }

  // 2. insertar voto
  const { error: errVoto } = await supabase.from('votos').insert({
    alumno_dni: body.dni,
    lista_id: body.lista_id
  })

  if (errVoto) {
    console.error(errVoto)
    return { ok: false, msg: 'No se pudo registrar el voto' }
  }

  // 3. marcar alumno como votó
  await supabase
    .from('alumnos')
    .update({ ya_voto: true })
    .eq('dni', body.dni)

  return { ok: true, msg: 'Voto registrado' }
})
