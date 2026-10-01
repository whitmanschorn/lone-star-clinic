import { Anchor, Button, Group, Skeleton, Stack, Tabs, Text, Title } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePatient, usePatientNotes } from '../api/hooks'
import type { Patient } from '../api/types'
import { ErrorState } from '../components/ErrorState'
import { NotesPanel } from '../components/notes/NotesPanel'
import { PatientOverview } from '../components/patients/PatientOverview'
import { StatusBadge } from '../components/patients/StatusBadge'
import { SummaryPanel } from '../components/patients/SummaryPanel'
import { isNotFound } from '../lib/errors'
import { formatDate, fullName } from '../lib/format'

const TABS = ['overview', 'notes', 'summary'] as const
type TabName = (typeof TABS)[number]

function isTabName(value: string | null): value is TabName {
  return (TABS as readonly string[]).includes(value ?? '')
}

function BackLink() {
  return (
    <Anchor component={Link} to="/patients" size="sm">
      <Group gap={4} component="span">
        <IconArrowLeft size={14} aria-hidden />
        Back to patients
      </Group>
    </Anchor>
  )
}

function PatientTabs({ patient }: { patient: Patient }) {
  // The open tab lives in the URL (?tab=notes) so it can be linked to and
  // survives a reload.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab: TabName = isTabName(requested) ? requested : 'overview'
  const { data: notes } = usePatientNotes(patient.id)

  return (
    <Tabs
      value={tab}
      onChange={(next) =>
        setSearchParams(next && next !== 'overview' ? { tab: next } : {}, { replace: true })
      }
      // Only the open tab is mounted, so the summary is fetched when asked for.
      keepMounted={false}
    >
      <Tabs.List>
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="notes">Notes{notes ? ` (${notes.length})` : ''}</Tabs.Tab>
        <Tabs.Tab value="summary">Summary</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="overview" pt="md">
        <PatientOverview patient={patient} />
      </Tabs.Panel>
      <Tabs.Panel value="notes" pt="md">
        <NotesPanel patient={patient} />
      </Tabs.Panel>
      <Tabs.Panel value="summary" pt="md">
        <SummaryPanel patientId={patient.id} />
      </Tabs.Panel>
    </Tabs>
  )
}

export function PatientDetailPage() {
  const { patientId } = useParams()
  const { data: patient, error, isLoading, mutate } = usePatient(patientId)

  if (error && isNotFound(error)) {
    return (
      <Stack align="flex-start">
        <Title order={2}>Patient not found</Title>
        <Text c="dimmed">There is no patient with this id. They may have been removed.</Text>
        <Button component={Link} to="/patients" variant="light">
          Back to patients
        </Button>
      </Stack>
    )
  }

  if (error && !patient) {
    return (
      <Stack>
        <BackLink />
        <ErrorState
          title="Could not load this patient"
          error={error}
          onRetry={() => void mutate()}
        />
      </Stack>
    )
  }

  if (isLoading || !patient) {
    return (
      <Stack aria-busy="true" aria-label="Loading patient">
        <Skeleton height={20} width={120} />
        <Skeleton height={40} width="50%" />
        <Skeleton height={180} />
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <BackLink />
      <div>
        <Group gap="sm" align="center">
          <Title order={2}>{fullName(patient)}</Title>
          <StatusBadge status={patient.status} size="lg" />
        </Group>
        <Text c="dimmed">
          {patient.age} years old · Born {formatDate(patient.date_of_birth)}
        </Text>
      </div>
      <PatientTabs patient={patient} />
    </Stack>
  )
}
