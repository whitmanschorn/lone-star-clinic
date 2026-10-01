import { Button, Card, Group, Table, Text, Title } from '@mantine/core'
import { IconChartBar, IconTable } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'

export interface ChartTable {
  columns: string[]
  rows: (string | number)[][]
}

interface ChartCardProps {
  title: string
  /** One line saying what is plotted. */
  description: string
  /** The same data as a table: the accessible twin of the chart. */
  table: ChartTable
  children: ReactNode
}

/**
 * The frame every dashboard chart sits in: a title, the chart, and a switch
 * to read the same numbers as a table. No value is available only by hovering.
 */
export function ChartCard({ title, description, table, children }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false)

  return (
    <Card withBorder component="section" aria-label={title}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm" mb="sm">
        <div>
          <Title order={3} size="h4">
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </div>
        <Button
          variant="subtle"
          size="compact-xs"
          leftSection={asTable ? <IconChartBar size={14} /> : <IconTable size={14} />}
          onClick={() => setAsTable((current) => !current)}
          style={{ flexShrink: 0 }}
        >
          {asTable ? 'View as chart' : 'View as table'}
        </Button>
      </Group>

      {asTable ? (
        <Table verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              {table.columns.map((column, index) => (
                <Table.Th key={column} ta={index === 0 ? 'left' : 'right'}>
                  {column}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {table.rows.map((row) => (
              <Table.Tr key={row[0]}>
                {row.map((cell, index) => (
                  <Table.Td
                    key={index}
                    ta={index === 0 ? 'left' : 'right'}
                    // Numbers in a column line up digit for digit.
                    style={index === 0 ? undefined : { fontVariantNumeric: 'tabular-nums' }}
                  >
                    {cell}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        children
      )}
    </Card>
  )
}
