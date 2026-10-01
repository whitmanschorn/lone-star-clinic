import { Anchor, Card, Group, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { usePatients, usePatientStats } from '../api/hooks'
import type { PatientListParams, PatientStatus } from '../api/types'
import { ErrorState } from '../components/ErrorState'
import { StatusBadge } from '../components/patients/StatusBadge'
import { formatDate, fullName } from '../lib/format'
import { useAppDispatch } from '../store/hooks'
import { statusChanged } from '../store/patientListSlice'

interface StatCardProps {
  label: string
  value: number | undefined
  /** When set, the card links to the patient list filtered to this status. */
  filter?: PatientStatus | null
  color?: string
}

function StatCard({ label, value, filter, color }: StatCardProps) {
  const dispatch = useAppDispatch()
  const content = (
    <>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      {value === undefined ? (
        <Skeleton height={34} width={60} mt={6} />
      ) : (
        <Text fz={32} fw={700} lh={1.2} c={color}>
          {value}
        </Text>
      )}
    </>
  )

  if (filter === undefined) {
    return <Card withBorder>{content}</Card>
  }
  return (
    <Card
      withBorder
      component={Link}
      to="/patients"
      onClick={() => dispatch(statusChanged(filter))}
      aria-label={`${label}: ${value ?? 'loading'}. View in patient list`}
    >
      {content}
    </Card>
  )
}

interface PatientPanelProps {
  title: string
  params: PatientListParams
  empty: string
  /** Show each patient's conditions on a second line instead of a status badge. */
  showConditions?: boolean
}

function PatientPanel({ title, params, empty, showConditions = false }: PatientPanelProps) {
  const { data, error, mutate } = usePatients(params)

  let body: ReactNode
  if (error && !data) {
    body = (
      <ErrorState
        title={`Could not load ${title.toLowerCase()}`}
        error={error}
        onRetry={() => void mutate()}
      />
    )
  } else if (!data) {
    body = (
      <Stack gap="xs">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} height={28} />
        ))}
      </Stack>
    )
  } else if (data.items.length === 0) {
    body = <Text c="dimmed">{empty}</Text>
  } else {
    body = (
      <Stack gap="xs" component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
        {data.items.map((patient) => (
          <li key={patient.id}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Anchor component={Link} to={`/patients/${patient.id}`} fw={500} truncate>
                  {fullName(patient)}
                </Anchor>
                {!showConditions && (
                  <StatusBadge status={patient.status} size="sm" style={{ flexShrink: 0 }} />
                )}
              </Group>
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {formatDate(patient.last_visit, 'Never')}
              </Text>
            </Group>
            {showConditions && (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {patient.conditions.join(', ') || 'No conditions recorded'}
              </Text>
            )}
          </li>
        ))}
      </Stack>
    )
  }

  return (
    <Card withBorder component="section" aria-label={title}>
      <Title order={3} size="h4" mb="sm">
        {title}
      </Title>
      {body}
    </Card>
  )
}

const RECENT_VISITS: PatientListParams = { sort: 'last_visit', order: 'desc', page_size: 6 }
const CRITICAL: PatientListParams = {
  status: 'critical',
  sort: 'last_visit',
  order: 'desc',
  page_size: 6,
}

export function DashboardPage() {
  const { data: stats, error, mutate } = usePatientStats()

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed">Howdy. Here is how the practice looks today.</Text>
      </div>

      {error && !stats ? (
        <ErrorState
          title="Could not load the numbers"
          error={error}
          onRetry={() => void mutate()}
        />
      ) : (
        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <StatCard label="Total patients" value={stats?.total} filter={null} />
          <StatCard
            label="Critical"
            value={stats?.by_status.critical}
            filter="critical"
            color="red"
          />
          <StatCard label="Active" value={stats?.by_status.active} filter="active" />
          <StatCard label="Seen in the last 30 days" value={stats?.seen_last_30_days} />
        </SimpleGrid>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <PatientPanel
          title="Needs attention"
          params={CRITICAL}
          empty="No critical patients right now."
          showConditions
        />
        <PatientPanel
          title="Recent visits"
          params={RECENT_VISITS}
          empty="No visits recorded yet."
        />
      </SimpleGrid>
    </Stack>
  )
}
