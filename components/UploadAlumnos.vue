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

const rows = ref<any[]>([])          // filas a enviar (ya normalizadas)
const allRows = ref<any[]>([])       // todas las filas leídas (info)
const preview = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const success = ref(false)
const successText = ref('')

/* =======================
 * Helpers de normalización
 * ======================= */
const normalizeKey = (str: string) => {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const gradoToNum = (sRaw: any) => {
  const s = normalizeKey(String(sRaw || ''))
  const map: Record<string, number> = {
    'primero': 1, '1': 1, '1°': 1,
    'segundo': 2, '2': 2, '2°': 2,
    'tercero': 3, '3': 3, '3°': 3,
    'cuarto': 4,  '4': 4, '4°': 4,
    'quinto': 5,  '5': 5, '5°': 5
  }
  // 👇 corrige el error del ?? con ||
  const v = map[s]
  return (v ?? Number.parseInt(s)) || 0
}

/** “APELLIDOS, NOMBRES” → { apellidos, nombres } */
const splitNombre = (full: string) => {
  const txt = String(full || '').trim()
  if (!txt) return { apellidos: '', nombres: '' }
  const parts = txt.split(',') // formato del padrón
  if (parts.length >= 2) {
    return { apellidos: parts[0].trim(), nombres: parts.slice(1).join(',').trim() }
  }
  // fallback: último token como nombre
  const tokens = txt.split(/\s+/)
  if (tokens.length <= 1) return { apellidos: txt, nombres: '' }
  return {
    apellidos: tokens.slice(0, -1).join(' '),
    nombres: tokens.slice(-1)[0]
  }
}

/** DNI de respaldo: 2 letras paterno + 2 letras materno + “1111” → largo 8 */
const fallbackDni = (apellidos: string) => {
  const clean = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const aps = clean(apellidos)
  // patrón esperado: "PATERNO MATERNO, ..." o "PATERNO MATERNO"
  const sinComa = aps.split(',')[0] || ''
  const toks = sinComa.trim().split(/\s+/)
  const paterno = toks[0] || 'XX'
  const materno = toks[1] || 'XX'
  let base = (paterno.slice(0, 2) || 'XX') + (materno.slice(0, 2) || 'XX') + '1111'
  // asegura longitud 8
  if (base.length < 8) base = base.padEnd(8, '1')
  if (base.length > 8) base = base.slice(0, 8)
  return base
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
    const workbook = XLSX.read(data as any, { type: 'binary' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // Leemos en crudo para ubicar la fila de cabeceras reales (donde empiece GRADO/SECCIÓN/…)
    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' }) as string[][]
    let headerRowIndex = -1

    // Buscamos una fila que contenga al menos GRADO y SECCIÓN (nuevo formato)
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i].map(c => normalizeKey(c))
      const hasGrado = row.some(c => c === 'grado')
      const hasSecc  = row.some(c => c.startsWith('seccion'))
      const hasNumDoc = row.some(c => c.includes('numero de documento') || c === 'dni')
      const hasEst = row.some(c => c === 'estudiante')
      if (hasGrado && hasSecc && hasNumDoc && hasEst) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      error.value = 'No se encontró una fila de cabeceras válida (GRADO/SECCIÓN/NÚMERO DE DOCUMENTO/ESTUDIANTE).'
      return
    }

    // Leemos ya como objetos a partir de la fila encontrada
    const json = XLSX.utils.sheet_to_json(sheet, {
      range: headerRowIndex,
      defval: ''
    }) as any[]

    // Mapeo exacto por nombre de columna del nuevo padrón
    const mapped = json.map((r) => {
      // normalizamos keys para ser tolerantes
      const norm: Record<string, any> = {}
      for (const k of Object.keys(r)) {
        norm[normalizeKey(k)] = r[k]
      }

      const gradoRaw =
        r['GRADO'] ?? r['grado'] ?? norm['grado'] ?? ''

      const seccionRaw =
        r['SECCIÓN'] ?? r['SECCION'] ?? r['sección'] ?? r['seccion'] ?? norm['seccion'] ?? ''

      const numDocRaw =
      r['NÚMERO DE DOCUMENTO'] ?? r['NUMERO DE DOCUMENTO'] ?? r['numero de documento'] ??
      norm['numero de documento'] ?? norm['dni'] ?? ''

      const tipoDocRaw =
        r['TIPO DE DOCUMENTO'] ?? r['tipo de documento'] ?? r['DOCUMENTO'] ??
        norm['tipo de documento'] ?? norm['documento'] ?? norm['tipodedocumento'] ?? ''

      const estudianteRaw =
        r['ESTUDIANTE'] ?? r['estudiante'] ?? norm['estudiante'] ?? ''

      const { apellidos, nombres } = splitNombre(String(estudianteRaw || ''))

      // ¿Es DNI?
      const tipoNorm = normalizeKey(String(tipoDocRaw || ''))
      const esDNI = (tipoNorm === 'dni')

      // Regla:
      // - Si es DNI y viene número -> usarlo.
      // - Si NO es DNI (vacío, “CE”, etc.) o no hay número -> generar fallback.
      let dni = ''
      if (esDNI) {
        dni = String(numDocRaw || '').trim()
      }
      if (!dni) {
        dni = fallbackDni(apellidos)
      }


      return {
        dni,
        nombres: String(nombres || ''),
        apellidos: String(apellidos || ''),
        grado: gradoToNum(gradoRaw),
        seccion: String(seccionRaw || '').toUpperCase().trim()
      }
    })

    allRows.value = mapped
    preview.value = mapped.slice(0, 5)
    rows.value = mapped
  }

  reader.readAsBinaryString(file)
}

const enviar = async () => {
  loading.value = true
  error.value = ''
  success.value = false
  successText.value = ''

  if (!rows.value.length) {
    error.value = 'No hay alumnos para enviar.'
    loading.value = false
    return
  }

  const res = await $fetch('/api/alumnos/import', {
    method: 'POST',
    body: {
      alumnos: rows.value,              // ahora enviamos todos (con DNI generado si faltaba)
      totalRows: allRows.value.length
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
  const discarded = res.discarded ?? Math.max(0, total - inserted)

  success.value = true
  successText.value = `Alumnos totales: ${total} · Alumnos cargados: ${inserted} · Filas descartadas: ${discarded}`
}
</script>

<style scoped>
.upload-box{gap:12px}
.upload-input{padding:8px}
.upload-error{color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;padding:8px;border-radius:8px}
.upload-success{color:#065f46;background:#d1fae5;border:1px solid #a7f3d0;padding:8px;border-radius:8px}
.upload-preview table{width:100%;border-collapse:collapse}
.upload-preview th,.upload-preview td{border:1px solid #e2e8f0;padding:10px}
.upload-btn{
  width: auto;           /* deja de ocupar 100% */
  display: inline-flex;  /* tamaño ajustado al contenido */
  align-items: center;
  justify-content: center;
  padding: 10px 16px;    /* igual que antes si ya lo tenías */
  border-radius: 10px;   /* igual que antes si ya lo tenías */
}
.upload-btn:disabled{opacity:.6;cursor:not-allowed}
</style>
