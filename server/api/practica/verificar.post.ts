import { defineEventHandler } from 'h3'
import { withPracticeDatabase } from '../../utils/practice-scope.mjs'
import verifyStudent from '../votos/verificar.post'
export default defineEventHandler(event=>withPracticeDatabase(()=>verifyStudent(event)))
