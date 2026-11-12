export function summarize(alumnos, votos, candidatos, { hidden = false } = {}) {
  const list = arr => [
    ...candidatos.map(c => ({ id: c.id, nombre: c.nombre, conteo: hidden ? 0 : arr.filter(v => !v.en_blanco && v.candidato_id === c.id).length })),
    { id: -1, nombre: 'Voto en blanco', conteo: hidden ? 0 : arr.filter(v => v.en_blanco).length }
  ]
  const porGrado = {}
  for (let g = 1; g <= 5; g++) {
    const vg = votos.filter(v => Number(v.grado) === g)
    porGrado[g] = { totalAlumnos: alumnos.filter(a => Number(a.grado) === g).length, emitidos: vg.length, porLista: list(vg) }
  }
  return { ok: true, meta: { resultsHidden: hidden }, notice: hidden ? 'La participación se actualiza en vivo. Los votos por lista se publicarán al cerrar la votación.' : '', totales: { totalAlumnos: alumnos.length, totalEmitidos: votos.length, porLista: list(votos) }, porGrado }
}
