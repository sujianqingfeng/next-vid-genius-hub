import { os } from "@orpc/server";
import { z } from "zod";
import { AIModelIds } from "~/lib/ai/models";
import { subtitleRenderConfigSchema } from "~/lib/subtitle/types";
import { subtitleService } from "~/lib/services/subtitle/subtitle.service";

export const transcribe = os
  .input(
    z.object({
      mediaId: z.string(),
      model: z.enum([
        "whisper-large",
        "whisper-medium",
        "whisper-tiny-en",
        "whisper-large-v3-turbo",
      ]),
      provider: z.enum(["local", "cloudflare"]).default("local"),
      downsampleBackend: z
        .enum(["auto", "local", "cloud"])
        .default("auto")
        .optional(),
    }),
  )
  .handler(async ({ input }) => {
    const res = await subtitleService.transcribe(input)
    return { success: true, transcription: res.transcription }
  });

const translateInput = z.object({
  mediaId: z.string(),
  model: z.enum(AIModelIds),
  promptId: z.string().optional(),
});
export const translate = os.input(translateInput).handler(async ({ input }) => {
  const res = await subtitleService.translate(input)
  return res
});

// 使用新架构中的Schema，移除重复定义

export const render = os
  .input(
    z.object({
      mediaId: z.string(),
      subtitleConfig: subtitleRenderConfigSchema.optional(),
      backend: z.enum(["local", "cloud"]).optional().default("local"),
    }),
  )
  .handler(async ({ input }) => {
    return subtitleService.render(input)
  });

export const updateTranslation = os
  .input(
    z.object({
      mediaId: z.string(),
      translation: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    return subtitleService.updateTranslation(input)
  });

export const deleteTranslationCue = os
  .input(
    z.object({
      mediaId: z.string(),
      index: z.number().min(0),
    }),
  )
  .handler(async ({ input }) => {
    return subtitleService.deleteTranslationCue(input)
  });

// Cloud rendering: start job explicitly
export const startCloudRender = os
  .input(
    z.object({
      mediaId: z.string(),
      subtitleConfig: subtitleRenderConfigSchema.optional(),
    }),
  )
  .handler(async ({ input }) => {
    return subtitleService.startCloudRender(input)
  });

// Cloud rendering: get status
export const getRenderStatus = os
  .input(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ input }) => {
    return subtitleService.getRenderStatus(input)
  });

// Optimize transcription using per-word timings + AI segmentation
export const optimizeTranscription = os
  .input(
    z.object({
      mediaId: z.string(),
      model: z.enum(AIModelIds),
      pauseThresholdMs: z.number().min(0).max(5000).default(480),
      maxSentenceMs: z.number().min(1000).max(30000).default(8000),
      maxChars: z.number().min(10).max(160).default(68),
      lightCleanup: z.boolean().optional().default(false),
      textCorrect: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ input }) => {
    return subtitleService.optimizeTranscription(input)
  });

// Restore transcription from original backup if available
export const clearOptimizedTranscription = os
  .input(z.object({ mediaId: z.string() }))
  .handler(async ({ input }) => {
    return subtitleService.clearOptimizedTranscription(input)
  });
