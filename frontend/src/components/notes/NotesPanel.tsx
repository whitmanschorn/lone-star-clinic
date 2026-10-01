import { ActionIcon, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconClipboardText, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { revalidateAllPatients, revalidatePatient, usePatientNotes } from '../../api/hooks'
import { deleteNote } from '../../api/mutations'
import type { Note, Patient } from '../../api/types'
import { describeChange } from '../../lib/chart'
import { describeError } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { ConfirmModal } from '../ConfirmModal'
import { ErrorState } from '../ErrorState'
import { NoteForm } from './NoteForm'

interface NoteItemProps {
  note: Note
  onDelete: (note: Note) => void
}

function NoteItem({ note, onDelete }: NoteItemProps) {
  const when = formatDateTime(note.timestamp)
  return (
    <Card withBorder padding="sm" component="li">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Text size="sm" c="dimmed" fw={600} component="time" dateTime={note.timestamp}>
          {when}
        </Text>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`Delete note from ${when}`}
          onClick={() => onDelete(note)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
      <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.content}</Text>
      {note.changes.length > 0 && (
        <Stack gap={0} mt="xs" role="group" aria-label="Chart changes">
          {note.changes.map((change, index) => (
            <Group key={index} gap={6} wrap="nowrap" align="flex-start" c="dimmed">
              <IconClipboardText size={14} style={{ flexShrink: 0, marginTop: 4 }} aria-hidden />
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                {describeChange(change)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  )
}

export function NotesPanel({ patient }: { patient: Patient }) {
  const patientId = patient.id
  const { mutate: mutateCache } = useSWRConfig()
  const { data: notes, error, mutate } = usePatientNotes(patientId)
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const doomed = pendingDelete
    setDeleting(true)
    try {
      await deleteNote(patientId, doomed.id)
      setPendingDelete(null)
      notifications.show({ message: 'Note deleted', color: 'teal' })
    } catch (error) {
      setPendingDelete(null)
      notifications.show({
        title: 'The note was not deleted',
        message: describeError(error),
        color: 'red',
      })
    } finally {
      setDeleting(false)
      // Whether it worked or not, show what the server now has. This also
      // refreshes the summary, which is built from the notes.
      await revalidatePatient(mutateCache, patientId)
    }
  }

  return (
    <Stack gap="md">
      <Card withBorder>
        <NoteForm
          patient={patient}
          onAdded={(note) => {
            const updatedChart = note.changes.length > 0
            notifications.show({
              message: updatedChart ? 'Note added and chart updated' : 'Note added',
              color: 'teal',
            })
            // A chart change also shows up in lists and on the dashboard.
            void (updatedChart
              ? revalidateAllPatients(mutateCache)
              : revalidatePatient(mutateCache, patientId))
          }}
          // The chart on screen was out of date; fetch the current one.
          onConflict={() => void revalidatePatient(mutateCache, patientId)}
        />
      </Card>

      <section aria-label="Notes">
        <Title order={3} size="h4" mb="sm">
          {notes ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : 'Notes'}
        </Title>
        {error && !notes ? (
          <ErrorState title="Could not load notes" error={error} onRetry={() => void mutate()} />
        ) : !notes ? (
          <Stack gap="xs" aria-busy="true" aria-label="Loading notes">
            <Skeleton height={70} />
            <Skeleton height={70} />
          </Stack>
        ) : notes.length === 0 ? (
          <Text c="dimmed">No notes yet. Add the first one above.</Text>
        ) : (
          <Stack gap="xs" component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} onDelete={setPendingDelete} />
            ))}
          </Stack>
        )}
      </section>

      <ConfirmModal
        opened={pendingDelete !== null}
        title="Delete this note?"
        confirmLabel="Delete note"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      >
        <Text size="sm">
          The note from {pendingDelete ? formatDateTime(pendingDelete.timestamp) : ''} will be
          removed for good.
        </Text>
        {pendingDelete && (
          <Text size="sm" c="dimmed" lineClamp={3}>
            {pendingDelete.content}
          </Text>
        )}
      </ConfirmModal>
    </Stack>
  )
}
