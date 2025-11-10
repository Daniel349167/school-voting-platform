<!-- pages/resultados.vue -->
<template>
  <div class="res-bg">
    <div class="res-shell">
      <!-- Header -->
      <div class="hero">
        <div class="hero-top">
          <div class="brand">
            <span class="badge">📊</span>
            <h1>Resultados en tiempo real</h1>
          </div>
          <div class="actions">
            <NuxtLink to="/login" class="btn ghost">Ir al login</NuxtLink>
            <button class="btn" @click="fetchData" :disabled="loading">
              {{ loading ? 'Actualizando…' : 'Actualizar' }}
            </button>
          </div>
        </div>
        <svg class="wave" viewBox="0 0 1200 90" preserveAspectRatio="none">
          <path d="M0,0 C350,80 800,-40 1200,50 L1200,120 L0,120 Z"/>
        </svg>
      </div>

      <!-- Contenido -->
      <div class="content">
        <!-- Aviso de error suave -->
        <div v-if="errorMsg" class="alert">
          {{ errorMsg }}
        </div>

        <!-- Tabs -->
        <div class="tabs">
          <button
            v-for="opt in opciones"
            :key="opt.val"
            class="tab"
            :class="{ active: gradoSel===opt.val }"
            @click="() => { gradoSel = opt.val; animateNow() }"
          >
            {{ opt.lbl }}
          </button>
        </div>

        <!-- Resumen participación -->
        <div class="cards">
          <div class="card">
            <div class="kpi">{{ resumen.totalAlumnos }}</div>
            <div class="lbl">Votantes posibles</div>
          </div>
          <div class="card">
            <div class="kpi">{{ resumen.totalEmitidos }}</div>
            <div class="lbl">Votos emitidos</div>
          </div>
          <div class="card">
            <div class="kpi">{{ porcentaje(resumen.totalEmitidos, resumen.totalAlumnos) }}%</div>
            <div class="lbl">Participación</div>
          </div>
        </div>

        <!-- Barras por lista -->
        <div class="panel">
          <h3 class="panel-title">Distribución por listas</h3>
          <div v-if="series.length===0" class="empty">Sin datos</div>

          <div v-else class="bars">
            <div v-for="(row, i) in series" :key="i" class="bar-row">
              <div class="bar-info">
                <span class="name">{{ row.nombre }}</span>
                <span class="val">{{ row.conteo }}</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ '--w': barWidth(row.conteo) + '%', '--idx': i }"
                />
              </div>
            </div>
          </div>
        </div>

        <p class="note">Los datos se muestran en bloques de publicación para proteger el secreto del voto.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// =====================
// Tipos y constantes
// =====================
type PorLista = { id:number, nombre:string, conteo:number }
type Totales = { totalAlumnos:number, totalEmitidos:number, porLista:PorLista[] }
type PorGrado = Record<number, { totalAlumnos:number, emitidos:number, porLista:PorLista[] }>

// Estructura opcional como llega desde la API (defensivo)
type ApiPayload = {
  ok: boolean
  meta?: { block?: number }
  totales?: Partial<Totales>
  porGrado?: Record<number, Partial<PorGrado[number]>>
  msg?: string
}

const GRADOS = [1,2,3,4,5] as const

const loading = ref(false)
const errorMsg = ref<string>('') // <-- NUEVO: mensaje suave
const data = ref<{ totales: Totales, porGrado: PorGrado } | null>(null)
const gradoSel = ref<'general'|1|2|3|4|5>('general')

const cfg = useRuntimeConfig()
const ALLOW_BLANK = /^(1|true|yes|si)$/i.test(String(cfg.public.VOTO_BLANCO ?? 'si'))

const opciones = [
  { val:'general' as const, lbl:'General' },
  { val:1 as const, lbl:'1°' },
  { val:2 as const, lbl:'2°' },
  { val:3 as const, lbl:'3°' },
  { val:4 as const, lbl:'4°' },
  { val:5 as const, lbl:'5°' },
]

// =====================
// Normalización robusta
// =====================
// Asegura que siempre existan totales, porGrado y porLista,
// incluso si la API no los envía por bloqueo < PUBLIC_RESULT_BLOCK.
function normalizePayload(p: ApiPayload | null | undefined): { totales: Totales, porGrado: PorGrado } {
  const emptyList: PorLista[] = []
  const totales: Totales = {
    totalAlumnos: Math.max(0, Number(p?.totales?.totalAlumnos ?? 0)),
    totalEmitidos: Math.max(0, Number(p?.totales?.totalEmitidos ?? 0)),
    porLista: Array.isArray(p?.totales?.porLista) ? p!.totales!.porLista as PorLista[] : emptyList
  }

  // porGrado con fallback para los 5 grados
  const porGrado: PorGrado = {} as any
  for (const g of GRADOS) {
    const gRaw = p?.porGrado?.[g] ?? {}
    porGrado[g] = {
      totalAlumnos: Math.max(0, Number((gRaw as any).totalAlumnos ?? 0)),
      emitidos: Math.max(0, Number((gRaw as any).emitidos ?? 0)),
      porLista: Array.isArray((gRaw as any).porLista) ? (gRaw as any).porLista as PorLista[] : emptyList
    }
  }
  return { totales, porGrado }
}

// =====================
// Carga de datos
// =====================
const fetchData = async () => {
  errorMsg.value = ''
  loading.value = true
  try {
    const res = await $fetch<ApiPayload>('/api/votos/resultados').catch(() => null)
    loading.value = false

    if (!res || res.ok === false) {
      errorMsg.value = res?.msg || 'No se pudieron obtener los resultados todavía.'
      // Aún así, deja data normalizada en cero para no romper la UI
      data.value = normalizePayload(res || { ok:false })
      await animateNow()
      return
    }

    data.value = normalizePayload(res)
    await animateNow()
  } catch (e:any) {
    loading.value = false
    errorMsg.value = 'Error de red o del servidor al obtener resultados.'
    data.value = normalizePayload({ ok:false })
    await animateNow()
  }
}

// Cargar datos una sola vez al entrar
onMounted(() => {
  fetchData()
})

// =====================
// Derivados UI robustos
// =====================
const resumen = computed(() => {
  if (!data.value) return { totalAlumnos:0, totalEmitidos:0 }
  if (gradoSel.value === 'general') {
    return {
      totalAlumnos: data.value.totales?.totalAlumnos ?? 0,
      totalEmitidos: data.value.totales?.totalEmitidos ?? 0
    }
  }
  const g = data.value.porGrado?.[gradoSel.value as number]
  return {
    totalAlumnos: g?.totalAlumnos ?? 0,
    totalEmitidos: g?.emitidos ?? 0
  }
})

const serieBase = computed<PorLista[]>(() => {
  if (!data.value) return []
  const base = (gradoSel.value === 'general')
    ? (data.value.totales?.porLista ?? [])
    : (data.value.porGrado?.[gradoSel.value as number]?.porLista ?? [])

  // ocultar “voto en blanco” si no está permitido
  return ALLOW_BLANK ? base : base.filter(r => (r?.nombre || '').toLowerCase() !== 'voto en blanco')
})

// Ordenar desc, barra animada
const series = computed(() => [...serieBase.value].sort((a,b) => (b?.conteo ?? 0) - (a?.conteo ?? 0)))

const maxConteo = computed(() => {
  const arr = series.value.map(s => Number(s?.conteo ?? 0))
  const m = Math.max(1, ...(arr.length ? arr : [1]))
  return Number.isFinite(m) ? m : 1
})
const barWidth = (v:number) => Math.round((Number(v) / maxConteo.value) * 100)

const porcentaje = (parte:number, total:number) => {
  const p = Number(parte), t = Number(total)
  if (!t || !Number.isFinite(p) || !Number.isFinite(t)) return 0
  return Math.round((p/t)*100)
}

// =====================
// Animación
// =====================
const animateNow = async () => {
  // Espera al próximo tick para asegurar que .bar-fill ya existe en el DOM
  await nextTick()
  const els = document.querySelectorAll<HTMLElement>('.bar-fill')
  els.forEach(el => {
    el.style.animation = 'none'
    void el.offsetWidth // reflow
    el.style.animation = ''
  })
}
</script>

<style scoped>
/* BG */
.res-bg{
  min-height:100vh;
  background: radial-gradient(130% 130% at 0% 0%, #e0f2fe 0%, #fff 60%) fixed;
  display:flex; justify-content:center;
}
.res-shell{ width:min(1500px, 96%); margin: 36px 0; }

/* Header */
.hero{
  position:relative; background:linear-gradient(90deg,#167b77,#267bbb); color:#fff;
  border-radius:18px; padding:16px 18px 56px; box-shadow:0 18px 48px rgba(0,0,0,.18);
}
.hero-top{ display:flex; justify-content:space-between; align-items:center; gap:12px; }
.brand{ display:flex; align-items:center; gap:10px; }
.badge{ width:34px; height:34px; display:inline-grid; place-items:center; background:#ffffff22; border:1px solid #ffffff55; border-radius:10px; }
.hero h1{ margin:0; font-size:20px; }
.actions{ display:flex; gap:8px; flex-wrap:wrap;}
.btn{ background:#0ea5e9; border:none; color:#fff; padding:10px 14px; border-radius:10px; font-weight:800; cursor:pointer; text-decoration:none; }
.btn:hover{ transform:translateY(-1px); }
.btn.ghost{ background:#e8eef6; color:#0f172a; }
.wave{ position:absolute; left:0; right:0; bottom:-8px; width:100%; height:46px; pointer-events:none; }
.wave path{ fill:#fff; }

/* Contenido */
.content{ margin-top:18px; }

/* Alert */
.alert{
  background:#fff7ed; border:1px solid #fed7aa; color:#7c2d12;
  padding:10px 12px; border-radius:10px; margin-bottom:10px; font-weight:600;
}

/* Tabs */
.tabs{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.tab{
  background:#f1f5f9; border:1px solid #e2e8f0; color:#0f172a;
  padding:8px 12px; border-radius:999px; font-weight:800; cursor:pointer;
}
.tab.active{ background:#1e293b; color:#fff; border-color:#1e293b; }

/* KPIs */
.cards{ display:grid; grid-template-columns: repeat(3, minmax(160px,1fr)); gap:12px; }
.card{
  background:linear-gradient(180deg,#ffffff 0%, #f8fafc 100%); border:1px solid #e6eef7; border-radius:14px; padding:14px 14px 16px;
  box-shadow: 0 12px 30px rgba(15,23,42,.06); text-align:center;
}
.kpi{ font-weight:900; font-size:26px; color:#0f172a; line-height:1; }
.lbl{ font-size:12.8px; color:#475569; margin-top:4px; }

/* Panel barras */
.panel{
  margin-top:14px; border-radius:16px; background:#fff; border:1px solid #e6eef7; padding:16px;
  box-shadow:0 14px 36px rgba(2,132,199,.08);
}
.panel-title{ margin:0 0 8px; font-size:16px; font-weight:900; color:#0f172a; }
.empty{ color:#64748b; padding:10px; }
.bars{ display:grid; gap:12px; margin-top:6px; }
.bar-row{ display:grid; gap:6px; }
.bar-info{ display:flex; justify-content:space-between; align-items:center; font-weight:700; color:#0f172a; }
.bar-track{
  height:16px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:999px; overflow:hidden;
  box-shadow: inset 0 2px 4px rgba(0,0,0,.04);
}
.bar-fill{
  height:100%; width:var(--w,0%);
  background: linear-gradient(90deg,#22c55e,#3b82f6,#06b6d4);
  border-right: 1px solid #0ea5e9;
  transform-origin:left center;
  animation: grow .75s ease forwards;
  animation-delay: calc(var(--idx) * 50ms);
}
@keyframes grow{
  from{ width:0% }
  to{ width:var(--w,0%) }
}
.name{ font-weight:800; }
.val{ font-weight:800; color:#0f172a; }

.note{ margin-top:8px; font-size:12.5px; color:#64748b; }
</style>
