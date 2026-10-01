import '@fontsource/zilla-slab/latin-600.css'
import '@fontsource/zilla-slab/latin-700.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
