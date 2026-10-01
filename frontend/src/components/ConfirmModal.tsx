import { Button, Group, Modal, Stack } from '@mantine/core'
import type { ReactNode } from 'react'

interface ConfirmModalProps {
  opened: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** True while the confirmed action is running. */
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Asks before doing something that cannot be undone. */
export function ConfirmModal({
  opened,
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered closeOnClickOutside={!busy}>
      <Stack>
        {children}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
