import axios from 'axios';
import prisma from '../config/db';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'webhook.dispatcher' });

export async function dispatchWebhookEvent(
  clinicId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  let webhooks;
  try {
    webhooks = await prisma.externalWebhook.findMany({
      where: { clinicId, isActive: true, events: { has: eventType } },
    });
  } catch (err) {
    log.error({ err, clinicId, eventType }, 'failed to load external webhooks');
    return;
  }

  if (webhooks.length === 0) return;

  const dispatches = webhooks.map((webhook) =>
    axios
      .post(
        webhook.url,
        {
          event: eventType,
          timestamp: new Date().toISOString(),
          clinicId,
          data: payload,
        },
        {
          timeout: env.EXTERNAL_HTTP_TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'DentaFlow-Webhook-Dispatcher/1.0',
          },
        },
      )
      .then(() => {
        log.debug({ webhookId: webhook.id, eventType }, 'webhook delivered');
      })
      .catch((err) => {
        log.warn(
          { webhookId: webhook.id, name: webhook.name, eventType, err: err.message },
          'webhook delivery failed',
        );
      }),
  );

  await Promise.allSettled(dispatches);
}
