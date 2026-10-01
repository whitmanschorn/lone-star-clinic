import { Anchor, Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import type { Patient } from '../../api/types'
import { formatDate, formatDateTime } from '../../lib/format'

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

/** Contact and medical details from the patient record. */
export function PatientOverview({ patient }: { patient: Patient }) {
  return (
    <Stack gap="md">
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
              <span style={{ whiteSpace: 'pre-line' }}>{address(patient) ?? '—'}</span>
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
            <Field label="Medications">
              <BadgeList items={patient.medications} color="violet" empty="None recorded" />
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
