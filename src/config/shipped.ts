import shipped from '../../config/hiring.config.json' with { type: 'json' }
import type { HiringConfig } from './types.ts'

export const SHIPPED = shipped as HiringConfig