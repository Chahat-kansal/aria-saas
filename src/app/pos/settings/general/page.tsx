import { redirect } from 'next/navigation'

// General POS settings live at /pos/settings
export default function PosSettingsGeneralPage() {
  redirect('/pos/settings')
}