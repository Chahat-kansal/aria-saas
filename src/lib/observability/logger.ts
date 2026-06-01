type LogLevel = 'debug' | 'info' | 'warn' | 'error'
interface LogContext { businessId?: string; userId?: string; route?: string; [k: string]: unknown }

function log(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...context }
  // Structured JSON — Vercel log drains + Sentry can parse this
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (m: string, c?: LogContext) => log('debug', m, c),
  info:  (m: string, c?: LogContext) => log('info',  m, c),
  warn:  (m: string, c?: LogContext) => log('warn',  m, c),
  error: (m: string, c?: LogContext) => log('error', m, c),
}
