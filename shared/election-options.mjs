export const blankVoteEnabled = value => /^(si|sí|yes|true|1|on)$/i.test(String(value ?? 'si').trim())
