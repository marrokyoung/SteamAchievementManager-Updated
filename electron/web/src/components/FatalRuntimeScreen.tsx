import type { RuntimeCheck } from '@/lib/electronBridge'

export function FatalRuntimeScreen({ runtime }: { runtime: RuntimeCheck & { ok: false } }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8 shadow-lg">
        {runtime.reason === 'invalid_bridge' ? (
          <>
            <h1 className="text-xl font-semibold">Bridge contract mismatch</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The Electron preload bridge is missing required methods. This usually means the
              application was not installed correctly or the install is corrupted. Try
              reinstalling Steam Achievement Manager.
            </p>
            {runtime.missingMethods && (
              <p className="mt-4 rounded-lg bg-muted px-4 py-3 font-mono text-xs text-muted-foreground">
                Missing: {runtime.missingMethods.join(', ')}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Desktop app required</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Steam Achievement Manager must be launched from the Windows Electron desktop app.
              Browser-hosted and PWA runtimes are unsupported.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
