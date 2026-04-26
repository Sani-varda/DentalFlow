import { parseHL7, HL7ParseError } from '../hl7.parser';

describe('parseHL7', () => {
  it('parses a minimal valid SIU^S12 message', () => {
    const msg = [
      'MSH|^~\\&|SENDING|FAC|RECV|FAC|20260101120000||SIU^S12|MSGID|P|2.5',
      'PID|||PAT001||Doe^John',
      'SCH||APT001|||||||||20260102100000',
    ].join('\r');
    const result = parseHL7(msg);
    expect(result.messageType).toBe('SIU^S12');
    expect(result.patientId).toBe('PAT001');
    expect(result.patientName).toBe('Doe John');
    expect(result.appointmentId).toBe('APT001');
    expect(result.appointmentTime).toBe('20260102100000');
  });

  it('tolerates \\n and \\r\\n separators', () => {
    const msg = [
      'MSH|^~\\&|A|B|C|D|20260101||ADT^A04',
      'PID|||PAT002||Smith',
    ].join('\n');
    const result = parseHL7(msg);
    expect(result.messageType).toBe('ADT^A04');
    expect(result.patientId).toBe('PAT002');
  });

  it('throws when MSH segment is missing', () => {
    expect(() => parseHL7('PID|||x||Doe')).toThrow(HL7ParseError);
  });

  it('throws on non-string input', () => {
    expect(() => parseHL7(null as unknown as string)).toThrow(HL7ParseError);
  });

  it('throws when payload exceeds size limit', () => {
    const huge = 'MSH|' + 'x'.repeat(70_000);
    expect(() => parseHL7(huge)).toThrow(HL7ParseError);
  });

  it('rejects invalid segment types', () => {
    const msg = 'MSH|^~\\&|A|B|C|D|20260101||SIU^S12\rXYZ@@@|||bad';
    expect(() => parseHL7(msg)).toThrow(HL7ParseError);
  });
});
