export interface HL7Message {
  messageType: string;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  appointmentTime?: string;
}

export function parseHL7(payload: string): HL7Message {
  // Ultra-simplified stub for HL7 v2 parsing
  // Typically HL7 looks like:
  // MSH|^~\&|SENDING_APP...
  // PID|||12345||Smith^John...
  // SCH|||98765|||||20261012103000...

  const lines = payload.split('\n');
  const result: HL7Message = { messageType: 'UNKNOWN' };

  for (const line of lines) {
    const segments = line.split('|');
    const segmentType = segments[0];

    if (segmentType === 'MSH') {
      const typeParts = segments[8]?.split('^') || [];
      result.messageType = typeParts[0] || 'UNKNOWN';
    } else if (segmentType === 'PID') {
      result.patientId = segments[3];
      result.patientName = segments[5]?.replace(/\^/g, ' ').trim();
    } else if (segmentType === 'SCH') {
      result.appointmentId = segments[2];
      result.appointmentTime = segments[11];
    }
  }

  return result;
}
