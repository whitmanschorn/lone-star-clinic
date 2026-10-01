import {
  ActionIcon,
  Badge,
  Button,
  CloseButton,
  Collapse,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from '@mantine/core'
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks'
import { IconFilter, IconSearch, IconSortAscending, IconSortDescending } from '@tabler/icons-react'
import { useState } from 'react'
import type { PatientSort, PatientStatus } from '../../api/types'
import { SORT_LABELS } from '../../lib/patientListUrl'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  activeFilterGroups,
  advancedFiltersApplied,
  filterGroupCleared,
  NO_FILTERS,
  searchChanged,
  selectPatientList,
  sortChanged,
  statusChanged,
} from '../../store/patientListSlice'
import { ActiveFilters } from './ActiveFilters'
import { PatientFilterPanel } from './PatientFilterPanel'

const STATUS_OPTIONS: { value: PatientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'critical', label: 'Critical' },
]

const SORT_OPTIONS = Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))

interface PatientListControlsProps {
  /** True while a request for the current filters is in flight. */
  busy: boolean
  /** Show the sort picker. The desktop table sorts by its column headers instead. */
  showSort: boolean
}

export function PatientListControls({ busy, showSort }: PatientListControlsProps) {
  const dispatch = useAppDispatch()
  const { search, status, sort, order, filters } = useAppSelector(selectPatientList)
  const [filtersOpened, { toggle: toggleFilters, close: closeFilters }] = useDisclosure(false)
  const activeCount = activeFilterGroups(filters).length

  // The input keeps its own value so typing is instant; the store (and so the
  // request) only catches up once the user pauses.
  const [draft, setDraft] = useState(search)
  const commitSearch = useDebouncedCallback((value: string) => {
    dispatch(searchChanged(value))
  }, 300)

  // Follow the store when the search is changed from elsewhere (cleared, or
  // set by a bookmarked URL).
  const [lastSearch, setLastSearch] = useState(search)
  if (search !== lastSearch) {
    setLastSearch(search)
    setDraft(search)
  }

  const changeDraft = (value: string) => {
    setDraft(value)
    commitSearch(value)
  }

  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm">
        <TextInput
          aria-label="Search patients"
          placeholder="Search by name or email"
          value={draft}
          onChange={(event) => changeDraft(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          rightSection={
            busy ? (
              <Loader size="xs" aria-label="Loading" />
            ) : draft ? (
              <CloseButton size="sm" aria-label="Clear search" onClick={() => changeDraft('')} />
            ) : null
          }
          style={{ flex: '1 1 16rem' }}
        />
        <SegmentedControl
          aria-label="Filter by status"
          data={STATUS_OPTIONS}
          value={status ?? 'all'}
          onChange={(value) => dispatch(statusChanged(value === 'all' ? null : value))}
          style={{ flex: '1 1 18rem' }}
        />
        <Button
          variant={activeCount > 0 ? 'light' : 'default'}
          leftSection={<IconFilter size={16} />}
          rightSection={
            activeCount > 0 ? (
              <Badge size="sm" circle>
                {activeCount}
              </Badge>
            ) : null
          }
          aria-expanded={filtersOpened}
          aria-label={activeCount > 0 ? `Filters, ${activeCount} applied` : 'Filters'}
          onClick={toggleFilters}
        >
          Filters
        </Button>
        {showSort && (
          <Group gap="xs" wrap="nowrap" style={{ flex: '1 1 100%' }}>
            <Select
              aria-label="Sort by"
              data={SORT_OPTIONS}
              value={sort}
              allowDeselect={false}
              onChange={(value) =>
                value && dispatch(sortChanged({ sort: value as PatientSort, order }))
              }
              style={{ flex: 1 }}
            />
            <ActionIcon
              variant="default"
              size="input-sm"
              aria-label={order === 'asc' ? 'Sorted ascending' : 'Sorted descending'}
              onClick={() =>
                dispatch(sortChanged({ sort, order: order === 'asc' ? 'desc' : 'asc' }))
              }
            >
              {order === 'asc' ? <IconSortAscending size={18} /> : <IconSortDescending size={18} />}
            </ActionIcon>
          </Group>
        )}
      </Group>

      <Collapse expanded={filtersOpened}>
        <PatientFilterPanel
          filters={filters}
          onApply={(next) => {
            dispatch(advancedFiltersApplied(next))
            closeFilters()
          }}
        />
      </Collapse>

      <ActiveFilters
        filters={filters}
        onRemove={(group) => dispatch(filterGroupCleared(group))}
        onClearAll={() => dispatch(advancedFiltersApplied(NO_FILTERS))}
      />
    </Stack>
  )
}
