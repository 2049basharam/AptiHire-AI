type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  message: string;
  meta?: Record<string, unknown>;
}

// Simple helper to redact sensitive fields
function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['password', 'passwordHash', 'password_hash', 'secret', 'token', 'jwt', 'jwt_secret', 'apiKey'];
  const cloned = JSON.parse(JSON.stringify(obj));
  
  const walk = (current: Record<string, unknown>) => {
    for (const key in current) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        current[key] = '[REDACTED]';
      } else if (current[key] && typeof current[key] === 'object') {
        walk(current[key] as Record<string, unknown>);
      }
    }
  };
  
  walk(cloned);
  return cloned;
}

function writeLog(level: LogLevel, message: string, requestId?: string, meta?: Record<string, unknown>) {
  const payload: LogPayload = {
    timestamp: new Date().toISOString(),
    level,
    requestId,
    message,
  };

  if (meta) {
    payload.meta = redact(meta) as Record<string, unknown>;
  }

  // Format log as structured JSON in production for observability ingestion,
  // or a readable colorized string in local development.
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(payload));
  } else {
    const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : level === 'debug' ? '\x1b[36m' : '\x1b[32m';
    const reqTag = requestId ? ` [Req: ${requestId}]` : '';
    console.log(`${payload.timestamp} [${color}${level.toUpperCase()}\x1b[0m]${reqTag}: ${message}`, meta ? redact(meta) : '');
  }
}

export const logger = {
  info: (message: string, requestId?: string, meta?: Record<string, unknown>) => writeLog('info', message, requestId, meta),
  warn: (message: string, requestId?: string, meta?: Record<string, unknown>) => writeLog('warn', message, requestId, meta),
  error: (message: string, requestId?: string, meta?: Record<string, unknown>) => writeLog('error', message, requestId, meta),
  debug: (message: string, requestId?: string, meta?: Record<string, unknown>) => writeLog('debug', message, requestId, meta),
};
