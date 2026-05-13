"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { cn } from "@/lib/utils"
// Sprint 19.7.5.1 — buttonVariants now lives in a non-client file so
// Server Components can call it. The cva() function itself moved; this
// module still re-exports it so existing client-side imports keep
// working unchanged.
import { buttonVariants, type ButtonVariantProps } from "./button-variants"

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & ButtonVariantProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
