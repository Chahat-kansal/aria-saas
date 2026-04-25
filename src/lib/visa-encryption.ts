import { encryptFieldSafe, decryptFieldSafe } from './encryption';

const SENSITIVE_CLIENT_FIELDS = [
  'full_name',
  'date_of_birth',
  'passport_number',
  'phone',
  'email',
  'address',
  'tax_file_number',
] as const;

const SENSITIVE_APPLICATION_FIELDS = [
  'notes',
  'personal_circumstances',
] as const;

type AnyRecord = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutateFields(obj: any, fields: readonly string[], fn: (v: string) => string | null): any {
  for (const field of fields) {
    if (field in obj) {
      obj[field] = fn(obj[field] as string);
    }
  }
  return obj;
}

export function encryptVisaClient(client: AnyRecord, businessId: string): AnyRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = { ...client, encryption_version: 1 };
  return mutateFields(result, SENSITIVE_CLIENT_FIELDS, v => encryptFieldSafe(v, businessId));
}

export function decryptVisaClient(client: AnyRecord, businessId: string): AnyRecord {
  if (!client) return client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = { ...client };
  return mutateFields(result, SENSITIVE_CLIENT_FIELDS, v => decryptFieldSafe(v, businessId));
}

export function encryptVisaApplication(app: AnyRecord, businessId: string): AnyRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = { ...app, encryption_version: 1 };
  return mutateFields(result, SENSITIVE_APPLICATION_FIELDS, v => encryptFieldSafe(v, businessId));
}

export function decryptVisaApplication(app: AnyRecord, businessId: string): AnyRecord {
  if (!app) return app;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = { ...app };
  return mutateFields(result, SENSITIVE_APPLICATION_FIELDS, v => decryptFieldSafe(v, businessId));
}