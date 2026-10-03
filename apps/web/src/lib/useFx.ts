import { useEffect, useMemo, useState } from "react";
import { fxStaleness, getRate, setRateOverride, type FxStaleness } from "./fx";
import { EDITABLE_FX, useSettings } from "@/store/settings";

/**
 * Keeps the FX table in step with Settings: every pinned rate (CNY, USD, EUR, GBP) becomes the
 * rate for every "≈" figure, the analysis card, the cost engine and exports. Returns a version
 * number that changes whenever a rate or the display currency changes, so memos can depend on it.
 */
export function useFxOverrides(): number {
  const fxRates = useSettings((s) => s.fxRates);
  const cnyTry = useSettings((s) => s.cost.fxCnyTry);
  const display = useSettings((s) => s.displayCurrency);
  // Apply synchronously on the first render too (idempotent assignment), so the initial paint already uses the user's rate.
  if (getRate("CNY") !== cnyTry) setRateOverride("CNY", cnyTry);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    for (const code of EDITABLE_FX) setRateOverride(code, code === "CNY" ? cnyTry : (fxRates[code] ?? null));
    // Display currency changes bump the version too, so "≈" memos re-run even when no rate moved.
    setVersion((v) => v + 1);
  }, [fxRates, cnyTry, display]);
  return version;
}

/** Age of the reference rate table and which currencies the user pinned (those are never stale). */
export function useFxStaleness(): FxStaleness {
  const version = useFxOverrides();
  return useMemo(() => fxStaleness(), [version]);
}
