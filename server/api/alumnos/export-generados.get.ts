// server/api/alumnos/export-codigos.get.ts
import { defineEventHandler, setResponseHeaders } from 'h3'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

export default defineEventHandler(async (event) => {
  // ⚙️ Credenciales Supabase (env/server-runtime)
  const cfg = useRuntimeConfig()
  const supabase = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceRole)

  // 1) Trae alumnos
  const { data, error } = await supabase
    .from('alumnos')
    .select('dni, nombres, apellidos, grado, seccion')

  if (error) {
    return { ok: false, msg: 'Error leyendo alumnos', detail: error.message }
  }

  // 2) Filtra solo los de DNI generado: "Letra + 3 dígitos"
  const reGen = /^[A-Za-z][0-9]{3}$/
  const filtrados = (data || []).filter(a => reGen.test(String(a?.dni ?? '')))

  // 3) Normaliza y ORDENA (grado numérico → sección → apellidos → nombres)
  type Row = {
    dni: string
    nombres: string
    apellidos: string
    gradoNum: number
    gradoTxt: string
    seccion: string
  }

  const normalizados: Row[] = filtrados.map((a) => {
    const gradoRaw = String(a?.grado ?? '').trim()
    const gradoNum = Number(gradoRaw.match(/\d+/)?.[0] ?? 0) // 1..5 aunque venga "1", "1°", etc.
    return {
      dni: String(a?.dni ?? '').trim(),
      nombres: String(a?.nombres ?? '').trim().replace(/\s+/g, ' '),
      apellidos: String(a?.apellidos ?? '').trim().replace(/\s+/g, ' '),
      gradoNum,
      gradoTxt: gradoRaw || String(gradoNum || ''),
      seccion: String(a?.seccion ?? '').trim().toUpperCase()
    }
  })

  normalizados.sort((x, y) =>
    (x.gradoNum - y.gradoNum) ||
    x.seccion.localeCompare(y.seccion, 'es', { sensitivity: 'base' }) ||
    x.apellidos.localeCompare(y.apellidos, 'es', { sensitivity: 'base' }) ||
    x.nombres.localeCompare(y.nombres, 'es', { sensitivity: 'base' })
  )

  // 4) Prepara datos para Excel
  const headers = ['Número', 'Nombre', 'Grado', 'Sección', 'Código']
  const rows = normalizados.map((a, idx) => ([
    idx + 1,
    `${a.apellidos}${a.apellidos && a.nombres ? ', ' : ''}${a.nombres}`,
    a.gradoTxt,
    a.seccion,
    a.dni
  ]))

  // 5) Genera workbook/worksheet en memoria
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  wb.modified = new Date()
  wb.properties.title = 'Alumnos con códigos'
  const ws = wb.addWorksheet('Alumnos', { views: [{ state: 'frozen', ySplit: 1 }] })

  // Encabezados
  ws.addRow(headers)
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: 'middle' }
  headerRow.eachCell(c => {
    c.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    }
  })

  // Cuerpo
  rows.forEach(r => ws.addRow(r))

  // Anchos sugeridos
  ws.columns = [
    { width: 10 },  // Número
    { width: 40 },  // Nombre
    { width: 12 },  // Grado
    { width: 12 },  // Sección
    { width: 18 }   // Código
  ]

  // 🔥 Centramos columnas cortas (incluye encabezados y cuerpo)
  const colsToCenter = [1, 3, 4, 5]
  colsToCenter.forEach(colIndex => {
    ws.getColumn(colIndex).eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  })

  // 6) Buffer y respuesta como archivo descargable
  const buf = await wb.xlsx.writeBuffer()
  const filename = 'alumnos-codigos.xlsx'
  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  })
  return buf
})
