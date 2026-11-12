import assert from 'node:assert/strict'
import { signSession } from '../shared/security.mjs'

const base = process.env.CHECK_BASE_URL || 'http://127.0.0.1:4016'
const secret = process.env.CHECK_SESSION_SECRET
if (!secret) throw new Error('CHECK_SESSION_SECRET debe coincidir con el secreto de un servidor de prueba local.')
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Esta prueba solo se ejecuta contra un servidor local.')
let checks=0
const request = (route,opts={}) => fetch(base+route,opts)
for (const [route,method] of [['/api/alumnos/import','POST'],['/api/alumnos/add','POST'],['/api/alumnos/delete','POST'],['/api/alumnos/export-generados','GET'],['/api/votos/emitir','POST'],['/api/votos/verificar','POST'],['/api/votos/export','GET'],['/api/votos/realtime','GET'],['/api/eleccion','GET'],['/api/eleccion','POST']]) {
  assert.equal((await request(route,{method,headers:{cookie:'user_role=docente'}})).status,401,route)
  checks++
}
assert.equal((await request('/api/votar',{method:'POST'})).status,410);checks++
assert.deepEqual(await (await request('/api/session',{headers:{cookie:'user_role=docente'}})).json(),{ok:false,role:null});checks++
for (const [role,route,method] of [['docente','/api/votos/emitir','POST'],['aperturador','/api/alumnos/import','POST'],['aperturador','/api/votos/export','GET']]) {
  const cookie='school_session='+signSession({id:'test',role},secret)
  assert.equal((await request(route,{method,headers:{cookie}})).status,403);checks++
}
const cookie='school_session='+signSession({id:'test',role:'docente'},secret)
assert.equal((await (await request('/api/session',{headers:{cookie}})).json()).role,'docente');checks++
assert.equal((await request('/api/logout',{method:'POST',headers:{origin:'https://otro.example'}})).status,403);checks++
assert.equal((await request('/api/logout',{method:'POST'})).headers.get('set-cookie').includes('school_session='),true);checks++
for (const route of ['/login','/resultados','/votar','/img/lista-1-2026.jpeg','/img/lista-2-2026.jpeg']) {assert.equal((await request(route)).status,200,route);checks++}
const unavailable=await (await request('/api/votos/resultados')).json()
assert.equal(unavailable.ok,false)
assert.ok(!unavailable.meta?.demo);checks++
console.log(`${checks} comprobaciones HTTP pasaron: roles, sesión, origen, páginas, imágenes y fallo de conexión sin datos simulados.`)
