import {
  buildColoringPrompt,
  defaultCustomProviderBaseUrl,
  defaultCustomProviderModel,
  buildImageAnimePrompt,
  buildImageLineartPrompt,
  buildImageRestorePrompt,
  buildTextImagePrompt,
  type CustomAiSettings,
  type EcommerceDirection,
  getOutputSizeByQuality,
  type ImageProviderMode,
  type TextProviderMode,
} from "@/lib/coloring";

const upstreamTimeoutMs = 200_000;
const nativeFalPollTimeoutMs = 200_000;
const nativeFalPollIntervalMs = 2_500;
const apimartPollTimeoutMs = 200_000;
const apimartInitialPollDelayMs = 10_000;
const apimartPollIntervalMs = 4_000;

type OpenAiImagePayload = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

type ProviderTestResult = {
  modelExists: boolean;
  supportsImageGeneration: boolean | null;
  tone: "success" | "error" | "info";
  message: string;
};

type ModelsPayload = {
  data?: Array<{ id?: string }>;
};

function resolveCustomProviderConfig(settings?: CustomAiSettings) {
  return {
    baseUrl: settings?.baseUrl?.trim() || defaultCustomProviderBaseUrl,
    apiKey: settings?.apiKey?.trim() || "",
    model: settings?.model?.trim() || defaultCustomProviderModel,
  };
}

function escapeXml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getFallbackSvg(prompt: string, style: string) {
  const safePrompt = escapeXml(prompt.trim() || "Coloring page");
  const title = safePrompt.length > 52 ? `${safePrompt.slice(0, 49)}...` : safePrompt;
  const accent =
    style === "mandala"
      ? "12"
      : style === "fantasy"
        ? "18"
        : style === "storybook"
          ? "24"
          : "36";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect width="100%" height="100%" fill="white" />
      <rect x="34" y="34" width="956" height="956" rx="30" fill="none" stroke="black" stroke-width="10" />
      <circle cx="155" cy="160" r="56" fill="none" stroke="black" stroke-width="8" />
      <circle cx="870" cy="165" r="46" fill="none" stroke="black" stroke-width="8" />
      <path d="M115 860c120-80 225-126 315-126s200 38 345 136" fill="none" stroke="black" stroke-width="10" stroke-linecap="round" />
      <path d="M182 724c66-96 146-142 237-142 102 0 185 44 257 133 28 35 70 55 117 55 51 0 97-18 133-49" fill="none" stroke="black" stroke-width="8" stroke-linecap="round" />
      <path d="M239 240c112 74 219 112 321 112s210-37 323-111" fill="none" stroke="black" stroke-width="8" stroke-linecap="round" />
      <path d="M294 531c72-96 148-143 228-143 86 0 158 46 221 142" fill="none" stroke="black" stroke-width="8" stroke-linecap="round" />
      <rect x="180" y="435" width="664" height="216" rx="30" fill="none" stroke="black" stroke-width="9" />
      <text x="512" y="515" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="black">AI Coloring Page</text>
      <text x="512" y="570" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="black">${title}</text>
      <text x="512" y="617" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="black">Style: ${escapeXml(style)}</text>
      <g stroke="black" fill="none" stroke-width="6">
        <circle cx="512" cy="224" r="${accent}" />
        <circle cx="452" cy="224" r="${accent}" />
        <circle cx="572" cy="224" r="${accent}" />
        <circle cx="420" cy="770" r="${accent}" />
        <circle cx="512" cy="812" r="${accent}" />
        <circle cx="604" cy="770" r="${accent}" />
      </g>
    </svg>
  `;
}

async function generateFallbackPng(prompt: string, style: string) {
  const { loadSharp } = await import("@/lib/sharp-loader");
  const sharp = await loadSharp();
  const svg = getFallbackSvg(prompt, style);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function resizeOutputBuffer(buffer: Buffer, targetSize: number) {
  let sharp: Awaited<
    ReturnType<typeof import("@/lib/sharp-loader").loadSharp>
  >;

  try {
    const { loadSharp } = await import("@/lib/sharp-loader");
    sharp = await loadSharp();
  } catch {
    return buffer;
  }

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const longestSide = Math.max(width, height);

  if (!targetSize || longestSide === targetSize) {
    return sharp(buffer).png().toBuffer();
  }

  if (longestSide > targetSize) {
    return sharp(buffer)
      .resize(
        width >= height
          ? { width: targetSize, fit: "inside", kernel: sharp.kernel.lanczos3 }
          : { height: targetSize, fit: "inside", kernel: sharp.kernel.lanczos3 },
      )
      .png()
      .toBuffer();
  }

  return sharp(buffer)
    .resize({
      width: targetSize,
      height: targetSize,
      fit: "contain",
      background: "white",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .sharpen()
    .png()
    .toBuffer();
}

async function fetchWithTimeout(
  input: URL | string,
  init: RequestInit,
  timeoutMs = upstreamTimeoutMs,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("上游图片服务响应超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as unknown;
  }

  return await response.text();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorPayload(payload: unknown, status: number, fallback: string) {
  if (typeof payload === "string") {
    const detail = payload.replaceAll(/\s+/g, " ").trim().slice(0, 180);

    if (detail.startsWith("<")) {
      return `${fallback}：上游服务返回了 HTML 页面，请检查接口地址是否正确，或该模型是否支持图片生成。`;
    }

    if (detail) {
      return `${fallback}：${detail}`;
    }
  }

  const detail = getPayloadErrorMessage(payload);

  if (detail) {
    return detail;
  }

  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const errorValue = payload.error;

    if (
      typeof errorValue === "object" &&
      errorValue !== null &&
      "message" in errorValue &&
      typeof errorValue.message === "string"
    ) {
      return errorValue.message;
    }

    if (typeof errorValue === "string") {
      return errorValue;
    }
  }

  return `${fallback}：${status}`;
}

function getPayloadErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.replaceAll(/\s+/g, " ").trim();
  }

  if (typeof payload === "object" && payload !== null) {
    if ("message" in payload && typeof payload.message === "string") {
      return payload.message;
    }

    if ("msg" in payload && typeof payload.msg === "string") {
      return payload.msg;
    }
  }

  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const errorValue = payload.error;

    if (
      typeof errorValue === "object" &&
      errorValue !== null &&
      "message" in errorValue &&
      typeof errorValue.message === "string"
    ) {
      return errorValue.message;
    }

    if (typeof errorValue === "string") {
      return errorValue;
    }
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    typeof payload.data === "object" &&
    payload.data !== null
  ) {
    const dataValue = payload.data;

    if ("message" in dataValue && typeof dataValue.message === "string") {
      return dataValue.message;
    }

    if (
      "error" in dataValue &&
      typeof dataValue.error === "object" &&
      dataValue.error !== null &&
      "message" in dataValue.error &&
      typeof dataValue.error.message === "string"
    ) {
      return dataValue.error.message;
    }
  }

  return "";
}

function logImageAttempt(options: {
  type:
    | "generation"
    | "generation-task-poll"
    | "edit"
    | "edit-task-poll"
    | "edit-native-submit"
    | "edit-native-poll";
  endpoint: string;
  model: string;
  size: string;
  variant: string;
  response: Response;
  payload: unknown;
}) {
  const detail = getPayloadErrorMessage(options.payload);
  const summary = [
    `[iColoring] ${options.type} attempt`,
    `model=${options.model}`,
    `size=${options.size}`,
    `variant=${options.variant}`,
    `status=${options.response.status}`,
    `endpoint=${options.endpoint}`,
  ].join(" | ");

  if (options.response.ok) {
    console.info(summary);
    return;
  }

  console.warn(`${summary} | detail=${detail || "empty"}`);
}

async function generateWithPollinationsPrompt(styledPrompt: string) {
  const url = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(styledPrompt)}`,
  );
  url.searchParams.set("width", "1024");
  url.searchParams.set("height", "1024");
  url.searchParams.set("seed", String(Math.floor(Math.random() * 1_000_000)));
  url.searchParams.set("model", "flux");
  url.searchParams.set("nologo", "true");
  url.searchParams.set("private", "true");
  url.searchParams.set("safe", "true");
  url.searchParams.set("enhance", "true");

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "image/png,image/jpeg;q=0.9,*/*;q=0.8",
      "User-Agent": "iColoring-MVP/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Pollinations request failed with ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function normalizeImageEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/images/generations")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/images/generations`;
  }

  return `${trimmed}/v1/images/generations`;
}

function normalizeImageEditEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/images/edits")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/images/edits`;
  }

  return `${trimmed}/v1/images/edits`;
}

function normalizeModelsEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/models")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/models`;
  }

  return `${trimmed}/v1/models`;
}

function getBaseOrigin(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const imageGenerationSuffix = "/v1/images/generations";
  const imageEditSuffix = "/v1/images/edits";
  const modelsSuffix = "/v1/models";

  if (trimmed.endsWith("/v1")) {
    return trimmed.slice(0, -3);
  }

  if (trimmed.endsWith(imageGenerationSuffix)) {
    return trimmed.slice(0, -imageGenerationSuffix.length);
  }

  if (trimmed.endsWith(imageEditSuffix)) {
    return trimmed.slice(0, -imageEditSuffix.length);
  }

  if (trimmed.endsWith(modelsSuffix)) {
    return trimmed.slice(0, -modelsSuffix.length);
  }

  return trimmed;
}

function isQingyunTopBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return /(^|\.)qingyuntop\.top$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isApimartBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return /(^|\.)apimart\.ai$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isApimartImageModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return normalized === "gpt-image-2" || normalized === "gpt-image-2-official";
}

function isApimartOfficialImageModel(model: string) {
  return model.trim().toLowerCase() === "gpt-image-2-official";
}

function shouldUseApimartImageApi(baseUrl: string, model: string) {
  return isApimartBaseUrl(baseUrl) && isApimartImageModel(model);
}

function getQingyunNativeFalModel(model: string) {
  const normalized = model.trim().toLowerCase();

  if (
    normalized === "flux-dev" ||
    normalized === "flux-1/dev" ||
    normalized === "fal-ai/flux-1/dev" ||
    normalized === "flux-1/dev/image-to-image" ||
    normalized === "fal-ai/flux-1/dev/image-to-image"
  ) {
    return "fal-ai/flux-1/dev/image-to-image";
  }

  if (
    normalized === "flux-schnell" ||
    normalized === "flux-redux-schnell" ||
    normalized === "flux-1/schnell" ||
    normalized === "fal-ai/flux-1/schnell" ||
    normalized === "flux-1/schnell/redux" ||
    normalized === "fal-ai/flux-1/schnell/redux"
  ) {
    return "fal-ai/flux-1/schnell/redux";
  }

  return null;
}

function shouldRetryWithoutResponseFormat(payload: unknown) {
  const responseFormatErrorPattern =
    /unknown parameter:\s*['"]?response_format['"]?|response_format.*cannot unmarshal|string into .*response_format|invalid request body.*response_format|response_format.*invalid|unsupported.*response_format/i;

  if (typeof payload === "string") {
    return responseFormatErrorPattern.test(payload);
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return responseFormatErrorPattern.test(payload.error.message);
  }

  return false;
}

function shouldRetryWithDifferentSize(payload: unknown) {
  if (typeof payload === "string") {
    return /(?:unknown|unsupported|invalid).*(?:size)|(?:size).*(?:unknown|unsupported|invalid)|not support.*size/i.test(
      payload,
    );
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return /(?:unknown|unsupported|invalid).*(?:size)|(?:size).*(?:unknown|unsupported|invalid)|not support.*size/i.test(
      payload.error.message,
    );
  }

  return false;
}

function isUnsupportedImageEditInterface(payload: unknown) {
  const message = getPayloadErrorMessage(payload);
  return /暂不支持该接口|unsupported.*interface|not support.*interface|not supported.*interface|unsupported.*images\/edits|not support.*images\/edits|暂不支持.*edits/i.test(
    message,
  );
}

function shouldFallbackToNativeFalRoute(payload: unknown, error?: unknown) {
  const message =
    getPayloadErrorMessage(payload) ||
    (error instanceof Error ? error.message : "");

  return /暂不支持该接口|unsupported.*interface|not support.*interface|not supported.*interface|unsupported.*images\/edits|not support.*images\/edits|暂不支持.*edits|上游图片服务响应超时/i.test(
    message,
  );
}

function getAiSizeCandidates(targetSize: number) {
  if (targetSize >= 2048) {
    return ["2048x2048", "1024x1024"];
  }

  return ["1024x1024"];
}

function getGenerationSizeCandidates(
  baseUrl: string,
  model: string,
  targetSize: number,
) {
  if (shouldUseApimartImageApi(baseUrl, model)) {
    return ["1:1"];
  }

  return getAiSizeCandidates(targetSize);
}

function getApimartResolution(targetSize: number) {
  return targetSize >= 2048 ? "2k" : "1k";
}

function buildApimartImageBody(options: {
  model: string;
  prompt: string;
  size: string;
  targetSize: number;
  imageUrls?: string[];
}) {
  const body: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
    size: options.size,
    n: 1,
  };

  if (isApimartOfficialImageModel(options.model)) {
    body.resolution = getApimartResolution(options.targetSize);
  }

  if (options.imageUrls?.length) {
    body.image_urls = options.imageUrls;
  }

  return body;
}

function buildGenerationRequestBodyVariants(options: {
  baseUrl: string;
  model: string;
  prompt: string;
  size: string;
  targetSize: number;
}) {
  if (shouldUseApimartImageApi(options.baseUrl, options.model)) {
    return [
      {
        label: isApimartOfficialImageModel(options.model)
          ? "apimart-official"
          : "apimart",
        body: buildApimartImageBody({
          model: options.model,
          prompt: options.prompt,
          size: options.size,
          targetSize: options.targetSize,
        }),
      },
    ] as const;
  }

  return [
    {
      label: "full",
      body: {
        model: options.model,
        prompt: options.prompt,
        size: options.size,
        n: 1,
        response_format: "b64_json",
      } satisfies Record<string, unknown>,
    },
    {
      label: "no-response-format",
      body: {
        model: options.model,
        prompt: options.prompt,
        size: options.size,
        n: 1,
      } satisfies Record<string, unknown>,
    },
    {
      label: "minimal",
      body: {
        model: options.model,
        prompt: options.prompt,
        size: options.size,
      } satisfies Record<string, unknown>,
    },
  ] as const;
}

function shouldRetryWithSimplerGenerationBody(
  payload: unknown,
  status: number,
) {
  if (shouldRetryWithoutResponseFormat(payload)) {
    return true;
  }

  if (shouldRetryWithDifferentSize(payload)) {
    return false;
  }

  const bodyShapeErrorPattern =
    /invalid request body|cannot unmarshal|json:\s*cannot unmarshal|unknown parameter|unsupported.*parameter|unsupported.*field|unexpected.*field|invalid.*field|extra inputs? are not permitted|unrecognized.*field|unknown field|\bn\b.*(?:invalid|unsupported|unknown)|(?:invalid|unsupported|unknown).*\bn\b/i;

  if (typeof payload === "string") {
    return bodyShapeErrorPattern.test(payload) || status === 400 || status === 422;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return (
      bodyShapeErrorPattern.test(payload.error.message) ||
      status === 400 ||
      status === 422
    );
  }

  return status === 400 || status === 422;
}

async function requestCustomProviderModels(baseUrl: string, apiKey: string) {
  const endpoint = normalizeModelsEndpoint(baseUrl);
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
    20_000,
  );
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new Error(
      formatErrorPayload(payload, response.status, "AI 服务模型列表获取失败"),
    );
  }

  if (typeof payload === "string") {
    throw new Error(
      "模型列表获取失败：接口返回了非 JSON 内容，请检查接口地址是否正确。",
    );
  }

  return payload as ModelsPayload;
}

async function decodeOpenAiImageResponse(
  payload: unknown,
  options?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    size?: string;
    type?: "generation-task-poll" | "edit-task-poll";
  },
) {
  if (
    options?.baseUrl &&
    options.apiKey &&
    options.model &&
    options.type &&
    shouldUseApimartImageApi(options.baseUrl, options.model)
  ) {
    const taskId = getApimartSubmittedTaskId(payload);

    if (taskId) {
      const taskPayload = await pollApimartTaskResult({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        size: options.size ?? "1:1",
        taskId,
        type: options.type,
      });
      const imageUrl = getApimartCompletedImageUrl(taskPayload);

      if (!imageUrl) {
        throw new Error("AI 图片任务已完成，但未返回图片地址。");
      }

      return downloadImageBuffer(imageUrl);
    }
  }

  const result = payload as OpenAiImagePayload;

  if (result.error?.message) {
    throw new Error(result.error.message);
  }

  const firstImage = result.data?.[0];

  if (!firstImage) {
    throw new Error("AI 服务没有返回图片数据。");
  }

  if (firstImage.b64_json) {
    return Buffer.from(firstImage.b64_json, "base64");
  }

  if (firstImage.url) {
    return downloadImageBuffer(firstImage.url);
  }

  throw new Error("AI 服务返回了未知的图片格式。");
}

async function requestCustomProviderImage(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
) {
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await readResponsePayload(response);

  return { response, payload };
}

function getApimartTaskEndpoint(baseUrl: string, taskId: string) {
  return `${normalizeImageEndpoint(getBaseOrigin(baseUrl)).replace("/images/generations", "")}/tasks/${encodeURIComponent(taskId)}?language=zh`;
}

function getApimartSubmittedTaskId(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !Array.isArray(payload.data)
  ) {
    return null;
  }

  const firstTask = payload.data[0];

  if (
    typeof firstTask === "object" &&
    firstTask !== null &&
    "task_id" in firstTask &&
    typeof firstTask.task_id === "string"
  ) {
    return firstTask.task_id;
  }

  return null;
}

function getApimartCompletedImageUrl(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    typeof payload.data !== "object" ||
    payload.data === null ||
    !("result" in payload.data) ||
    typeof payload.data.result !== "object" ||
    payload.data.result === null ||
    !("images" in payload.data.result) ||
    !Array.isArray(payload.data.result.images)
  ) {
    return null;
  }

  const firstImage = payload.data.result.images[0];

  if (
    typeof firstImage !== "object" ||
    firstImage === null ||
    !("url" in firstImage)
  ) {
    return null;
  }

  if (typeof firstImage.url === "string") {
    return firstImage.url;
  }

  if (Array.isArray(firstImage.url) && typeof firstImage.url[0] === "string") {
    return firstImage.url[0];
  }

  return null;
}

async function downloadImageBuffer(url: string) {
  const imageResponse = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "image/png,image/jpeg;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    },
    upstreamTimeoutMs,
  );

  if (!imageResponse.ok) {
    throw new Error(`下载生成图片失败：${imageResponse.status}`);
  }

  return Buffer.from(await imageResponse.arrayBuffer());
}

async function pollApimartTaskResult(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: string;
  taskId: string;
  type: "generation-task-poll" | "edit-task-poll";
}) {
  const endpoint = getApimartTaskEndpoint(options.baseUrl, options.taskId);
  const startedAt = Date.now();
  let firstPoll = true;
  let lastPayload: unknown = null;

  while (Date.now() - startedAt < apimartPollTimeoutMs) {
    if (firstPoll) {
      await sleep(apimartInitialPollDelayMs);
      firstPoll = false;
    } else {
      await sleep(apimartPollIntervalMs);
    }

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
      upstreamTimeoutMs,
    );
    const payload = await readResponsePayload(response);
    lastPayload = payload;
    logImageAttempt({
      type: options.type,
      endpoint,
      model: options.model,
      size: options.size,
      variant: "apimart-task",
      response,
      payload,
    });

    if (!response.ok) {
      throw new Error(
        formatErrorPayload(payload, response.status, "AI 图片任务查询失败"),
      );
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("data" in payload) ||
      typeof payload.data !== "object" ||
      payload.data === null ||
      !("status" in payload.data) ||
      typeof payload.data.status !== "string"
    ) {
      throw new Error("AI 图片任务查询返回了未知的结果格式。");
    }

    const status = payload.data.status.toLowerCase();

    if (status === "completed") {
      return payload;
    }

    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(getPayloadErrorMessage(payload) || "AI 图片任务执行失败。");
    }
  }

  throw new Error(
    `AI 图片任务等待超时，请稍后重试。最后一次响应：${getPayloadErrorMessage(lastPayload) || "队列处理中"}`,
  );
}

async function requestCustomProviderImageEdit(
  endpoint: string,
  apiKey: string,
  body: FormData,
) {
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    cache: "no-store",
  });
  const payload = await readResponsePayload(response);

  return { response, payload };
}

async function requestNativeFalTask(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
) {
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
    upstreamTimeoutMs,
  );
  const payload = await readResponsePayload(response);

  return { response, payload };
}

async function pollNativeFalResult(
  endpoint: string,
  apiKey: string,
  model: string,
  size: string,
) {
  const startedAt = Date.now();
  let lastPayload: unknown = null;

  while (Date.now() - startedAt < nativeFalPollTimeoutMs) {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
      upstreamTimeoutMs,
    );
    const payload = await readResponsePayload(response);
    lastPayload = payload;
    logImageAttempt({
      type: "edit-native-poll",
      endpoint,
      model,
      size,
      variant: "poll",
      response,
      payload,
    });

    if (!response.ok) {
      throw new Error(
        formatErrorPayload(payload, response.status, "AI 图片编辑任务查询失败"),
      );
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "images" in payload &&
      Array.isArray(payload.images) &&
      payload.images.length > 0
    ) {
      return payload;
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "status" in payload &&
      typeof payload.status === "string"
    ) {
      const status = payload.status.toUpperCase();

      if (status === "COMPLETED") {
        return payload;
      }

      if (status === "FAILED" || status === "ERROR" || status === "CANCELLED") {
        throw new Error(
          getPayloadErrorMessage(payload) || "AI 图片编辑任务执行失败。",
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, nativeFalPollIntervalMs));
  }

  throw new Error(
    `AI 图片编辑任务等待超时，请稍后重试。最后一次响应：${getPayloadErrorMessage(lastPayload) || "队列处理中"}`,
  );
}

async function decodeNativeFalImageResponse(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "images" in payload &&
    Array.isArray(payload.images)
  ) {
    const firstImage = payload.images[0] as
      | { url?: string; image?: { url?: string } }
      | undefined;
    const url = firstImage?.url ?? firstImage?.image?.url;

    if (!url) {
      throw new Error("AI 图片编辑任务未返回图片地址。");
    }

    return downloadImageBuffer(url);
  }

  throw new Error("AI 图片编辑任务返回了未知的结果格式。");
}

async function generateEditedImageWithQingyunNativeFal(
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  targetSize: number,
) {
  const nativeModel = getQingyunNativeFalModel(model);

  if (!nativeModel) {
    throw new Error("当前模型没有可用的青云原生图片编辑路由。");
  }

  const endpoint = `${getBaseOrigin(baseUrl)}/${nativeModel}`;
  const imageUrl = `data:${mimeType || "image/png"};base64,${imageBuffer.toString("base64")}`;
  const taskBody: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
  };
  const submitResult = await requestNativeFalTask(endpoint, apiKey, taskBody);

  logImageAttempt({
    type: "edit-native-submit",
    endpoint,
    model,
    size: targetSize >= 2048 ? "2048" : "1024",
    variant: "native-fal",
    response: submitResult.response,
    payload: submitResult.payload,
  });

  if (!submitResult.response.ok) {
    throw new Error(
      formatErrorPayload(
        submitResult.payload,
        submitResult.response.status,
        "AI 图片编辑任务创建失败",
      ),
    );
  }

  if (
    typeof submitResult.payload !== "object" ||
    submitResult.payload === null ||
    !("request_id" in submitResult.payload) ||
    typeof submitResult.payload.request_id !== "string"
  ) {
    throw new Error("AI 图片编辑任务创建成功，但未返回 request_id。");
  }

  const responseUrl =
    "response_url" in submitResult.payload &&
    typeof submitResult.payload.response_url === "string"
      ? submitResult.payload.response_url
      : "";
  const resultEndpoint =
    responseUrl
      ? responseUrl.replace(
          /^https:\/\/queue\.fal\.run/i,
          getBaseOrigin(baseUrl),
        )
      : `${endpoint}/requests/${submitResult.payload.request_id}`;

  const resultPayload = await pollNativeFalResult(
    resultEndpoint,
    apiKey,
    model,
    targetSize >= 2048 ? "2048" : "1024",
  );
  const resultBuffer = await decodeNativeFalImageResponse(resultPayload);
  return resizeOutputBuffer(resultBuffer, targetSize);
}

async function generateWithCustomProviderPrompt(
  styledPrompt: string,
  settings: CustomAiSettings,
) {
  const { baseUrl, apiKey, model } = resolveCustomProviderConfig(settings);

  if (!apiKey) {
    throw new Error("请先填写访问密钥。");
  }

  const endpoint = normalizeImageEndpoint(baseUrl);
  const targetSize = getOutputSizeByQuality(settings.outputQuality);
  const sizeCandidates = getGenerationSizeCandidates(baseUrl, model, targetSize);
  let response: Response | null = null;
  let payload: unknown = null;
  let usedSize = sizeCandidates[0] ?? "1024x1024";

  for (let sizeIndex = 0; sizeIndex < sizeCandidates.length; sizeIndex += 1) {
    const size = sizeCandidates[sizeIndex];
    usedSize = size;
    const requestBodies = buildGenerationRequestBodyVariants({
      baseUrl,
      model,
      prompt: styledPrompt,
      size,
      targetSize,
    });

    for (
      let bodyIndex = 0;
      bodyIndex < requestBodies.length;
      bodyIndex += 1
    ) {
      ({ response, payload } = await requestCustomProviderImage(
        endpoint,
        apiKey,
        requestBodies[bodyIndex].body,
      ));
      logImageAttempt({
        type: "generation",
        endpoint,
        model,
        size,
        variant: requestBodies[bodyIndex].label,
        response,
        payload,
      });

      if (response.ok) {
        break;
      }

      if (
        !shouldRetryWithSimplerGenerationBody(payload, response.status) ||
        bodyIndex === requestBodies.length - 1
      ) {
        break;
      }
    }

    if (
      response?.ok ||
      !shouldRetryWithDifferentSize(payload) ||
      sizeIndex === sizeCandidates.length - 1
    ) {
      break;
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      formatErrorPayload(payload, response?.status ?? 500, "AI 服务请求失败"),
    );
  }

  if (typeof payload === "string") {
    throw new Error(
      "AI 服务返回了非 JSON 内容，请检查接口地址是否正确，或该模型是否支持图片生成。",
    );
  }

  const buffer = await decodeOpenAiImageResponse(payload, {
    baseUrl,
    apiKey,
    model,
    size: usedSize,
    type: "generation-task-poll",
  });
  return resizeOutputBuffer(buffer, targetSize);
}

export async function testCustomProviderConnection(settings: CustomAiSettings) {
  const { baseUrl, apiKey, model } = resolveCustomProviderConfig(settings);

  if (!apiKey) {
    throw new Error("请先填写访问密钥。");
  }

  const result = await requestCustomProviderModels(baseUrl, apiKey);
  const modelExists = result.data?.some((item) => item.id === model) ?? false;

  return {
    modelExists,
    supportsImageGeneration: null,
    tone: modelExists ? "success" : "info",
    message: modelExists
      ? "OpenAI 兼容接口连通成功，已找到该模型。该模式无法在不实际生成图片的前提下判断模型是否支持出图。"
      : "接口已连通，但模型列表中未找到该模型；请确认模型名是否正确。",
  } satisfies ProviderTestResult;
}

export async function listCustomProviderModels(settings: CustomAiSettings) {
  const { baseUrl, apiKey } = resolveCustomProviderConfig(settings);

  if (!apiKey) {
    throw new Error("请先填写访问密钥。");
  }

  const result = await requestCustomProviderModels(baseUrl, apiKey);
  const models = Array.from(
    new Set(
      (result.data ?? [])
        .map((item) => item.id?.trim() ?? "")
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return models;
}

function resolveProviderMode(settings?: CustomAiSettings): TextProviderMode {
  return settings?.providerMode === "custom" ? "custom" : "free";
}

function resolveImageProviderMode(settings?: CustomAiSettings): ImageProviderMode {
  return settings?.imageProviderMode === "custom" ? "custom" : "local";
}

export async function generateTextColoringPage(
  prompt: string,
  style: string,
  settings?: CustomAiSettings,
) {
  const providerMode = resolveProviderMode(settings);
  const styledPrompt = buildColoringPrompt(prompt, style);

  try {
    if (providerMode === "custom") {
      return await generateWithCustomProviderPrompt(styledPrompt, settings ?? {
        providerMode: "custom",
      });
    }

    const generated = await generateWithPollinationsPrompt(styledPrompt);
    return resizeOutputBuffer(
      generated,
      getOutputSizeByQuality(settings?.outputQuality),
    );
  } catch (error) {
    const allowFallback =
      providerMode === "free" ? true : Boolean(settings?.allowFallback);

    if (allowFallback) {
      return generateFallbackPng(prompt, style);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("生成失败，请检查自定义 AI 服务配置。");
  }
}

export async function generateTextImage(
  prompt: string,
  style: string,
  settings?: CustomAiSettings,
  options?: {
    ecommerceDirection?: EcommerceDirection;
  },
) {
  const providerMode = resolveProviderMode(settings);
  const styledPrompt = buildTextImagePrompt(prompt, style, options);

  try {
    if (providerMode === "custom") {
      return await generateWithCustomProviderPrompt(styledPrompt, settings ?? {
        providerMode: "custom",
      });
    }

    const generated = await generateWithPollinationsPrompt(styledPrompt);
    return resizeOutputBuffer(
      generated,
      getOutputSizeByQuality(settings?.outputQuality),
    );
  } catch (error) {
    const allowFallback =
      providerMode === "custom" && Boolean(settings?.allowFallback);

    if (allowFallback) {
      const generated = await generateWithPollinationsPrompt(styledPrompt);
      return resizeOutputBuffer(
        generated,
        getOutputSizeByQuality(settings?.outputQuality),
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("文生图失败，请检查自定义 AI 服务配置。");
  }
}

export async function generateImageColoringPageWithCustomProvider(
  imageBuffer: Buffer,
  mimeType: string,
  style: string,
  settings?: CustomAiSettings,
) {
  return generateEditedImageWithCustomProvider(
    imageBuffer,
    mimeType,
    style,
    settings,
    buildImageLineartPrompt,
    "AI 图片转线稿失败",
    "请先切换到 AI 转线稿模式。",
  );
}

export async function generateImageAnimeWithCustomProvider(
  imageBuffer: Buffer,
  mimeType: string,
  style: string,
  settings?: CustomAiSettings,
) {
  return generateEditedImageWithCustomProvider(
    imageBuffer,
    mimeType,
    style,
    settings,
    buildImageAnimePrompt,
    "AI 图片转动漫失败",
    "请先切换到 AI 转动漫模式。",
  );
}

export async function generateImageRestoreWithCustomProvider(
  imageBuffer: Buffer,
  mimeType: string,
  style: string,
  settings?: CustomAiSettings,
) {
  return generateEditedImageWithCustomProvider(
    imageBuffer,
    mimeType,
    style,
    settings,
    buildImageRestorePrompt,
    "AI 老照片修复失败",
    "请先切换到自定义 AI 修复模式。",
  );
}

async function generateEditedImageWithCustomProvider(
  imageBuffer: Buffer,
  mimeType: string,
  style: string,
  settings: CustomAiSettings | undefined,
  buildPrompt: (styleId: string) => string,
  errorPrefix: string,
  invalidModeMessage: string,
) {
  const providerMode = resolveImageProviderMode(settings);

  if (providerMode !== "custom") {
    throw new Error(invalidModeMessage);
  }

  const { baseUrl, apiKey, model } = resolveCustomProviderConfig(settings);

  if (!apiKey) {
    throw new Error("请先填写访问密钥。");
  }

  const endpoint = normalizeImageEditEndpoint(baseUrl);
  const prompt = buildPrompt(style);
  const targetSize = getOutputSizeByQuality(settings?.outputQuality);
  const sizeCandidates = getGenerationSizeCandidates(baseUrl, model, targetSize);
  const nativeFalSupported = isQingyunTopBaseUrl(baseUrl) && getQingyunNativeFalModel(model);
  const apimartSupported = shouldUseApimartImageApi(baseUrl, model);

  if (apimartSupported) {
    const imageUrl = `data:${mimeType || "image/png"};base64,${imageBuffer.toString("base64")}`;
    const size = sizeCandidates[0] ?? "1:1";
    const requestBody = buildApimartImageBody({
      model,
      prompt,
      size,
      targetSize,
      imageUrls: [imageUrl],
    });
    const { response, payload } = await requestCustomProviderImage(
      normalizeImageEndpoint(baseUrl),
      apiKey,
      requestBody,
    );

    logImageAttempt({
      type: "edit",
      endpoint: normalizeImageEndpoint(baseUrl),
      model,
      size,
      variant: "apimart-image-urls",
      response,
      payload,
    });

    if (!response.ok) {
      throw new Error(formatErrorPayload(payload, response.status, errorPrefix));
    }

    if (typeof payload === "string") {
      throw new Error(
        "AI 服务返回了非 JSON 内容，请检查接口地址是否正确，或该模型是否支持图片编辑。",
      );
    }

    const resultBuffer = await decodeOpenAiImageResponse(payload, {
      baseUrl,
      apiKey,
      model,
      size,
      type: "edit-task-poll",
    });
    return resizeOutputBuffer(resultBuffer, targetSize);
  }

  const createFormData = (includeResponseFormat: boolean) => {
    return (size: string) => {
      const formData = new FormData();
      formData.set("model", model);
      formData.set("prompt", prompt);
      formData.set("size", size);
      formData.set("image", new Blob([new Uint8Array(imageBuffer)], {
        type: mimeType || "image/png",
      }), "source.png");

      if (includeResponseFormat) {
        formData.set("response_format", "b64_json");
      }

      return formData;
    };
  };
  const requestVariants = [
    {
      label: "full",
      createBody: createFormData(true),
    },
    {
      label: "no-response-format",
      createBody: createFormData(false),
    },
  ] as const;
  let response: Response | null = null;
  let payload: unknown = null;
  let lastEditError: unknown = null;

  try {
    for (let index = 0; index < sizeCandidates.length; index += 1) {
      const size = sizeCandidates[index];
      for (let variantIndex = 0; variantIndex < requestVariants.length; variantIndex += 1) {
        ({ response, payload } = await requestCustomProviderImageEdit(
          endpoint,
          apiKey,
          requestVariants[variantIndex].createBody(size),
        ));
        logImageAttempt({
          type: "edit",
          endpoint,
          model,
          size,
          variant: requestVariants[variantIndex].label,
          response,
          payload,
        });

        if (response.ok) {
          break;
        }

        if (
          !shouldRetryWithoutResponseFormat(payload) ||
          variantIndex === requestVariants.length - 1
        ) {
          break;
        }
      }

      if (
        response?.ok ||
        !shouldRetryWithDifferentSize(payload) ||
        index === sizeCandidates.length - 1
      ) {
        break;
      }
    }
  } catch (error) {
    lastEditError = error;
  }

  if (!response || !response.ok) {
    if (nativeFalSupported && shouldFallbackToNativeFalRoute(payload, lastEditError)) {
      console.info(
        `[iColoring] edit fallback | model=${model} | endpoint=${endpoint} | reason=${getPayloadErrorMessage(payload) || (lastEditError instanceof Error ? lastEditError.message : "unknown")}`,
      );
      return generateEditedImageWithQingyunNativeFal(
        imageBuffer,
        mimeType,
        prompt,
        baseUrl,
        apiKey,
        model,
        targetSize,
      );
    }

    if (response && !response.ok && isUnsupportedImageEditInterface(payload)) {
      throw new Error(
        `${errorPrefix}：当前中转站或模型暂不支持通过 OpenAI 兼容接口 /v1/images/edits 进行图片编辑。请切换到“本地处理”，或改用支持图片编辑的模型。原始错误：${getPayloadErrorMessage(payload)}`,
      );
    }

    throw new Error(formatErrorPayload(payload, response?.status ?? 500, errorPrefix));
  }

  if (typeof payload === "string") {
    throw new Error(
      "AI 服务返回了非 JSON 内容，请检查接口地址是否正确，或该模型是否支持图片编辑。",
    );
  }

  const resultBuffer = await decodeOpenAiImageResponse(payload, {
    baseUrl,
    apiKey,
    model,
    size: sizeCandidates[0] ?? "1024x1024",
    type: "edit-task-poll",
  });
  return resizeOutputBuffer(resultBuffer, targetSize);
}
