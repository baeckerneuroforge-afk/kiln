import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg font-serif text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
        >
          K
        </div>
        <span className="font-serif text-xl text-foreground">KILN</span>
      </Link>
      <SignIn
        appearance={{
          elements: {
            socialButtonsBlockButton: "font-medium",
          },
        }}
      />
      <p className="mt-6 text-xs text-muted-foreground">
        Sign in with email, Google, or GitHub
      </p>
    </div>
  );
}
