<template>
  <div class="upload-box">
    <label for="padron-file" class="upload-label">Seleccionar padrón Excel</label>
    <input
      id="padron-file"
      type="file"
      accept=".xlsx"
      @change="onFileChange"
      class="upload-input"
    />

    <p v-if="error" class="upload-error">{{ error }}</p>
    <p v-if="success" class="upload-success">
      {{ successText || '✅ Alumnos cargados correctamente.' }}
    </p>

    <div v-if="dedupInfo.total > 0" class="upload-info">
      <p>
        Detectados: {{ dedupInfo.total }} ·
        Trasladados excluidos: {{ dedupInfo.discarded }}
      </p>
      <ul v-if="dedupInfo.samples.length">
        <li v-for="(s, i) in dedupInfo.samples" :key="i">
          {{ s }}
        </li>
      </ul>
    </div>

    <div v-if="preview.length" class="upload-preview">
      <h4>Vista previa (primeros 5)</h4>
      <table>
        <thead>
          <tr>
            <th>DNI</th>
            <th>Nombres</th>
            <th>Apellidos</th>
            <th>Grado</th>
            <th>Sección</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in preview" :key="idx">
            <td>{{ row.dni }}</td>
            <td>{{ row.nombres }}</td>
            <td>{{ row.apellidos }}</td>
            <td>{{ row.grado }}</td>
            <td>{{ row.seccion }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <button
      v-if="rows.length"
      @click="enviar"
      class="upload-btn"
      :disabled="loading"
    >
      {{ loading ? 'Enviando...' : 'Cargar padrón' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { parseRoll } from '~/shared/roll.mjs'
const emit = defineEmits(['imported'])
const rows = ref<any[]>([])
const preview = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const success = ref(false)
const successText = ref('')
const dedupInfo = ref({total:0,discarded:0,samples:[] as string[]})
const onFileChange = async (e: Event) => {
  error.value = ''; success.value = false; rows.value = []; preview.value = []
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx')) { error.value = 'Usa el archivo Excel .xlsx del padrón.'; return }
  if (file.size > 10 * 1024 * 1024) { error.value = 'El archivo supera 10 MB.'; return }
  try {
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer() as any)
    const sheet = wb.worksheets[0]
    if (!sheet) throw new Error('El archivo no contiene hojas.')
    const matrix: any[][] = []
    sheet.eachRow({includeEmpty:true}, row => matrix.push(Array.from({length:sheet.columnCount},(_,i)=>row.getCell(i+1).value)))
    const result = parseRoll(matrix)
    dedupInfo.value = {total:result.total,discarded:result.transferred,samples:[`${result.transferred} trasladados excluidos. ${result.withoutDni} alumnos usarán su código de estudiante.`]}
    if (result.errors.length) throw new Error(result.errors.slice(0,5).join(' '))
    rows.value = result.alumnos
    preview.value = result.alumnos.slice(0,5)
  } catch (err:any) { error.value = err.message || 'No se pudo leer el padrón.' }
}
const enviar = async () => {
  if (!rows.value.length || loading.value) return
  loading.value = true; error.value = ''; success.value = false
  try {
    const res:any = await $fetch('/api/alumnos/import',{method:'POST',body:{alumnos:rows.value,totalRows:rows.value.length}})
    if (!res.ok) throw new Error(res.msg || 'No se pudo cargar el padrón.')
    success.value = true
    successText.value = `${res.inserted} alumnos cargados. La elección conserva el estado de quienes ya votaron.`
    emit('imported')
  } catch (err:any) { error.value = err.data?.statusMessage || err.message || 'Error al cargar el padrón.' }
  finally { loading.value = false }
}
</script>

<style scoped>
.upload-box{gap:12px}
.upload-input{padding:8px}
.upload-error{color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;padding:8px;border-radius:8px}
.upload-success{color:#065f46;background:#d1fae5;border:1px solid #a7f3d0;padding:8px;border-radius:8px}
.upload-info{color:#1f2937;background:#f3f4f6;border:1px solid #e5e7eb;padding:8px;border-radius:8px;margin-top:8px}
.upload-preview table{width:100%;border-collapse:collapse}
.upload-preview th,.upload-preview td{border:1px solid #e2e8f0;padding:10px}
.upload-btn{
  width: auto; display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 16px; border-radius: 10px;
}
.upload-btn:disabled{opacity:.6;cursor:not-allowed}
</style>
