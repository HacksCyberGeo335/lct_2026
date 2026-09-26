import { useRef, type RefObject, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { appearance, transition } from './motion';
import { statusNames, type Status } from '../domain/models';
import { UnsupportedError } from '../api/source';

export function StatusStamp({ status, text }: { status: Status; text?: string }) {
  return <span className={'stamp ' + status}>{text ?? statusNames[status]}</span>;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol" aria-hidden="true">
        —
      </span>
      <h2 className="h-sec">{title}</h2>
      {children && <p className="sub">{children}</p>}
      {action}
    </div>
  );
}
export function QueryState({
  pending,
  error,
  retry,
}: {
  pending?: boolean;
  error?: Error | null;
  retry?: () => void;
}) {
  if (pending)
    return (
      <div className="query-state" role="status">
        Загружаем данные…
      </div>
    );
  if (!error) return null;
  return (
    <div className="query-state" role="alert">
      <h2 className="h-sec">
        {error instanceof UnsupportedError ? 'Раздел пока недоступен в API' : 'Не удалось получить данные'}
      </h2>
      <p>{error.message}</p>
      {retry && !(error instanceof UnsupportedError) && (
        <button className="btn btn-quiet" onClick={retry}>
          Повторить
        </button>
      )}
    </div>
  );
}
export function Modal({
  open,
  returnFocusRef,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <ModalPanel
          returnFocusRef={returnFocusRef}
          key="dialog"
          onClose={onClose}
          title={title}
          description={description}
        >
          {children}
        </ModalPanel>
      )}
    </AnimatePresence>
  );
}
function ModalPanel({
  onClose,
  title,
  description,
  children,
  returnFocusRef,
}: Omit<Parameters<typeof Modal>[0], 'open'>) {
  const reduce = useReducedMotion(),
    present = useIsPresent(),
    returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal forceMount>
        <Dialog.Overlay asChild forceMount>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition(reduce, true)}
          />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          forceMount
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocusRef?.current ?? returnFocus.current;
            if (target?.isConnected && target !== document.body && !target.closest('[inert]')) {
              target.focus();
              if (document.activeElement === target) return;
            }
            document.querySelector<HTMLElement>('#main')?.focus();
          }}
        >
          <motion.div
            className="modal-panel"
            {...appearance(reduce)}
            inert={!present}
            style={{ pointerEvents: present ? 'auto' : 'none' }}
          >
            <div className="modal-heading">
              <Dialog.Title className="h-sec">{title}</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Закрыть диалог">
                ×
              </Dialog.Close>
            </div>
            <Dialog.Description className="sub">{description}</Dialog.Description>
            {children}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="legend-line plan" />
        План
      </span>
      <span>
        <i className="legend-line fact" />
        Наблюдённый факт
      </span>
      <span>
        <i className="legend-line warn" />
        Отставание
      </span>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div {...appearance(reduce)} className="notice" role="status">
      {children}
    </motion.div>
  );
}
