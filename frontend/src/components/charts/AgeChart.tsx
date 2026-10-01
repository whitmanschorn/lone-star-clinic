import { Box, Group, Text } from '@mantine/core'
import { Link } from 'react-router'
import type { PatientStats } from '../../api/types'
import { percent } from '../../lib/format'
import { ChartCard } from './ChartCard'
import { ChartTooltip } from './ChartTooltip'
import classes from './charts.module.css'

const PLOT_HEIGHT = 150
const VALUE_LABEL_HEIGHT = 22
const COLUMN_WIDTH = 24

// Age bands are ordered, so they take one hue stepped by lightness: the order
// can be read from the colour as well as the position.
const RAMP = [1, 2, 3, 4, 5].map((step) => `var(--chart-ramp-${step})`)

/** Patients by age band, as columns. Each column links to those patients in the list. */
export function AgeChart({ stats }: { stats: PatientStats }) {
  const bands = stats.by_age_band
  const tallest = Math.max(1, ...bands.map((band) => band.count))

  return (
    <ChartCard
      title="Patients by age"
      description="Number of patients in each age band"
      table={{
        columns: ['Age', 'Patients', 'Share'],
        rows: bands.map((band) => [band.label, band.count, percent(band.count, stats.total)]),
      }}
    >
      {/* No gap between the bands, so their baselines join into one rule. */}
      <Group gap={0} wrap="nowrap" align="flex-end" role="list" aria-label="Patients by age">
        {bands.map((band, index) => {
          const query =
            band.max_age === null
              ? `min_age=${band.min_age}`
              : `min_age=${band.min_age}&max_age=${band.max_age}`
          const patients = `${band.count} ${band.count === 1 ? 'patient' : 'patients'}`
          return (
            <Box key={band.label} role="listitem" style={{ flex: 1, minWidth: 0 }}>
              <ChartTooltip
                value={patients}
                label={`Aged ${band.label} · ${percent(band.count, stats.total)} of all patients`}
              >
                <Link
                  to={`/patients?${query}`}
                  className={classes.hit}
                  aria-label={`Aged ${band.label}: ${patients}. View in patient list`}
                >
                  {/* The whole band, not just the column, is the hover target. */}
                  <Box
                    h={PLOT_HEIGHT}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    {/* With only five columns, each carries its value on its cap,
                      so no y-axis is needed. */}
                    <Text size="sm" fw={600} h={VALUE_LABEL_HEIGHT} lh={`${VALUE_LABEL_HEIGHT}px`}>
                      {band.count}
                    </Text>
                    <Box
                      className={classes.mark}
                      data-chart-mark
                      w={COLUMN_WIDTH}
                      bg={RAMP[index] ?? RAMP.at(-1)}
                      // Rounded cap, square on the baseline.
                      style={{
                        height: `calc((100% - ${VALUE_LABEL_HEIGHT}px) * ${band.count / tallest})`,
                        borderRadius: '4px 4px 0 0',
                      }}
                    />
                  </Box>
                  <Text size="xs" c="dimmed" ta="center" pt={4} className={classes.baseline}>
                    {band.label}
                  </Text>
                </Link>
              </ChartTooltip>
            </Box>
          )
        })}
      </Group>
    </ChartCard>
  )
}
