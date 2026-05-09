export {
  findCustomerProfile,
  identifyCustomer,
  mergeCustomerProfiles,
  normalizeEmail,
  normalizePhone,
} from "./identifier";
export type {
  CustomerIdentifierInput,
  IdentifyCustomerArgs,
  MergeCustomerProfilesArgs,
} from "./identifier";

export {
  buildMemorySummary,
  formatMemoryForPrompt,
  getRelevantMemory,
} from "./retriever";
export type { CustomerMemorySummary, MemoryRetrievalContext } from "./retriever";

export {
  deactivateMemoryEntry,
  extractFactsFromConversation,
  recordInteraction,
  upsertPreference,
} from "./writer";
export type {
  CustomerMemorySource,
  CustomerMemoryType,
  DeactivateMemoryArgs,
  ExtractFactsArgs,
  RecordInteractionArgs,
  UpsertPreferenceArgs,
} from "./writer";

export {
  anonymizeCustomerProfile,
  deleteCustomerProfile,
  exportCustomerProfile,
  recordConsent,
} from "./dsgvo";
export type {
  AnonymizeArgs,
  CustomerExportPayload,
  DeleteCustomerArgs,
  RecordConsentArgs,
} from "./dsgvo";
