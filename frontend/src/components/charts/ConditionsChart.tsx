import { Box, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'
import type { PatientStats } from '../../api/types'
import { percent } from '../../lib/format'
import { ChartCard } from './ChartCard'
import { ChartTooltip } from './ChartTooltip'
import classes from './charts.module.css'

const BAR_HEIGHT = 14
// Room kept clear at the end of the track for the value at the bar's tip.
const VALUE_WIDTH = '2.5rem'

/**
 * The most common conditions, as horizontal bars: long names read better this
 * way. Conditions have no natural order, so every bar is the same colour and
 * length alone carries the count.
 */
export function ConditionsChart({ stats }: { stats: PatientStats }) {
  const conditions = stats.top_conditions
  const longest = Math.max(1, ...conditions.map((condition) => condition.count))

  return (
    <ChartCard
      title="Most common conditions"
      description="Number of patients with each condition"
      table={{
        columns: ['Condition', 'Patients', 'Share'],
        rows: conditions.map(({ name, count }) => [name, count, percent(count, stats.total)]),
      }}
    >
      {conditions.length === 0 ? (
        <Text c="dimmed">No conditions have been recorded yet.</Text>
      ) : (
        <Stack gap={6} role="list" aria-label="Most common conditions">
          {conditions.map(({ name, count }) => {
            const patients = `${count} ${count === 1 ? 'patient' : 'patients'}`
            return (
              <Box key={name} role="listitem">
                <ChartTooltip
                  value={patients}
                  label={`${name} · ${percent(count, stats.total)} of all patients`}
                >
                  <Link
                    to={`/patients?${new URLSearchParams({ condition: name }).toString()}`}
                    className={classes.hit}
                    aria-label={`${name}: ${patients}. View in patient list`}
                  >
                    <Box
                      py={3}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 48%) 1fr',
                        alignItems: 'center',
                        columnGap: 8,
                      }}
                    >
                      <Text size="sm" truncate title={name}>
                        {name}
                      </Text>
                      <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Box
                          className={classes.mark}
                          data-chart-mark
                          h={BAR_HEIGHT}
                          bg="var(--chart-series)"
                          // Square at the baseline, rounded at the data end.
                          style={{
                            width: `calc((100% - ${VALUE_WIDTH}) * ${count / longest})`,
                            borderRadius: '0 4px 4px 0',
                          }}
                        />
                        <Text size="sm" fw={600}>
                          {count}
                        </Text>
                      </Box>
                    </Box>
                  </Link>
                </ChartTooltip>
              </Box>
            )
          })}
        </Stack>
      )}
    </ChartCard>
  )
}
