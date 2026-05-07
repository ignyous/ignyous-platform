// src/app/page.tsx
// Redirect root to /dashboard (which redirects to /login if not authenticated)
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/dashboard')
}
