import { serverConfig } from '@/server/config';
import { getDatabase } from '@/server/db';
import { handle, HttpError } from '@/server/http';
import { applySesEvent, isAmazonSnsUrl, parseSnsMessage, verifySnsSignature } from '@/server/services/ses-events';

const certificates = new Map<string, Promise<string>>();

function loadCertificate(url: string): Promise<string> {
  let certificate = certificates.get(url);
  if (!certificate) {
    certificate = fetch(url, { signal: AbortSignal.timeout(8000) }).then((response) => {
      if (!response.ok) throw new Error(`Certificate request failed (${response.status}).`);
      return response.text();
    });
    certificate.catch(() => certificates.delete(url));
    certificates.set(url, certificate);
  }
  return certificate;
}

/**
 * Amazon SNS delivers SES bounce and complaint reports here. Off unless
 * SES_EVENTS_TOPIC_ARN is set; only that topic, signed by Amazon, is accepted.
 */
export const POST = handle(async (request: Request) => {
  const topicArn = serverConfig().sesEventsTopicArn.trim();
  if (!topicArn) throw new HttpError(404, 'Not found.');

  const raw = await request.text().catch(() => '');
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const message = parseSnsMessage(parsed);
  if (!message || message.TopicArn !== topicArn || !(await verifySnsSignature(message, loadCertificate))) {
    throw new HttpError(403, 'Message rejected.');
  }

  if (message.Type === 'SubscriptionConfirmation') {
    if (!isAmazonSnsUrl(message.SubscribeURL, 'subscribe')) throw new HttpError(400, 'Bad subscription link.');
    const response = await fetch(message.SubscribeURL!, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new HttpError(502, 'Could not confirm the subscription.');
    return Response.json({ ok: true });
  }
  if (message.Type === 'Notification') {
    let payload: unknown;
    try {
      payload = JSON.parse(message.Message);
    } catch {
      return Response.json({ ok: true });
    }
    await applySesEvent(getDatabase(), payload);
  }
  return Response.json({ ok: true });
});
