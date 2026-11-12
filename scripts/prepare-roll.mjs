import fs from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { parseRoll } from '../shared/roll.mjs'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Uso: node scripts/prepare-roll.mjs archivo.xlsx private/padron-2026.json [--include-transfers]')
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(input)
const matrix = []
wb.worksheets[0].eachRow({ includeEmpty: true }, row => matrix.push(Array.from({length: wb.worksheets[0].columnCount}, (_,i) => row.getCell(i+1).value)))
const result = parseRoll(matrix, { includeTransfers: process.argv.includes('--include-transfers') })
if (result.errors.length) throw new Error(result.errors.join('\n'))
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ total: result.total, incluidos: result.alumnos.length, trasladadosExcluidos: result.transferred, conCodigoEstudiante: result.withoutDni }))
