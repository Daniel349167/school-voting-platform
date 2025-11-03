<template>
  <div class="teacher-card">
    <h2 class="mb">Gestión individual de alumnos</h2>
    <p class="muted mb">
      Añade o elimina un alumno sin necesidad de subir todo el Excel.
    </p>

    <!-- FORM AGREGAR -->
    <div class="inline-box">
      <h3 class="mb-sm">➕ Añadir / Actualizar alumno</h3>
      <form @submit.prevent="agregar">
        <div class="form-grid">
          <div>
            <label>DNI *</label>
            <input v-model="alumno.dni" type="text" required maxlength="15" />
          </div>
          <div>
            <label>Nombres (opcional)</label>
            <input v-model="alumno.nombres" type="text" />
          </div>
          <div>
            <label>Apellidos (opcional)</label>
            <input v-model="alumno.apellidos" type="text" />
          </div>
          <div>
            <label>Grado *</label>
            <select v-model="alumno.grado" required>
              <option value="">-- seleccionar --</option>
              <option value="1">1 (1ro)</option>
              <option value="2">2 (2do)</option>
              <option value="3">3 (3ro)</option>
              <option value="4">4 (4to)</option>
              <option value="5">5 (5to)</option>
            </select>
          </div>
          <div>
            <label>Sección *</label>
            <select v-model="alumno.seccion" required :disabled="!alumno.grado">
                <option value="">-- seleccionar --</option>
                <option
                v-for="sec in seccionesDisponibles"
                :key="sec"
                :value="sec"
                >
                {{ sec }}
                </option>
            </select>
            </div>
        </div>

        <p v-if="addError" class="upload-error">{{ addError }}</p>
        <p v-if="addSuccess" class="upload-success">{{ addSuccess }}</p>

        <button type="submit" class="upload-btn" :disabled="loadingAdd">
          {{ loadingAdd ? 'Guardando...' : 'Guardar alumno' }}
        </button>
      </form>
    </div>

    <!-- FORM ELIMINAR -->
    <div class="inline-box mt">
      <h3 class="mb-sm">🗑️ Eliminar por DNI</h3>
      <form @submit.prevent="eliminar">
        <div class="form-row">
          <input
            v-model="dniEliminar"
            type="text"
            placeholder="DNI del alumno"
            required
          />
          <button type="submit" class="danger-btn" :disabled="loadingDel">
            {{ loadingDel ? 'Eliminando...' : 'Eliminar' }}
          </button>
        </div>
      </form>
      <p v-if="delError" class="upload-error">{{ delError }}</p>
      <p v-if="delSuccess" class="upload-success">{{ delSuccess }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const alumno = reactive({
  dni: '',
  nombres: '',
  apellidos: '',
  grado: '',
  seccion: ''
})

const loadingAdd = ref(false)
const loadingDel = ref(false)
const addError = ref('')
const addSuccess = ref('')
const delError = ref('')
const delSuccess = ref('')
const dniEliminar = ref('')

// 👇 mapa de secciones por grado (ajústalo a tu cole)
const seccionesPorGrado: Record<string, string[]> = {
  '1': ['A', 'B', 'C'],
  '2': ['A', 'B', 'C'],
  '3': ['A', 'B'],
  '4': ['A', 'B'],
  '5': ['A', 'B']
}

// secciones disponibles según el grado elegido
const seccionesDisponibles = computed(() => {
  if (!alumno.grado) return []
  return seccionesPorGrado[alumno.grado] || []
})

// cuando cambia el grado, si la sección actual no existe, la limpiamos
watch(
  () => alumno.grado,
  (nuevo) => {
    const secs = seccionesPorGrado[nuevo] || []
    if (!secs.includes(alumno.seccion)) {
      alumno.seccion = ''
    }
  }
)

const agregar = async () => {
  addError.value = ''
  addSuccess.value = ''

  if (!alumno.dni || !alumno.grado || !alumno.seccion) {
    addError.value = 'DNI, grado y sección son obligatorios.'
    return
  }

  loadingAdd.value = true
  const res = await $fetch('/api/alumnos/add', {
    method: 'POST',
    body: {
      dni: alumno.dni.trim(),
      // 👇 opcionales pero como string vacío
      nombres: alumno.nombres ? alumno.nombres.trim() : '',
      apellidos: alumno.apellidos ? alumno.apellidos.trim() : '',
      grado: alumno.grado,
      seccion: alumno.seccion
    }
  }).catch(() => ({ ok: false, msg: 'Error al guardar' }))

  loadingAdd.value = false

  if (!res?.ok) {
    addError.value = res?.msg || 'No se pudo guardar'
    return
  }

  addSuccess.value = 'Alumno guardado correctamente.'
}

const eliminar = async () => {
  delError.value = ''
  delSuccess.value = ''
  if (!dniEliminar.value) {
    delError.value = 'Ingresa un DNI.'
    return
  }
  loadingDel.value = true
  const res = await $fetch('/api/alumnos/delete', {
    method: 'POST',
    body: { dni: dniEliminar.value.trim() }
  }).catch(() => ({ ok: false, msg: 'Error al eliminar' }))

  loadingDel.value = false

  if (!res?.ok) {
    delError.value = res?.msg || 'No se pudo eliminar'
    return
  }

  delSuccess.value = 'Alumno eliminado.'
  dniEliminar.value = ''
}
</script>
