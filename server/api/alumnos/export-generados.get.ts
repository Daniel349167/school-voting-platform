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

  // 3) Prepara datos para Excel
  const headers = ['Número', 'Nombre', 'Grado', 'Sección', 'Código']
  const rows = filtrados.map((a, idx) => ([
    idx + 1,
    `${(a.apellidos || '').trim()}, ${(a.nombres || '').trim()}`.replace(/,\s*$/, ''),
    String(a.grado ?? ''),
    String(a.seccion ?? ''),
    String(a.dni ?? '')
  ]))

  // 4) Genera workbook/worksheet en memoria (sin path → sin errores ESM/URL)
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
  { width: 10, alignment: { horizontal: 'center' } }, // Número
  { width: 40 }, // Nombre
  { width: 12, alignment: { horizontal: 'center' } }, // Grado
  { width: 12, alignment: { horizontal: 'center' } }, // Sección
  { width: 18, alignment: { horizontal: 'center' } }  // Código
]

  // 5) Buffer y respuesta como archivo descargable
  const buf = await wb.xlsx.writeBuffer()
  const filename = 'alumnos-codigos.xlsx'
  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  })
  return buf
})
