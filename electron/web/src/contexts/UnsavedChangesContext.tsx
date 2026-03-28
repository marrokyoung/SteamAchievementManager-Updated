import { createContext, useContext, useState, type ReactNode } from 'react'

interface NavigationContextValue {
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (v: boolean) => void
  isNavigatingBack: boolean
  setIsNavigatingBack: (v: boolean) => void
}

const NavigationContext = createContext<NavigationContextValue>({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  isNavigatingBack: false,
  setIsNavigatingBack: () => {}
})

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)

  return (
    <NavigationContext.Provider value={{ hasUnsavedChanges, setHasUnsavedChanges, isNavigatingBack, setIsNavigatingBack }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useUnsavedChanges() {
  return useContext(NavigationContext)
}
