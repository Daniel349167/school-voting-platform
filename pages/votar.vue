<script setup lang="ts">
const router = useRouter()

// === Flag "Voto en blanco" desde runtimeConfig ===
const { public: pub } = useRuntimeConfig()
const allowVotoBlanco = computed(() => {
  const raw = (pub.VOTO_BLANCO ?? 'yes').toString().toLowerCase().trim()
  // cualquier valor distinto de 'no' -> habilita
  return raw !== 'no'
})

onMounted(async () => {
  const { data } = await useFetch('/api/session')
  if (!data.value?.ok || data.value?.role !== 'aperturador') {
    router.replace('/login')
    return
  }
  // carga estadísticas generales al entrar
  await loadEstadoAll()
})

// ===== Tipos =====
type Alumno = {
  dni: string
  nombres: string
  apellidos: string
  grado?: number | string
  seccion?: string
  ya_voto: boolean
  en_colegio?: boolean
}
type Candidato = { id: number; nombre: string; descripcion?: string; imagen?: string }

// ===== Estado UI =====
const step = ref<'dni'|'votar'>('dni')

// votación
const dni = ref('')
const alumno = ref<Alumno|null>(null)
const candidatos = ref<Candidato[]>([])
const elegido = ref<number | 'blanco' | null>(null)

const error = ref('')
const loading = ref(false)

// === Estado de conteos GENERALES (todos los grados) ===
const estado = reactive({ total: 0, votaron: 0, faltan: 0 })

const loadEstadoAll = async () => {
  const res = await $fetch('/api/votos/estado', {
    method: 'GET',
  }).catch(() => ({ ok: false }))
  if (res?.ok) {
    estado.total   = res.total
    estado.votaron = res.votaron
    estado.faltan  = res.faltan
  }
}

// UI helpers
const dniInput = ref<HTMLInputElement|null>(null)
const showModal = ref(false)

// genera “confeti” simple
const confetti = ref(Array.from({length: 22}).map(() => ({
  left: Math.random()*100,
  delay: Math.random()*0.6,
  dur: 1.4 + Math.random()*0.9,
  rot: (Math.random()*60-30)
})))

// Rutas de imágenes (coloca los archivos en /public/img/…)
const IMG_LOGO          = '/img/logo-8161.png'
const IMG_LISTA_1       = '/img/lista-1.png'
const IMG_LISTA_2       = '/img/lista-2.png'
const IMG_LISTA_GENERIC = '/img/lista-generic.png'
const IMG_VOTO_BLANCO   = '/img/voto-blanco.png'

// ===== Lógica =====

// Normaliza a mayúsculas al escribir (para que el backend compare consistente)
const onDniInput = (e: Event) => {
  const el = e.target as HTMLInputElement
  el.value = el.value.toUpperCase()
  dni.value = el.value
}

const verificarDNI = async () => {
  error.value = ''
  if (!dni.value.trim()) { error.value = 'Ingresa el DNI.'; return }
  loading.value = true

  const dniNorm = dni.value.trim().toUpperCase()

  // Ya NO enviamos grado/sección
  const res = await $fetch('/api/votos/verificar', {
    method:'POST',
    body:{ dni: dniNorm }
  }).catch(() => ({ ok:false, msg:'Error de verificación' }))
  loading.value = false

  if (!res?.ok) { error.value = res?.msg || 'No se pudo verificar.'; return }
  if (res.alumno?.en_colegio === false) { error.value = 'No estás registrado en el padrón del colegio.'; return }
  if (res.alumno?.ya_voto) { error.value = 'Este DNI ya emitió su voto.'; return }

  alumno.value = res.alumno

  // Asigna imágenes a las listas
  const imgsByIndex = [IMG_LISTA_1, IMG_LISTA_2]
  candidatos.value = (res.candidatos as Candidato[]).map((c: Candidato, idx: number) => ({
    ...c,
    imagen: imgsByIndex[idx] ?? IMG_LISTA_GENERIC
  }))

  elegido.value = null
  step.value = 'votar'
}

const emitirVoto = async () => {
  error.value = ''

  if (!allowVotoBlanco.value && elegido.value === 'blanco') {
    error.value = 'El voto en blanco está deshabilitado por la institución.'
    return
  }
  if (elegido.value === null) { error.value = 'Selecciona una opción.'; return }

  loading.value = true
  const dniNorm = dni.value.trim().toUpperCase()

  // Ya NO enviamos grado/sección
  const res = await $fetch('/api/votos/emitir', {
    method:'POST',
    body:{
      dni: dniNorm,
      candidatoId: (elegido.value === 'blanco' ? null : elegido.value),
      enBlanco: elegido.value === 'blanco'
    }
  }).catch(() => ({ ok:false, msg:'No se pudo votar' }))
  loading.value = false

  if (!res?.ok) { error.value = res?.msg || 'No se pudo votar.'; return }

  // 🎉 Modal bonito + confeti; luego volver a DNI y refrescar estadísticas generales
  showModal.value = true
  setTimeout(async () => {
    showModal.value = false
    dni.value = ''
    alumno.value = null
    candidatos.value = []
    elegido.value = null
    error.value = ''
    step.value = 'dni'
    await loadEstadoAll()
    nextTick(() => dniInput.value?.focus())
  }, 2200)
}
</script>

<template>
  <div class="vote-bg">
    <div class="vote-shell" :class="{ votar: step === 'votar' }">
      <div class="vote-card">
        <!-- Cabecera decorativa -->
        <div class="hero">
          <div class="hero-top">
            <div class="brand">
              <!-- Logo -->
              <img :src="IMG_LOGO" alt="I.E. 3045" class="brand-logo" />
              <div>
                <h1>Votación Escolar</h1>
                <p class="muted">Sesión abierta por el profesor</p>
              </div>
            </div>
            <!-- (Eliminado) header-actions: Cambiar salón / Cerrar sesión -->
          </div>

          <!-- Nombre del colegio centrado sobre la onda -->
          <div class="school-name">
            I.E. 8161 “MANUEL SCORZA TORRE”
          </div>

          <!-- Onda -->
          <svg class="wave" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,0 C300,90 900,-30 1200,60 L1200,120 L0,120 Z" />
          </svg>
        </div>

        <!-- Contenido -->
        <div class="content-area" :class="{ votar: step === 'votar' }">
          <!-- Paso: DNI -->
          <section v-if="step==='dni'" class="section dni-step">
            <h2 class="step">1) Ingresa tu DNI</h2>

            <div class="dni-grid">
              <!-- Panel principal con el input -->
              <div class="dni-panel">
                <div class="dni-panel-head">
                  <p class="dni-sub">Presiona <b>Enter</b> o toca el botón para continuar</p>
                </div>

                <div class="dni-input-row">
                  <input
                    ref="dniInput"
                    class="text-input lg dni-upper"
                    v-model="dni"
                    placeholder="DNI"
                    inputmode="text"
                    autocomplete="off"
                    @input="onDniInput"
                    @keyup.enter="verificarDNI"
                  />
                  <button class="btn primary lg" @click="verificarDNI" :disabled="loading">
                    {{ loading ? 'Verificando…' : 'Continuar' }}
                  </button>
                </div>

                <p class="dni-hint">Asegúrate de no dejar espacios ni guiones.</p>
              </div>

              <!-- Tarjeta lateral con los KPIs GENERALES -->
              <aside class="stats-card">
                <div class="stats-header">
                  <span class="stats-chip">General</span>
                  <div class="stats-room">Todos los grados</div>
                </div>

                <div class="stats-grid">
                  <div class="stat item total">
                    <div class="kpi">{{ estado.total }}</div>
                    <div class="lbl">Total</div>
                  </div>
                  <div class="stat item ok">
                    <div class="kpi">{{ estado.votaron }}</div>
                    <div class="lbl">Votaron</div>
                  </div>
                  <div class="stat item wait">
                    <div class="kpi">{{ estado.faltan }}</div>
                    <div class="lbl">Faltan</div>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <!-- Paso: Votar -->
          <section v-else-if="step==='votar'" class="section">
            <div class="voter">
              <!-- Avatar genérico -->
              <svg class="avatar" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="30" fill="#e2e8f0"/>
                <circle cx="32" cy="26" r="12" fill="#94a3b8"/>
                <path d="M12,54c4-10,16-14,20-14s16,4,20,14" fill="#94a3b8"/>
              </svg>
              <div class="voter-info">
                <div class="who">{{ alumno!.apellidos }} {{ alumno!.nombres }}</div>
                <div class="meta">{{ alumno.grado }}° {{ alumno.seccion }}</div>
              </div>
            </div>

            <h2 class="step">2) Elige tu lista</h2>
            <div class="cards">
              <label v-for="c in candidatos" :key="c.id" class="card">
                <input type="radio" name="opc" :value="c.id" v-model="elegido" />
                <span class="selmark">✓</span>

                <!-- Imagen del candidato (se muestra completa) -->
                <div class="card-img">
                  <img :src="c.imagen" :alt="`Lista ${c.nombre}`" />
                </div>

                <div class="card-body">
                  <div class="chip">Lista</div>
                  <div class="title">{{ c.nombre }}</div>
                  <div class="desc">{{ c.descripcion }}</div>
                </div>
              </label>

              <!-- Tarjeta de voto en blanco con imagen -->
              <label v-if="allowVotoBlanco" class="card blank">
                <input type="radio" name="opc" value="blanco" v-model="elegido" />
                <span class="selmark">✓</span>
                <div class="card-img">
                  <img :src="IMG_VOTO_BLANCO" alt="Voto en blanco" />
                </div>
                <div class="card-body">
                  <div class="chip">Opción</div>
                  <div class="title">Voto en blanco</div>
                  <div class="desc">No elijo ninguna lista</div>
                </div>
              </label>
            </div>

            <div class="actions">
              <button class="btn success" @click="emitirVoto" :disabled="loading">
                {{ loading ? 'Registrando…' : 'VOTAR' }}
              </button>
              <button class="btn ghost" @click="step='dni'">Atrás</button>
            </div>
          </section>

          <p v-if="error" class="banner error">{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- Modal éxito -->
    <transition name="fade">
      <div v-if="showModal" class="modal">
        <div class="modal-card">
          <div class="modal-top">
            <div class="check">✔</div>
            <h3>¡Tu voto fue registrado!</h3>
            <p class="muted">Gracias por participar. Preparando la cabina para el siguiente alumno…</p>
          </div>

          <!-- confeti -->
          <div class="confetti">
            <span
              v-for="(p, i) in confetti"
              :key="i"
              class="conf"
              :style="{
                left: p.left + '%',
                animationDelay: p.delay + 's',
                animationDuration: p.dur + 's',
                transform: `rotate(${p.rot}deg)`
              }"
            />
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* Fondo */
.vote-bg{
  min-height:100vh;
  background: linear-gradient(180deg, #f1f5f9 0%, #e0f2fe 40%, #f8fafc 100%);
  display:flex;align-items:flex-start;justify-content:center;
}

/* Card contenedor */
.vote-shell{
  width:min(1650px, 98%);
  margin-top: 90px;
}
.vote-shell.votar{
  margin-top: 38px;
  transition: margin-top .2s;
}

.vote-card{
  background:#fff;
  border-radius:20px;
  box-shadow:0 26px 58px rgba(0,0,0,.22);
  overflow:hidden;
  min-height: 380px;
  display: flex;
  flex-direction: column; 
}

/* Hero (más alto para que no se tape el nombre del colegio) */
.hero{
  position:relative;
  background:linear-gradient(90deg,#167b77,#267bbb);
  padding:22px 22px 65px; /* MÁS padding inferior para despegar la onda y el título */
  color:#fff
}
.hero .hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.brand{display:flex;gap:12px;align-items:center}
.brand-logo{
  width:42px;height:42px;object-fit:contain;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))
}
h1{margin:0;font-size:22px}
.muted{margin:2px 0 0;opacity:.9;font-size:13.8px}

/* Nombre del colegio centrado encima de la onda */
.school-name{
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  bottom:64px; /* queda por encima de la onda */
  font-weight:900;
  font-size:18px;
  text-align:center;
  text-wrap:balance;
  text-shadow:0 2px 6px rgba(0,0,0,.35);
}

/* Onda */
.wave{
  position:absolute; left:0; right:0;
  bottom:-10px;
  width:100%; height:60px;
  pointer-events:none;
}
.wave path{fill:#fff}

/* Contenido */
.content-area{
  padding:0px 28px 34px;
  flex: 1;
}
.content-area.votar .step{ margin-top: 20px; }
.section{margin-top:6px}
.step{margin:.2rem 0 .7rem;font-size:18px}

/* Inputs */
label{display:block;margin-bottom:6px;color:#334155;font-weight:600}
.text-input{
  width:100%;background:#f8fafc;border:1px solid #d9e2ec;border-radius:12px;
  padding:12px 12px;font-size:15.5px;outline:none;transition:.15s;
}
.text-input:focus{box-shadow:0 0 0 3px #c7e6ff;border-color:#60a5fa;background:#fff}
.text-input.lg{ padding:14px 14px; font-size:16.5px; border-radius:12px; }
.dni-upper { text-transform: uppercase; }

/* Botones */
.btn{background:#0ea5e9;border:none;color:#fff;padding:10px 16px;border-radius:10px;cursor:pointer;font-size:14.5px;font-weight:700}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:#2563eb}
.btn.success{background:#16a34a}
.btn.ghost{background:#e8eef6;color:#0f172a}

/* ===== Paso DNI ===== */
.dni-step .step{ margin-top: 6px; }
.dni-grid{
  display:grid;
  grid-template-columns: 1.4fr .9fr; /* panel + KPIs generales */
  gap:16px;
  align-items: stretch;
}
@media (max-width: 1020px){ .dni-grid{ grid-template-columns: 1fr; } }

.dni-panel{
  position: relative;
  border-radius: 16px;
  background: linear-gradient(180deg,#ffffff 0%, #f8fafc 100%);
  border:1px solid #e6eef7;
  box-shadow: 0 14px 32px rgba(15,23,42,.08);
  padding:18px 18px 20px;
  overflow: hidden;
}
.dni-panel::before{
  content:"";
  position:absolute; inset:0 0 auto 0; height:4px;
  background: linear-gradient(90deg,#22c55e,#3b82f6,#06b6d4);
  opacity:.65;
}
.dni-panel-head{ margin-bottom:12px; }
.dni-title{ margin:0; font-size:18px; font-weight:800; color:#0f172a; }
.dni-sub{ margin:.2rem 0 0; color:#475569; font-size:13.8px; }

.dni-input-row{ display:flex; gap:10px; align-items:center; }
.btn.lg{ padding:12px 18px; font-size:15.5px; border-radius:12px; }

.dni-hint{ margin:.55rem 0 0; color:#64748b; font-size:12.8px; }

/* KPIs */
.stats-card{
  border-radius: 16px;
  background: radial-gradient(120% 120% at 0% 0%, #e0f2fe 0%, #fff 55%),
              linear-gradient(180deg,#ffffff 0%, #f8fafc 100%);
  border:1px solid #dbe7f3;
  box-shadow: 0 14px 32px rgba(2, 132, 199, .08);
  padding:16px;
  display:grid;
  grid-template-rows: auto 1fr;
  gap:12px;
}
.stats-header{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
.stats-chip{
  font-size:12px; font-weight:800; color:#2563eb; background:#e0e7ff;
  padding:4px 8px; border-radius:999px;
}
.stats-room{ font-weight:800; color:#0f172a; }

.stats-grid{ display:grid; gap:10px; grid-template-columns: repeat(3, 1fr); }
.stat.item{
  border-radius:12px;
  background:#ffffff;
  border:1px solid #e6eef7;
  text-align:center;
  padding:10px 8px;
}
.stat.item .kpi{ font-weight:900; font-size:22px; color:#0f172a; line-height:1; }
.stat.item .lbl{ font-size:12.5px; color:#475569; margin-top:2px; }

.stat.item.ok{ background:#f0fdf4; border-color:#dcfce7; }
.stat.item.wait{ background:#fff7ed; border-color:#ffedd5; }
.stat.item.total{ background:#f1f5f9; border-color:#e2e8f0; }

/* Votante */
.voter{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.avatar{width:42px;height:42px;border-radius:10px}
.voter-info .who{font-weight:800;font-size:16px}
.voter-info .meta{color:#334155;font-size:13.5px}

/* Tarjetas */
.cards{
  display:grid;grid-template-columns:repeat(3, minmax(260px,1fr));
  gap:12px;margin:.7rem 0 0;
}
@media (max-width:1100px){.cards{grid-template-columns:repeat(2, minmax(220px,1fr))}}
@media (max-width:720px){.cards{grid-template-columns:1fr}}

.card{
  position:relative;isolation:isolate;
  border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;
  background:linear-gradient(180deg,#ffffff 0%, #f8fafc 100%);
  transition:.18s;cursor:pointer;
}
.card:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(0,0,0,.08)}
.card input{display:none}

/* contenedor de imagen que NO recorta (contain) */
.card-img{
  height: 220px;
  background:#ffffff;
  display:flex;align-items:center;justify-content:center;
  border-bottom:1px solid #eef2f7;
}
.card-img img{
  max-width:100%;
  max-height:100%;
  object-fit:contain;
}

.card-body{padding:14px 14px 16px;display:grid;gap:6px}
.card .chip{
  justify-self:start;font-size:12px;font-weight:800;color:#2563eb;background:#e0e7ff;
  padding:4px 8px;border-radius:999px
}
.card .title{font-weight:900;font-size:16px;color:#0f172a}
.card .desc{font-size:13.5px;color:#64748b}

/* Borde inferior animado en hover */
.card::after{
  content:""; position:absolute; inset:auto auto 0 0; height:4px; width:0;
  background:linear-gradient(90deg,#22c55e,#3b82f6,#06b6d4); transition:.25s;
}
.card:hover::after{width:100%}
.card.blank .chip{color:#a16207;background:#fef3c7}

/* ✔ Marca visual */
.selmark{
  position:absolute; top:10px; right:10px; width:26px; height:26px;
  border-radius:50%; background:#22c55e; color:#fff; font-weight:900; font-size:16px;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 8px 18px rgba(34,197,94,.35);
  opacity:0; transform:scale(.7); transition:.18s;
}
.card input:checked + .selmark{ opacity:1; transform:scale(1); }

/* Glow selección */
.card input:checked ~ .card-body{
  background: linear-gradient(180deg, #eef7ff 0%, #e9f5ff 100%);
  border: 1px solid #bfdbfe;
  box-shadow: 0 0 0 3px #bfdbfe, 0 12px 26px rgba(37,99,235,.18);
  border-radius: 14px;
}
.card input:checked ~ .card-body .title{ color:#1d4ed8 }
.card input:checked ~ .card-body .chip{ background:#1d4ed8; color:#eaf2ff }

/* Mensajería */
.actions{
  display:flex;
  gap:12px;
  margin-top:28px;
  flex-wrap:wrap;
  justify-content:flex-start;
}
.banner{margin-top:.8rem;border-radius:12px;padding:.7rem .9rem;font-size:14px}
.banner.error{background:#fee2e2;border:1px solid #fecaca;color:#991b1b}

/* Modal éxito */
.modal{
  position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);
  display:flex;align-items:center;justify-content:center;z-index:60;
}
.modal-card{
  position:relative;background:#fff;border-radius:18px;padding:20px 22px; width:min(520px,92%);
  box-shadow:0 26px 58px rgba(0,0,0,.25); text-align:center; overflow:hidden;
}
.modal-top .check{
  width:56px;height:56px;border-radius:14px;background:#16a34a;color:#fff;
  display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:28px;
  box-shadow:0 12px 22px rgba(22,163,74,.35); margin-bottom:8px;
}
.modal-top h3{margin:0 0 4px;font-size:20px}
.modal-top .muted{font-size:13.6px;color:#475569}
.confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.conf{
  position:absolute;top:-10px;width:10px;height:12px;border-radius:2px;
  background: var(--c, #f43f5e);
  animation: fall var(--t,2s) linear forwards;
  box-shadow: 0 0 0 1px rgba(0,0,0,.04) inset;
}
.conf:nth-child(3n){--c:#f59e0b}
.conf:nth-child(4n){--c:#22c55e}
.conf:nth-child(5n){--c:#3b82f6}
@keyframes fall{
  0%{transform:translateY(-12px) rotate(0deg)}
  100%{transform:translateY(420px) rotate(360deg)}
}

/* Transiciones */
.fade-enter-active,.fade-leave-active{transition:opacity .2s ease}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
