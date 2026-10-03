import { useEffect, useState } from "react";
import { getRate, setRateOverride } from "./fx";
import { useSettings } from "@/store/settings";

/**
 * Keeps the display FX table in step with Settings: the user's CNY rate becomes the CNY→TRY rate
 * for every "≈" figure, the analysis card and exports. Returns a version number that changes
 * whenever a rate or the display currency changes, so memos can depend on it.
 */
export function useFxOverrides(): number {
  const cnyTry = useSettings((s) => s.cost.fxCnyTry);
  const display = useSettings((s) => s.displayCurrency);
  // Apply synchronously on the first render too (idempotent assignment), so the initial paint already uses the user's rate.
  if (getRate("CNY") !== cnyTry) setRateOverride("CNY", cnyTry);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setRateOverride("CNY", cnyTry);
    setVersion((v) => v + 1);
  }, [cnyTry, display]);
  return version;
}
