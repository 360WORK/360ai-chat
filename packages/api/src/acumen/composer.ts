import type { ComposeInput, ComposedPrompt, LayerRecord, UseCaseId } from './types';
import { layerStore, type LayerStore } from './store';
import { lensIdFor } from './grid';
import { mergeFields } from './merge';
import { accumulateConstraints } from './constraints';
import { selectUseCase } from './router';
import { renderPrompt } from './render';

const resolveInstructionLayers = (
  store: LayerStore,
  businessType: ComposeInput['businessType'],
  useCase: UseCaseId | null,
): LayerRecord[] => {
  const ordered: LayerRecord[] = [store.foundations()];
  if (useCase) {
    ordered.push(store.require(`core:${useCase}`));
  }
  if (businessType) {
    const profile = store.get(`profile:${businessType}`);
    if (profile) ordered.push(profile);
    if (useCase) {
      const lensId = lensIdFor(businessType, useCase);
      if (lensId) ordered.push(store.require(lensId));
    }
  }
  return ordered;
};

export const composeSystemPrompt = (
  input: ComposeInput,
  store: LayerStore = layerStore,
): ComposedPrompt => {
  const selected: UseCaseId | null =
    input.useCaseId ?? selectUseCase(input.brief, input.businessType)?.useCaseId ?? null;

  const ordered = resolveInstructionLayers(store, input.businessType, selected);

  // Caching of the assembled instruction-layer prompt is deferred until there is a measured need (LayerStore is versioned, so it can be keyed by id@version when added).
  const fields = mergeFields(ordered);
  const { constraints, flags } = accumulateConstraints(ordered);

  const prompt = renderPrompt({
    ordered,
    fields,
    constraints,
    userContext: input.userContext,
    brief: input.brief,
  });

  return { prompt, resolvedLayers: ordered.map((l) => l.id), selectedUseCase: selected, flags };
};
