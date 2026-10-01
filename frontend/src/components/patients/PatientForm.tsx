import {
  Alert,
  Button,
  Card,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  TagsInput,
  TextInput,
  Title,
} from '@mantine/core'
import { schemaResolver, useForm } from '@mantine/form'
import { useEffect, useState } from 'react'
import type { Patient, PatientCreate } from '../../api/types'
import { fieldErrors, reportSubmitError } from '../../lib/errors'
import { STATUS_LABELS } from '../../lib/format'
import {
  BLOOD_TYPES,
  patientFormSchema,
  STATUSES,
  toDateInputValue,
  toFormValues,
  toPatientCreate,
  type PatientFormValues,
} from '../../lib/patientForm'

const BLOOD_TYPE_OPTIONS = [{ value: '', label: 'Unknown' }, ...BLOOD_TYPES]
const STATUS_OPTIONS = STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))
const FIELD_NAMES = new Set(Object.keys(patientFormSchema.shape))

interface PatientFormProps {
  /** The patient being edited. Leave out to create a new one. */
  initial?: Patient
  submitLabel: string
  onCancel: () => void
  /** Sends the record to the API. */
  save: (body: PatientCreate) => Promise<Patient>
  /** Called with the server's copy once it has been saved. */
  onSaved: (patient: Patient) => void | Promise<void>
}

/** The create and edit form: personal information, then medical information. */
export function PatientForm({ initial, submitLabel, onCancel, save, onSaved }: PatientFormProps) {
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm<PatientFormValues>({
    initialValues: toFormValues(initial),
    validate: schemaResolver(patientFormSchema, { sync: true }),
    // Check each field as the user leaves it, not only on submit.
    validateInputOnBlur: true,
  })

  // The form may have been opened from a cached, slightly stale copy of the
  // record while SWR fetches the latest. When a newer copy arrives and nothing
  // has been edited yet, start again from it; once the user has made changes,
  // leave their work alone.
  const recordVersion = initial?.updated_at
  useEffect(() => {
    if (!initial || form.isDirty()) return
    const values = toFormValues(initial)
    form.setInitialValues(values)
    form.setValues(values)
    // Runs only when a different version of the record arrives, not on every
    // render (`form` and `initial` change identity each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordVersion])

  const submit = form.onSubmit(
    async (values) => {
      setSaving(true)
      setFailure(null)
      try {
        await onSaved(await save(toPatientCreate(values)))
      } catch (error) {
        // Server-side validation errors land on their fields; network and
        // server failures are explained next to the buttons. The form keeps
        // its values, so "try again" is just pressing the button again.
        setFailure(reportSubmitError(error, form, (path) => FIELD_NAMES.has(path)))
        focusFirstError(Object.keys(fieldErrors(error) ?? {}))
      } finally {
        setSaving(false)
      }
    },
    (errors) => focusFirstError(Object.keys(errors)),
  )

  /** Take the user to the first field that needs attention. */
  function focusFirstError(paths: string[]) {
    const first = paths.find((path) => FIELD_NAMES.has(path))
    if (first) form.getInputNode(first)?.focus()
  }

  const today = toDateInputValue(new Date())

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label="Patient details">
      <Stack gap="md">
        <Card withBorder component="section" aria-labelledby="personal-heading">
          <Title order={3} size="h4" id="personal-heading" mb="sm">
            Personal information
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="First name" withAsterisk {...form.getInputProps('first_name')} />
            <TextInput label="Last name" withAsterisk {...form.getInputProps('last_name')} />
            <TextInput
              type="date"
              label="Date of birth"
              withAsterisk
              max={today}
              {...form.getInputProps('date_of_birth')}
            />
            <TextInput
              type="email"
              label="Email"
              autoComplete="off"
              {...form.getInputProps('email')}
            />
            <TextInput type="tel" label="Phone" {...form.getInputProps('phone')} />
            <TextInput label="Address" {...form.getInputProps('address_line')} />
            <TextInput label="City" {...form.getInputProps('city')} />
            <Group grow align="flex-start">
              <TextInput
                label="State"
                placeholder="TX"
                maxLength={2}
                {...form.getInputProps('state')}
                onChange={(event) =>
                  form.setFieldValue('state', event.currentTarget.value.toUpperCase())
                }
              />
              <TextInput
                label="ZIP code"
                inputMode="numeric"
                {...form.getInputProps('postal_code')}
              />
            </Group>
          </SimpleGrid>
        </Card>

        <Card withBorder component="section" aria-labelledby="medical-heading">
          <Title order={3} size="h4" id="medical-heading" mb="sm">
            Medical information
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NativeSelect label="Status" data={STATUS_OPTIONS} {...form.getInputProps('status')} />
            <NativeSelect
              label="Blood type"
              data={BLOOD_TYPE_OPTIONS}
              {...form.getInputProps('blood_type')}
            />
            <TagsInput
              label="Conditions"
              description="Press Enter after each one"
              splitChars={[',']}
              {...form.getInputProps('conditions')}
            />
            <TagsInput
              label="Medications"
              description="Press Enter after each one"
              splitChars={[',']}
              {...form.getInputProps('medications')}
            />
            <TagsInput
              label="Allergies"
              description="Press Enter after each one"
              splitChars={[',']}
              {...form.getInputProps('allergies')}
            />
            <TextInput
              type="date"
              label="Last visit"
              max={today}
              {...form.getInputProps('last_visit')}
            />
          </SimpleGrid>
        </Card>

        {/* Next to the buttons, so it is in view when a save fails. */}
        {failure && (
          <Alert
            color="red"
            title="The patient was not saved"
            withCloseButton
            onClose={() => setFailure(null)}
          >
            {failure}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={saving}
            // Pressing the button would first blur the field being edited; if
            // that field is invalid its error appears, the layout shifts, and
            // the click misses the button. Keeping focus where it is avoids
            // that, and the submit validates every field anyway.
            onMouseDown={(event) => event.preventDefault()}
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
