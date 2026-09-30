import { useState } from "react";
import { Platform } from "react-native";
import { SectionCard } from "../../components/shared/SectionCard";
import { PageErrorToast } from "../../components/shared/PageErrorToast";
import { pb } from "../../lib/pocketbase";
import { Button } from "../../ui/Button";

export function FoodJournalExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (Platform.OS !== "web") return null;
  async function download() {
    setBusy(true);
    setError(null);
    const account = pb.authStore.record?.id;
    try {
      if (!pb.authStore.isValid || !account)
        throw new Error("Sign in before exporting your records.");
      const response = await fetch(
        `${pb.baseURL}/api/food-journal/export?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
        { headers: { Authorization: pb.authStore.token }, cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          "Unable to export your records. Check that your photos are available and try again.",
        );
      const blob = await response.blob();
      if (!pb.authStore.isValid || pb.authStore.record?.id !== account)
        throw new Error("Export cancelled because your session changed.");
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "food-journal.zip";
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export records.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title="Export Food Journal"
      description="Download your visits, notes, and photos for import into Productivity. The ZIP contains readable personal data; store it privately. Available on the website only."
    >
      <Button
        label="Download Food Journal ZIP"
        loading={busy}
        onPress={() => {
          void download();
        }}
      />
      <PageErrorToast errorMessage={error} title="Export failed" />
    </SectionCard>
  );
}
