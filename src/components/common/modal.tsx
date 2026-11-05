import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  destructive?: boolean;
}) {
  const Root = destructive ? AlertDialog : Dialog,
    Popup = destructive ? AlertDialogPopup : DialogPopup;
  const Header = destructive ? AlertDialogHeader : DialogHeader,
    Title = destructive ? AlertDialogTitle : DialogTitle;
  const Description = destructive ? AlertDialogDescription : DialogDescription,
    Footer = destructive ? AlertDialogFooter : DialogFooter,
    Close = destructive ? AlertDialogClose : DialogClose;
  return (
    <Root open={open} onOpenChange={v => !v && onClose()}>
      <Popup className="max-w-2xl">
        <Header>
          <Title>{title}</Title>
          <Description>{description}</Description>
        </Header>
        {destructive ? (
          <div className="overflow-y-auto px-6 pb-6">{children}</div>
        ) : (
          <DialogPanel>{children}</DialogPanel>
        )}
        <Footer>
          <Close render={<Button variant="ghost" />}>取消</Close>
          {footer}
        </Footer>
      </Popup>
    </Root>
  );
}
