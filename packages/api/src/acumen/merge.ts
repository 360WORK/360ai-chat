import type { LayerFields, LayerRecord, TierSpec } from './types';

const lastDefined = <T>(values: (T | undefined)[]): T | undefined => {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== undefined) {
      return values[i];
    }
  }
  return undefined;
};

export const mergeFields = (layersLowToHigh: LayerRecord[]): LayerFields => {
  const f = layersLowToHigh.map((l) => l.fields);

  const openingCopy = lastDefined(f.map((x) => x.openingCopy));
  const starters = lastDefined(f.map((x) => x.starters));
  const vocabulary = lastDefined(f.map((x) => x.vocabulary));
  const tiering = lastDefined<TierSpec[]>(f.map((x) => x.tiering));

  const thresholds = f.reduce<Record<string, number>>((acc, x) => {
    return x.thresholds ? { ...acc, ...x.thresholds } : acc;
  }, {});

  const outputAdditions = [
    ...new Set(f.flatMap((x) => x.outputAdditions ?? [])),
  ];

  const merged: LayerFields = {};
  if (openingCopy !== undefined) merged.openingCopy = openingCopy;
  if (starters !== undefined) merged.starters = starters;
  if (vocabulary !== undefined) merged.vocabulary = vocabulary;
  if (tiering !== undefined) merged.tiering = tiering;
  if (Object.keys(thresholds).length) merged.thresholds = thresholds;
  if (outputAdditions.length) merged.outputAdditions = outputAdditions;
  return merged;
};
