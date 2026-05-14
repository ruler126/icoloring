type SharpModule = typeof import("sharp");

let sharpPromise: Promise<SharpModule> | null = null;

export async function loadSharp(): Promise<SharpModule> {
  sharpPromise ??= import("sharp").then((module) => {
    const loaded = module as unknown as { default?: SharpModule };
    return loaded.default ?? (module as unknown as SharpModule);
  });

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
