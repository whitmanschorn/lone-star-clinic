import { createTheme, type MantineColorsTuple } from '@mantine/core'

// A warm saddle-leather accent: the one visible nod to the clinic's name.
const saddle: MantineColorsTuple = [
  '#fdf4ec',
  '#f7e5d7',
  '#edc9ad',
  '#e3ab7f',
  '#db9158',
  '#d6813f',
  '#c66a2a',
  '#a8521f',
  '#8e4419',
  '#733511',
]

export const theme = createTheme({
  primaryColor: 'saddle',
  primaryShade: 7,
  colors: { saddle },
  // No transitions or animations for people who ask their system for less motion.
  respectReducedMotion: true,
  headings: {
    fontFamily: "'Zilla Slab', Georgia, serif",
    fontWeight: '600',
  },
})
