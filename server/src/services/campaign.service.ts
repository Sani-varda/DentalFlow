import prisma from '../config/db';
import { Channel, CampaignStatus } from '@prisma/client';
import { dispatch } from './messaging/dispatcher';
import { realtimeService } from './realtime.service';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'campaign.service' });

const DEFAULT_CONCURRENCY = 5;
const PROGRESS_INTERVAL = 25;

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

export class CampaignService {
  async triggerCampaign(
    clinicId: string,
    campaignId: string,
    name: string,
    _type: string,
    channel: Channel,
    content: string,
  ): Promise<void> {
    const patients = await prisma.patient.findMany({
      where: { clinicId, consentStatus: true },
      select: { id: true, email: true, phone: true },
    });

    if (patients.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', totalTarget: 0 },
      });
      return;
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING', totalTarget: patients.length },
    });

    realtimeService.sendToClinic(clinicId, 'CAMPAIGN_PROGRESS', {
      campaignId,
      status: 'SENDING',
      sentCount: 0,
      totalTarget: patients.length,
    });

    let sentCount = 0;
    let failedCount = 0;
    let lastReported = 0;

    const persistProgress = async (final: boolean) => {
      try {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { sentCount, failedCount },
        });
      } catch (err) {
        log.warn({ err: (err as Error).message, campaignId }, 'progress write failed');
      }
      realtimeService.sendToClinic(clinicId, 'CAMPAIGN_PROGRESS', {
        campaignId,
        status: final ? 'SENDING' : 'SENDING',
        sentCount,
        totalTarget: patients.length,
      });
      lastReported = sentCount + failedCount;
    };

    await runWithConcurrency(patients, DEFAULT_CONCURRENCY, async (patient) => {
      try {
        const recipient = channel === 'EMAIL' ? patient.email ?? '' : patient.phone ?? '';
        if (!recipient) {
          failedCount++;
          return;
        }
        const result = await dispatch(channel, recipient, `DentalFlow: ${name}`, content);
        if (result.success) sentCount++;
        else failedCount++;
      } catch (err) {
        log.warn({ err: (err as Error).message, patientId: patient.id }, 'campaign dispatch error');
        failedCount++;
      }
      const processed = sentCount + failedCount;
      if (processed - lastReported >= PROGRESS_INTERVAL || processed === patients.length) {
        await persistProgress(false);
      }
    });

    let finalStatus: CampaignStatus = 'COMPLETED';
    if (failedCount === patients.length) finalStatus = 'FAILED';

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: finalStatus, sentCount, failedCount },
    });

    realtimeService.sendToClinic(clinicId, 'CAMPAIGN_PROGRESS', {
      campaignId,
      status: finalStatus,
      sentCount,
      totalTarget: patients.length,
    });

    log.info(
      { campaignId, clinicId, sentCount, failedCount, total: patients.length, finalStatus },
      'campaign complete',
    );
  }
}

export const campaignService = new CampaignService();
