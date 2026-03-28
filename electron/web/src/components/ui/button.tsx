import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 shadow-[0_8px_26px_rgba(0,0,0,0.35)] hover:-translate-y-[1px] active:translate-y-0 backdrop-blur-sm',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-[var(--btn-primary-from)] via-[var(--btn-primary-via)] to-[var(--btn-primary-to)] text-primary-foreground hover:shadow-[var(--accent-hover-shadow)]',
        destructive: 'bg-red-600 text-white hover:bg-red-700 hover:shadow-[0_12px_32px_rgba(248,113,113,0.35)]',
        outline: 'border border-white/20 bg-white/5 text-foreground hover:bg-white/10',
        secondary: 'border border-white/10 bg-secondary/70 text-secondary-foreground hover:bg-secondary/90',
        ghost: 'text-foreground hover:bg-white/10',
        link: 'text-primary underline-offset-4 hover:underline shadow-none',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
