import { useState } from "react";
import { Platform } from "react-native";
import { SectionCard } from "../../components/shared/SectionCard";
import { PageErrorToast } from "../../components/shared/PageErrorToast";
import { pb } from "../../lib/pocketbase";
import { Button } from "../../ui/Button";

export function FoodJournalExportSection({ scope = "journal" }: { scope?: "journal" | "food-products" }) {
  const productsOnly = scope === "food-products";
  const exportName = productsOnly ? "Food Products" : "Food Journal";
  const fileName = productsOnly ? "food-products" : "food-journal";
  const [busyPart, setBusyPart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{
    parts: number;
    snapshot: string;
    timezone: string;
  } | null>(null);
  const [downloaded, setDownloaded] = useState<number[]>([]);
  if (Platform.OS !== "web") return null;
  async function download(part = 1, restart = false) {
    setBusyPart(part);
    setError(null);
    const account = pb.authStore.record?.id;
    const currentPlan = restart ? null : plan;
    const timezone =
      currentPlan?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (!pb.authStore.isValid || !account)
        throw new Error("Sign in before exporting your records.");
      const query = new URLSearchParams({ timezone, part: String(part), scope });
      if (currentPlan) query.set("snapshot", currentPlan.snapshot);
      const response = await fetch(
        `${pb.baseURL}/api/food-journal/export?${query}`,
        { headers: { Authorization: pb.authStore.token }, cache: "no-store" },
      );
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(
          typeof failure?.message === "string"
            ? failure.message
            : "Unable to export your records. Try again.",
        );
      }
      const parts = Number(response.headers.get("X-Food-Journal-Parts"));
      const snapshot = response.headers.get("X-Food-Journal-Snapshot") ?? "";
      if (
        !Number.isSafeInteger(parts) ||
        parts < 1 ||
        parts > 1000 ||
        !/^[a-f0-9]{64}$/.test(snapshot)
      )
        throw new Error(
          "The export response is incomplete. Refresh the website and try again.",
        );
      const blob = await response.blob();
      if (!pb.authStore.isValid || pb.authStore.record?.id !== account)
        throw new Error("Export cancelled because your session changed.");
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download =
          parts > 1
            ? `${fileName}-part-${part}-of-${parts}.zip`
            : `${fileName}.zip`;
        anchor.click();
        setPlan({ parts, snapshot, timezone });
        setDownloaded((previous) =>
          previous.includes(part) ? previous : [...previous, part],
        );
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export records.");
    } finally {
      setBusyPart(null);
    }
  }
  return (
    <SectionCard
      title={`Export ${exportName}`}
      description={plan && plan.parts > 1
        ? `Your export has ${plan.parts} ZIP parts. Download every part, then import each file into Food Journal in Productivity. Existing imported records are reused. The ZIPs contain readable personal data; store them privately.`
        : productsOnly
        ? "Download your food products, ratings, categories, locations, notes, and photos for import into Productivity Food Journal. Large libraries use numbered ZIP parts. The ZIPs contain readable personal data; store them privately. Available on the website only."
        : "Download your visits, notes, and photos for import into Productivity. Large libraries use numbered ZIP parts. The ZIPs contain readable personal data; store them privately. Available on the website only."}
    >
      {plan && plan.parts > 1 ? (
        <>
          {Array.from({ length: plan.parts }, (_, index) => index + 1).map((part) => (
            <Button
              key={part}
              label={`Download part ${part} of ${plan.parts}${downloaded.includes(part) ? " again" : ""}`}
              loading={busyPart === part}
              disabled={busyPart !== null}
              onPress={() => {
                void download(part);
              }}
            />
          ))}
          <Button
            label="Start a new export"
            disabled={busyPart !== null}
            onPress={() => {
              setPlan(null);
              setDownloaded([]);
              setError(null);
            }}
          />
        </>
      ) : (
        <Button
          label={`Download ${exportName} ZIP`}
          loading={busyPart !== null}
          onPress={() => {
            setPlan(null);
            setDownloaded([]);
            void download(1, true);
          }}
        />
      )}
      <PageErrorToast errorMessage={error} title="Export failed" />
    </SectionCard>
  );
}
