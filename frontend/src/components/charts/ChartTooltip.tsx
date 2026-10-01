import { Text, Tooltip } from '@mantine/core'
import type { ReactElement } from 'react'

interface ChartTooltipProps {
  /** The number, which is what the reader came for. */
  value: string
  /** What the number describes. */
  label: string
  children: ReactElement
}

/**
 * The hover and keyboard-focus readout for one chart mark. The value leads
 * and the label follows.
 */
export function ChartTooltip({ value, label, children }: ChartTooltipProps) {
  return (
    <Tooltip
      withArrow
      events={{ hover: true, focus: true, touch: true }}
      label={
        <>
          <Text fw={700} size="sm">
            {value}
          </Text>
          <Text size="xs">{label}</Text>
        </>
      }
    >
      {children}
    </Tooltip>
  )
}
