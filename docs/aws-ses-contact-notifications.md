# AWS SES contact notifications

The Nuxt contact API stores an enquiry in PostgreSQL and then uses Amazon SES
to notify Tilana. SES delivery is server-only; no AWS credential is available
to the Astro site or either browser bundle.

## 1. Configure SES

1. Open Amazon SES in the **Africa (Cape Town) `af-south-1`** region.
2. Under **Verified identities**, verify `tilanavantonder.co.za` (recommended)
   or the exact sender email address.
3. Add the DKIM DNS records that SES provides to Cloudflare.
4. While the SES account is in the sandbox, also verify
   `tilanavantonder@gmail.com`. Request production access before sending to
   arbitrary recipients in future features.

SES identities and sandbox status are regional. The identity must therefore be
verified in the same region configured by `AWS_REGION`.

## 2. Grant least-privilege sending access

Prefer an IAM role on AWS-hosted infrastructure. For non-AWS hosting, create an
IAM principal restricted to `ses:SendEmail` for the verified identity:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:af-south-1:AWS_ACCOUNT_ID:identity/tilanavantonder.co.za"
    }
  ]
}
```

Do not use an AWS root access key.

## 3. Configure the Nuxt server

Set these as deployment secrets for the admin/Nuxt server:

```dotenv
NUXT_CONTACT_NOTIFICATION_ENABLED=true
NUXT_CONTACT_NOTIFICATION_TO=tilanavantonder@gmail.com
NUXT_EMAIL_FROM_ADDRESS=website@tilanavantonder.co.za
NUXT_EMAIL_FROM_NAME=Tilana van Tonder website
AWS_REGION=af-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

`AWS_SESSION_TOKEN` is only required for temporary credentials. When the
server has an IAM role, omit the access-key variables; the AWS SDK resolves the
role automatically.

## Delivery behaviour

- The database write happens first.
- SES is called only after the write succeeds.
- The visitor receives a successful response once the enquiry is stored.
- If SES is temporarily unavailable, the error is logged and the enquiry
  remains visible in the admin dashboard. This avoids duplicate submissions.

For guaranteed retry delivery at larger scale, add a transactional outbox and
background worker rather than moving the email call ahead of the database write.
