<template>
  <div class="teacher-layout">
    <!-- Sidebar -->
    <aside class="teacher-sidebar">
      <div class="teacher-brand">
        <span class="emoji">🏫</span>
        <div>
          <h2>Sistema</h2>
          <p>Votación escolar</p>
        </div>
      </div>

      <nav class="teacher-nav">
        <button
          class="nav-btn"
          :class="{ active: current === 'cargar' }"
          @click="current = 'cargar'"
        >
          📥 Cargar alumnos
        </button>
        <button
          class="nav-btn"
          :class="{ active: current === 'gestionar' }"
          @click="current = 'gestionar'"
        >
          🧑‍🎓 Gestionar alumnos
        </button>
        <button
          class="nav-btn"
          :class="{ active: current === 'estadisticas' }"
          @click="current = 'estadisticas'"
        >
          📈 Estadísticas
        </button>
      </nav>

      <div class="teacher-footer">
        <button class="logout-btn" @click="logout" title="Cerrar sesión">
          <span class="logout-ico">🚪</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>

    <!-- Contenido -->
    <main class="teacher-main">
      <header class="teacher-header">
        <div>
          <h1>Panel del docente</h1>
          <p class="muted">Administra alumnos, grados y visualiza el avance.</p>
        </div>
        <div class="teacher-badge">
          ✅ Votación activa
        </div>
      </header>

      <!-- CARGA MASIVA -->
      <section v-if="current === 'cargar'">
        <div class="teacher-card">
          <h2 class="mb">Cargar alumnos desde Excel</h2>
          <p class="muted mb">
            Sube el padrón de estudiantes por grado y sección. Acepta <b>.xlsx</b> y <b>.csv</b>.
          </p>
          <UploadAlumnos />
        </div>
      </section>

      <!-- GESTIÓN INDIVIDUAL -->
      <section v-else-if="current === 'gestionar'">
        <GestionAlumnos />
      </section>

      <!-- ESTADÍSTICAS -->
      <section v-else-if="current === 'estadisticas'">
        <div class="teacher-card">
          <div class="stats-head">
            <div>
              <h2 class="mb">Estadísticas en vivo</h2>
              <p class="muted mb">Visualiza el avance por listas y descarga los resultados actuales en Excel.</p>
            </div>

            <button class="dl-btn subtle" @click="downloadExcel" title="Descargar Excel con los resultados actuales">
              <span class="dl-icon">⬇️</span>
              <span class="dl-text">Descargar Excel</span>
              <span class="dl-subtext">Resultados de la votación</span>
            </button>
          </div>

          <!-- KPIs -->
          <div class="kpis">
            <div class="kpi">
              <div class="kpi-num">{{ stats.totales.totalAlumnos }}</div>
              <div class="kpi-label">Votantes posibles</div>
            </div>
            <div class="kpi">
              <div class="kpi-num">{{ stats.totales.totalEmitidos }}</div>
              <div class="kpi-label">Votos emitidos</div>
            </div>
            <div class="kpi">
              <div class="kpi-num">{{ porcentaje(stats.totales.totalEmitidos, stats.totales.totalAlumnos) }}%</div>
              <div class="kpi-label">Participación</div>
            </div>
          </div>

          <!-- Barras reales -->
          <div class="real-bars" v-if="series.length">
            <div v-for="(row, i) in series" :key="i" class="bar-item">
              <div class="bar-caption">
                <span class="name">{{ row.nombre }}</span>
                <span class="val">{{ row.conteo }}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: widthPct(row.conteo) + '%' }" :class="colorClass(i)"></div>
              </div>
            </div>
          </div>

          <p v-else class="muted">Sin datos por ahora.</p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import UploadAlumnos from '~/components/UploadAlumnos.vue'
import GestionAlumnos from '~/components/GestionAlumnos.vue'

const router = useRouter()
const current = ref<'cargar' | 'estadisticas' | 'gestionar'>('cargar')

const logout = () => {
  router.push('/login')
}

const downloadExcel = () => {
  // Navega a la ruta; el navegador usará el filename del servidor
  window.location.href = '/api/votos/export';
};



const stats = reactive<{ totales: { totalAlumnos: number; totalEmitidos: number; porLista: { nombre:string; conteo:number }[] } }>(
  { totales: { totalAlumnos: 0, totalEmitidos: 0, porLista: [] } }
)

const fetchRealtime = async () => {
  const res = await $fetch('/api/votos/realtime').catch(() => ({ ok:false }))
  if ((res as any)?.ok) {
    stats.totales = (res as any).totales
  }
}

onMounted(() => {
  if (current.value === 'estadisticas') fetchRealtime()
})
watch(current, (v) => { if (v === 'estadisticas') fetchRealtime() })

// Habilitar/ocultar "Voto en blanco" según .env
const allowBlank = computed(() => {
  const v = String(useRuntimeConfig().public.VOTO_BLANCO ?? 'si').toLowerCase()
  return v === 'si' || v === 'sí' || v === 'true' || v === '1' || v === 'on'
})


const series = computed(() => {
  const arr = stats.totales.porLista || []
  return allowBlank.value ? arr : arr.filter(r => String(r.nombre).toLowerCase() !== 'voto en blanco')
})

const widthPct = (v:number) => {
  const total = stats.totales.totalEmitidos || 1
  return Math.round((v / total) * 100)
}
const porcentaje = (parte:number, total:number) => !total ? 0 : Math.round((parte/total)*100)
const colorClass = (i:number) => ['c-a','c-b','c-c','c-d','c-e'][i % 5]
</script>

<style scoped>
/* ===== Footer & Logout (CAMBIADO para estilo sobrio) ===== */
.teacher-footer{
  margin-top:auto;
  padding:16px;
  border-top:1px solid rgba(255,255,255,0.08); /* más sutil */
  display:flex;
  justify-content:center;
}

.logout-btn{
  display:inline-flex;
  align-items:center;
  gap:10px;
  padding:10px 14px;
  font-weight:600;
  font-size:14px;
  color:rgba(255,255,255,0.92);
  background:transparent;                 /* sin caja blanca */
  border:1px solid rgba(255,255,255,0.18);/* sutil */
  border-radius:12px;
  cursor:pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease;
  backdrop-filter: saturate(120%);        /* ligero */
}
.logout-btn:hover{
  background: rgba(255,255,255,0.06);     /* hover muy leve */
  border-color: rgba(255,255,255,0.26);
  transform: translateY(-1px);
}
.logout-btn:active{
  transform: translateY(0);
}

.logout-ico{
  display:inline-grid;
  place-items:center;
  width:28px; height:28px;
  border-radius:8px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.9);
  font-size:16px;
}

/* ====== Resto (igual) ====== */
.stats-head{
  display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
}

/* KPIs simples */
.kpis{ display:grid; grid-template-columns: repeat(3, minmax(140px,1fr)); gap:12px; margin-bottom:10px; }
.kpi{ background:#f8fafc; border:1px solid #e6eef7; border-radius:12px; padding:10px 12px; text-align:center; }
.kpi-num{ font-weight:900; font-size:20px; color:#0f172a; }
.kpi-label{ font-size:12.5px; color:#475569 }

/* Barras reales */
.real-bars{ display:grid; gap:12px; }
.bar-item{ display:grid; gap:6px; }
.bar-caption{ display:flex; justify-content:space-between; font-weight:700; color:#0f172a; }
.bar-track{ height:16px; background:#eef2f7; border:1px solid #e2e8f0; border-radius:999px; overflow:hidden; }
.bar-fill{ height:100%; border-radius:999px; transition: width .35s ease; }

/* Paleta suave */
.c-a{ background: linear-gradient(90deg,#93c5fd,#60a5fa) }
.c-b{ background: linear-gradient(90deg,#86efac,#34d399) }
.c-c{ background: linear-gradient(90deg,#fde68a,#fbbf24) }
.c-d{ background: linear-gradient(90deg,#fecaca,#f87171) }
.c-e{ background: linear-gradient(90deg,#ddd6fe,#a78bfa) }

/* Botón de descarga */
.dl-btn.subtle{
  display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto;
  gap:0 10px; align-items:center;
  padding:10px 14px;
  border:1px solid #dbe4ee; border-radius:12px;
  background:#ffffff; color:#0f172a; cursor:pointer;
  box-shadow: 0 6px 14px rgba(15,23,42,.06);
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
}
.dl-btn.subtle:hover{ transform: translateY(-1px); box-shadow:0 10px 20px rgba(15,23,42,.08); background:#f8fafc; }
.dl-icon{
  grid-row: 1 / span 2;
  width:36px; height:36px; border-radius:10px;
  display:grid; place-items:center;
  background:#f1f5f9; border:1px solid #e2e8f0; font-size:18px;
}
.dl-text{ font-weight:800; font-size:14.5px; line-height:1.1; }
.dl-subtext{ margin-top:2px; font-size:12px; color:#64748b; line-height:1; }

@media (max-width:680px){
  .dl-btn.subtle{ width:100%; }
  .kpis{ grid-template-columns:1fr; }
}
</style>
