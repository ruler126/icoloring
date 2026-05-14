import { createHmac, createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type HistoryMode = "text" | "art" | "image" | "anime";

export type HistoryItem = {
  id: string;
  mode: HistoryMode;
  prompt: string;
  style: string;
  createdAt: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
};

type StorageDriver = "local" | "cos";

type StorageProvider = {
  addHistoryItem(item: Omit<HistoryItem, "id"> & { id?: string }): Promise<HistoryItem>;
  readGeneratedFile(fileName: string): Promise<Buffer>;
  readHistory(): Promise<HistoryItem[]>;
  saveGeneratedFile(fileName: string, buffer: Buffer): Promise<string>;
};

const historyLimit = 18;
const storageDir = path.join(process.cwd(), "storage");
const generatedDir = path.join(storageDir, "generated");
const historyFile = path.join(storageDir, "history.json");
const cosHistoryKey = "history.json";

function getStorageDriver(): StorageDriver {
  return process.env.ICOLORING_STORAGE_DRIVER === "cos" ? "cos" : "local";
}

function normalizeCosPrefix(value: string | undefined) {
  return (value ?? "icoloring")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function toCosKey(fileName: string) {
  const prefix = normalizeCosPrefix(process.env.COS_PREFIX);
  return prefix ? `${prefix}/${fileName}` : fileName;
}

function getCosConfig() {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  const endpoint =
    process.env.COS_ENDPOINT ||
    (bucket && region ? `https://${bucket}.cos.${region}.myqcloud.com` : "");

  if (!secretId || !secretKey || !bucket || !region || !endpoint) {
    throw new Error(
      "COS 存储未配置完整，请设置 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION。",
    );
  }

  return {
    endpoint: endpoint.replace(/\/+$/g, ""),
    secretId,
    secretKey,
  };
}

function hmacSha1(key: string | Buffer, value: string) {
  return createHmac("sha1", key).update(value).digest("hex");
}

function sha1(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function encodeCosPath(key: string) {
  return `/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function createCosAuthorization(method: string, key: string, host: string) {
  const { secretId, secretKey } = getCosConfig();
  const now = Math.floor(Date.now() / 1000);
  const signTime = `${now};${now + 600}`;
  const httpMethod = method.toLowerCase();
  const httpUri = encodeCosPath(key);
  const httpParameters = "";
  const httpHeaders = `host=${host.toLowerCase()}\n`;
  const signedHeaders = "host";
  const signedParameters = "";
  const httpString = `${httpMethod}\n${httpUri}\n${httpParameters}\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${signTime}\n${sha1(httpString)}\n`;
  const signKey = hmacSha1(secretKey, signTime);
  const signature = hmacSha1(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${signTime}`,
    `q-header-list=${signedHeaders}`,
    `q-url-param-list=${signedParameters}`,
    `q-signature=${signature}`,
  ].join("&");
}

async function ensureLocalStorage() {
  await mkdir(generatedDir, { recursive: true });

  try {
    await readFile(historyFile, "utf8");
  } catch {
    await writeFile(historyFile, "[]", "utf8");
  }
}

async function parseHistory(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is HistoryItem => {
      return Boolean(
        item &&
          typeof item === "object" &&
          "id" in item &&
          "fileName" in item &&
          typeof item.id === "string" &&
          typeof item.fileName === "string",
      );
    });
  } catch {
    return [];
  }
}

async function cosRequest(method: "GET" | "PUT", key: string, body?: Buffer) {
  const { endpoint } = getCosConfig();
  const url = new URL(encodeCosPath(key), endpoint);
  const host = url.host;
  const headers = new Headers({
    Authorization: createCosAuthorization(method, key, host),
  });

  if (body) {
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Content-Type", "application/octet-stream");
  }

  const response = await fetch(url, {
    body: body ? new Uint8Array(body) : undefined,
    headers,
    method,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `COS ${method} ${key} 失败：${response.status} ${detail.slice(0, 120)}`,
    );
  }

  return response;
}

const localProvider: StorageProvider = {
  async saveGeneratedFile(fileName, buffer) {
    await ensureLocalStorage();
    const filePath = path.join(generatedDir, fileName);
    await writeFile(filePath, buffer);
    return fileName;
  },

  async readGeneratedFile(fileName) {
    await ensureLocalStorage();
    const filePath = path.join(generatedDir, fileName);
    return readFile(filePath);
  },

  async readHistory() {
    await ensureLocalStorage();
    const raw = await readFile(historyFile, "utf8");
    return parseHistory(raw);
  },

  async addHistoryItem(item) {
    const history = await this.readHistory();
    const nextItem: HistoryItem = {
      ...item,
      id: item.id ?? randomUUID(),
    };
    history.unshift(nextItem);
    await writeFile(
      historyFile,
      JSON.stringify(history.slice(0, historyLimit), null, 2),
      "utf8",
    );
    return nextItem;
  },
};

const cosProvider: StorageProvider = {
  async saveGeneratedFile(fileName, buffer) {
    await cosRequest("PUT", toCosKey(`generated/${fileName}`), buffer);
    return fileName;
  },

  async readGeneratedFile(fileName) {
    const response = await cosRequest("GET", toCosKey(`generated/${fileName}`));
    return Buffer.from(await response.arrayBuffer());
  },

  async readHistory() {
    try {
      const response = await cosRequest("GET", toCosKey(cosHistoryKey));
      return parseHistory(await response.text());
    } catch (error) {
      if (error instanceof Error && error.message.includes(" 404 ")) {
        return [];
      }

      throw error;
    }
  },

  async addHistoryItem(item) {
    const history = await this.readHistory();
    const nextItem: HistoryItem = {
      ...item,
      id: item.id ?? randomUUID(),
    };
    const next = [nextItem, ...history.filter((entry) => entry.id !== nextItem.id)]
      .slice(0, historyLimit);
    await cosRequest(
      "PUT",
      toCosKey(cosHistoryKey),
      Buffer.from(JSON.stringify(next, null, 2)),
    );
    return nextItem;
  },
};

function getProvider() {
  return getStorageDriver() === "cos" ? cosProvider : localProvider;
}

export async function saveGeneratedFile(fileName: string, buffer: Buffer) {
  return getProvider().saveGeneratedFile(fileName, buffer);
}

export async function readGeneratedFile(fileName: string) {
  return getProvider().readGeneratedFile(fileName);
}

export async function readHistory() {
  return getProvider().readHistory();
}

export async function addHistoryItem(item: Omit<HistoryItem, "id"> & { id?: string }) {
  return getProvider().addHistoryItem(item);
}
