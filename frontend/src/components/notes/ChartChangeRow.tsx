import { CloseButton, Group, NativeSelect, TextInput } from '@mantine/core'
import type { ChartAction, ChartField } from '../../api/types'
import { CHART_ACTIONS, CHART_FIELDS, singular } from '../../lib/chart'

/** One chart update as the form holds it. `new_value` is only used by updates. */
export interface ChartChangeDraft {
  key: string
  field: ChartField
  action: ChartAction
  value: string
  new_value: string
}

interface ChartChangeRowProps {
  /** 1-based position, used to tell rows apart for assistive technology. */
  position: number
  draft: ChartChangeDraft
  /** The patient's current entries for this row's field. */
  existing: string[]
  errors: { value?: string; new_value?: string }
  onChange: (draft: ChartChangeDraft) => void
  onDiscard: () => void
}

/**
 * One row of "also update the chart": add a new entry, or update or remove an
 * existing one, for conditions, medications or allergies.
 */
export function ChartChangeRow({
  position,
  draft,
  existing,
  errors,
  onChange,
  onDiscard,
}: ChartChangeRowProps) {
  const noun = singular(draft.field)

  return (
    <Group
      role="group"
      aria-label={`Chart update ${position}`}
      align="flex-start"
      gap="xs"
      // A tinted panel keeps each update together when its inputs wrap on a phone.
      bg="var(--clinic-panel-bg)"
      p="xs"
      bdrs="sm"
    >
      <NativeSelect
        aria-label="Action"
        data={CHART_ACTIONS}
        value={draft.action}
        // A different action or type means the old entry no longer applies.
        onChange={(event) =>
          onChange({
            ...draft,
            action: event.currentTarget.value as ChartAction,
            value: '',
            new_value: '',
          })
        }
        w={110}
      />
      <NativeSelect
        aria-label="Type"
        data={CHART_FIELDS}
        value={draft.field}
        onChange={(event) =>
          onChange({
            ...draft,
            field: event.currentTarget.value as ChartField,
            value: '',
            new_value: '',
          })
        }
        w={140}
      />

      {draft.action === 'add' ? (
        <TextInput
          aria-label={`New ${noun}`}
          placeholder={`New ${noun}`}
          value={draft.value}
          onChange={(event) => onChange({ ...draft, value: event.currentTarget.value })}
          error={errors.value}
          maxLength={100}
          style={{ flex: '1 1 14rem' }}
        />
      ) : (
        <NativeSelect
          aria-label={`Existing ${noun}`}
          data={[
            {
              value: '',
              label: existing.length > 0 ? `Choose a ${noun}…` : `No ${noun} on the chart`,
            },
            ...existing,
          ]}
          value={draft.value}
          // Start an update from the current wording, ready to edit.
          onChange={(event) =>
            onChange({
              ...draft,
              value: event.currentTarget.value,
              new_value: draft.action === 'update' ? event.currentTarget.value : '',
            })
          }
          error={errors.value}
          disabled={existing.length === 0}
          style={{ flex: '1 1 14rem' }}
        />
      )}

      {draft.action === 'update' && (
        <TextInput
          aria-label="Change to"
          placeholder="Change to"
          value={draft.new_value}
          onChange={(event) => onChange({ ...draft, new_value: event.currentTarget.value })}
          error={errors.new_value}
          maxLength={100}
          style={{ flex: '1 1 14rem' }}
        />
      )}

      <CloseButton aria-label={`Discard chart update ${position}`} onClick={onDiscard} mt={4} />
    </Group>
  )
}
