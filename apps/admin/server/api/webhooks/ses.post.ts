import { applySesEvent, isAmazonSnsUrl, parseSnsMessage, verifySnsSignature } from '../../services/ses-events';

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
 * NUXT_SES_EVENTS_TOPIC_ARN is set; only that topic, signed by Amazon, is accepted.
 */
export default defineEventHandler(async (event) => {
  const topicArn = String(useRuntimeConfig(event).sesEventsTopicArn ?? '').trim();
  if (!topicArn) throw createError({ statusCode: 404, statusMessage: 'Not found.' });

  const raw = await readRawBody(event, 'utf8').catch(() => undefined);
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  }
  catch {
    parsed = null;
  }
  const message = parseSnsMessage(parsed);
  if (!message || message.TopicArn !== topicArn || !(await verifySnsSignature(message, loadCertificate))) {
    throw createError({ statusCode: 403, statusMessage: 'Message rejected.' });
  }

  if (message.Type === 'SubscriptionConfirmation') {
    if (!isAmazonSnsUrl(message.SubscribeURL, 'subscribe')) throw createError({ statusCode: 400, statusMessage: 'Bad subscription link.' });
    const response = await fetch(message.SubscribeURL!, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw createError({ statusCode: 502, statusMessage: 'Could not confirm the subscription.' });
    return { ok: true as const };
  }
  if (message.Type === 'Notification') {
    let payload: unknown;
    try {
      payload = JSON.parse(message.Message);
    }
    catch {
      return { ok: true as const };
    }
    await applySesEvent(useDatabase(), payload);
  }
  return { ok: true as const };
});
