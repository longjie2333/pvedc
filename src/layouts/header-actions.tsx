import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

export const HeaderSlot = createContext<HTMLElement | null>(null);

/** Page-level actions rendered at the right of the admin header; labels collapse to icons on small screens. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  return slot ? createPortal(children, slot) : null;
}

export function HeaderButton({
  icon,
  label,
  ...props
}: ComponentProps<typeof Button> & { icon: ReactNode; label: string }) {
  return (
    <Button {...props} className="max-sm:size-9 max-sm:px-0">
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}
