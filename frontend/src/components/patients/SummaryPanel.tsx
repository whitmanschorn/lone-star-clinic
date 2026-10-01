import { Badge, Button, Card, CopyButton, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import { IconCheck, IconCopy, IconRefresh } from '@tabler/icons-react'
import { usePatientSummary } from '../../api/hooks'
import { formatDateTime } from '../../lib/format'
import { ErrorState } from '../ErrorState'
import { StatusBadge } from './StatusBadge'

function BadgeRow({
  label,
  items,
  color,
  empty,
}: {
  label: string
  items: string[]
  color: string
  empty: string
}) {
  return (
    <Group gap={6} align="center">
      <Text size="sm" fw={600}>
        {label}:
      </Text>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          {empty}
        </Text>
      ) : (
        items.map((item) => (
          <Badge key={item} color={color} variant="light" tt="none" fw={500}>
            {item}
          </Badge>
        ))
      )}
    </Group>
  )
}

/** The generated summary from GET /patients/{id}/summary. */
export function SummaryPanel({ patientId }: { patientId: string }) {
  const { data: summary, error, isValidating, mutate } = usePatientSummary(patientId)

  if (error && !summary) {
    return (
      <ErrorState title="Could not load the summary" error={error} onRetry={() => void mutate()} />
    )
  }
  if (!summary) {
    return (
      <Stack aria-busy="true" aria-label="Loading summary">
        <Skeleton height={24} width="60%" />
        <Skeleton height={120} />
      </Stack>
    )
  }

  return (
    <Card withBorder component="section" aria-label="Summary">
      <Stack gap="sm">
        <Group gap="xs" align="center">
          <Title order={3} size="h4">
            {summary.name}
          </Title>
          <StatusBadge status={summary.status} />
        </Group>
        <Text>
          {summary.age} years old · Blood type {summary.blood_type ?? 'unknown'}
        </Text>
        <BadgeRow
          label="Conditions"
          items={summary.conditions}
          color="blue"
          empty="none recorded"
        />
        <BadgeRow
          label="Medications"
          items={summary.medications}
          color="violet"
          empty="none recorded"
        />
        <BadgeRow label="Allergies" items={summary.allergies} color="orange" empty="none known" />

        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            From the notes
          </Text>
          <Text style={{ overflowWrap: 'anywhere' }}>{summary.narrative}</Text>
        </div>

        <Group justify="space-between" gap="sm">
          <Text size="xs" c="dimmed">
            Generated {formatDateTime(summary.generated_at)} from {summary.note_count}{' '}
            {summary.note_count === 1 ? 'note' : 'notes'}
          </Text>
          <Group gap="xs">
            <CopyButton value={summary.summary}>
              {({ copied, copy }) => (
                <Button
                  size="xs"
                  variant="default"
                  onClick={copy}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                >
                  {copied ? 'Copied' : 'Copy as text'}
                </Button>
              )}
            </CopyButton>
            <Button
              size="xs"
              variant="default"
              loading={isValidating}
              onClick={() => void mutate()}
              leftSection={<IconRefresh size={14} />}
            >
              Regenerate
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  )
}
