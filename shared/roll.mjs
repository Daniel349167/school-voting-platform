const clean = v => String(v ?? '').trim().replace(/\s+/g, ' ')
const key = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const GRADES = { primero: '1', segundo: '2', tercero: '3', cuarto: '4', quinto: '5' }

export function parseRoll(matrix, { includeTransfers = false } = {}) {
  const first = matrix.findIndex(row => row.some(c => key(c) === 'grado') && row.some(c => key(c) === 'seccion'))
  if (first < 0) throw new Error('No se encontraron las columnas GRADO y SECCIÓN.')
  let end = first
  // SIAGIE divide las cabeceras entre dos filas y usa celdas combinadas.
  if (matrix[first + 1]?.some(c => ['numero de documento', 'tipo de documento'].includes(key(c)))) end++
  const headers = Array.from({ length: Math.max(...matrix.slice(first, end + 1).map(r => r.length)) }, (_, i) => {
    for (let r = end; r >= first; r--) if (clean(matrix[r][i])) return key(matrix[r][i])
    return ''
  })
  const col = (...names) => headers.findIndex(h => names.includes(h))
  const ix = { item: col('item'), grado: col('grado'), seccion: col('seccion'), doc: col('numero de documento','dni'), codigo: col('codigo del estudiante','codigo'), paterno: col('apellido paterno'), materno: col('apellido materno'), nombres: col('nombres'), apellidos: col('apellidos'), full: col('estudiante'), estado: col('estado de matricula') }
  if (ix.doc < 0 && ix.codigo < 0) throw new Error('Falta la columna DNI o código de estudiante.')
  const result = { alumnos: [], total: 0, transferred: 0, withoutDni: 0, errors: [] }
  const seen = new Set()
  for (let r = end + 1; r < matrix.length; r++) {
    const row = matrix[r]
    if (!row.some(v => clean(v))) continue
    if (ix.item >= 0 && !/^\d+$/.test(clean(row[ix.item]))) continue
    result.total++
    const estado = ix.estado < 0 ? '' : key(row[ix.estado])
    if (estado === 'trasladado' && !includeTransfers) { result.transferred++; continue }
    if (ix.estado >= 0 && !['definitiva','trasladado'].includes(estado)) { result.errors.push(`Fila ${r+1}: estado de matrícula desconocido.`); continue }
    const doc = clean(row[ix.doc])
    const codigo = clean(row[ix.codigo]).toUpperCase()
    const dni = doc || (codigo ? `CE-${codigo}` : '')
    const grado = GRADES[key(row[ix.grado])] || clean(row[ix.grado])
    const rawSection = clean(row[ix.seccion]).toUpperCase()
    const seccion = rawSection.replace(new RegExp(`^${grado}(?=[A-Z])`), '')
    let nombres = clean(row[ix.nombres])
    let apellidos = [clean(row[ix.paterno]),clean(row[ix.materno])].filter(Boolean).join(' ') || clean(row[ix.apellidos])
    if (!nombres && !apellidos && ix.full >= 0) {
      const parts = clean(row[ix.full]).split(',')
      if (parts.length >= 2) { apellidos = parts.shift().trim(); nombres = parts.join(',').trim() }
      else { result.errors.push(`Fila ${r+1}: nombres sin separar. Usa columnas NOMBRES y APELLIDOS.`); continue }
    }
    if (!/^[A-Z0-9-]{4,32}$/.test(dni) || (doc && !/^\d{8}$/.test(doc)) || !/^[1-5]$/.test(grado) || !/^[A-Z]{1,3}$/.test(seccion) || !nombres || !apellidos) {
      result.errors.push(`Fila ${r+1}: documento, nombre, grado o sección inválido.`); continue
    }
    if (seen.has(dni)) { result.errors.push(`Fila ${r+1}: identificador duplicado. Revisa el padrón.`); continue }
    seen.add(dni)
    if (!doc) result.withoutDni++
    result.alumnos.push({ dni, nombres, apellidos, grado, seccion })
  }
  return result
}
