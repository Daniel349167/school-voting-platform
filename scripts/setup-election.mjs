import fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { hashPassword } from '../shared/security.mjs'

const prefix = 'eleccion_2026_'
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE en .env.')
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {auth:{persistSession:false}})
const action = process.argv[2]
if (action === 'import') {
  const file = process.argv[3]
  if (!file) throw new Error('Falta la ruta al padrón JSON preparado.')
  const { alumnos, errors } = JSON.parse(await fs.readFile(file,'utf8'))
  if (!Array.isArray(alumnos) || !alumnos.length || errors?.length) throw new Error('Padrón inválido.')
  const c = await db.from(prefix+'configuracion').select('abierta').eq('id',1).single()
  const v = await db.from(prefix+'votos').select('*',{count:'exact',head:true})
  if (c.error || v.error) throw new Error('Ejecuta primero la migración SQL y comprueba la conexión.')
  if (c.data.abierta || v.count !== 0) throw new Error('Solo se importa antes del primer voto y con la elección cerrada.')
  const result = await db.from(prefix+'alumnos').upsert(alumnos,{onConflict:'dni'}).select('dni')
  if (result.error) throw new Error(result.error.message)
  console.log(`${result.data.length} alumnos importados. La votación sigue cerrada.`)
} else if (action === 'migrate-users') {
  const old = await db.from('usuarios').select('email,password,role')
  if (old.error) throw new Error('No se pudieron leer los usuarios anteriores. Usa la acción user para un proyecto nuevo.')
  const users = old.data.filter(u => ['docente','aperturador'].includes(u.role)).map(u => ({email:u.email.trim().toLowerCase(),role:u.role,password:u.password.startsWith('scrypt$') ? u.password : hashPassword(u.password)}))
  if (!users.length) throw new Error('No hay usuarios anteriores para migrar.')
  const r = await db.from(prefix+'usuarios').upsert(users,{onConflict:'email',ignoreDuplicates:true})
  if (r.error) throw new Error(r.error.message)
  console.log('Usuarios anteriores migrados con sus mismas contraseñas, protegidas mediante scrypt.')
} else if (action === 'user') {
  const [email, role] = process.argv.slice(3)
  if (!email || !['docente','aperturador'].includes(role)) throw new Error('Uso: setup-election.mjs user correo docente|aperturador (contraseña por stdin)')
  let input=''
  for await (const chunk of process.stdin) input+=chunk
  const password=input.trim()
  if (password.length < 12 || password.length > 256) throw new Error('La contraseña debe tener entre 12 y 256 caracteres.')
  const result = await db.from(prefix+'usuarios').insert({email:email.trim().toLowerCase(),role,password:hashPassword(password)})
  if (result.error) throw new Error(result.error.message)
  console.log('Usuario creado. No se guardó la contraseña en texto claro.')
} else throw new Error('Acciones: import o user.')
