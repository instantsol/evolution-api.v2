const notifiedErrors = new Map<string, number>();
const notificationInterval = 5 * 60 * 1000;

export function notifyEvolutionError(value: any, context: string, instance?: string): void {
  try {
    const error = value instanceof Error ? value : value?.error instanceof Error ? value.error : null;
    const status = value?.status ?? value?.data?.status;
    if (typeof status === 'number' && status < 500) return;

    const redact = (text: string) => {
      let result = text
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
        .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
        .replace(
          /(["'](?:api[_-]?key|(?:access[_-]?|refresh[_-]?)?token|password|secret|authorization)["']\s*:\s*)(["'])(.*?)\2/gi,
          '$1"[REDACTED]"',
        )
        .replace(
          /((?:api[_-]?key|(?:access[_-]?|refresh[_-]?)?token|password|secret|authorization)\s*[:=]\s*)[^\s,;}\]"']+/gi,
          '$1[REDACTED]',
        );
      const apiKey = process.env.AUTHENTICATION_API_KEY;
      if (apiKey) result = result.split(apiKey).join('[REDACTED]');
      return result;
    };

    const message = typeof value === 'string' ? value : value?.message || error?.message || value?.data?.message;
    const description = redact(typeof message === 'string' ? message : 'Erro interno registrado pela Evolution API')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 500);
    const operation = context.slice(0, 100);
    const errorInstance = instance || (typeof value?.instanceName === 'string' ? value.instanceName : undefined);
    const instanceName = errorInstance ? String(errorInstance).slice(0, 255) : undefined;
    const key = JSON.stringify([operation, instanceName, description, status]);
    const now = Date.now();
    if ((notifiedErrors.get(key) || 0) > now) return;

    for (const [previousKey, expiresAt] of notifiedErrors) {
      if (expiresAt <= now) notifiedErrors.delete(previousKey);
    }
    if (notifiedErrors.size >= 1000) notifiedErrors.delete(notifiedErrors.keys().next().value);
    notifiedErrors.set(key, now + notificationInterval);

    let serverUrl: string;
    try {
      serverUrl = new URL(process.env.SERVER_URL || '').origin;
    } catch {
      serverUrl = undefined;
    }

    const details = error
      ? redact(`${error.name}\n${error.stack || error.message}`).slice(0, 12000)
      : JSON.stringify({
          durationMs: typeof value?.durationMs === 'number' ? value.durationMs : undefined,
          metadataMs: typeof value?.metadataMs === 'number' ? value.metadataMs : undefined,
          countsMs: typeof value?.countsMs === 'number' ? value.countsMs : undefined,
          instances: typeof value?.instances === 'number' ? value.instances : undefined,
          includeCounts: typeof value?.includeCounts === 'boolean' ? value.includeCounts : undefined,
        });
    const baseUrl = (process.env.IVCI_URL || 'http://ivci:9000').replace(/\/+$/, '');
    fetch(`${baseUrl}/webhook/evolution_error_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createdAt: new Date(now).toISOString(),
        source: 'evolution-api',
        description,
        operation,
        instanceName,
        status: typeof status === 'number' ? status : undefined,
        serverUrl,
        details,
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok) console.warn('[Evolution API] Error email notification was rejected:', response.status);
      })
      .catch(() => console.warn('[Evolution API] Could not forward error email notification'));
  } catch {
    console.warn('[Evolution API] Could not prepare error email notification');
  }
}
