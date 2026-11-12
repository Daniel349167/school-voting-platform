import fs from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { hashPassword } from '../shared/security.mjs'

const [input,output] = process.argv.slice(2)
if (!input || !output) throw new Error('Uso: prepare-users.mjs exportacion-usuarios.csv private/usuarios-2026.csv')
const wb = new ExcelJS.Workbook()
const sheet = await wb.csv.readFile(input,{map:value=>String(value)})
const headers = sheet.getRow(1).values.slice(1).map(v=>String(v).trim().toLowerCase())
const users=[]
for(let i=2;i<=sheet.rowCount;i++) {
  const row=Object.fromEntries(headers.map((h,j)=>[h,String(sheet.getRow(i).getCell(j+1).value ?? '')]))
  if (!['docente','aperturador'].includes(row.role)) continue
  if (!row.email || !row.password) throw new Error(`Fila ${i}: falta correo o contraseña.`)
  users.push({email:row.email.trim().toLowerCase(),password:row.password.startsWith('scrypt$') ? row.password : hashPassword(row.password),role:row.role})
}
if (!users.length) throw new Error('No hay usuarios para migrar.')
const columns=['email','password','role']
const csv=[columns,...users.map(u=>columns.map(c=>u[c]))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')
await fs.mkdir(path.dirname(output),{recursive:true})
await fs.writeFile(output,csv,{mode:0o600})
console.log(`${users.length} usuarios preparados con contraseñas protegidas. No se cambiaron las contraseñas.`)
