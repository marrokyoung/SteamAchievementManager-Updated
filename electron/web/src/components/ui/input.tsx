import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-[0_10px_35px_rgba(0,0,0,0.35)] ring-offset-background transition-all',
          'backdrop-blur-sm focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-[rgba(140,97,255,0.65)] focus-visible:ring-offset-0',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
