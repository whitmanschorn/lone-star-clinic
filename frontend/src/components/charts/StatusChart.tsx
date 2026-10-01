import { Box, Group, Stack, Text } from '@mantine/core'
import { IconActivityHeartbeat, IconMoon, IconUrgent, type Icon } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { PatientStats, PatientStatus } from '../../api/types'
import { percent, STATUS_LABELS } from '../../lib/format'
import { ChartCard } from './ChartCard'
import { ChartTooltip } from './ChartTooltip'
import classes from './charts.module.css'

// Most urgent first. A status always travels with its icon and label, so its
// meaning never rests on colour alone.
const SEGMENTS: { status: PatientStatus; color: string; icon: Icon }[] = [
  { status: 'critical', color: 'var(--chart-status-critical)', icon: IconUrgent },
  { status: 'active', color: 'var(--chart-status-active)', icon: IconActivityHeartbeat },
  { status: 'inactive', color: 'var(--chart-status-inactive)', icon: IconMoon },
]

const BAR_HEIGHT = 20

/**
 * Patients by status as one stacked bar: three parts of a whole. The legend
 * below it is always shown and doubles as the direct labels.
 */
export function StatusChart({ stats }: { stats: PatientStats }) {
  const segments = SEGMENTS.map((segment) => ({
    ...segment,
    label: STATUS_LABELS[segment.status],
    count: stats.by_status[segment.status],
  }))
  const drawn = segments.filter((segment) => segment.count > 0)

  return (
    <ChartCard
      title="Patients by status"
      description="Share of all patients in each status"
      table={{
        columns: ['Status', 'Patients', 'Share'],
        rows: segments.map(({ label, count }) => [label, count, percent(count, stats.total)]),
      }}
    >
      <Stack gap="sm">
        {/* The 2px gap between segments is what separates them; no borders. */}
        <Group gap={2} wrap="nowrap" role="list" aria-label="Patients by status">
          {drawn.map(({ status, label, color, count }, index) => (
            // Width in proportion to the count, with a floor so a small share
            // is still a visible, clickable segment.
            <Box key={status} role="listitem" style={{ flex: `${count} 1 0`, minWidth: 8 }}>
              <ChartTooltip
                value={`${count} ${count === 1 ? 'patient' : 'patients'}`}
                label={`${label} · ${percent(count, stats.total)} of all patients`}
              >
                <Link
                  to={`/patients?status=${status}`}
                  className={classes.hit}
                  aria-label={`${label}: ${count} patients, ${percent(count, stats.total)}. View in patient list`}
                >
                  <Box
                    className={classes.mark}
                    data-chart-mark
                    h={BAR_HEIGHT}
                    bg={color}
                    // Square at the start, rounded where the whole bar ends.
                    style={{ borderRadius: index === drawn.length - 1 ? '0 4px 4px 0' : 0 }}
                  />
                </Link>
              </ChartTooltip>
            </Box>
          ))}
          {drawn.length === 0 && <Box h={BAR_HEIGHT} className={classes.baseline} flex={1} />}
        </Group>

        <Group gap="lg" role="list" aria-label="Legend">
          {segments.map(({ status, label, color, icon: StatusIcon, count }) => (
            <Group key={status} gap={6} wrap="nowrap" role="listitem">
              <Box
                w={12}
                h={12}
                bg={color}
                style={{ borderRadius: 2, flexShrink: 0 }}
                aria-hidden
              />
              <StatusIcon size={16} aria-hidden />
              <Text size="sm">{label}</Text>
              <Text size="sm" fw={700}>
                {count}
              </Text>
              <Text size="sm" c="dimmed">
                {percent(count, stats.total)}
              </Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </ChartCard>
  )
}
