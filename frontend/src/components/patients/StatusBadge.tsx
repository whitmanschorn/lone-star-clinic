import { Badge, type BadgeProps } from '@mantine/core'
import type { PatientStatus } from '../../api/types'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/format'

interface StatusBadgeProps extends BadgeProps {
  status: PatientStatus
}

export function StatusBadge({ status, ...badgeProps }: StatusBadgeProps) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light" {...badgeProps}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
