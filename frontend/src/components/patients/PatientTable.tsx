import { Anchor, Group, Table, Text, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Patient, PatientSort, SortOrder } from '../../api/types'
import { formatDate, fullName } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

interface SortableHeaderProps {
  column: PatientSort
  label: string
  sort: PatientSort
  order: SortOrder
  onSort: (column: PatientSort) => void
}

function SortableHeader({ column, label, sort, order, onSort }: SortableHeaderProps) {
  const active = sort === column
  const SortIcon = !active ? IconArrowsSort : order === 'asc' ? IconArrowUp : IconArrowDown
  return (
    <Table.Th aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <UnstyledButton onClick={() => onSort(column)} fw={700} fz="sm">
        <Group gap={4} wrap="nowrap">
          {label}
          <SortIcon size={14} opacity={active ? 1 : 0.4} aria-hidden />
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}

// Memoised so rows that did not change are skipped when the list re-renders
// (every keystroke in the search box re-renders the page around it).
const PatientRow = memo(function PatientRow({ patient }: { patient: Patient }) {
  const navigate = useNavigate()
  const href = `/patients/${patient.id}`
  return (
    <Table.Tr onClick={() => void navigate(href)} style={{ cursor: 'pointer' }}>
      <Table.Td>
        <Anchor component={Link} to={href} fw={500} onClick={(event) => event.stopPropagation()}>
          {fullName(patient)}
        </Anchor>
      </Table.Td>
      <Table.Td>{patient.age}</Table.Td>
      <Table.Td>{formatDate(patient.last_visit, 'Never')}</Table.Td>
      <Table.Td>
        <StatusBadge status={patient.status} />
      </Table.Td>
      <Table.Td visibleFrom="md">
        <Text size="sm" c="dimmed">
          {patient.city ?? '—'}
        </Text>
      </Table.Td>
    </Table.Tr>
  )
})

interface PatientTableProps {
  patients: Patient[]
  sort: PatientSort
  order: SortOrder
  onSort: (column: PatientSort) => void
}

export function PatientTable({ patients, sort, order, onSort }: PatientTableProps) {
  const header = { sort, order, onSort }
  return (
    <Table highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <SortableHeader column="name" label="Name" {...header} />
          <SortableHeader column="age" label="Age" {...header} />
          <SortableHeader column="last_visit" label="Last visit" {...header} />
          <SortableHeader column="status" label="Status" {...header} />
          <Table.Th visibleFrom="md">City</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {patients.map((patient) => (
          <PatientRow key={patient.id} patient={patient} />
        ))}
      </Table.Tbody>
    </Table>
  )
}
