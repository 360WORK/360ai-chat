import type { HardConstraints, LayerRecord } from './types';

interface LooseningLayer extends LayerRecord {
  loosen?: string[];
}

export const accumulateConstraints = (
  layers: LayerRecord[],
): { constraints: Required<HardConstraints>; flags: string[] } => {
  const offLimits = new Set<string>();
  const guardrails = new Set<string>();
  const flags: string[] = [];

  for (const layer of layers) {
    for (const o of layer.hardConstraints?.offLimits ?? []) offLimits.add(o);
    for (const g of layer.hardConstraints?.guardrails ?? []) guardrails.add(g);

    const loosen = (layer as LooseningLayer).loosen ?? [];
    for (const attempt of loosen) {
      flags.push(
        `layer "${layer.id}" attempted to loosen hard constraint "${attempt}" — ignored (tighten-only)`,
      );
    }
  }

  return {
    constraints: { offLimits: [...offLimits], guardrails: [...guardrails] },
    flags,
  };
};
