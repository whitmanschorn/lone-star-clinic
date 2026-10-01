import { Anchor, Button, Group, Skeleton, Stack, Tabs, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconPencil, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useSWRConfig } from 'swr'
import { revalidateAllPatients, usePatient, usePatientNotes } from '../api/hooks'
import { deletePatient } from '../api/mutations'
import type { Patient } from '../api/types'
import { ConfirmModal } from '../components/ConfirmModal'
import { ErrorState } from '../components/ErrorState'
import { RefreshIndicator } from '../components/RefreshIndicator'
import { usePatientModals } from '../lib/usePatientModals'
import { NotesPanel } from '../components/notes/NotesPanel'
import { PatientOverview } from '../components/patients/PatientOverview'
import { StatusBadge } from '../components/patients/StatusBadge'
import { SummaryPanel } from '../components/patients/SummaryPanel'
import { describeError, isNotFound } from '../lib/errors'
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
  const navigate = useNavigate()
  const { mutate: mutateCache } = useSWRConfig()
  const { data: patient, error, isLoading, isValidating, mutate } = usePatient(patientId)
  const { openEdit } = usePatientModals()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const removePatient = async (doomed: Patient) => {
    setDeleting(true)
    try {
      await deletePatient(doomed.id)
      notifications.show({ message: `${fullName(doomed)} was deleted`, color: 'teal' })
      // Leave first, so this page does not refetch a patient that is gone.
      await navigate('/patients')
      void revalidateAllPatients(mutateCache)
    } catch (error) {
      setConfirmingDelete(false)
      notifications.show({
        title: 'The patient was not deleted',
        message: describeError(error),
        color: 'red',
      })
    } finally {
      setDeleting(false)
    }
  }

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
      <Group justify="space-between" align="flex-start" gap="sm">
        <div>
          <Group gap="sm" align="center">
            <Title order={2}>{fullName(patient)}</Title>
            <StatusBadge status={patient.status} size="lg" />
            <RefreshIndicator active={isValidating} />
          </Group>
          <Text c="dimmed">
            {patient.age} years old · Born {formatDate(patient.date_of_birth)}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconPencil size={16} />}
            onClick={() => openEdit(patient)}
          >
            Edit
          </Button>
          <Button
            variant="default"
            c="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        </Group>
      </Group>
      <PatientTabs patient={patient} />

      <ConfirmModal
        opened={confirmingDelete}
        title={`Delete ${fullName(patient)}?`}
        confirmLabel="Delete patient"
        busy={deleting}
        onConfirm={() => void removePatient(patient)}
        onClose={() => setConfirmingDelete(false)}
      >
        <Text size="sm">
          This removes the patient record and all of their notes for good. It cannot be undone.
        </Text>
      </ConfirmModal>
    </Stack>
  )
}
