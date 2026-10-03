import type { MarketId } from "@manufactogate/core";
import { COMPARE_CAP } from "@/lib/comparePrefs";
import type { getRegistry } from "@/lib/registry";
import { Card, cn } from "@/components/ui";

export interface MarketPickerProps {
  reg: ReturnType<typeof getRegistry>;
  selected: MarketId[];
  proven: Map<MarketId, number>;
  wave1: MarketId[];
  /** Beta markets verified live (Settings `VERIFIED_MARKETS`). */
  verified: MarketId[];
  /** Markets selling in the user's target country. */
  targetMarkets: MarketId[];
  source: MarketId;
  onToggle: (m: MarketId) => void;
  onReset: () => void;
}

/**
 * Compare market picker (B05): proven markets first, then the hand-calibrated wave-1 set, the
 * verified beta markets, the target country's markets and the rest of the beta list. Capped at
 * `COMPARE_CAP` so a compare never fans out to every market by default.
 */
export function MarketPicker({ reg, selected, proven, wave1, verified, targetMarkets, source, onToggle, onReset }: MarketPickerProps) {
  const all = reg.all();
  const taken = new Set<MarketId>([source]);
  const take = (pred: (id: MarketId) => boolean): MarketId[] => {
    const ids = all.map((a) => a.id).filter((id) => !taken.has(id) && pred(id));
    for (const id of ids) taken.add(id);
    return ids;
  };
  const groups: { label: string; hint: string; ids: MarketId[] }[] = [
    { label: "Kanıtlı", hint: "bu cihazda daha önce sonuç verdi", ids: take((id) => proven.has(id)) },
    { label: "Ana pazarlar", hint: "elle kalibre edilmiş okuyucular", ids: take((id) => wave1.includes(id)) },
    { label: "Doğrulanmış beta", hint: "kalibrasyon turunda canlıda sonuç verdi", ids: take((id) => verified.includes(id)) },
    { label: "Hedef ülke", hint: "hedef ülkede satan pazarlar", ids: take((id) => targetMarkets.includes(id)) },
    { label: "Beta", hint: "genel kart okuma, doğrulanmadı", ids: take(() => true) },
  ];
  const full = selected.length >= COMPARE_CAP;
  return (
    <Card className="mt-2 p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-muted">
          {selected.length}/{COMPARE_CAP} pazar · kaynak pazar her zaman dahil
        </span>
        <button onClick={onReset} className="text-accent hover:underline">otomatiğe dön</button>
      </div>
      {groups.map((g) =>
        g.ids.length ? (
          <div key={g.label} className="mt-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted" title={g.hint}>{g.label}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.ids.map((m) => {
                const on = selected.includes(m);
                return (
                  <button key={m} onClick={() => onToggle(m)} disabled={!on && full} className={cn("chip h-7", on && "chip-on", !on && full && "opacity-50")} aria-pressed={on} title={proven.get(m) ? `${proven.get(m)} ilan kayıtlı` : undefined}>
                    {reg.get(m)?.meta.name ?? m}
                    {proven.get(m) ? <span className="ml-1 text-[10px] text-muted">{proven.get(m)}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
    </Card>
  );
}
