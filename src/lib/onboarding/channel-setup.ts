import { prisma } from "@/lib/prisma";
import type { WizardChannelConfig, WizardBrandingConfig, WizardBasics } from "@/lib/onboarding/types";

export interface ChannelSetupResult {
  activated: string[];
  warnings: string[];
}

function defaultEmailAddress(basics: WizardBasics): string {
  const domain = basics.customDomain?.replace(/^https?:\/\//, "").split("/")[0] || "yourcompany.com";
  return `support@${domain}`;
}

export async function setupOnboardingChannels(args: {
  departmentIds: string[];
  basics: WizardBasics;
  channels: WizardChannelConfig;
  branding: WizardBrandingConfig;
}): Promise<ChannelSetupResult> {
  const activated: string[] = [];
  const warnings: string[] = [];
  const emailConfig = args.channels.email;

  if (emailConfig?.enabled) {
    const inbound = emailConfig.inboundAddress || defaultEmailAddress(args.basics);
    const outbound = emailConfig.outboundAddress || inbound;
    await prisma.department.updateMany({
      where: { id: { in: args.departmentIds } },
      data: {
        emailEnabled: true,
        emailInboundAddr: inbound,
        emailFromAddr: outbound,
        emailFromName: args.basics.customerName,
        emailReplyToAddr: outbound,
      },
    });
    activated.push("email");
    if (emailConfig.setupDnsLater) {
      warnings.push("Email DNS setup was deferred.");
    }
  }

  if (args.channels.whatsapp?.enabled) {
    await prisma.department.updateMany({
      where: { id: { in: args.departmentIds } },
      data: { whatsappEnabled: false },
    });
    warnings.push("WhatsApp needs Meta Business setup after wizard completion.");
  }

  if (args.channels.webchat?.enabled) {
    activated.push("webchat");
  }

  if (args.channels.voice?.enabled) {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      activated.push("voice");
      warnings.push("Voice provisioning is marked ready, but Twilio number automation is out of this sprint.");
    } else {
      warnings.push("Voice Agent selected, but Twilio integration is not configured.");
    }
  }

  return { activated, warnings };
}
