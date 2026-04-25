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

type VisaClient = Record<string, unknown>;
type VisaApplication = Record<string, unknown>;

export function encryptVisaClient(client: VisaClient, businessId: string): VisaClient {
  const result = { ...client, encryption_version: 1 };
  for (const field of SENSITIVE_CLIENT_FIELDS) {
    if (field in result) {
      result[field] = encryptFieldSafe(result[field] as string, businessId);
    }
  }
  return result;
}

export function decryptVisaClient(client: VisaClient, businessId: string): VisaClient {
  if (!client) return client;
  const result = { ...client };
  for (const field of SENSITIVE_CLIENT_FIELDS) {
    if (field in result) {
      result[field] = decryptFieldSafe(result[field] as string, businessId);
    }
  }
  return result;
}

export function encryptVisaApplication(app: VisaApplication, businessId: string): VisaApplication {
  const result = { ...app, encryption_version: 1 };
  for (const field of SENSITIVE_APPLICATION_FIELDS) {
    if (field in result) {
      result[field] = encryptFieldSafe(result[field] as string, businessId);
    }
  }
  return result;
}

export function decryptVisaApplication(app: VisaApplication, businessId: string): VisaApplication {
  if (!app) return app;
  const result = { ...app };
  for (const field of SENSITIVE_APPLICATION_FIELDS) {
    if (field in result) {
      result[field] = decryptFieldSafe(result[field] as string, businessId);
    }
  }
  return result;
}