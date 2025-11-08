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

    <div v-if="dedupInfo.total > 0" class="upload-info">
      <p>
        Detectados: {{ dedupInfo.total }} ·
        Duplicados descartados: {{ dedupInfo.discarded }}
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
            <th>DNI o Código</th>
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

const rows = ref<any[]>([])      // filas listas para enviar (normalizadas y deduplicadas)
const allRows = ref<any[]>([])   // todas las filas leídas y mapeadas (antes de deduplicar)
const preview = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const success = ref(false)
const successText = ref('')

const dedupInfo = ref<{ total:number, unique:number, discarded:number, samples:string[] }>({
  total: 0, unique: 0, discarded: 0, samples: []
})

/* =======================
 * Helpers de normalización
 * ======================= */
const normalizeKey = (str: string) => {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const gradoToNum = (sRaw: any) => {
  const s = normalizeKey(String(sRaw || ''))
  const map: Record<string, number> = {
    'primero': 1, '1': 1, '1°': 1,
    'segundo': 2, '2': 2, '2°': 2,
    'tercero': 3, '3': 3, '3°': 3,
    'cuarto':  4, '4': 4, '4°': 4,
    'quinto':  5, '5': 5, '5°': 5,
  }
  const v = map[s]
  return (v ?? Number.parseInt(s)) || 0
}

/** “APELLIDOS, NOMBRES” → { apellidos, nombres } */
const splitNombre = (full: string) => {
  const txt = String(full || '').trim()
  if (!txt) return { apellidos: '', nombres: '' }
  const parts = txt.split(',') // padrón: "APELLIDOS, NOMBRES"
  if (parts.length >= 2) {
    return {
      apellidos: parts[0].trim(),
      nombres: parts.slice(1).join(',').trim(),
    }
  }
  // fallback
  const tokens = txt.split(/\s+/)
  if (tokens.length <= 1) return { apellidos: txt, nombres: '' }
  return { apellidos: tokens.slice(0, -1).join(' '), nombres: tokens.slice(-1)[0] }
}

/** Normaliza el “código del estudiante” como string sin espacios extra */
const normalizeCodigo = (v: any) => String(v ?? '').toString().trim()

/** Genera ID aleatorio: una letra (A-Z) + 3 dígitos (000-999) */
const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26))
const rand3 = () => String(Math.floor(Math.random() * 1000)).padStart(3, '0')
const makeRandomId = (used: Set<string>) => {
  let id = ''
  let guard = 0
  do {
    id = `${randLetter()}${rand3()}`
    guard++
    // evita bucle infinito en caso extremo
    if (guard > 2000) break
  } while (used.has(id))
  used.add(id)
  return id
}

/** Decide si se considera “DNI válido” (tipo === 'dni' y hay número) */
const hasRealDni = (tipoDoc: string, numDoc: string) => {
  const tipo = normalizeKey(tipoDoc)
  const dni = String(numDoc || '').trim()
  return (tipo === 'dni' && !!dni)
}

const onFileChange = (e: Event) => {
  error.value = ''
  success.value = false
  successText.value = ''
  rows.value = []
  preview.value = []
  allRows.value = []
  dedupInfo.value = { total: 0, unique: 0, discarded: 0, samples: [] }

  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (evt) => {
    const data = evt.target?.result
    const workbook = XLSX.read(data as any, { type: 'binary' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // Leemos en crudo para detectar la fila de cabeceras REALES
    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' }) as string[][]
    let headerRowIndex = -1

    // Buscamos una fila que tenga al menos estas columnas del nuevo formato
    // GRADO | SECCIÓN | TIPO DE DOCUMENTO | NÚMERO DE DOCUMENTO | CÓDIGO DEL ESTUDIANTE | ESTUDIANTE
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i].map(c => normalizeKey(c))
      const hasGrado   = row.some(c => c === 'grado')
      const hasSeccion = row.some(c => c.startsWith('seccion'))
      const hasTipo    = row.some(c => c === 'tipo de documento' || c === 'documento')
      const hasNumDoc  = row.some(c => c === 'numero de documento' || c === 'dni')
      const hasCodigo  = row.some(c => c === 'codigo del estudiante' || c === 'codigo')
      const hasEst     = row.some(c => c === 'estudiante')
      if (hasGrado && hasSeccion && hasTipo && hasNumDoc && hasCodigo && hasEst) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      error.value = 'No se encontró la fila de cabeceras válida (GRADO/SECCIÓN/TIPO/NÚMERO/CÓDIGO/ESTUDIANTE).'
      return
    }

    // Leemos como objetos desde esa fila
    const json = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' }) as any[]

    // 1) Mapear filas a estructura intermedia
    type Mapped = {
      // datos visuales
      nombres: string
      apellidos: string
      grado: number
      seccion: string
      // campos brutos
      _tipoDoc: string
      _numDoc: string
      _codigo: string
      // flags
      _hasRealDni: boolean
      // salida futura
      dni: string  // será DNI real o aleatorio si no tiene DNI
    }

    const mapped: Mapped[] = json.map((r) => {
      // normalizamos keys para ser tolerantes a mayúsculas/acentos
      const norm: Record<string, any> = {}
      for (const k of Object.keys(r)) {
        norm[normalizeKey(k)] = r[k]
      }

      const gradoRaw   = r['GRADO'] ?? r['grado'] ?? norm['grado'] ?? ''
      const seccionRaw = r['SECCIÓN'] ?? r['SECCION'] ?? r['sección'] ?? r['seccion'] ?? norm['seccion'] ?? ''
      const tipoDocRaw = r['TIPO DE DOCUMENTO'] ?? r['tipo de documento'] ?? r['DOCUMENTO'] ?? norm['tipo de documento'] ?? norm['documento'] ?? ''
      const numDocRaw  = r['NÚMERO DE DOCUMENTO'] ?? r['NUMERO DE DOCUMENTO'] ?? r['numero de documento'] ?? norm['numero de documento'] ?? norm['dni'] ?? ''
      const codigoEst  = r['CÓDIGO DEL ESTUDIANTE'] ?? r['CODIGO DEL ESTUDIANTE'] ?? r['codigo del estudiante'] ?? norm['codigo del estudiante'] ?? norm['codigo'] ?? ''
      const estudiante = r['ESTUDIANTE'] ?? r['estudiante'] ?? norm['estudiante'] ?? ''

      const { apellidos, nombres } = splitNombre(String(estudiante || ''))

      const _tipoDoc = String(tipoDocRaw || '')
      const _numDoc  = String(numDocRaw || '').trim()
      const _codigo  = normalizeCodigo(codigoEst)

      return {
        nombres: String(nombres || ''),
        apellidos: String(apellidos || ''),
        grado: gradoToNum(gradoRaw),
        seccion: String(seccionRaw || '').toUpperCase().trim(),
        _tipoDoc,
        _numDoc,
        _codigo,
        _hasRealDni: hasRealDni(_tipoDoc, _numDoc),
        // 'dni' se asignará en la fase 2 (deduplicación + generación)
        dni: ''
      }
    })

    // 2) Deduplicar según regla y asignar identificador final
    const seenDni = new Set<string>()      // para quienes SÍ tienen DNI
    const seenCod = new Set<string>()      // para quienes NO tienen DNI (se guía por CÓDIGO)
    const usedGen = new Set<string>()      // para garantizar aleatorios únicos dentro del lote

    const kept: any[] = []
    const discards: string[] = []

    for (const item of mapped) {
      if (item._hasRealDni) {
        const key = item._numDoc
        if (seenDni.has(key)) {
          discards.push(`Descartado por DNI duplicado: ${key} (${item.apellidos}, ${item.nombres})`)
          continue
        }
        seenDni.add(key)
        // Mantiene el DNI real como identificador final
        kept.push({
          dni: key,
          nombres: item.nombres,
          apellidos: item.apellidos,
          grado: item.grado,
          seccion: item.seccion
        })
      } else {
        const cod = item._codigo
        if (cod) {
          if (seenCod.has(cod)) {
            discards.push(`Descartado: ${cod} (${item.apellidos}, ${item.nombres})`)
            continue
          }
          seenCod.add(cod)
        }
        // Generar identificador aleatorio (Letra + 3 dígitos) único en el lote
        const genId = makeRandomId(usedGen)
        kept.push({
          dni: genId,
          nombres: item.nombres,
          apellidos: item.apellidos,
          grado: item.grado,
          seccion: item.seccion
        })
      }
    }

    allRows.value = kept
    rows.value = kept
    preview.value = kept.slice(0, 5)

    dedupInfo.value = {
      total: mapped.length,
      unique: kept.length,
      discarded: discards.length,
      samples: discards.slice(0, 5)
    }
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
      alumnos: rows.value,
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
  successText.value = `Alumnos totales: ${total} · Alumnos cargados: ${inserted}`
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
