import { redirect } from "next/navigation";

export default async function ResetPasswordTokenPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ callbackURL?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const callbackURL = resolvedSearchParams.callbackURL
    ? `&callbackURL=${encodeURIComponent(resolvedSearchParams.callbackURL)}`
    : "";

  redirect(`/reset-password?token=${encodeURIComponent(resolvedParams.token)}${callbackURL}`);
}
