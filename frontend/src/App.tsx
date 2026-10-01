import { MantineProvider } from '@mantine/core'
import { Provider as ReduxProvider } from 'react-redux'
import { RouterProvider } from 'react-router'
import { SWRConfig } from 'swr'
import { router } from './router'
import { store } from './store'
import { theme } from './theme'

export function App() {
  return (
    // "auto" follows the operating system until the user picks a scheme.
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ReduxProvider store={store}>
        {/* Refetching every time the tab regains focus is noisy for a dashboard. */}
        <SWRConfig value={{ revalidateOnFocus: false }}>
          <RouterProvider router={router} />
        </SWRConfig>
      </ReduxProvider>
    </MantineProvider>
  )
}
