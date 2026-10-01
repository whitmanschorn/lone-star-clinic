import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { usePatient } from '../api/hooks'
import type { Patient } from '../api/types'
import { ErrorState } from '../components/ErrorState'
import { StatusBadge } from '../components/patients/StatusBadge'
import { isNotFound } from '../lib/errors'
import { formatDate, formatDateTime, fullName } from '../lib/format'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Text component="div">{children}</Text>
    </div>
  )
}

function BadgeList({ items, color, empty }: { items: string[]; color: string; empty: string }) {
  if (items.length === 0) {
    return <Text c="dimmed">{empty}</Text>
  }
  return (
    <Group gap={6} mt={4}>
      {items.map((item) => (
        <Badge key={item} color={color} variant="light" size="lg" tt="none" fw={500}>
          {item}
        </Badge>
      ))}
    </Group>
  )
}

function address(patient: Patient): string | null {
  const cityLine = [patient.city, [patient.state, patient.postal_code].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  return [patient.address_line, cityLine].filter(Boolean).join('\n') || null
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

  const postalAddress = address(patient)

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

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder component="section" aria-label="Contact">
          <Stack gap="sm">
            <Title order={3} size="h4">
              Contact
            </Title>
            <Field label="Email">
              {patient.email ? (
                <Anchor href={`mailto:${patient.email}`}>{patient.email}</Anchor>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Phone">
              {patient.phone ? <Anchor href={`tel:${patient.phone}`}>{patient.phone}</Anchor> : '—'}
            </Field>
            <Field label="Address">
              <span style={{ whiteSpace: 'pre-line' }}>{postalAddress ?? '—'}</span>
            </Field>
          </Stack>
        </Card>

        <Card withBorder component="section" aria-label="Medical">
          <Stack gap="sm">
            <Title order={3} size="h4">
              Medical
            </Title>
            <Group gap="xl">
              <Field label="Blood type">{patient.blood_type ?? 'Unknown'}</Field>
              <Field label="Last visit">{formatDate(patient.last_visit, 'Never')}</Field>
            </Group>
            <Field label="Conditions">
              <BadgeList items={patient.conditions} color="blue" empty="None recorded" />
            </Field>
            <Field label="Allergies">
              <BadgeList items={patient.allergies} color="orange" empty="No known allergies" />
            </Field>
          </Stack>
        </Card>
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Record created {formatDateTime(patient.created_at)} · Last updated{' '}
        {formatDateTime(patient.updated_at)}
      </Text>
    </Stack>
  )
}
