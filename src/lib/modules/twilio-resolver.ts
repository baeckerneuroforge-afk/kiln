import {
  decryptModuleCredentials,
  findModuleConfig,
} from "./store";
import {
  ModuleMissingCredentialsError,
  ModuleNotActiveError,
  type ModuleName,
  type ResolvedTwilioCredentials,
  type TwilioModuleCredentials,
} from "./types";

/**
 * Resolves Twilio credentials (account SID, auth token, phone number)
 * for a Sub-Account in one of the three modes. Behaviour mirrors the
 * AI resolver:
 *
 *   pool           → returns platform defaults from env vars
 *                     (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 *                      TWILIO_<MODULE>_PHONE_NUMBER).
 *   byok_agency    → agency-owned Twilio account.
 *   byok_customer  → end-customer-owned Twilio account.
 *
 * Throws ModuleNotActiveError when the module exists but is inactive.
 */
const TWILIO_MODULES: readonly ModuleName[] = ["sms", "voice", "whatsapp"] as const;

export async function resolveTwilioCredentials(args: {
  subAccountId: string;
  moduleName: ModuleName;
  requireActive?: boolean;
}): Promise<ResolvedTwilioCredentials> {
  if (!TWILIO_MODULES.includes(args.moduleName)) {
    throw new Error(`resolveTwilioCredentials does not support module ${args.moduleName}`);
  }
  const row = await findModuleConfig({ subAccountId: args.subAccountId, moduleName: args.moduleName });
  if (!row) {
    if (args.requireActive !== false) {
      throw new ModuleNotActiveError(args.subAccountId, args.moduleName);
    }
    return defaultPool(args.moduleName);
  }
  if (args.requireActive !== false && !row.isActive) {
    throw new ModuleNotActiveError(args.subAccountId, args.moduleName);
  }
  if (row.mode === "pool") {
    return defaultPool(args.moduleName);
  }

  const creds = decryptModuleCredentials<TwilioModuleCredentials>(row);
  if (!creds || !creds.accountSid || !creds.authToken) {
    throw new ModuleMissingCredentialsError(args.subAccountId, args.moduleName, row.mode as never);
  }
  return {
    accountSid: creds.accountSid,
    authToken: creds.authToken,
    phoneNumber: creds.phoneNumber ?? null,
    byokActive: true,
    mode: row.mode as never,
    credentialsOwner: row.credentialsOwner,
  };
}

function defaultPool(moduleName: ModuleName): ResolvedTwilioCredentials {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const phoneNumber = (() => {
    switch (moduleName) {
      case "sms":
        return process.env.TWILIO_SMS_PHONE_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? null;
      case "voice":
        return process.env.TWILIO_VOICE_PHONE_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? null;
      case "whatsapp":
        return process.env.TWILIO_WHATSAPP_PHONE_NUMBER ?? null;
      default:
        return null;
    }
  })();
  return {
    accountSid,
    authToken,
    phoneNumber,
    byokActive: false,
    mode: "pool",
    credentialsOwner: null,
  };
}
