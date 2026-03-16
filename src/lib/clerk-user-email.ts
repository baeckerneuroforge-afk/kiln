import { clerkClient } from "@clerk/nextjs/server";

export async function getUserEmailOrPlaceholder(userId: string): Promise<string> {
  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress;

    if (email) {
      return email;
    }
  } catch {
    // Fall back to placeholder below.
  }

  console.warn("User created with placeholder email:", userId);
  return `${userId}@clerk.temp`;
}
