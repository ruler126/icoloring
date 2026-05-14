type SharpModule = typeof import("sharp");

let sharpPromise: Promise<SharpModule["default"]> | null = null;

export async function loadSharp() {
  sharpPromise ??= import("sharp").then((module) => module.default);

  try {
    return await sharpPromise;
  } catch (error) {
    sharpPromise = null;
    throw new Error(
      error instanceof Error
        ? `当前运行环境无法加载 sharp 图片处理模块：${error.message}`
        : "当前运行环境无法加载 sharp 图片处理模块。",
    );
  }
}
