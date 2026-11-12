<script setup lang="ts">
const router=useRouter()
const role=ref<string|null>(null)
const checkedSession=ref(false)
const data=ref<any>(null)
const busy=ref(false)
const error=ref('')
const notice=ref('')
const code=ref('')
const student=ref<any>(null)
const choice=ref<number|'blanco'|null>(null)
let timer:ReturnType<typeof setInterval>|undefined

const refresh=async()=>{
  try {
    const result:any=await $fetch('/api/practica')
    if(!result.ok) throw new Error(result.msg)
    data.value=result
    if(!result.abierta){student.value=null;choice.value=null}
  } catch(e:any){error.value=e.data?.statusMessage||e.message||'No se pudo consultar la práctica.'}
}
onMounted(async()=>{
  try {
    const session:any=await $fetch('/api/session')
    role.value=session.ok?session.role:null
    if(role.value){await refresh();timer=setInterval(refresh,5000)}
  } finally {checkedSession.value=true}
})
onUnmounted(()=>{if(timer)clearInterval(timer)})

const control=async(reset=false)=>{
  if(busy.value||!data.value)return
  if(reset&&!window.confirm('¿Borrar los votos ficticios de la práctica y dejarla cerrada?'))return
  busy.value=true;error.value='';notice.value=''
  try {
    const result:any=await $fetch('/api/practica/control',{method:'POST',body:reset?{reiniciar:true}:{abierta:!data.value.abierta}})
    if(!result.ok)throw new Error(result.msg)
    student.value=null;choice.value=null;code.value=''
    notice.value=reset?'La práctica se reinició. Los tres códigos pueden volver a votar.':''
    await refresh()
  } catch(e:any){error.value=e.data?.statusMessage||e.message}
  finally {busy.value=false}
}
const verify=async()=>{
  if(busy.value)return
  busy.value=true;error.value='';notice.value=''
  try {
    const result:any=await $fetch('/api/practica/verificar',{method:'POST',body:{dni:code.value.trim().toUpperCase()}})
    if(!result.ok)throw new Error(result.msg)
    if(!result.alumno?.en_colegio)throw new Error('Usa uno de los tres códigos ficticios que aparecen aquí.')
    if(result.alumno.ya_voto)throw new Error('Este código ya votó en la práctica. Prueba otro o pide al docente que la reinicie.')
    student.value=result.alumno;choice.value=null
  } catch(e:any){error.value=e.data?.statusMessage||e.message}
  finally {busy.value=false}
}
const vote=async()=>{
  if(busy.value||choice.value===null||!student.value)return
  busy.value=true;error.value=''
  try {
    const result:any=await $fetch('/api/practica/emitir',{method:'POST',body:{dni:student.value.dni,candidatoId:choice.value==='blanco'?null:choice.value,enBlanco:choice.value==='blanco'}})
    if(!result.ok)throw new Error(result.msg)
    notice.value='Voto de práctica registrado. Puedes probar con otro código.'
    student.value=null;choice.value=null;code.value=''
    await refresh()
  } catch(e:any){error.value=e.data?.statusMessage||e.message}
  finally {busy.value=false}
}
const logout=async()=>{await $fetch('/api/logout',{method:'POST'});await router.push('/login?next=/practica')}
</script>

<template>
  <main class="practice-page">
    <header class="practice-header">
      <div><span class="practice-label">PRÁCTICA CON DATOS FICTICIOS</span><h1>Prueba la votación</h1><p>Estos votos se guardan en el espacio de pruebas.</p></div>
      <nav><NuxtLink :to="role==='docente'?'/docente':role==='aperturador'?'/votar':'/login'">Volver al sistema</NuxtLink><button v-if="role" @click="logout">Cambiar de cuenta</button></nav>
    </header>
    <section v-if="checkedSession&&!role" class="practice-panel">
      <h2>Entra con una cuenta del personal</h2>
      <p>El docente abre y reinicia la práctica. La cuenta de mesa permite probar la cédula.</p>
      <NuxtLink class="practice-button" to="/login?next=/practica">Iniciar sesión para practicar</NuxtLink>
    </section>
    <p v-if="error" class="practice-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="practice-notice" role="status">{{ notice }}</p>
    <template v-if="data">
      <section class="practice-panel">
        <div class="practice-status"><h2>Jornada de prueba</h2><span>{{ data.abierta?'Práctica abierta':'Práctica cerrada' }}</span></div>
        <p>{{ data.totales.totalAlumnos }} alumnos ficticios · {{ data.totales.totalEmitidos }} votos de práctica</p>
        <div v-if="role==='docente'" class="practice-actions">
          <button class="practice-button" :disabled="busy" @click="control()">{{ data.abierta?'Cerrar práctica':'Abrir práctica' }}</button>
          <button class="practice-button secondary" :disabled="busy" @click="control(true)">Reiniciar votos de prueba</button>
        </div>
        <p v-else>{{ data.abierta?'Ingresa un código ficticio para practicar.':'El docente debe abrir la práctica desde su cuenta.' }}</p>
      </section>
      <section class="practice-panel">
        <h2>Alumnos ficticios disponibles</h2>
        <div class="practice-table"><table><thead><tr><th>Código para ingresar</th><th>Nombre</th><th>Estado</th></tr></thead><tbody><tr v-for="a in data.alumnos" :key="a.dni"><td><code>{{ a.dni }}</code></td><td>{{ a.nombres }}</td><td>{{ a.ya_voto?'Ya votó en la práctica':'Disponible' }}</td></tr></tbody></table></div>
      </section>
      <section v-if="role==='aperturador'" class="practice-panel">
        <h2>{{ student?'Elige una opción':'Ingresa el código de prueba' }}</h2>
        <form v-if="!student" class="practice-actions" @submit.prevent="verify">
          <label class="sr-label" for="practice-code">Código de prueba</label>
          <input id="practice-code" v-model="code" aria-label="Código de prueba" placeholder="PRUEBA01" maxlength="32" autocomplete="off" :disabled="!data.abierta||busy" />
          <button class="practice-button" :disabled="!data.abierta||busy||!code.trim()">Continuar</button>
        </form>
        <template v-else>
          <p>Alumno ficticio: {{ student.nombres }} · {{ student.dni }}</p>
          <div class="practice-ballot">
            <label v-for="c in data.candidatos" :key="c.id" class="practice-option" :class="{selected:choice===c.id}"><input v-model="choice" type="radio" name="practice-vote" :value="c.id" /><img :src="c.imagen" :alt="c.nombre" /><strong>{{ c.nombre }}</strong></label>
            <label v-if="data.voto_blanco" class="practice-option" :class="{selected:choice==='blanco'}"><input v-model="choice" type="radio" name="practice-vote" value="blanco" /><img src="/img/voto-blanco.png" alt="Voto en blanco" /><strong>Voto en blanco</strong></label>
          </div>
          <div class="practice-actions"><button class="practice-button" :disabled="busy||choice===null" @click="vote">Registrar voto de práctica</button><button class="practice-button secondary" :disabled="busy" @click="student=null;choice=null">Volver</button></div>
        </template>
      </section>
      <section class="practice-panel"><h2>Resultados de práctica</h2><div v-for="c in data.totales.porLista" :key="c.id" class="practice-result"><span>{{ c.nombre }}</span><strong>{{ c.conteo }}</strong></div></section>
    </template>
  </main>
</template>

<style scoped>
.practice-page{max-width:1120px;margin:0 auto;padding:32px 20px 60px;color:#18333b}
.practice-header{display:flex;justify-content:space-between;gap:24px;align-items:start;margin-bottom:24px}.practice-header h1{font-size:32px;margin:10px 0}.practice-header p{margin:0;color:#536772}.practice-label{font-size:12px;font-weight:700;color:#9a5300;background:#fff1c6;padding:6px 10px;border-radius:6px}.practice-header nav{display:flex;gap:14px;flex-wrap:wrap;align-items:center}.practice-header a{color:#13695e}.practice-header nav button{background:transparent;border:0;text-decoration:underline;font:inherit;cursor:pointer;color:#13695e}
.practice-panel{padding:24px;margin:18px 0;background:#fff;border:1px solid #dce7e8;border-radius:16px}.practice-panel h2{margin:0 0 16px;font-size:21px}.practice-status{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.practice-status span{color:#885b04;font-weight:600}.practice-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px}.practice-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border:1px solid #167e70;border-radius:10px;background:#168778;color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.practice-button.secondary{background:#f0fdfa;color:#126558;border-color:#a5d9d0}.practice-button:disabled{opacity:.5;cursor:default}.practice-button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
.practice-actions input{min-height:44px;padding:10px 14px;font:inherit;text-transform:uppercase;border:1px solid #adc5c8;border-radius:8px}.practice-table{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid #e5edef}th{font-size:13px;color:#596e76}code{font-size:16px;font-weight:700;white-space:nowrap}.practice-error,.practice-notice{padding:14px;border-radius:10px}.practice-error{background:#fff0ee;color:#a31b14}.practice-notice{background:#e8f9ef;color:#166439}
.practice-ballot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.practice-option{position:relative;border:2px solid #dce7e8;padding:14px;border-radius:14px;cursor:pointer;display:flex;flex-direction:column;gap:12px}.practice-option.selected{border-color:#168778;background:#edfaf7}.practice-option input{position:absolute;top:12px;left:12px}.practice-option img{height:220px;width:100%;object-fit:contain;background:#fff}.practice-option:focus-within{outline:3px solid #38bdf8;outline-offset:3px}.practice-result{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #e5edef}.sr-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@media(max-width:700px){.practice-header{flex-direction:column}.practice-ballot{grid-template-columns:1fr}.practice-panel{padding:18px}.practice-actions input{width:100%}}
</style>
