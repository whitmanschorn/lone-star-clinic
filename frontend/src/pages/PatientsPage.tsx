import {
  Button,
  Card,
  Group,
  Pagination,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import { useEffect } from 'react'
import { usePatients } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { PatientCards } from '../components/patients/PatientCards'
import { PatientListControls } from '../components/patients/PatientListControls'
import { PatientTable } from '../components/patients/PatientTable'
import { RefreshIndicator } from '../components/RefreshIndicator'
import { PAGE_SIZES } from '../lib/patientListUrl'
import { usePatientListUrlSync } from '../lib/usePatientListUrlSync'
import { usePatientModals } from '../lib/usePatientModals'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import {
  activeFilterGroups,
  filtersCleared,
  pageChanged,
  pageSizeChanged,
  selectPatientList,
  selectPatientListParams,
  sortToggled,
} from '../store/patientListSlice'
import { selectHighlightedPatientId } from '../store/uiSlice'

export function PatientsPage() {
  const dispatch = useAppDispatch()
  usePatientListUrlSync()
  const { search, status, filters, sort, order, page, pageSize } = useAppSelector(selectPatientList)
  const params = useAppSelector(selectPatientListParams)
  const { data, error, isLoading, isValidating, mutate } = usePatients(params)
  const highlightedId = useAppSelector(selectHighlightedPatientId)
  const { openCreate, openEdit, openNote } = usePatientModals()

  // Render either the table or the cards, never both, so only one copy of
  // each patient is in the document.
  const isNarrow = useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false })

  // If the current page no longer exists (rows were deleted, or the page size
  // grew), fall back to the last page that does.
  const lastPage = data?.pages
  useEffect(() => {
    if (lastPage !== undefined && lastPage > 0 && page > lastPage) {
      dispatch(pageChanged(lastPage))
    }
  }, [dispatch, lastPage, page])

  const hasFilters =
    search.trim() !== '' || status !== null || activeFilterGroups(filters).length > 0
  const firstRow = data && data.total > 0 ? (data.page - 1) * data.page_size + 1 : 0
  const lastRow = data ? firstRow + data.items.length - 1 : 0

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group align="baseline" gap="sm">
          <Title order={2}>Patients</Title>
          <Text c="dimmed" size="sm" aria-live="polite">
            {data
              ? data.total === 0
                ? 'No patients'
                : `Showing ${firstRow}–${lastRow} of ${data.total}`
              : ' '}
          </Text>
          {/* Rows are on screen but a fresher copy is being fetched. */}
          <RefreshIndicator active={isValidating && data !== undefined} />
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          New patient
        </Button>
      </Group>

      <PatientListControls busy={isValidating} showSort={isNarrow} />

      {error && !data ? (
        <ErrorState title="Could not load patients" error={error} onRetry={() => void mutate()} />
      ) : isLoading || !data ? (
        <Stack gap="xs" aria-busy="true" aria-label="Loading patients">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} height={44} />
          ))}
        </Stack>
      ) : data.items.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="xs">
            <Text fw={600}>No patients found</Text>
            <Text c="dimmed" size="sm">
              {hasFilters
                ? 'Nobody matches the current search and filters.'
                : 'There are no patients yet.'}
            </Text>
            {hasFilters && (
              <Button variant="light" size="xs" onClick={() => dispatch(filtersCleared())}>
                Clear search and filters
              </Button>
            )}
          </Stack>
        </Card>
      ) : (
        <>
          {/* A failed refresh keeps the rows on screen and says so above them. */}
          {error && (
            <ErrorState
              title="Could not refresh patients"
              error={error}
              onRetry={() => void mutate()}
            />
          )}
          {/* Dim, rather than replace, the rows while the next result loads. */}
          <div style={{ opacity: isValidating ? 0.6 : 1, transition: 'opacity 150ms' }}>
            {isNarrow ? (
              <PatientCards
                patients={data.items}
                highlightedId={highlightedId}
                onAddNote={openNote}
                onEdit={openEdit}
              />
            ) : (
              <Card withBorder padding={0}>
                <PatientTable
                  patients={data.items}
                  sort={sort}
                  order={order}
                  onSort={(column) => dispatch(sortToggled(column))}
                  highlightedId={highlightedId}
                  onAddNote={openNote}
                  onEdit={openEdit}
                />
              </Card>
            )}
          </div>
          <Group justify="space-between" gap="sm">
            <Pagination
              total={data.pages}
              value={page}
              onChange={(next) => dispatch(pageChanged(next))}
              siblings={isNarrow ? 0 : 1}
              size={isNarrow ? 'sm' : 'md'}
              getControlProps={(control) => ({ 'aria-label': `${control} page` })}
            />
            <Select
              aria-label="Patients per page"
              data={PAGE_SIZES.map((size) => ({
                value: String(size),
                label: `${size} per page`,
              }))}
              value={String(pageSize)}
              allowDeselect={false}
              onChange={(value) => value && dispatch(pageSizeChanged(Number(value)))}
              w={140}
              size="xs"
            />
          </Group>
        </>
      )}
    </Stack>
  )
}
