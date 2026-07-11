import { createFileRoute, redirect } from '@tanstack/react-router'

// /legal.html works fine as a standalone static page (excluded from the
// Worker in wrangler.jsonc). This route just sends visitors from the
// clean URL straight there. IMPORTANT: /legal.html must stay excluded
// from run_worker_first, and assets.html_handling must stay "none" — 
// otherwise Cloudflare's own clean-URL redirect fights this one and you
// get an infinite redirect loop (ERR_TOO_MANY_REDIRECTS).
export const Route = createFileRoute('/legal')({
  beforeLoad: () => {
    throw redirect({ href: '/legal.html' })
  },
})
