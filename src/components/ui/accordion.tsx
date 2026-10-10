"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Accordion({ className, ...props }: AccordionPrimitive.Root.Props): React.ReactElement {
  return <AccordionPrimitive.Root className={cn("flex w-full flex-col", className)} data-slot="accordion" {...props} />;
}

export function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props): React.ReactElement {
  return <AccordionPrimitive.Item className={cn("border-b last:border-b-0", className)} data-slot="accordion-item" {...props} />;
}

export function AccordionHeader({ className, ...props }: AccordionPrimitive.Header.Props): React.ReactElement {
  return <AccordionPrimitive.Header className={cn("flex", className)} data-slot="accordion-header" {...props} />;
}

export function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props): React.ReactElement {
  return <AccordionPrimitive.Trigger className={cn("flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring", className)} data-slot="accordion-trigger" {...props}>{children}<ChevronDown className="size-4 shrink-0 transition-transform duration-200 data-panel-open:rotate-180" /></AccordionPrimitive.Trigger>;
}

export function AccordionPanel({ className, ...props }: AccordionPrimitive.Panel.Props): React.ReactElement {
  return <AccordionPrimitive.Panel className={cn("overflow-hidden pb-4 text-sm leading-7 text-muted-foreground", className)} data-slot="accordion-panel" {...props} />;
}

export { AccordionPrimitive };
