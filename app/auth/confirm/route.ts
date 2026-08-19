import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mensajeDeError } from '@/lib/errores'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/set-password'

  const redirectTo = request.nextUrl.clone()
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')
  redirectTo.searchParams.delete('next')

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      redirectTo.pathname = next
      return NextResponse.redirect(redirectTo)
    }

    redirectTo.pathname = '/login'
    redirectTo.searchParams.set(
      'error',
      mensajeDeError(error, {
        otp_expired: 'El link ya expiró. Pedí que te reenvíen la invitación.',
      })
    )
    return NextResponse.redirect(redirectTo)
  }

  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'El link de invitación es inválido o ya fue usado.')
  return NextResponse.redirect(redirectTo)
}
