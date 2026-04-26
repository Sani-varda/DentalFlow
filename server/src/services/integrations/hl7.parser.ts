export interface HL7Message {
  messageType: string;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  appointmentTime?: string;
}

export class HL7ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HL7ParseError';
  }
}

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KiB
const MAX_LINES = 200;
const MAX_FIELDS_PER_SEGMENT = 64;
const SEGMENT_TYPE_RE = /^[A-Z][A-Z0-9]{2}$/;

/**
 * Parse a minimal subset of an HL7 v2 message (MSH/PID/SCH) used for
 * appointment scheduling integrations. Throws HL7ParseError on malformed
 * input rather than silently producing partial data.
 */
export function parseHL7(payload: unknown): HL7Message {
  if (typeof payload !== 'string') {
    throw new HL7ParseError('HL7 payload must be a string');
  }
  if (payload.length === 0) {
    throw new HL7ParseError('HL7 payload is empty');
  }
  if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new HL7ParseError('HL7 payload exceeds maximum size');
  }

  // HL7 segments are typically separated by \r; tolerate \n and \r\n too.
  const rawLines = payload.split(/\r\n|\r|\n/);
  if (rawLines.length === 0 || !rawLines[0].startsWith('MSH')) {
    throw new HL7ParseError('HL7 message must begin with an MSH segment');
  }
  if (rawLines.length > MAX_LINES) {
    throw new HL7ParseError('HL7 payload exceeds maximum segment count');
  }

  const result: HL7Message = { messageType: 'UNKNOWN' };
  let mshSeen = false;

  for (const line of rawLines) {
    if (!line) continue;
    const segments = line.split('|');
    if (segments.length > MAX_FIELDS_PER_SEGMENT) {
      throw new HL7ParseError('HL7 segment exceeds maximum field count');
    }
    const segmentType = segments[0];
    if (!SEGMENT_TYPE_RE.test(segmentType)) {
      throw new HL7ParseError(`Invalid HL7 segment type: ${segmentType}`);
    }

    if (segmentType === 'MSH') {
      mshSeen = true;
      // MSH-9 (message type) is at segments[8] because the field separator
      // immediately follows MSH.
      const typeField = segments[8];
      if (typeof typeField === 'string' && typeField.length > 0) {
        const [msgType, triggerEvent] = typeField.split('^');
        result.messageType = triggerEvent ? `${msgType}^${triggerEvent}` : msgType || 'UNKNOWN';
      }
    } else if (segmentType === 'PID') {
      const pidId = segments[3];
      if (typeof pidId === 'string' && pidId.length > 0) {
        result.patientId = pidId.split('^')[0].slice(0, 128);
      }
      const pidName = segments[5];
      if (typeof pidName === 'string') {
        result.patientName = pidName.replace(/\^/g, ' ').trim().slice(0, 256);
      }
    } else if (segmentType === 'SCH') {
      const schId = segments[2];
      if (typeof schId === 'string' && schId.length > 0) {
        result.appointmentId = schId.split('^')[0].slice(0, 128);
      }
      const schTime = segments[11];
      if (typeof schTime === 'string' && schTime.length > 0) {
        result.appointmentTime = schTime.slice(0, 64);
      }
    }
  }

  if (!mshSeen) {
    throw new HL7ParseError('HL7 message missing MSH segment');
  }
  return result;
}
