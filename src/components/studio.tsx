"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  artStylePresets,
  animeStylePresets,
  type CustomAiSettings,
  ecommerceDirectionPresets,
  ecommercePromptTemplates,
  type EcommerceDirection,
  getStyleLabel,
  historyLimit,
  type ImageProviderMode,
  imageStylePresets,
  textStylePresets,
  type GeneratorMode,
  type TextProviderMode,
} from "@/lib/coloring";

export type HistoryResponseItem = {
  id: string;
  mode: GeneratorMode;
  prompt: string;
  style: string;
  createdAt: string;
  imageUrl: string;
  downloadUrl: string;
};

type GenerationResult = {
  id?: string;
  imageUrl: string;
  downloadUrl: string;
  prompt: string;
  style: string;
};

type ApiErrorResponse = {
  error: string;
};

type ProviderTestResponse = {
  message: string;
  modelExists: boolean;
  supportsImageGeneration: boolean | null;
  tone: "success" | "error" | "info";
};

type InlineNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

type SegmentOptionProps = {
  checked: boolean;
  label: string;
  name: string;
  onSelect: () => void;
};

type CardOptionProps = {
  checked: boolean;
  description: string;
  label: string;
  name: string;
  onSelect: () => void;
};

const providerStorageKey = "icoloring.custom-ai-settings";
const historyStorageKey = "icoloring.local-history";
const providerStoreEvent = "icoloring:provider-settings";
const historyStoreEvent = "icoloring:history";
const textGenerationTimeoutMs = 120_000;
const imageGenerationTimeoutMs = 210_000;

const defaultProviderSettings: CustomAiSettings = {
  providerMode: "free",
  imageProviderMode: "local",
  outputQuality: "standard",
  baseUrl: "",
  apiKey: "",
  model: "",
  allowFallback: false,
};
const emptyHistory: HistoryResponseItem[] = [];
let cachedProviderRaw: string | null | undefined;
let cachedProviderSnapshot: CustomAiSettings = defaultProviderSettings;
let cachedHistoryRaw: string | null | undefined;
let cachedHistorySnapshot: HistoryResponseItem[] = emptyHistory;

function getTextFromUnknownPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return "";
  }

  return typeof payload.error === "string" ? payload.error : "";
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function createClientId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createNamedEvent(name: string) {
  if (typeof window !== "undefined" && typeof window.Event === "function") {
    return new window.Event(name);
  }

  if (typeof document !== "undefined") {
    const legacyEvent = document.createEvent("Event");
    legacyEvent.initEvent(name, false, false);
    return legacyEvent;
  }

  return null;
}

function SegmentOption({
  checked,
  label,
  name,
  onSelect,
}: SegmentOptionProps) {
  return (
    <button
      aria-pressed={checked}
      className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${
        checked
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
      data-group={name}
      onClick={onSelect}
      type="button"
    >
      <span>{label}</span>
    </button>
  );
}

function CardOption({
  checked,
  description,
  label,
  name,
  onSelect,
}: CardOptionProps) {
  return (
    <button
      aria-pressed={checked}
      className={`block min-h-24 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${
        checked
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-400"
      }`}
      data-group={name}
      onClick={onSelect}
      type="button"
    >
      <div className="font-semibold">{label}</div>
      <div
        className={`mt-1 text-sm leading-6 ${
          checked ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {description}
      </div>
    </button>
  );
}

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 75_000,
) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(input, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();
      const detail = normalizeWhitespace(text).slice(0, 180);

      throw new Error(
        detail.startsWith("<")
          ? "服务端返回了非 JSON 内容，请检查 AI 接口地址或稍后重试。"
          : detail || "服务端返回了无法识别的内容。",
      );
    }

    return {
      response,
      data: (await response.json()) as T,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请稍后重试。");
    }

    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        /failed to fetch|load failed|networkerror/i.test(error.message))
    ) {
      throw new Error("网络请求失败，请检查当前页面连接状态后重试。");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sanitizeProviderSettings(value: unknown): CustomAiSettings {
  if (!value || typeof value !== "object") {
    return defaultProviderSettings;
  }

  const input = value as Record<string, unknown>;

  return {
    providerMode: input.providerMode === "custom" ? "custom" : "free",
    imageProviderMode:
      input.imageProviderMode === "custom" ? "custom" : "local",
    outputQuality:
      input.outputQuality === "ultra2048" ? "ultra2048" : "standard",
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : "",
    apiKey: typeof input.apiKey === "string" ? input.apiKey : "",
    model: typeof input.model === "string" ? input.model : "",
    allowFallback: Boolean(input.allowFallback),
  };
}

function buildDownloadUrl(downloadUrl: string, size: 1024 | 2048) {
  const [pathname, search = ""] = downloadUrl.split("?");
  const params = new URLSearchParams(search);
  params.set("download", "1");
  params.set("size", String(size));
  return `${pathname}?${params.toString()}`;
}

function getProviderSettingsSnapshot() {
  if (typeof window === "undefined") {
    return defaultProviderSettings;
  }

  try {
    const raw = window.localStorage.getItem(providerStorageKey);
    if (raw === cachedProviderRaw) {
      return cachedProviderSnapshot;
    }

    cachedProviderRaw = raw;
    cachedProviderSnapshot = raw
      ? sanitizeProviderSettings(JSON.parse(raw))
      : defaultProviderSettings;
    return cachedProviderSnapshot;
  } catch {
    return defaultProviderSettings;
  }
}

function subscribeProviderSettings(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === providerStorageKey) {
      callback();
    }
  };
  const handleCustomEvent = () => callback();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(providerStoreEvent, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(providerStoreEvent, handleCustomEvent);
  };
}

function writeProviderSettings(next: CustomAiSettings) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = JSON.stringify(next);
  cachedProviderRaw = raw;
  cachedProviderSnapshot = next;
  window.localStorage.setItem(providerStorageKey, raw);
  const providerEvent = createNamedEvent(providerStoreEvent);
  if (providerEvent) {
    window.dispatchEvent(providerEvent);
  }
}

function useProviderSettings() {
  return useSyncExternalStore(
    subscribeProviderSettings,
    getProviderSettingsSnapshot,
    () => defaultProviderSettings,
  );
}

function sanitizeHistory(value: unknown): HistoryResponseItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const input = item as Record<string, unknown>;
      const mode: GeneratorMode =
        input.mode === "art"
          ? "art"
          : input.mode === "image"
          ? "image"
          : input.mode === "anime"
            ? "anime"
            : "text";
      return {
        id: typeof input.id === "string" ? input.id : createClientId(),
        mode,
        prompt: typeof input.prompt === "string" ? input.prompt : "",
        style: typeof input.style === "string" ? input.style : "",
        createdAt:
          typeof input.createdAt === "string"
            ? input.createdAt
            : new Date().toISOString(),
        imageUrl: typeof input.imageUrl === "string" ? input.imageUrl : "",
        downloadUrl:
          typeof input.downloadUrl === "string" ? input.downloadUrl : "",
      };
    })
    .filter((item) => item.imageUrl && item.downloadUrl)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, historyLimit);
}

function getHistorySnapshot() {
  if (typeof window === "undefined") {
    return emptyHistory;
  }

  try {
    const raw = window.localStorage.getItem(historyStorageKey);
    if (raw === cachedHistoryRaw) {
      return cachedHistorySnapshot;
    }

    cachedHistoryRaw = raw;
    cachedHistorySnapshot = raw ? sanitizeHistory(JSON.parse(raw)) : emptyHistory;
    return cachedHistorySnapshot;
  } catch {
    return emptyHistory;
  }
}

function subscribeHistory(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === historyStorageKey) {
      callback();
    }
  };
  const handleCustomEvent = () => callback();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(historyStoreEvent, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(historyStoreEvent, handleCustomEvent);
  };
}

function writeHistory(next: HistoryResponseItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = JSON.stringify(next);
  cachedHistoryRaw = raw;
  cachedHistorySnapshot = next;
  window.localStorage.setItem(historyStorageKey, raw);
  const historyEvent = createNamedEvent(historyStoreEvent);
  if (historyEvent) {
    window.dispatchEvent(historyEvent);
  }
}

function pushHistoryItem(item: HistoryResponseItem) {
  const history = getHistorySnapshot();
  const next = [item, ...history.filter((entry) => entry.id !== item.id)].slice(
    0,
    historyLimit,
  );
  writeHistory(next);
}

function removeHistoryItem(id: string) {
  const history = getHistorySnapshot();
  const next = history.filter((entry) => entry.id !== id);
  writeHistory(next);
}

function clearHistory() {
  writeHistory([]);
}

function useLocalHistory() {
  return useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    () => emptyHistory,
  );
}

export function Studio() {
  const providerSettings = useProviderSettings();
  const history = useLocalHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<GeneratorMode>("text");
  const [prompt, setPrompt] = useState("一只戴着宇航员头盔的小猫，站在月球上");
  const [textStyle, setTextStyle] = useState(textStylePresets[0].id);
  const [artStyle, setArtStyle] = useState(artStylePresets[0].id);
  const [ecommerceDirection, setEcommerceDirection] = useState<EcommerceDirection>(
    ecommerceDirectionPresets[0].id,
  );
  const [selectedEcommerceTemplateId, setSelectedEcommerceTemplateId] = useState("");
  const [imageStyle, setImageStyle] = useState(imageStylePresets[0].id);
  const [animeStyle, setAnimeStyle] = useState(animeStylePresets[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [error, setError] = useState("");
  const [providerNotice, setProviderNotice] = useState<InlineNotice | null>(null);
  const [historyPreviewItem, setHistoryPreviewItem] =
    useState<HistoryResponseItem | null>(null);
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);

  const activeStyle = useMemo(
    () =>
      mode === "text"
        ? textStyle
        : mode === "art"
          ? artStyle
          : mode === "anime"
            ? animeStyle
            : imageStyle,
    [animeStyle, artStyle, imageStyle, mode, textStyle],
  );
  const uploadPreviewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file],
  );
  const imageProviderMode = providerSettings.imageProviderMode ?? "local";
  const isUploadMode = mode === "image" || mode === "anime";
  const isTextPromptMode = mode === "text" || mode === "art";
  const isTextImageMode = mode === "art";
  const isEcommerceArtStyle = isTextImageMode && artStyle === "ecommerce";
  const isAnimeMode = mode === "anime";
  const isLineartMode = mode === "image";
  const showCustomProviderConfig =
    isTextPromptMode
      ? providerSettings.providerMode === "custom"
      : imageProviderMode === "custom";
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

  function updateProviderSettings(
    patch: Partial<CustomAiSettings> | ((prev: CustomAiSettings) => CustomAiSettings),
  ) {
    const next =
      typeof patch === "function"
        ? patch(providerSettings)
        : { ...providerSettings, ...patch };

    setProviderNotice(null);
    writeProviderSettings(next);
  }

  async function handleGenerate() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isTextPromptMode) {
        const { response, data } = await fetchJsonWithTimeout<
          GenerationResult | ApiErrorResponse
        >(
          isTextImageMode ? "/api/text-to-image" : "/api/text-to-coloring",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              style: isTextImageMode ? artStyle : textStyle,
              provider: providerSettings,
              ...(isTextImageMode ? { ecommerceDirection } : {}),
            }),
          },
          textGenerationTimeoutMs,
        );

        if (!response.ok || "error" in data) {
          throw new Error(getTextFromUnknownPayload(data) || "生成失败");
        }

        setResult(data);
        pushHistoryItem({
          id: data.id ?? createClientId(),
          mode,
          prompt: data.prompt,
          style: data.style,
          createdAt: new Date().toISOString(),
          imageUrl: data.imageUrl,
          downloadUrl: data.downloadUrl,
        });
      } else {
        if (!file) {
          throw new Error("请先上传一张图片。");
        }

        setResult(null);
        const formData = new FormData();
        formData.set("file", file);
        formData.set("style", mode === "anime" ? animeStyle : imageStyle);
        formData.set("provider", JSON.stringify(providerSettings));

        const { response, data } = await fetchJsonWithTimeout<
          GenerationResult | ApiErrorResponse
        >(
          mode === "anime" ? "/api/image-to-anime" : "/api/image-to-coloring",
          {
            method: "POST",
            body: formData,
          },
          imageGenerationTimeoutMs,
        );

        if (!response.ok || "error" in data) {
          throw new Error(
            getTextFromUnknownPayload(data) ||
              (mode === "anime" ? "动漫化失败" : "转换失败"),
          );
        }

        setResult(data);
        pushHistoryItem({
          id: data.id ?? createClientId(),
          mode,
          prompt: data.prompt,
          style: data.style,
          createdAt: new Date().toISOString(),
          imageUrl: data.imageUrl,
          downloadUrl: data.downloadUrl,
        });
      }
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "请求失败，请稍后重试。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleTestConnection() {
    if (testingConnection) {
      return;
    }

    setTestingConnection(true);
    setProviderNotice(null);

    try {
      const { response, data } = await fetchJsonWithTimeout<
        ProviderTestResponse | ApiErrorResponse
      >(
        "/api/test-ai",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: providerSettings,
          }),
        },
        30_000,
      );

      if (!response.ok || "error" in data) {
        throw new Error(getTextFromUnknownPayload(data) || "连通测试失败");
      }

      setProviderNotice({
        tone: data.tone,
        message: data.message,
      });
    } catch (testError) {
      setProviderNotice({
        tone: "error",
        message:
          testError instanceof Error ? testError.message : "连通测试失败，请稍后重试。",
      });
    } finally {
      setTestingConnection(false);
    }
  }

  const uploadModeLocalLabel = isAnimeMode ? "快速动漫化" : "本地转线稿";
  const uploadModeAiLabel = isAnimeMode ? "AI 转动漫" : "AI 转线稿";
  const uploadModeStyleLabel = isAnimeMode ? "动漫风格" : "线稿风格";
  const uploadModeResultLabel = isAnimeMode ? "动漫效果" : "线稿";
  const uploadModeResultHint = isAnimeMode
    ? "生成完成后会在这里显示动漫化结果。"
    : "生成完成后会在这里显示线稿结果。";
  const customProviderTitle =
    mode === "art" && providerSettings.providerMode === "custom"
      ? "AI 文生图配置"
      : mode === "image" && imageProviderMode === "custom"
        ? "AI 转线稿配置"
        : mode === "anime" && imageProviderMode === "custom"
          ? "AI 转动漫配置"
          : "AI 涂色页配置";
  const customProviderFallbackLabel =
    mode === "art" && providerSettings.providerMode === "custom"
      ? "AI 文生图失败时，允许回退到普通文生图接口"
      : mode === "image" && imageProviderMode === "custom"
        ? "AI 转线稿失败时，允许回退到普通接口线稿转换"
        : mode === "anime" && imageProviderMode === "custom"
          ? "AI 转动漫失败时，允许回退到普通接口动漫化处理"
          : "AI 生成失败时，允许回退到本地模板";
  const promptModeTextareaLabel = isTextImageMode
    ? "描述你想生成的图片"
    : "描述你想生成的内容";
  const promptModeTextareaPlaceholder = isTextImageMode
    ? "例如：一个未来城市的雨夜街头，霓虹灯倒映在路面，电影感构图"
    : "例如：一条会飞的鲸鱼，在云层上方和热气球一起旅行";
  const promptModeStyleLabel = isTextImageMode ? "图片风格" : "线稿风格";
  const promptModeStylePresets = isTextImageMode
    ? artStylePresets
    : textStylePresets;
  const promptModeResultHint = isTextImageMode
    ? "生成完成后会在这里展示文生图预览，并可直接下载。"
    : "生成完成后会在这里展示涂色页预览，并可直接下载。";
  const promptModeLoadingLabel = isTextImageMode ? "生成图片中..." : "生成涂色页中...";
  const filteredEcommerceTemplates = ecommercePromptTemplates.filter(
    (item) => item.direction === ecommerceDirection,
  );
  const customProviderSettingsPanel = showCustomProviderConfig ? (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3 sm:p-4">
      <div className="mb-2 text-sm font-semibold text-sky-900">
        {customProviderTitle}
      </div>
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            接口地址（Base URL）
          </span>
          <input
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
            onChange={(event) =>
              updateProviderSettings({ baseUrl: event.target.value })
            }
            placeholder="留空则使用站内默认接口，也可填写你自己的 OpenAI 兼容地址"
            type="text"
            value={providerSettings.baseUrl ?? ""}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              访问密钥（API Key）
            </span>
            <input
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) =>
                updateProviderSettings({ apiKey: event.target.value })
              }
              placeholder="sk-..."
              type="password"
              value={providerSettings.apiKey ?? ""}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              模型名称
            </span>
            <input
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) =>
                updateProviderSettings({ model: event.target.value })
              }
              placeholder="留空则使用站内默认模型，也可手动填写你自己的模型名"
              type="text"
              value={providerSettings.model ?? ""}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            disabled={testingConnection}
            onClick={handleTestConnection}
            type="button"
          >
            {testingConnection ? "测试中..." : "测试 AI 连通"}
          </button>
          <span className="text-xs leading-5 text-slate-500">
            地址或模型留空时使用默认预设。
          </span>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700">
          <input
            checked={Boolean(providerSettings.allowFallback)}
            className="mt-1"
            onChange={(event) =>
              updateProviderSettings({
                allowFallback: event.target.checked,
              })
            }
            type="checkbox"
          />
          <span>{customProviderFallbackLabel}</span>
        </label>
        {providerNotice ? (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm ${
              providerNotice.tone === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : providerNotice.tone === "info"
                  ? "border border-amber-200 bg-amber-50 text-amber-700"
                  : "border border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {providerNotice.message}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;
  const visibleSelectedHistoryIds = selectedHistoryIds.filter((id) =>
    history.some((item) => item.id === id),
  );
  const allHistorySelected =
    history.length > 0 && visibleSelectedHistoryIds.length === history.length;

  function toggleHistorySelection(id: string, checked: boolean) {
    setSelectedHistoryIds((previous) =>
      checked ? Array.from(new Set([...previous, id])) : previous.filter((item) => item !== id),
    );
  }

  function handleDeleteHistoryItem(id: string) {
    removeHistoryItem(id);
    setSelectedHistoryIds((previous) => previous.filter((item) => item !== id));
    if (historyPreviewItem?.id === id) {
      setHistoryPreviewItem(null);
    }
  }

  function handleDeleteSelectedHistory() {
    if (visibleSelectedHistoryIds.length === 0) {
      return;
    }

    const next = history.filter((item) => !visibleSelectedHistoryIds.includes(item.id));
    writeHistory(next);
    setSelectedHistoryIds([]);

    if (
      historyPreviewItem &&
      visibleSelectedHistoryIds.includes(historyPreviewItem.id)
    ) {
      setHistoryPreviewItem(null);
    }
  }

  function handleDeleteAllHistory() {
    clearHistory();
    setSelectedHistoryIds([]);
    setHistoryPreviewItem(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <SegmentOption
            checked={mode === "text"}
            label="文本生成线稿"
            name="generator-mode"
            onSelect={() => setMode("text")}
          />
          <SegmentOption
            checked={mode === "art"}
            label="纯文生图"
            name="generator-mode"
            onSelect={() => setMode("art")}
          />
          <SegmentOption
            checked={mode === "image"}
            label="图片转线稿"
            name="generator-mode"
            onSelect={() => setMode("image")}
          />
          <SegmentOption
            checked={mode === "anime"}
            label="图片转动漫"
            name="generator-mode"
            onSelect={() => setMode("anime")}
          />
        </div>

        <div className="mt-6 space-y-5">
          {isTextPromptMode ? (
            <>
              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  生成来源
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    {
                      id: "free",
                      label: "普通接口",
                      description: isTextImageMode
                        ? "按提示词直接出图，适合快速尝试。"
                        : "快速生成涂色页，失败时自动使用本地模板。",
                    },
                    {
                      id: "custom",
                      label: "自定义 AI",
                      description:
                        isTextImageMode
                          ? "连接你的 OpenAI 兼容服务，生成质量更可控。"
                          : "连接你的 AI 服务，生成更干净的黑白线稿。",
                    },
                  ] as Array<{
                    id: TextProviderMode;
                    label: string;
                    description: string;
                  }>).map((item) => (
                    <CardOption
                      checked={providerSettings.providerMode === item.id}
                      description={item.description}
                      key={item.id}
                      label={item.label}
                      name="text-provider-mode"
                      onSelect={() =>
                        updateProviderSettings({ providerMode: item.id })
                      }
                    />
                  ))}
                </div>
              </div>

              {customProviderSettingsPanel}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  {promptModeTextareaLabel}
                </span>
                <textarea
                  className="min-h-36 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    if (isEcommerceArtStyle) {
                      setSelectedEcommerceTemplateId("");
                    }
                  }}
                  placeholder={promptModeTextareaPlaceholder}
                  value={prompt}
                />
              </label>

              <div>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    {promptModeStyleLabel}
                  </span>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {promptModeStylePresets.map((item) => (
                    <CardOption
                      checked={activeStyle === item.id}
                      description={item.description}
                      key={item.id}
                      label={item.label}
                      name={isTextImageMode ? "art-style" : "text-style"}
                      onSelect={() => {
                        if (isTextImageMode) {
                          setArtStyle(item.id);
                          if (item.id !== "ecommerce") {
                            setSelectedEcommerceTemplateId("");
                          }
                          return;
                        }

                        setTextStyle(item.id);
                      }}
                    />
                  ))}
                </div>
              </div>

              {isEcommerceArtStyle ? (
                <>
                  <div>
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      电商细分方向
                    </span>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {ecommerceDirectionPresets.map((item) => (
                        <CardOption
                          checked={ecommerceDirection === item.id}
                          description={item.description}
                          key={item.id}
                          label={item.label}
                          name="ecommerce-direction"
                          onSelect={() => {
                            setEcommerceDirection(item.id);
                            setSelectedEcommerceTemplateId("");
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="block text-sm font-semibold text-slate-700">
                        高转化提示词模板
                      </span>
                      <span className="text-xs text-slate-500">
                        选择后会自动填入下方提示词，可继续手动修改
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredEcommerceTemplates.map((item) => (
                        <CardOption
                          checked={selectedEcommerceTemplateId === item.id}
                          description={item.description}
                          key={item.id}
                          label={item.label}
                          name="ecommerce-template"
                          onSelect={() => {
                            setSelectedEcommerceTemplateId(item.id);
                            setPrompt(item.prompt);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  转换方式
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    {
                      id: "local",
                      label: uploadModeLocalLabel,
                      description: isAnimeMode
                        ? "无需配置，快速把照片处理成动漫插画。"
                        : "无需配置，适合普通照片快速提取轮廓。",
                    },
                    {
                      id: "custom",
                      label: uploadModeAiLabel,
                      description: isAnimeMode
                        ? "调用图片编辑/图生图AI模型获得更自然、更精致的动漫化结果。"
                        : "调用图片编辑/图生图AI模型生成更干净的黑白线稿，效果更好。",
                    },
                  ] as Array<{
                    id: ImageProviderMode;
                    label: string;
                    description: string;
                  }>).map((item) => (
                    <CardOption
                      checked={imageProviderMode === item.id}
                      description={item.description}
                      key={item.id}
                      label={item.label}
                      name="image-provider-mode"
                      onSelect={() =>
                        updateProviderSettings({ imageProviderMode: item.id })
                      }
                    />
                  ))}
                </div>
              </div>

              {customProviderSettingsPanel}

              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  上传图片
                </span>
                <button
                  className="flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center transition hover:border-slate-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <span className="text-base font-semibold text-slate-700">
                    {file ? file.name : "选择图片"}
                  </span>
                  <span className="mt-2 text-sm text-slate-500">
                    支持 JPG、PNG、WEBP，建议主体清晰、背景简单
                  </span>
                </button>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    setFile(nextFile);
                    setError("");
                    setResult(null);
                  }}
                  ref={fileInputRef}
                  type="file"
                />
              </div>

              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  {uploadModeStyleLabel}
                </span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(isAnimeMode ? animeStylePresets : imageStylePresets).map((item) => (
                    <CardOption
                      checked={activeStyle === item.id}
                      description={item.description}
                      key={item.id}
                      label={item.label}
                      name={isAnimeMode ? "anime-style" : "image-style"}
                      onSelect={() =>
                        isAnimeMode ? setAnimeStyle(item.id) : setImageStyle(item.id)
                      }
                    />
                  ))}
                </div>
              </div>
            </>
          )}

        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto sm:min-w-40"
            disabled={loading || (isUploadMode && !file)}
            onClick={handleGenerate}
            type="button"
          >
            {loading
              ? isTextPromptMode
                ? promptModeLoadingLabel
                : isLineartMode
                ? "生成线稿中..."
                : isAnimeMode
                  ? "动漫化处理中..."
                  : "处理中..."
              : isUploadMode
                ? "开始转换"
                : "开始生成"}
          </button>
          <div className="text-sm leading-6 text-slate-500">
            当前风格：{getStyleLabel(mode, activeStyle)}
            {isTextPromptMode
              ? ` · 来源：${
                  providerSettings.providerMode === "free"
                    ? isTextImageMode
                      ? "普通文生图接口"
                      : "普通接口"
                    : "自定义 AI · OpenAI 兼容平台"
                }`
              : ` · 来源：${
                  imageProviderMode === "custom"
                    ? `${uploadModeAiLabel} · OpenAI 兼容平台`
                    : uploadModeLocalLabel
                }`}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">预览结果</h3>
            <p className="mt-1 text-sm text-slate-500">
              生成完成后可点开大图，并下载 1024 或 2048 尺寸。
            </p>
          </div>
        </div>

        {isUploadMode ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">原图预览</div>
                  <div className="text-xs text-slate-500">
                    {uploadPreviewUrl
                      ? `已选择 ${file?.name ?? "图片"}`
                      : "上传图片后会在这里显示原图。"}
                  </div>
                </div>
                <div className="text-xs text-slate-400">原图</div>
              </div>
              <div
                className={`overflow-hidden rounded-b-[28px] bg-slate-100 ${
                  uploadPreviewUrl ? "" : "p-6"
                }`}
              >
                {uploadPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={file?.name ?? "上传预览"}
                    className="aspect-square w-full object-contain bg-slate-50"
                    src={uploadPreviewUrl}
                  />
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center text-sm text-slate-400">
                    选择一张图片后，这里会展示原图预览。
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">当前结果</div>
                  <div className="text-xs text-slate-500">
                    {uploadModeResultHint}
                  </div>
                </div>
                <div className="text-xs text-slate-400">{uploadModeResultLabel}</div>
              </div>
              <div
                className={`overflow-hidden rounded-b-[28px] bg-slate-100 ${
                  result ? "" : "p-6"
                }`}
              >
                {result ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={result.prompt}
                    className="aspect-square w-full cursor-zoom-in object-contain bg-white"
                    onClick={() => setResultPreviewOpen(true)}
                    src={result.imageUrl}
                  />
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center text-sm text-slate-400">
                    {`点击“立即生成”后，这里会显示转换后的${uploadModeResultLabel}。`}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`mt-5 overflow-hidden rounded-[28px] bg-slate-100 ${
              result ? "" : "p-6"
            }`}
          >
            {result ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={result.prompt}
                className="max-h-[70vh] w-full cursor-zoom-in rounded-[28px] object-contain bg-white"
                onClick={() => setResultPreviewOpen(true)}
                src={result.imageUrl}
              />
            ) : (
              <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center text-sm text-slate-400">
                {promptModeResultHint}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">最近历史</h3>
            <p className="mt-1 text-sm text-slate-500">
              本地保存最近 18 条生成记录。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              onClick={() => writeHistory(getHistorySnapshot())}
              type="button"
            >
              刷新
            </button>
            <button
              className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={visibleSelectedHistoryIds.length === 0}
              onClick={handleDeleteSelectedHistory}
              type="button"
            >
              删除所选
            </button>
            <button
              className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={history.length === 0}
              onClick={handleDeleteAllHistory}
              type="button"
            >
              清空全部
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {history.length > 0 ? (
            <>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  checked={allHistorySelected}
                  className="h-4 w-4"
                  onChange={(event) =>
                    setSelectedHistoryIds(
                      event.target.checked ? history.map((item) => item.id) : [],
                    )
                  }
                  type="checkbox"
                />
                <span>
                  已选择 {visibleSelectedHistoryIds.length} 条记录
                </span>
              </label>
              {history.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-4 rounded-3xl border border-slate-200 p-4 sm:grid-cols-[auto_96px_1fr]"
                >
                  <label className="flex items-start pt-1">
                    <input
                      checked={visibleSelectedHistoryIds.includes(item.id)}
                      className="h-4 w-4"
                      onChange={(event) =>
                        toggleHistorySelection(item.id, event.target.checked)
                      }
                      type="checkbox"
                    />
                  </label>
                  <button
                    className="block h-24 w-24 overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-300"
                    onClick={() => setHistoryPreviewItem(item)}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={item.prompt}
                      className="h-24 w-24 rounded-2xl object-cover transition hover:scale-[1.03]"
                      onError={() => handleDeleteHistoryItem(item.id)}
                      src={item.imageUrl}
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                        {item.mode === "text"
                          ? "文本生线稿"
                          : item.mode === "art"
                            ? "文生图"
                          : item.mode === "anime"
                            ? "图片转动漫"
                            : "图片转线稿"}
                      </span>
                      <span>{getStyleLabel(item.mode, item.style)}</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm text-slate-700">
                      {item.prompt}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <button
                        className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                        onClick={() => handleDeleteHistoryItem(item.id)}
                        type="button"
                      >
                        删除
                      </button>
                      <a
                        className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                        href={item.downloadUrl}
                      >
                        下载
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              还没有生成记录，先试一次吧。
            </div>
          )}
        </div>
      </section>

      {historyPreviewItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4"
          onClick={() => setHistoryPreviewItem(null)}
          role="presentation"
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="历史图片大图预览"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">
                  {historyPreviewItem.prompt}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {getStyleLabel(historyPreviewItem.mode, historyPreviewItem.style)}
                  {" · "}
                  {new Date(historyPreviewItem.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3">
                <a
                  className="rounded-full border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:px-4"
                  href={buildDownloadUrl(historyPreviewItem.downloadUrl, 1024)}
                >
                  1024
                </a>
                <a
                  className="rounded-full border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:px-4"
                  href={buildDownloadUrl(historyPreviewItem.downloadUrl, 2048)}
                >
                  2048
                </a>
                <button
                  className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:px-4"
                  onClick={() => setHistoryPreviewItem(null)}
                  type="button"
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-100 p-3 sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={historyPreviewItem.prompt}
                className="max-h-[78vh] w-full rounded-2xl object-contain bg-white"
                onError={() => {
                  removeHistoryItem(historyPreviewItem.id);
                  setHistoryPreviewItem(null);
                }}
                src={historyPreviewItem.imageUrl}
              />
            </div>
          </div>
        </div>
      ) : null}

      {resultPreviewOpen && result ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4"
          onClick={() => setResultPreviewOpen(false)}
          role="presentation"
        >
          <div
            aria-label="当前结果大图预览"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">
                  {result.prompt}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {getStyleLabel(mode, result.style)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3">
                <a
                  className="rounded-full border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:px-4"
                  href={buildDownloadUrl(result.downloadUrl, 1024)}
                >
                  1024
                </a>
                <a
                  className="rounded-full border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:px-4"
                  href={buildDownloadUrl(result.downloadUrl, 2048)}
                >
                  2048
                </a>
                <button
                  className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:px-4"
                  onClick={() => setResultPreviewOpen(false)}
                  type="button"
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-100 p-3 sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={result.prompt}
                className="max-h-[78vh] w-full rounded-2xl object-contain bg-white"
                onError={() => setResultPreviewOpen(false)}
                src={result.imageUrl}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
