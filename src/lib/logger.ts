import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  // When connecting Axiom, replace this with pino-axiom transport:
  // transport: { target: 'pino-axiom', options: { ... } }
})

export default logger
