import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBEDDING_MODEL, MODEL_CACHE_DIR } from './config.ts';

export type Embed = (texts: string[]) => Promise<number[][]>;

env.cacheDir = MODEL_CACHE_DIR;
// Set HF_OFFLINE=1 to prove the no-key path needs no network once the model is cached.
if (process.env.HF_OFFLINE === '1') env.allowRemoteModels = false;

let extractor: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  // fp32 is the original model; quantized variants are smaller but shift scores slightly,
  // which would invalidate the calibrated refusal threshold.
  extractor ??= pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' });
  return extractor;
}

/** Embeds texts with mean pooling + L2 normalisation (the sentence-transformers recipe for this model). */
export const embed: Embed = async (texts) => {
  if (texts.length === 0) return [];
  const model = await getExtractor();
  const out = await model(texts, { pooling: 'mean', normalize: true });
  return out.tolist() as number[][];
};
