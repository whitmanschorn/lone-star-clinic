import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  NativeSelect,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconCheck, IconCopy, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import { fetchPatientSummary, usePatientSummary } from '../../api/hooks'
import type { GeneratorChoice, SummaryGenerator } from '../../api/types'
import { describeError } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { ErrorState } from '../ErrorState'
import { StatusBadge } from './StatusBadge'

const GENERATOR_LABELS: Record<SummaryGenerator, string> = {
  template: 'Standard template',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Claude',
}

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

/**
 * The generated summary from GET /patients/{id}/summary. The narrative may be
 * written by an LLM when the server has one configured; the panel always says
 * who wrote it, and says so plainly when it had to fall back to the template.
 */
export function SummaryPanel({ patientId }: { patientId: string }) {
  // "auto" is the server's default generator until the user picks one.
  const [choice, setChoice] = useState<GeneratorChoice>('auto')
  const { data: summary, error, isValidating, mutate } = usePatientSummary(patientId, choice)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState<string | null>(null)

  if (error && !summary) {
    return (
      <ErrorState title="Could not load the summary" error={error} onRetry={() => void mutate()} />
    )
  }
  if (!summary) {
    return (
      <Stack aria-busy="true" aria-label="Writing the summary">
        <Skeleton height={24} width="60%" />
        <Skeleton height={120} />
      </Stack>
    )
  }

  const writtenByAi = summary.generator !== 'template'
  const canChoose = summary.available_generators.length > 1
  // What the picker shows: the user's choice, or the server's default.
  const selected = choice === 'auto' ? summary.available_generators[0] : choice

  const regenerate = async () => {
    setRegenerating(true)
    setRegenerateError(null)
    try {
      // refresh=true makes an LLM write it again rather than reuse its last answer.
      await mutate(fetchPatientSummary(patientId, choice, true), { revalidate: false })
    } catch (failure) {
      setRegenerateError(describeError(failure))
    } finally {
      setRegenerating(false)
    }
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
          <Group gap="xs" align="center" mb={2}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              From the notes
            </Text>
            {writtenByAi && (
              <Badge
                size="sm"
                variant="light"
                color="grape"
                tt="none"
                leftSection={<IconSparkles size={12} aria-hidden />}
              >
                Written by {GENERATOR_LABELS[summary.generator]}
                {summary.model ? ` (${summary.model})` : ''}
              </Badge>
            )}
          </Group>
          <Text style={{ overflowWrap: 'anywhere' }}>{summary.narrative}</Text>
          {writtenByAi && (
            <Text size="xs" c="dimmed" mt={4}>
              AI-generated from this patient's notes. Check it against the notes before relying on
              it.
            </Text>
          )}
        </div>

        {summary.fallback_reason && (
          <Alert color="yellow" title="AI summary unavailable">
            Showing the standard summary instead: {summary.fallback_reason}.
          </Alert>
        )}
        {regenerateError && (
          <Alert
            color="red"
            title="Could not regenerate the summary"
            withCloseButton
            onClose={() => setRegenerateError(null)}
          >
            {regenerateError}
          </Alert>
        )}

        <Group justify="space-between" align="flex-end" gap="sm">
          <Text size="xs" c="dimmed">
            Generated {formatDateTime(summary.generated_at)} from {summary.note_count}{' '}
            {summary.note_count === 1 ? 'note' : 'notes'}
          </Text>
          <Group gap="xs" align="flex-end">
            {canChoose && (
              <NativeSelect
                aria-label="Summary written by"
                size="xs"
                data={summary.available_generators.map((generator) => ({
                  value: generator,
                  label: GENERATOR_LABELS[generator],
                }))}
                value={selected}
                onChange={(event) => setChoice(event.currentTarget.value as SummaryGenerator)}
              />
            )}
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
              loading={regenerating || isValidating}
              onClick={() => void regenerate()}
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
