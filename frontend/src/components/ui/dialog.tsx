"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { finePointer } from "@/lib/pointer"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  // on a phone the sheet follows a finger dragging its handle down, and closes past 80 px
  const sheet = React.useRef<HTMLDivElement>(null)
  const close = React.useRef<HTMLButtonElement>(null)
  const drag = React.useRef<number | null>(null)
  const release = (dy: number) => {
    const el = sheet.current
    drag.current = null
    if (!el) return
    el.style.transition = "transform 0.22s var(--ease-soft)"
    if (dy > 80) close.current?.click()
    else el.style.transform = ""
  }
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={sheet}
        data-slot="dialog-content"
        className={cn(
          // a sheet that rises from the bottom on a phone, a centred dialog from sm up
          "fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[calc(100dvh-2.5rem)] w-full gap-4 overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-popover px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm text-popover-foreground shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:slide-in-from-bottom data-open:duration-300 data-open:ease-(--ease-soft) data-closed:animate-out data-closed:slide-out-to-bottom data-closed:duration-200",
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:mx-0 sm:max-h-[calc(100dvh-4rem)] sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-4 sm:shadow-none sm:data-open:slide-in-from-bottom-0 sm:data-open:fade-in-0 sm:data-open:zoom-in-95 sm:data-open:duration-100 sm:data-closed:slide-out-to-bottom-0 sm:data-closed:fade-out-0 sm:data-closed:zoom-out-95 sm:data-closed:duration-100",
          className
        )}
        {...props}
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e)
          if (e.defaultPrevented || finePointer()) return
          // on touch, focusing the first field would open the keyboard before the person chose to type
          e.preventDefault()
          sheet.current?.focus({ preventScroll: true })
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-16 top-0 z-10 flex h-8 cursor-grab touch-none justify-center pt-2.5 sm:hidden"
          onPointerDown={(e) => {
            drag.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
            if (sheet.current) sheet.current.style.transition = "none"
          }}
          onPointerMove={(e) => {
            if (drag.current === null || !sheet.current) return
            sheet.current.style.transform = `translateY(${Math.max(0, e.clientY - drag.current)}px)`
          }}
          onPointerUp={(e) => drag.current !== null && release(e.clientY - drag.current)}
          onPointerCancel={() => release(0)}
        >
          <span className="h-1.5 w-10 rounded-full bg-foreground/15" />
        </span>
        <DialogPrimitive.Close ref={close} className="hidden" tabIndex={-1} aria-hidden />
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3 sm:top-2 sm:right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Tutup</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "mt-1 flex flex-col-reverse gap-2 *:min-h-12 *:w-full sm:-mx-4 sm:-mb-4 sm:mt-0 sm:flex-row sm:justify-end sm:rounded-b-xl sm:border-t sm:bg-muted/50 sm:p-4 sm:*:min-h-0 sm:*:w-auto",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
