import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/legal')({
  component: LegalComponent,
})

function LegalComponent() {
  return (
    <iframe 
      src="/legal.html" 
      style={{ width: '100%', height: '100vh', border: 'none' }}
      title="Legal Document"
    />
  )
}
