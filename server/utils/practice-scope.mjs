import { AsyncLocalStorage } from 'node:async_hooks'

const practiceContext = new AsyncLocalStorage()
export const withPracticeDatabase = work => practiceContext.run(true, work)
export const electionTablePrefix = productionPrefix => practiceContext.getStore() === true ? 'practica_2026_' : productionPrefix
export const electionVoteFunction = productionFunction => practiceContext.getStore() === true ? 'emitir_voto_practica_2026' : productionFunction
