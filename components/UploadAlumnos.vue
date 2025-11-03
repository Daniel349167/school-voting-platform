<template>
  <div class="upload-box">
    <label class="upload-label">Seleccionar archivo Excel/CSV</label>
    <input
      type="file"
      accept=".xlsx,.xls,.csv"
      @change="onFileChange"
      class="upload-input"
    />

    <p v-if="error" class="upload-error">{{ error }}</p>
    <p v-if="success" class="upload-success">
      {{ successText || '✅ Alumnos cargados correctamente.' }}
    </p>

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
      {{ loading ? 'Enviando...' : 'Enviar a Supabase' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import * as XLSX from 'xlsx'

const rows = ref<any[]>([])          // 👈 SOLO con DNI (para enviar)
const allRows = ref<any[]>([])       // 👈 TODAS las filas leídas del Excel
const preview = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const success = ref(false)
const successText = ref('')

const normalizeKey = (str: string) => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

const onFileChange = (e: Event) => {
  error.value = ''
  success.value = false
  successText.value = ''
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (evt) => {
    const data = evt.target?.result
    const workbook = XLSX.read(data, { type: 'binary' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      defval: ''
    }) as string[][]

    const headerKeywords = [
      'grado',
      'seccion',
      'documento',
      'numerodedocumento',
      'nombres',
      'apellido'
    ]
    let headerRowIndex = -1

    for (let i = 0; i < raw.length; i++) {
      const row = raw[i]
      const hasHeader = row.some((cell) => {
        const norm = normalizeKey(String(cell || ''))
        return headerKeywords.some((kw) => norm.includes(kw))
      })
      if (hasHeader) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      error.value = 'No se encontró una fila de cabeceras válida en el Excel.'
      return
    }

    const json = XLSX.utils.sheet_to_json(sheet, {
      range: headerRowIndex,
      defval: ''
    }) as any[]

    // mapeo general (TODAS las filas)
    const mapped = json.map((r) => {
      const normalized: Record<string, string> = {}
      for (const key in r) {
        const normKey = normalizeKey(key)
        normalized[normKey] = r[key]
      }

      const dni = (
        normalized['numerodedocumento'] ||
        normalized['numerodedni'] ||
        normalized['documento'] ||
        normalized['dni'] ||
        ''
      )
        .toString()
        .trim()

      return {
        dni,
        nombres: (normalized['nombres'] || '').toString().trim(),
        apellidos: (
          (normalized['apellidopaterno'] || '') +
          ' ' +
          (normalized['apellidomaterno'] || '')
        )
          .toString()
          .trim(),
        grado: (normalized['grado'] || '').toString().trim(),
        seccion: (normalized['seccion'] || '').toString().trim()
      }
    })

    // 👇 guardamos todas las filas leídas
    allRows.value = mapped

    // vista previa
    preview.value = mapped.slice(0, 5)

    // 👇 lo que sí se va a enviar
    rows.value = mapped.filter((r) => r.dni && r.dni !== '')
  }

  reader.readAsBinaryString(file)
}

const enviar = async () => {
  loading.value = true
  error.value = ''
  success.value = false
  successText.value = ''

  if (!rows.value.length) {
    error.value = 'No hay alumnos con N° de documento. Corrige el Excel.'
    loading.value = false
    return
  }

  const res = await $fetch('/api/alumnos/import', {
    method: 'POST',
    body: {
      alumnos: rows.value,              // 👈 los válidos
      totalRows: allRows.value.length   // 👈 los totales leídos
    }
  }).catch((err) => {
    console.error(err)
    return { ok: false, msg: 'Error al enviar' }
  })

  loading.value = false

  if (!res?.ok) {
    error.value = res?.msg || 'No se pudo insertar'
    return
  }

  const total = res.total ?? allRows.value.length
  const inserted = res.inserted ?? rows.value.length
  const discarded = res.discarded ?? (total - inserted)

  success.value = true
  successText.value = `Alumnos totales: ${total} · Alumnos cargados: ${inserted} · Filas descartadas: ${discarded}`
}
</script>
