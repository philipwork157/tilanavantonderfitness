# @tilana/email

Server-only email transport for the Tilana platform.

- `@tilana/email/server` exposes a provider-neutral `EmailSender` interface and
  the AWS SES implementation.
- Message content stays in the owning application service; this package only
  owns transport concerns.
- AWS credentials are resolved through the standard AWS SDK credential chain.

Never import this package into browser code.
