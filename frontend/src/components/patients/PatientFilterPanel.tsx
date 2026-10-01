import {
  Button,
  Card,
  Chip,
  Group,
  Input,
  NumberInput,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core'
import { useState, type FormEvent } from 'react'
import type { BloodType } from '../../api/types'
import { BLOOD_TYPES, toDateInputValue } from '../../lib/patientForm'
import { NO_FILTERS, type AdvancedFilters } from '../../store/patientListSlice'

/** The panel's working copy: number inputs hold '' while empty. */
interface Draft {
  min_age: number | ''
  max_age: number | ''
  blood_type: BloodType[]
  last_visit_from: string
  last_visit_to: string
  condition: string
  medication: string
  allergy: string
  city: string
}

function toDraft(filters: AdvancedFilters): Draft {
  return {
    ...filters,
    min_age: filters.min_age ?? '',
    max_age: filters.max_age ?? '',
    last_visit_from: filters.last_visit_from ?? '',
    last_visit_to: filters.last_visit_to ?? '',
  }
}

function toFilters(draft: Draft): AdvancedFilters {
  return {
    min_age: draft.min_age === '' ? null : draft.min_age,
    max_age: draft.max_age === '' ? null : draft.max_age,
    blood_type: BLOOD_TYPES.filter((type) => draft.blood_type.includes(type)),
    last_visit_from: draft.last_visit_from || null,
    last_visit_to: draft.last_visit_to || null,
    condition: draft.condition.trim(),
    medication: draft.medication.trim(),
    allergy: draft.allergy.trim(),
    city: draft.city.trim(),
  }
}

interface PatientFilterPanelProps {
  /** The filters currently applied to the list. */
  filters: AdvancedFilters
  onApply: (filters: AdvancedFilters) => void
}

/**
 * The advanced filters. Edits are a draft until "Apply filters" is pressed,
 * so the list is not refetched for every half-typed value.
 */
export function PatientFilterPanel({ filters, onApply }: PatientFilterPanelProps) {
  const [draft, setDraft] = useState(() => toDraft(filters))
  const [errors, setErrors] = useState<{ age?: string; last_visit?: string }>({})

  // When the applied filters change from elsewhere (a chip removed, a
  // bookmarked URL), start the draft again from them.
  const [appliedFilters, setAppliedFilters] = useState(filters)
  if (filters !== appliedFilters) {
    setAppliedFilters(filters)
    setDraft(toDraft(filters))
    setErrors({})
  }

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const apply = (event: FormEvent) => {
    event.preventDefault()
    const problems: typeof errors = {}
    if (draft.min_age !== '' && draft.max_age !== '' && draft.min_age > draft.max_age) {
      problems.age = 'The minimum age cannot be greater than the maximum'
    }
    if (
      draft.last_visit_from &&
      draft.last_visit_to &&
      draft.last_visit_from > draft.last_visit_to
    ) {
      problems.last_visit = 'The start date cannot be after the end date'
    }
    setErrors(problems)
    if (Object.keys(problems).length === 0) onApply(toFilters(draft))
  }

  const today = toDateInputValue(new Date())
  const ageInput = { min: 0, max: 130, allowDecimal: false, allowNegative: false } as const

  return (
    <Card withBorder component="form" onSubmit={apply} aria-label="Filters" noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
          <Group grow align="flex-start">
            <NumberInput
              label="Minimum age"
              {...ageInput}
              value={draft.min_age}
              onChange={(value) => set('min_age', typeof value === 'number' ? value : '')}
              error={errors.age}
            />
            <NumberInput
              label="Maximum age"
              {...ageInput}
              value={draft.max_age}
              onChange={(value) => set('max_age', typeof value === 'number' ? value : '')}
              error={Boolean(errors.age)}
            />
          </Group>
          <Group grow align="flex-start">
            <TextInput
              type="date"
              label="Last visit from"
              max={today}
              value={draft.last_visit_from}
              onChange={(event) => set('last_visit_from', event.currentTarget.value)}
              error={errors.last_visit}
            />
            <TextInput
              type="date"
              label="Last visit to"
              max={today}
              value={draft.last_visit_to}
              onChange={(event) => set('last_visit_to', event.currentTarget.value)}
              error={Boolean(errors.last_visit)}
            />
          </Group>
          <TextInput
            label="Condition contains"
            placeholder="e.g. diabetes"
            maxLength={100}
            value={draft.condition}
            onChange={(event) => set('condition', event.currentTarget.value)}
          />
          <TextInput
            label="Medication contains"
            placeholder="e.g. metformin"
            maxLength={100}
            value={draft.medication}
            onChange={(event) => set('medication', event.currentTarget.value)}
          />
          <TextInput
            label="Allergy contains"
            placeholder="e.g. penicillin"
            maxLength={100}
            value={draft.allergy}
            onChange={(event) => set('allergy', event.currentTarget.value)}
          />
          <TextInput
            label="City contains"
            placeholder="e.g. Austin"
            maxLength={100}
            value={draft.city}
            onChange={(event) => set('city', event.currentTarget.value)}
          />
        </SimpleGrid>

        <Input.Wrapper label="Blood type" labelElement="div">
          <Chip.Group
            multiple
            value={draft.blood_type}
            onChange={(value) => set('blood_type', value)}
          >
            <Group gap="xs" mt={4} role="group" aria-label="Blood type">
              {BLOOD_TYPES.map((type) => (
                <Chip key={type} value={type} size="sm">
                  {type}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Input.Wrapper>

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => onApply(NO_FILTERS)}>
            Clear filters
          </Button>
          <Button type="submit">Apply filters</Button>
        </Group>
      </Stack>
    </Card>
  )
}
