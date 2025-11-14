// server/api/votos/export.get.ts
import { defineEventHandler, setResponseHeaders } from 'h3'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

type Voto = {
  dni: string
  grado: any
  seccion: string
  candidato_id: number | null
  en_blanco: boolean
  created_at?: string | null  // normalizamos desde creado_en
  creado_en?: string | null
}

type Alumno = { dni: string; grado: any; seccion: string; nombres?: string | null; apellidos?: string | null }
type Candidato = { id: number; nombre: string }

const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const GRADOS = [1, 2, 3, 4, 5]
const TZ = 'America/Lima'

/** Convierte un ISO/UTC a un Date con la "hora de reloj" de Lima. */
function toLimaDate(iso: string | Date) {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(d)

  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || 0)
  const y = get('year'), m = get('month'), day = get('day')
  const hh = get('hour'), mm = get('minute'), ss = get('second')
  return new Date(y, m - 1, day, hh, mm, ss)
}

/** Sella con fecha/hora de Lima para el nombre del archivo. */
function limaStamp() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(now)

  const get = (t: string) => (parts.find(p => p.type === t)?.value ?? '').padStart(2, '0')
  const stamp = `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}`

  // Logs de verificación
  console.log('🕓 Hora del sistema (UTC/local):', now.toISOString(), now.toLocaleString('es-PE'))
  console.log('🇵🇪 Sello Lima para filename:', stamp)

  return stamp
}

/** Letra de columna para merge (A, B, ... Z, AA, AB, ...) */
function colLetter(n: number) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s || 'A'
}

/** Título de hoja con merge hasta la última columna configurada */
function sheetTitle(ws: ExcelJS.Worksheet, title: string) {
  const last = colLetter(ws.columns.length || 1)
  const r = ws.addRow([title])
  r.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } }
  r.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.mergeCells(`A${r.number}:${last}${r.number}`)
  ws.addRow([])
}

function headerRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const r = ws.addRow(headers)
  r.font = { bold: true, color: { argb: 'FF0F172A' } }
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  r.alignment = { vertical: 'middle' }
  r.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  }
  return r
}

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  const supa = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  const allowBlank = String(cfg.public.VOTO_BLANCO ?? 'si')
    .toLowerCase()
    .match(/^(si|sí|true|1|on)$/) !== null

  // === Candidatos ===
  let candidatos: Candidato[] = []
  {
    const q = await supa.from('candidatos').select('id,nombre') as any
    if (q.error) return { ok: false, msg: `No se pudo leer candidatos: ${q.error.message}` }
    candidatos = (q.data || []) as Candidato[]
  }

  // === Alumnos (si faltan nombres/apellidos, sigue igual) ===
  let alumnos: Alumno[] = []
  {
    let q = await supa.from('alumnos').select('dni,grado,seccion,nombres,apellidos') as any
    if (q.error && q.error.code === '42703') {
      q = await supa.from('alumnos').select('dni,grado,seccion') as any
      if (q.error) return { ok: false, msg: `No se pudo leer alumnos: ${q.error.message}` }
      alumnos = (q.data || []).map((a: any) => ({ ...a, nombres: null, apellidos: null })) as Alumno[]
    } else if (q.error) {
      return { ok: false, msg: `No se pudo leer alumnos: ${q.error.message}` }
    } else {
      alumnos = (q.data || []) as Alumno[]
    }
  }

  // === Votos (usar creado_en y mapear a created_at) ===
  let votos: Voto[] = []
  {
    let q = await supa
      .from('votos')
      .select('dni,grado,seccion,candidato_id,en_blanco,creado_en')
      .order('creado_en', { ascending: true }) as any

    if (q.error) {
      if (q.error.code === '42P01') {
        votos = []
      } else if (q.error.code === '42703') {
        q = await supa
          .from('votos')
          .select('dni,grado,seccion,candidato_id,en_blanco,creado_en') as any
        if (q.error) return { ok: false, msg: `No se pudo leer votos: ${q.error.message}` }
        votos = (q.data || []) as Voto[]
      } else {
        return { ok: false, msg: `No se pudo leer votos: ${q.error.message}` }
      }
    } else {
      votos = (q.data || []) as Voto[]
    }
  }

  const alumnosN = (alumnos || []).map((a: Alumno) => ({ ...a, grado: toNum(a.grado) }))
  const votosN = (votos || []).map((v: Voto) => ({
    ...v,
    grado: toNum(v.grado),
    created_at: v.created_at ?? v.creado_en ?? null, // normaliza para usar en Excel
  }))

  const totalAlumnos = alumnosN.length

  // 🔎 Mapa DNI → "Apellidos, Nombres"
  const nameByDni: Record<string, string> = {}
  for (const a of alumnosN) {
    const ap = (a.apellidos || '').trim()
    const no = (a.nombres || '').trim()
    const joined = [ap, no].filter(Boolean).join(', ')
    nameByDni[a.dni] = joined
  }

  // Conteos
  const keyBlanco = -1
  const nameBlanco = 'Voto en blanco'
  const allNames: Record<number, string> =
    Object.fromEntries((candidatos || []).map((c: Candidato) => [c.id, c.nombre]))
  allNames[keyBlanco] = nameBlanco

  const countMap = (arr: Voto[]) => {
    const m: Record<number, number> = {}
    for (const v of arr) {
      const id = (v.en_blanco || v.candidato_id == null) ? keyBlanco : Number(v.candidato_id)
      m[id] = (m[id] || 0) + 1
    }
    return m
  }

  // General
  const gen = countMap(votosN)
  const totalEmitidos = votosN.length

  // Ganador(es) virtual(es) (excluye blanco)
  let maxVotes = 0
  for (const c of candidatos || []) {
    const n = gen[c.id] || 0
    if (n > maxVotes) maxVotes = n
  }
  const ganadores = (candidatos || [])
    .filter(c => (gen[c.id] || 0) === maxVotes && maxVotes > 0)
    .map(c => `${c.nombre} (${gen[c.id]})`)

  // ==== POR GRADO Y SECCIÓN ====
  type Cont = { totalAlumnos: number, emitidos: number, porLista: Record<number, number> }

  // Detalle por sección
  const porGS: Record<string, Cont> = {}  // key: `${g}|${sec}`
  // totales alumnos por sección
  for (const a of alumnosN) {
    const k = `${a.grado}|${a.seccion}`
    if (!porGS[k]) porGS[k] = { totalAlumnos: 0, emitidos: 0, porLista: {} }
    porGS[k].totalAlumnos++
  }
  // votos por sección
  for (const v of votosN) {
    const k = `${v.grado}|${v.seccion}`
    if (!porGS[k]) porGS[k] = { totalAlumnos: 0, emitidos: 0, porLista: {} }
    porGS[k].emitidos++
    const id = (v.en_blanco || v.candidato_id == null) ? keyBlanco : Number(v.candidato_id)
    porGS[k].porLista[id] = (porGS[k].porLista[id] || 0) + 1
  }

  // === RESUMEN POR GRADO (acumulado de todas las secciones) ===
  const porG: Record<number, Cont> = {}
  for (const g of GRADOS) {
    porG[g] = { totalAlumnos: 0, emitidos: 0, porLista: {} }
  }
  for (const k of Object.keys(porGS)) {
    const [gStr] = k.split('|')
    const g = Number(gStr)
    const box = porGS[k]
    porG[g].totalAlumnos += box.totalAlumnos
    porG[g].emitidos     += box.emitidos
    for (const idStr of Object.keys(box.porLista)) {
      const id = Number(idStr)
      porG[g].porLista[id] = (porG[g].porLista[id] || 0) + box.porLista[id]
    }
  }

  // ========== Excel ==========
  const wb = new ExcelJS.Workbook()
  const nowLima = toLimaDate(new Date().toISOString())
  wb.created = nowLima
  wb.modified = nowLima
  wb.calcProperties.fullCalcOnLoad = true
  wb.properties.subject = 'Resultados en tiempo real'
  wb.properties.title = 'Votación escolar'
  wb.properties.company = 'Colegio'

  // ===== Hoja 1: Resumen =====
  const ws1 = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws1.columns = [
    { key: 'a', width: 28 },
    { key: 'b', width: 22 },
    { key: 'c', width: 44 },
    { key: 'd', width: 22 },
    { key: 'e', width: 20 },
    { key: 'f', width: 20 }
  ]
  sheetTitle(ws1, 'Resultados generales — en tiempo real')

  headerRow(ws1, ['Métrica', 'Valor', 'Descripción', '', '', ''])
  ws1.addRow(['Votantes posibles', totalAlumnos, 'Total de alumnos cargados', '', '', '']) // fila 4
  ws1.addRow(['Votos emitidos', totalEmitidos, 'Votos registrados hasta ahora', '', '', '']) // fila 5

  // Participación = B5/B4
  ws1.addRow([
    'Participación',
    { formula: `IF(B4=0,0,B5/B4)`, result: totalAlumnos ? totalEmitidos / totalAlumnos : 0 },
    'Emitidos / Posibles', '', '', ''
  ]) // fila 6

  ws1.getRow(4).getCell(2).numFmt = '0'
  ws1.getRow(5).getCell(2).numFmt = '0'
  ws1.getRow(6).getCell(2).numFmt = '0%'

  ws1.addRow([])
  headerRow(ws1, ['Indicador', 'Detalle', 'Notas', '', '', ''])
  const ganadorTexto = ganadores.length ? ganadores.join(', ') : 'Sin ganador aún'
  const notaGanador = 'Cálculo en tiempo real' + (allowBlank ? ' (incluye o muestra blanco según config)' : '')
  ws1.addRow(['Ganador(es) virtual(es)', ganadorTexto, notaGanador, '', '', ''])

  ws1.addRow([])
  sheetTitle(ws1, 'Distribución por listas (general)')
  headerRow(ws1, ['Lista', 'Votos', '% sobre emitidos', '', '', ''])
  const orderIds = [...Object.keys(allNames).map(Number)]
    .filter(id => id !== keyBlanco)
    .sort((a, b) => (gen[b] || 0) - (gen[a] || 0))
  for (const id of orderIds) {
    const votosL = gen[id] || 0
    const r = ws1.addRow([allNames[id], votosL, totalEmitidos ? votosL / totalEmitidos : 0, '', '', ''])
    r.getCell(2).numFmt = '0'
    r.getCell(3).numFmt = '0%'
  }
  if (allowBlank) {
    const vb = gen[keyBlanco] || 0
    const rb = ws1.addRow([nameBlanco, vb, totalEmitidos ? vb / totalEmitidos : 0, '', '', ''])
    rb.getCell(2).numFmt = '0'
    rb.getCell(3).numFmt = '0%'
  }

  // ===== Hoja 2: Por grado y sección =====
  const ws2 = wb.addWorksheet('Por grado y sección', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws2.columns = [
    { key: 'grado', width: 8 },
    { key: 'secc', width: 8 },
    { key: 'lista', width: 26 },
    { key: 'v', width: 12 },
    { key: 'te', width: 24 },
    { key: 'pg', width: 14 },
    { key: 'pp', width: 18 }
  ]
  sheetTitle(ws2, 'Distribución por listas — resumen por grado y detalle por sección')

  /* ========= Bloque A: RESUMEN POR GRADO (con celdas unificadas) ========= */
  const subA = ws2.addRow(['', '', 'RESUMEN POR GRADO', '', '', '', ''])
  subA.font = { bold: true }
  ws2.addRow([])
  headerRow(ws2, ['Grado', '', 'Lista', 'Votos', 'Emitidos (grado)', '% en grado', '% participación'])

  for (const g of GRADOS) {
    const box = porG[g]
    if (!box) continue
    const emG = box.emitidos
    const totG = box.totalAlumnos

    const idsG = [...Object.keys(allNames).map(Number)]
      .filter(id => id !== keyBlanco)
      .sort((a, b) => (box.porLista[b] || 0) - (box.porLista[a] || 0))

    const start = ws2.lastRow?.number ?? 8

    for (const id of idsG) {
      const c = box.porLista[id] || 0
      const r = ws2.addRow([`${g}°`, '', allNames[id], c, emG, emG ? c / emG : 0, totG ? emG / totG : 0])
      r.getCell(4).numFmt = '0'
      r.getCell(5).numFmt = '0'
      r.getCell(6).numFmt = '0%'
      r.getCell(7).numFmt = '0%'
    }
    if (allowBlank) {
      const cb = box.porLista[keyBlanco] || 0
      const rr = ws2.addRow([`${g}°`, '', nameBlanco, cb, emG, emG ? cb / emG : 0, totG ? emG / totG : 0])
      rr.getCell(4).numFmt = '0'
      rr.getCell(5).numFmt = '0'
      rr.getCell(6).numFmt = '0%'
      rr.getCell(7).numFmt = '0%'
    }

    // Unificar celdas E (Emitidos) y G (% participación) para este grado
    const end = ws2.lastRow?.number ?? start
    if (end > start) {
      ws2.mergeCells(`E${start + 1}:E${end}`)
      ws2.mergeCells(`G${start + 1}:G${end}`)
    }

    ws2.addRow([]) // separación entre grados
  }

  /* ========= Bloque B: DETALLE POR SECCIÓN (con celdas unificadas) ========= */
  const subB = ws2.addRow(['', '', 'DETALLE POR SECCIÓN', '', '', '', ''])
  subB.font = { bold: true }
  ws2.addRow([])
  headerRow(ws2, ['Grado', 'Sección', 'Lista', 'Votos', 'Emitidos (sección)', '% en sección', '% participación'])

  const keys = Object.keys(porGS).sort((a, b) => {
    const [ga, sa] = a.split('|'); const [gb, sb] = b.split('|')
    return Number(ga) - Number(gb) || sa.localeCompare(sb)
  })

  for (const k of keys) {
    const [gStr, sec] = k.split('|')
    const g = Number(gStr)
    const box = porGS[k]
    const em = box.emitidos
    const totSec = box.totalAlumnos

    const ids = [...Object.keys(allNames).map(Number)]
      .filter(id => id !== keyBlanco)
      .sort((a, b) => (box.porLista[b] || 0) - (box.porLista[a] || 0))

    const start = ws2.lastRow?.number ?? 8

    for (const id of ids) {
      const c = box.porLista[id] || 0
      const r = ws2.addRow([`${g}°`, sec, allNames[id], c, em, em ? c / em : 0, totSec ? em / totSec : 0])
      r.getCell(4).numFmt = '0'
      r.getCell(5).numFmt = '0'
      r.getCell(6).numFmt = '0%'
      r.getCell(7).numFmt = '0%'
    }
    if (allowBlank) {
      const cb = box.porLista[keyBlanco] || 0
      const rr = ws2.addRow([`${g}°`, sec, nameBlanco, cb, em, em ? cb / em : 0, totSec ? em / totSec : 0])
      rr.getCell(4).numFmt = '0'
      rr.getCell(5).numFmt = '0'
      rr.getCell(6).numFmt = '0%'
      rr.getCell(7).numFmt = '0%'
    }

    // Unificar celdas E (Emitidos) y G (% participación) para este bloque de sección
    const end = ws2.lastRow?.number ?? start
    if (end > start) {
      ws2.mergeCells(`E${start + 1}:E${end}`)
      ws2.mergeCells(`G${start + 1}:G${end}`)
    }

    ws2.addRow([]) // separación visual
  }

  // ===== Hoja 3: Votos (detalle) =====
  const ws3 = wb.addWorksheet('Votos (detalle)')
  ws3.columns = [
    { key: 'dni', width: 14 },
    { key: 'nombres', width: 36 },   // "Apellidos, Nombres"
    { key: 'grado', width: 8 },
    { key: 'seccion', width: 8 },
    { key: 'fecha', width: 22 }
  ]
  sheetTitle(ws3, 'Listado de votos (orden cronológico)')
  headerRow(ws3, ['DNI', 'Nombres', 'Grado', 'Sección', 'Fecha (Lima)'])

  for (const v of votosN) {
    const nombre = nameByDni[v.dni] || '' // "Apellidos, Nombres" si existe
    const fecha = v.created_at ? toLimaDate(v.created_at) : ''
    ws3.addRow([v.dni, nombre, v.grado, v.seccion, fecha])
  }
  ws3.getColumn(5).numFmt = 'yyyy-mm-dd hh:mm:ss'

  // → Buffer y respuesta
  const buf = await wb.xlsx.writeBuffer()
  const fname = `Resultados_votacion_${limaStamp()}.xlsx`
  console.log('🧾 Nombre del archivo a descargar:', fname)

  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`
  })
  return buf
})
