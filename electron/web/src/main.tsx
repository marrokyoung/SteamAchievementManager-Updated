import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { validateElectronRuntime } from '@/lib/electronBridge'
import { FatalRuntimeScreen } from '@/components/FatalRuntimeScreen'
import App from './App'
import './index.css'

const runtime = validateElectronRuntime()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark">
      {runtime.ok ? (
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      ) : (
        <FatalRuntimeScreen runtime={runtime} />
      )}
    </ThemeProvider>
  </React.StrictMode>
)
