import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm, type FormErrors } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { addNote } from '../../api/mutations'
import type { ChartChange, ChartField, Note, Patient } from '../../api/types'
import { CHART_FIELDS, singular } from '../../lib/chart'
import { describeError, fieldErrors } from '../../lib/errors'
import { toDateTimeInputValue } from '../../lib/format'
import { ChartChangeRow, type ChartChangeDraft } from './ChartChangeRow'

const MAX_NOTE_LENGTH = 5000
const MAX_ENTRY_LENGTH = 100

interface NoteFormValues {
  content: string
  timestamp: string
  changes: ChartChangeDraft[]
}

function sameEntry(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Check a note before it is sent. The server applies the same rules again. */
function validate(values: NoteFormValues, patient: Patient): FormErrors {
  const errors: FormErrors = {}

  if (values.content.trim() === '') {
    errors.content = 'Write the note before saving it'
  } else if (values.content.length > MAX_NOTE_LENGTH) {
    errors.content = `Notes can be at most ${MAX_NOTE_LENGTH} characters`
  }

  if (values.timestamp === '' || Number.isNaN(Date.parse(values.timestamp))) {
    errors.timestamp = 'Enter the date and time of the note'
  } else if (new Date(values.timestamp) > new Date()) {
    errors.timestamp = 'A note cannot be dated in the future'
  }

  values.changes.forEach((change, index) => {
    const noun = singular(change.field)
    const existing = patient[change.field]
    const onChart = (entry: string) => existing.some((other) => sameEntry(other, entry))

    if (change.action === 'add') {
      if (change.value.trim() === '') {
        errors[`changes.${index}.value`] = `Enter the ${noun} to add`
      } else if (change.value.trim().length > MAX_ENTRY_LENGTH) {
        errors[`changes.${index}.value`] = `At most ${MAX_ENTRY_LENGTH} characters`
      } else if (onChart(change.value)) {
        errors[`changes.${index}.value`] = 'Already on the chart'
      }
      return
    }

    if (change.value === '') {
      errors[`changes.${index}.value`] =
        existing.length > 0
          ? `Choose the ${noun} to ${change.action}`
          : `There is no ${noun} to ${change.action}`
    } else if (change.action === 'update') {
      const next = change.new_value.trim()
      if (next === '') {
        errors[`changes.${index}.new_value`] = 'Enter the new wording'
      } else if (next.length > MAX_ENTRY_LENGTH) {
        errors[`changes.${index}.new_value`] = `At most ${MAX_ENTRY_LENGTH} characters`
      } else if (next === change.value) {
        errors[`changes.${index}.new_value`] = 'This is the same as the current entry'
      } else if (!sameEntry(next, change.value) && onChart(next)) {
        errors[`changes.${index}.new_value`] = 'Already on the chart'
      }
    }
  })

  return errors
}

function toChartChange(draft: ChartChangeDraft): ChartChange {
  const change: ChartChange = {
    field: draft.field,
    action: draft.action,
    value: draft.value.trim(),
  }
  if (draft.action === 'update') {
    change.new_value = draft.new_value.trim()
  }
  return change
}

interface NoteFormProps {
  patient: Patient
  /** Called after a successful save, with the note as the server stored it. */
  onAdded: (note: Note) => void
  /** Called when the server refuses the note because the chart has moved on. */
  onConflict: () => void
}

export function NoteForm({ patient, onAdded, onConflict }: NoteFormProps) {
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm<NoteFormValues>({
    initialValues: { content: '', timestamp: toDateTimeInputValue(new Date()), changes: [] },
    validate: (values) => validate(values, patient),
  })

  const addChange = (field: ChartField) => {
    form.insertListItem('changes', {
      key: randomId(),
      field,
      action: 'add',
      value: '',
      new_value: '',
    } satisfies ChartChangeDraft)
  }

  const submit = form.onSubmit(async (values) => {
    setSaving(true)
    setFailure(null)
    try {
      const note = await addNote(patient.id, {
        content: values.content,
        // An untouched time field means "now", not "when this page was opened".
        timestamp: (form.isTouched('timestamp')
          ? new Date(values.timestamp)
          : new Date()
        ).toISOString(),
        changes: values.changes.map(toChartChange),
      })
      form.setValues({ content: '', timestamp: toDateTimeInputValue(new Date()), changes: [] })
      form.resetTouched()
      onAdded(note)
    } catch (error) {
      // Show the server's own complaints on the fields they are about;
      // anything else (network, conflict, 5xx) goes above the form. What was
      // typed is kept either way, so nothing is lost.
      const errors = fieldErrors(error)
      if (errors) {
        form.setErrors(errors)
        // Complaints about a whole chart update rather than one of its inputs
        // have no field to sit under, so list them above the form.
        const unplaced = Object.entries(errors)
          .filter(([path]) => !/^(content|timestamp|changes\.\d+\.(value|new_value))$/.test(path))
          .map(([, message]) => message)
        if (unplaced.length > 0) setFailure(unplaced.join(' '))
      } else {
        setFailure(describeError(error))
        if (error instanceof ApiError && error.status === 409) onConflict()
      }
    } finally {
      setSaving(false)
    }
  })

  return (
    <form onSubmit={(event) => void submit(event)} aria-label="Add a note" noValidate>
      <Stack gap="sm">
        {failure && (
          <Alert
            color="red"
            title="The note was not saved"
            withCloseButton
            onClose={() => setFailure(null)}
          >
            {failure}
          </Alert>
        )}
        <Textarea
          label="New note"
          placeholder="What happened at this visit?"
          autosize
          minRows={3}
          maxRows={10}
          {...form.getInputProps('content')}
        />

        <Stack gap="xs" role="group" aria-label="Chart updates">
          {form.values.changes.map((draft, index) => (
            <ChartChangeRow
              key={draft.key}
              position={index + 1}
              draft={draft}
              existing={patient[draft.field]}
              errors={{
                value: form.errors[`changes.${index}.value`] as string | undefined,
                new_value: form.errors[`changes.${index}.new_value`] as string | undefined,
              }}
              onChange={(next) => {
                form.setFieldValue(`changes.${index}`, next)
                form.clearFieldError(`changes.${index}.value`)
                form.clearFieldError(`changes.${index}.new_value`)
              }}
              onDiscard={() => {
                form.removeListItem('changes', index)
                form.clearErrors()
              }}
            />
          ))}
          <Group gap="xs" align="center">
            <Text size="sm" c="dimmed">
              Also update the chart:
            </Text>
            {CHART_FIELDS.map(({ value, label }) => (
              <Button
                key={value}
                variant="default"
                size="compact-sm"
                leftSection={<IconPlus size={14} />}
                onClick={() => addChange(value)}
              >
                {label}
              </Button>
            ))}
          </Group>
        </Stack>

        <Group align="flex-end" justify="space-between" gap="sm">
          <TextInput
            type="datetime-local"
            label="Date and time"
            max={toDateTimeInputValue(new Date())}
            {...form.getInputProps('timestamp')}
          />
          <Button type="submit" loading={saving}>
            Add note
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
