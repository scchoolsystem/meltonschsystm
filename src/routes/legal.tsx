import { createFileRoute, redirect } from '@tanstack/react-router'

// /legal used to iframe /legal.html, which was fragile (iframe sizing,
// nested requests, and it looked identical to a genuinely blank page when
// anything went wrong). /legal.html works fine as a standalone static
// page, so just send visitors straight there instead of wrapping it.
export const Route = createFileRoute('/legal')({
  beforeLoad: () => {
    throw redirect({ href: '/legal.html' })
  },
})
