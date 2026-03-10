import prisma from '../config/db';
import { Channel, CampaignStatus } from '@prisma/client';
import { dispatch } from './messaging/dispatcher';
import { realtimeService } from './realtime.service';

export class CampaignService {
  /**
   * Triggers a bulk campaign for a specific clinic.
   * In a real production app, this would be an async background job (BullMQ).
   * For this implementation, we run it in the background as a promise loop with real-time feedback.
   */
  async triggerCampaign(
    clinicId: string, 
    campaignId: string,
    name: string,
    type: string,
    channel: Channel,
    content: string
  ) {
    // 1. Fetch audience
    const patients = await prisma.patient.findMany({
      where: { clinicId, consentStatus: true }
    });

    if (patients.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', totalTarget: 0 }
      });
      return;
    }

    // 2. Initialize campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING', totalTarget: patients.length }
    });

    // Notify frontend about campaign start
    realtimeService.sendToClinic(clinicId, 'CAMPAIGN_PROGRESS', {
      campaignId,
      status: 'SENDING',
      sentCount: 0,
      totalTarget: patients.length
    });

    // 3. Dispatch loop (simulating background processing)
    let sentCount = 0;
    let failedCount = 0;

    // Process in chunks to avoid blocking/rate limits
    for (const patient of patients) {
      try {
        if (!patient.phone && (channel === 'SMS' || channel === 'WHATSAPP')) {
          throw new Error('No phone number');
        }

        const to = channel === 'EMAIL' ? (patient.email || '') : (patient.phone || '');
        
        await dispatch(channel, to, `DentalFlow: ${name}`, content);
        sentCount++;
      } catch (err: any) {
        console.error(`[Campaign] Failed to send to patient ${patient.id}:`, err.message);
        failedCount++;
      }

      // Periodically update DB and Broadcast Progress
      if ((sentCount + failedCount) % 5 === 0 || (sentCount + failedCount) === patients.length) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { sentCount, failedCount }
        });

        realtimeService.sendToClinic(clinicId, 'CAMPAIGN_PROGRESS', {
          campaignId,
          status: 'SENDING',
          sentCount,
          totalTarget: patients.length
        });
      }
    }

    // 4. Finalize
    const finalStatus = failedCount === patients.length ? 'FAILED' : 'COMPLETED';
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: finalStatus as CampaignStatus }
    });

    realtimeService.sendToClinic(clinicId, 'CAMPAIGN_PROGRESS', {
      campaignId,
      status: finalStatus,
      sentCount,
      totalTarget: patients.length
    });
  }
}

export const campaignService = new CampaignService();
