import { type FormEvent, useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { KeyRoundIcon } from "lucide-react"
import { AuthShell } from "@/components/auth-shell"
import { PasswordInput } from "@/components/password-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { authService, type StatusResponse } from "@/services/auth"
import { markSsoLoginPending, warnIfMultipleSessions } from "@/lib/post-login-check"
import { ssoErrorMessage } from "@/lib/sso-errors"
import { loginNotice } from "@/lib/login-notice"
import { recallLoginMethod, rememberLoginMethod } from "@/lib/login-method"
import { cn } from "@/lib/utils"

const SHAKE_DURATION_MS = 400

export function LoginPage() {
  usePageMetadata({ title: "Sign in", icon: { kind: "static" } })

  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const consumeSignOutReason = useAuthStore((s) => s.consumeSignOutReason)

  const from = (location.state as { from?: string } | null)?.from ?? "/"
  const [notice] = useState(() => loginNotice(consumeSignOutReason(), from))

  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)
  const [error, setError] = useState<string | null>(() =>
    ssoErrorMessage(searchParams.get("error")),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  // Password form is collapsed behind "Use a password instead" when SSO is
  // the primary surface — unless the user picked the password last time.
  const [isPasswordExpanded, setIsPasswordExpanded] = useState(
    () => recallLoginMethod() === "password",
  )

  // Drop the ?error= from the URL once it has been captured into state so a
  // reload does not re-show a stale message.
  useEffect(() => {
    if (searchParams.has("error")) {
      const next = new URLSearchParams(searchParams)
      next.delete("error")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Already authenticated (e.g. opened /login in a second tab) — bounce back.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate, from])

  // Learn which login surfaces this deployment offers. A fresh install with
  // no users goes to /enroll — unless SSO can bootstrap the first admin, in
  // which case enrolment stays reachable via the link below.
  useEffect(() => {
    authService
      .getStatus()
      .then((s) => {
        setStatus(s)
        if (!s.enrolled && !s.oidc.enabled) navigate("/enroll", { replace: true })
      })
      .catch(() => setStatusFailed(true))
  }, [navigate])

  function shake() {
    setIsShaking(true)
    window.setTimeout(() => setIsShaking(false), SHAKE_DURATION_MS)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const form = new FormData(e.currentTarget)
    const username = form.get("username") as string
    const password = form.get("password") as string

    try {
      const response = await authService.login(username, password)
      rememberLoginMethod("password")
      setSession(response)
      navigate(from, { replace: true })
      warnIfMultipleSessions()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
      shake()
    } finally {
      setIsSubmitting(false)
    }
  }

  function startSso() {
    if (!status?.oidc.enabled) return
    rememberLoginMethod("sso")
    markSsoLoginPending()
    window.location.assign(authService.oidcLoginUrl(status.oidc, from))
  }

  const oidc = status?.oidc
  const showSso = oidc?.enabled === true
  const ssoUnavailable = Boolean(oidc?.unavailable_reason)
  // If /status never answers, fall back to the password form so a broken
  // status endpoint cannot lock everyone out.
  const showLocal = status ? status.local_login_enabled : statusFailed
  const showEnrollLink = status ? !status.enrolled : false
  const isStatusPending = status === null && !statusFailed
  // SSO leads only when it is usable; a broken provider should not hide the
  // password form behind an extra click.
  const isSsoPrimary = showSso && !ssoUnavailable
  const showPasswordForm = showLocal && (!isSsoPrimary || isPasswordExpanded)
  const hasError = error !== null

  return (
    <AuthShell>
      <Card className={cn(isShaking && "animate-auth-shake")}>
        {notice && (
          <CardHeader className="text-center">
            <CardDescription>{notice}</CardDescription>
          </CardHeader>
        )}
        <CardContent className={cn(!notice && "pt-2")}>
          {isStatusPending ? (
            <LoginSkeleton />
          ) : (
            <FieldGroup>
              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
                >
                  {error}
                </div>
              )}

              {showSso && (
                <Field>
                  <Button
                    type="button"
                    variant={showPasswordForm ? "outline" : "default"}
                    onClick={startSso}
                    disabled={ssoUnavailable}
                    autoFocus={isSsoPrimary && !isPasswordExpanded}
                  >
                    <KeyRoundIcon className="size-4" aria-hidden="true" />
                    Continue with {oidc?.display_name || "single sign-on"}
                  </Button>
                  {ssoUnavailable && (
                    <FieldError>
                      Single sign-on is unavailable: {oidc?.unavailable_reason}.
                    </FieldError>
                  )}
                </Field>
              )}

              {showSso && showPasswordForm && (
                <FieldSeparator>or sign in with a password</FieldSeparator>
              )}

              {showPasswordForm && (
                <form onSubmit={handleSubmit}>
                  <FieldGroup>
                    <Field data-invalid={hasError || undefined}>
                      <FieldLabel htmlFor="username">Username</FieldLabel>
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        aria-invalid={hasError || undefined}
                        required
                        autoFocus={!isSsoPrimary || isPasswordExpanded}
                      />
                    </Field>
                    <Field data-invalid={hasError || undefined}>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <PasswordInput
                        id="password"
                        name="password"
                        autoComplete="current-password"
                        aria-invalid={hasError || undefined}
                        required
                      />
                    </Field>
                    <Field>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Signing in..." : "Sign in"}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              )}

              {isSsoPrimary && showLocal && !isPasswordExpanded && (
                <Button
                  type="button"
                  variant="link"
                  className="self-center text-muted-foreground"
                  onClick={() => setIsPasswordExpanded(true)}
                >
                  Use a password instead
                </Button>
              )}

              {showEnrollLink && (
                <p className="text-center text-xs text-muted-foreground">
                  No accounts exist yet.{" "}
                  <Link to="/enroll" className="underline underline-offset-4">
                    Set up a local admin instead
                  </Link>
                </p>
              )}
            </FieldGroup>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}

// Placeholder with the same footprint as the password form so the card does
// not jump when /status resolves and the real controls mount.
function LoginSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading sign-in options">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20 bg-foreground/10" />
        <Skeleton className="h-8 w-full bg-foreground/10" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20 bg-foreground/10" />
        <Skeleton className="h-8 w-full bg-foreground/10" />
      </div>
      <Skeleton className="h-8 w-full bg-foreground/10" />
    </div>
  )
}
