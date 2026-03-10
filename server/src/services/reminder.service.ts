import prisma from '../config/db';
import { dispatch } from './messaging/dispatcher';
import { realtimeService } from './realtime.service';
import { dispatchWebhookEvent } from './webhook.dispatcher';
// Channel type: SMS | WHATSAPP | EMAIL

/**
 * Schedule (and immediately attempt) a reminder for an appointment.
 */
export async function scheduleReminder(
  appointmentId: string,
  channelOverride?: string,
  templateId?: string
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true },
  });

  if (!appointment) throw new Error('Appointment not found');
  if (!appointment.patient.consentStatus) {
    throw new Error('Patient has not consented to notifications');
  }

  const channel = (channelOverride || appointment.patient.preferredChannel) as 'SMS' | 'WHATSAPP' | 'EMAIL';

  // Resolve template
  let subject = 'Appointment Reminder';
  let body = `Hi ${appointment.patient.name}, this is a reminder for your dental appointment on ${appointment.scheduledTime.toLocaleString()}.`;

  if (templateId) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (template) {
      subject = (template.subject || subject)
        .replace('{{patient_name}}', appointment.patient.name)
        .replace('{{appointment_time}}', appointment.scheduledTime.toLocaleString());
      body = template.body
        .replace('{{patient_name}}', appointment.patient.name)
        .replace('{{appointment_time}}', appointment.scheduledTime.toLocaleString());
    }
  }

  // Determine contact info
  const to = channel === 'EMAIL'
    ? appointment.patient.email
    : appointment.patient.phone;

  if (!to) {
    throw new Error(`No ${channel.toLowerCase()} contact info for patient`);
  }

  // Create ChannelMessage record
  const msg = await prisma.channelMessage.create({
    data: {
      appointmentId,
      channel,
      status: 'PENDING',
      contentTemplateId: templateId || null,
    },
  });

  // Dispatch the message
  realtimeService.sendToClinic(appointment.clinicId, 'message_dispatched', {
    messageId: msg.id,
    appointmentId,
    patientName: appointment.patient.name,
    channel,
  });

  dispatchWebhookEvent(appointment.clinicId, 'MESSAGE_DISPATCHED', {
    messageId: msg.id,
    appointmentId,
    patientName: appointment.patient.name,
    channel,
  });

  const result = await dispatch(channel, to, subject, body);

  // Update message status
  await prisma.channelMessage.update({
    where: { id: msg.id },
    data: {
      status: result.success ? 'SENT' : 'FAILED',
      sentAt: result.success ? new Date() : null,
      externalId: result.externalId || null,
      deliveryReport: result.error ? { error: result.error } : undefined,
    },
  });

  realtimeService.sendToClinic(appointment.clinicId, 'message_status_updated', {
    messageId: msg.id,
    status: result.success ? 'SENT' : 'FAILED',
    timestamp: new Date(),
  });

  dispatchWebhookEvent(appointment.clinicId, 'MESSAGE_STATUS_UPDATED', {
    messageId: msg.id,
    status: result.success ? 'SENT' : 'FAILED',
    channel,
    externalId: result.externalId
  });

  return {
    messageId: msg.id,
    channel,
    status: result.success ? 'SENT' : 'FAILED',
    externalId: result.externalId,
  };
}
