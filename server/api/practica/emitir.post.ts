import { defineEventHandler } from 'h3'
import { withPracticeDatabase } from '../../utils/practice-scope.mjs'
import castVote from '../votos/emitir.post'
export default defineEventHandler(event=>withPracticeDatabase(()=>castVote(event)))
