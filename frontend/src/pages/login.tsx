import { type FormEvent, useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { KeyRoundIcon, TerminalSquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/stores/auth"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { authService, type StatusResponse } from "@/services/auth"
import { markSsoLoginPending, warnIfMultipleSessions } from "@/lib/post-login-check"
import { ssoErrorMessage } from "@/lib/sso-errors"

export function LoginPage() {
  usePageMetadata({ title: "Sign in", icon: { kind: "static" } })

  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(() =>
    ssoErrorMessage(searchParams.get("error")),
  )
  const [loading, setLoading] = useState(false)

  // Drop the ?error= from the URL once it has been captured into state so a
  // reload does not re-show a stale message.
  useEffect(() => {
    if (searchParams.has("error")) {
      const next = new URLSearchParams(searchParams)
      next.delete("error")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Already authenticated (e.g. opened /login in a second tab) — bounce home.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/", { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

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
      .catch(() => {})
  }, [navigate])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const username = form.get("username") as string
    const password = form.get("password") as string

    try {
      const response = await authService.login(username, password)
      setSession(response)
      navigate("/", { replace: true })
      warnIfMultipleSessions()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  function startSso() {
    if (!status?.oidc.enabled) return
    markSsoLoginPending()
    const from = (location.state as { from?: string } | null)?.from ?? "/"
    window.location.assign(authService.oidcLoginUrl(status.oidc, from))
  }

  const oidc = status?.oidc
  const showSso = oidc?.enabled === true
  const ssoUnavailable = Boolean(oidc?.unavailable_reason)
  // Until /status answers, keep today's behaviour (password form visible).
  const showLocal = status ? status.local_login_enabled : true
  const showEnrollLink = status ? !status.enrolled : false

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <TerminalSquareIcon className="size-4" />
          </div>
          Vibe C2
        </a>
        <Card>
          <CardContent className="pt-6">
            <FieldGroup>
              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {showSso && (
                <Field>
                  <Button
                    type="button"
                    variant={showLocal ? "outline" : "default"}
                    onClick={startSso}
                    disabled={ssoUnavailable}
                    title={oidc?.unavailable_reason}
                  >
                    <KeyRoundIcon className="size-4" />
                    Continue with {oidc?.display_name || "single sign-on"}
                  </Button>
                  {ssoUnavailable && (
                    <p className="text-xs text-muted-foreground">
                      Single sign-on is unavailable: {oidc?.unavailable_reason}.
                    </p>
                  )}
                </Field>
              )}

              {showSso && showLocal && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Separator className="flex-1" />
                  or sign in with a password
                  <Separator className="flex-1" />
                </div>
              )}

              {showLocal && (
                <form onSubmit={handleSubmit}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="username">Username</FieldLabel>
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        required
                        autoFocus={!showSso}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                      />
                    </Field>
                    <Field>
                      <Button type="submit" disabled={loading}>
                        {loading ? "Logging in..." : "Login"}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
