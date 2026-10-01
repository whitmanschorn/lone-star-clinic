// Friendly names for the generated API types. Import from here, not from
// schema.d.ts, so the rest of the app does not depend on the generator's layout.
import type { components } from './schema'

type Schemas = components['schemas']

export type Health = Schemas['Health']
