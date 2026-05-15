export type GeneratorMode = "text" | "art" | "image" | "anime" | "restore";
export type TextProviderMode = "free" | "custom";
export type ImageProviderMode = "local" | "custom";
export type OutputQuality = "standard" | "hd1080" | "ultra2048";
export type EcommerceDirection =
  | "product-main"
  | "campaign-poster"
  | "detail-hero";

export type CustomAiSettings = {
  providerMode: TextProviderMode;
  imageProviderMode?: ImageProviderMode;
  outputQuality?: OutputQuality;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  allowFallback?: boolean;
};

export type StylePreset = {
  id: string;
  label: string;
  description: string;
  promptHint: string;
};

export type EcommerceDirectionPreset = {
  id: EcommerceDirection;
  label: string;
  description: string;
  promptHint: string;
};

export type EcommercePromptTemplate = {
  id: string;
  label: string;
  description: string;
  direction: EcommerceDirection;
  prompt: string;
};

export type HistoryItem = {
  id: string;
  mode: GeneratorMode;
  prompt: string;
  style: string;
  createdAt: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
};

export const defaultCustomProviderBaseUrl = "https://api.apimart.ai";
export const defaultCustomProviderModel = "gpt-image-2";

export const textStylePresets: StylePreset[] = [
  {
    id: "kids",
    label: "儿童卡通",
    description: "线条粗、留白多，适合低龄儿童。",
    promptHint: "bold simple outlines, large coloring spaces, kids coloring book",
  },
  {
    id: "storybook",
    label: "故事插画",
    description: "角色和场景更完整，适合家庭打印。",
    promptHint: "storybook line art, playful scene, clean black outlines",
  },
  {
    id: "fantasy",
    label: "奇幻冒险",
    description: "更适合城堡、龙、海底世界等主题。",
    promptHint: "fantasy coloring page, detailed but clean line art",
  },
  {
    id: "mandala",
    label: "成人减压",
    description: "细节更多，更接近成人涂色页。",
    promptHint: "intricate coloring page, elegant outlines, printable line art",
  },
];

export const imageStylePresets: StylePreset[] = [
  {
    id: "clean",
    label: "干净轮廓",
    description: "保留主体边缘，适合常见照片。",
    promptHint: "clean outline",
  },
  {
    id: "cartoon",
    label: "卡通线稿",
    description: "边缘更圆润、整体更轻松。",
    promptHint: "cartoon outline",
  },
  {
    id: "sketch",
    label: "素描风格",
    description: "保留更多纹理和轻微细节。",
    promptHint: "pencil sketch outline",
  },
];

export const animeStylePresets: StylePreset[] = [
  {
    id: "cel",
    label: "经典赛璐璐",
    description: "高饱和、大色块、边缘清晰，接近传统日漫上色。",
    promptHint: "classic cel shaded anime, crisp outlines, flat color blocks",
  },
  {
    id: "shoujo",
    label: "少女漫画",
    description: "颜色柔和、肤色明亮，氛围更轻盈梦幻。",
    promptHint:
      "shoujo manga anime, soft colors, delicate features, romantic mood",
  },
  {
    id: "shonen",
    label: "热血少年",
    description: "对比更强、线条更利落，适合动作感照片。",
    promptHint: "dynamic shonen anime, bold shading, energetic composition",
  },
  {
    id: "chibi",
    label: "Q版萌系",
    description: "人物更可爱圆润，适合儿童和轻松场景。",
    promptHint: "cute chibi anime, simplified features, playful proportions",
  },
  {
    id: "fantasy",
    label: "奇幻动画",
    description: "颜色更通透，适合自然、旅行和童话照片。",
    promptHint: "fantasy anime illustration, whimsical lighting, scenic background",
  },
  {
    id: "neon",
    label: "霓虹都市",
    description: "高对比霓虹色调，适合夜景、人像和街头照片。",
    promptHint: "neon cyber anime, vivid lighting, cinematic urban style",
  },
];

export const restoreStylePresets: StylePreset[] = [
  {
    id: "archive",
    label: "档案级修复",
    description: "保留原貌、年代感和胶片质感，适合大多数老照片。",
    promptHint:
      "museum archive quality restoration, faithful original look, subtle film grain, natural clarity",
  },
  {
    id: "portrait",
    label: "人像保真",
    description: "重点保护五官、年龄感和真实皮肤纹理，避免 AI 脸。",
    promptHint:
      "portrait identity preservation, realistic facial anatomy, natural eyes, preserve age characteristics",
  },
  {
    id: "colorize",
    label: "黑白上色",
    description: "在修复基础上进行历史真实感上色，色彩低饱和自然。",
    promptHint:
      "historically accurate colorization, natural skin tones, realistic fabric colors, muted vintage palette",
  },
  {
    id: "damage",
    label: "重度破损",
    description: "针对划痕、折痕、霉斑、水渍和缺损区域做深度修复。",
    promptHint:
      "reconstruct missing photo regions naturally, repair tears, folds, water damage, mold stains and cracks",
  },
];

export const artStylePresets: StylePreset[] = [
  {
    id: "illustration",
    label: "插画海报",
    description: "色彩完整、构图稳定，适合角色和场景创作。",
    promptHint: "polished digital illustration, vibrant colors, refined composition",
  },
  {
    id: "realistic",
    label: "写实质感",
    description: "更接近摄影与真实光影表现。",
    promptHint: "highly detailed realistic image, natural lighting, cinematic depth",
  },
  {
    id: "anime",
    label: "动漫插画",
    description: "偏二次元上色和角色表现，适合人物与幻想题材。",
    promptHint: "anime illustration, expressive composition, clean details, vivid palette",
  },
  {
    id: "fantasy",
    label: "梦幻奇境",
    description: "更适合童话、奇幻、旅行和超现实场景。",
    promptHint: "fantasy concept art, dreamy atmosphere, magical lighting, rich details",
  },
  {
    id: "guofeng",
    label: "国风插画",
    description: "偏东方审美、古风配色与雅致意境，适合人物、节气和文化主题。",
    promptHint:
      "Chinese style illustration, elegant oriental palette, refined traditional aesthetics, poetic atmosphere",
  },
  {
    id: "poster",
    label: "电影海报",
    description: "更强调戏剧张力、主视觉冲击和海报式构图。",
    promptHint:
      "cinematic movie poster, dramatic lighting, strong focal point, premium key art composition",
  },
  {
    id: "render3d",
    label: "3D 渲染",
    description: "具有立体材质、真实光泽和空间感，适合产品与角色表现。",
    promptHint:
      "high-end 3D render, realistic materials, studio lighting, volumetric depth, polished surfaces",
  },
  {
    id: "storybook-kids",
    label: "儿童绘本",
    description: "色彩友好、角色亲切，适合亲子、教育和童趣场景。",
    promptHint:
      "children's picture book illustration, warm friendly colors, charming characters, playful storytelling scene",
  },
  {
    id: "ecommerce",
    label: "电商爆款",
    description: "偏商业广告主视觉，突出产品卖点、氛围和传播转化效果。",
    promptHint:
      "high-converting e-commerce campaign visual, commercial advertising hero image, premium promotional composition",
  },
];

export const ecommerceDirectionPresets: EcommerceDirectionPreset[] = [
  {
    id: "product-main",
    label: "产品主图",
    description: "突出单品卖点，适合主图、首图和封面展示。",
    promptHint:
      "focus on a single hero product, ultra clear product visibility, direct purchase appeal",
  },
  {
    id: "campaign-poster",
    label: "活动海报",
    description: "强调促销氛围、折扣信息和视觉冲击，适合活动宣传。",
    promptHint:
      "strong campaign atmosphere, bold promotional messaging, festive commercial impact",
  },
  {
    id: "detail-hero",
    label: "详情页头图",
    description: "适合详情页首屏，兼顾产品卖点、场景感和品牌质感。",
    promptHint:
      "detail-page hero banner composition, product benefits storytelling, premium branded layout",
  },
];

export const ecommercePromptTemplates: EcommercePromptTemplate[] = [
  {
    id: "beauty-serum-launch",
    label: "美妆新品上市",
    description: "适合精华液、面霜、护肤套装等高颜值新品推广。",
    direction: "product-main",
    prompt:
      "一款高端精华液新品主视觉海报，玻璃瓶产品置于画面中央，通透液体质感和高级反光明显，背景为干净奢华的浅金与奶白渐变，加入醒目的中文宣传文案“新品上市”“紧致透亮”“限时尝鲜价”，再加入价格标签、卖点短句和精致促销角标，整体像高端电商平台爆款美妆广告图，极具购买欲",
  },
  {
    id: "summer-drink-sale",
    label: "夏日促销海报",
    description: "适合饮品、水果茶、冷饮、零食大促活动。",
    direction: "campaign-poster",
    prompt:
      "夏日饮品促销活动海报，一杯冰镇果茶作为主角，水果飞溅、冰块通透、色彩清爽明亮，画面中直接生成醒目的中文促销文案“夏日特饮节”“第二杯半价”“限时抢购”，包含价格爆炸贴、折扣信息、活动氛围元素和强烈广告视觉冲击，整体像电商首页活动海报，吸睛且高转化",
  },
  {
    id: "appliance-detail-hero",
    label: "家电详情页头图",
    description: "适合小家电、厨房电器、清洁电器等详情页首屏。",
    direction: "detail-hero",
    prompt:
      "一款高端空气炸锅详情页头图，产品放在现代厨房场景中，机身质感清晰，灯光高级，旁边直接生成规范中文文案“无油轻食”“大容量”“智能触控”，同时加入简洁参数卖点、小型图标信息和品质感说明文字，整体像品牌电商详情页首屏视觉，兼顾专业感和购买转化",
  },
  {
    id: "fashion-bag-hero",
    label: "时尚箱包主图",
    description: "适合包袋、女装配饰、轻奢单品展示。",
    direction: "product-main",
    prompt:
      "一款轻奢女包电商主图广告，产品居中突出，皮革纹理和金属配件精致清晰，背景为高级时尚摄影风，直接生成醒目的中文宣传文案“爆款推荐”“轻奢百搭”“新品限量”，加入价格标签、热卖角标和购买引导文案，整体像高转化电商广告主图，时尚高级、极具吸引力",
  },
  {
    id: "festival-sale-poster",
    label: "节日大促海报",
    description: "适合大促节点、满减活动、店铺宣传图。",
    direction: "campaign-poster",
    prompt:
      "节日大促电商活动海报，主产品和节庆氛围元素结合，画面热闹但不杂乱，色彩浓烈吸睛，直接生成大字中文促销文案“限时大促”“满减优惠”“爆款直降”，加入优惠券、折扣贴纸、活动口号和强烈销售氛围，整体像电商平台招商活动海报，极具传播感和下单冲动",
  },
];

export const historyLimit = 18;

export const outputQualityPresets: Array<{
  id: OutputQuality;
  label: string;
  description: string;
  size: number;
}> = [
  {
    id: "standard",
    label: "标准清晰",
    description: "默认 1024 像素，速度更快、兼容性更稳。",
    size: 1024,
  },
  {
    id: "hd1080",
    label: "高清 1080",
    description: "导出约 1080 像素，更适合大图预览和常规下载。",
    size: 1080,
  },
  {
    id: "ultra2048",
    label: "超清 2048",
    description: "导出 2048 像素，更适合细节查看和后续打印。",
    size: 2048,
  },
];

export function getOutputSizeByQuality(quality?: OutputQuality) {
  return outputQualityPresets.find((item) => item.id === quality)?.size ?? 1024;
}

export function getOutputQualityLabel(quality?: OutputQuality) {
  return outputQualityPresets.find((item) => item.id === quality)?.label ?? "标准清晰";
}

export function getStyleLabel(mode: GeneratorMode, styleId: string) {
  const presets =
    mode === "text"
      ? textStylePresets
      : mode === "art"
        ? artStylePresets
      : mode === "anime"
        ? animeStylePresets
      : mode === "restore"
        ? restoreStylePresets
        : imageStylePresets;
  return presets.find((item) => item.id === styleId)?.label ?? styleId;
}

export function buildColoringPrompt(prompt: string, styleId: string) {
  const style =
    textStylePresets.find((item) => item.id === styleId) ?? textStylePresets[0];

  return [
    "black and white coloring page",
    "pure white background",
    "crisp black outlines only",
    "no shading",
    "no gray fill",
    "printable",
    style.promptHint,
    prompt.trim(),
  ].join(", ");
}

export function buildTextImagePrompt(
  prompt: string,
  styleId: string,
  options?: {
    ecommerceDirection?: EcommerceDirection;
  },
) {
  const style =
    artStylePresets.find((item) => item.id === styleId) ?? artStylePresets[0];
  const ecommerceDirection =
    ecommerceDirectionPresets.find(
      (item) => item.id === options?.ecommerceDirection,
    ) ?? ecommerceDirectionPresets[0];
  const styleSpecificHints =
    style.id === "ecommerce"
      ? [
          "designed for e-commerce promotion and campaign marketing",
          "make the main product or subject dominant, eye-catching, and premium",
          "strong visual hierarchy, high click-through appeal, clean commercial composition",
          "studio-grade lighting, glossy highlights, rich texture detail, premium ad quality",
          "directly generate complex promotional text, Chinese marketing headlines, subtitles, price callouts, and offer badges inside the image",
          "the promotional copy should look intentional, prominent, and integrated into the design",
          "avoid empty placeholder text areas and avoid blank reserved space",
          "make the typography look like a real e-commerce advertisement instead of random decoration",
          ecommerceDirection.promptHint,
          "suitable for product promotion, landing page hero banner, marketplace campaign cover, and social media ad creative",
        ]
      : style.id === "poster"
        ? [
            "poster-ready composition",
            "dramatic contrast, cinematic framing, memorable key visual",
            "bold atmosphere and premium blockbuster presentation",
          ]
        : style.id === "guofeng"
          ? [
              "elegant Chinese cultural mood",
              "refined composition inspired by traditional ink, silk, and oriental decorative aesthetics",
            ]
          : style.id === "render3d"
            ? [
                "three-dimensional presentation",
                "precise material rendering, realistic reflections, premium CGI quality",
              ]
            : style.id === "storybook-kids"
              ? [
                  "friendly shapes and readable scene storytelling",
                  "warm, joyful, child-friendly atmosphere",
                ]
              : [];

  return [
    "high quality generated image",
    "cohesive composition",
    "clear main subject",
    "detailed scene",
    "no watermark",
    ...(style.id === "ecommerce" ? [] : ["no text overlay"]),
    ...styleSpecificHints,
    style.promptHint,
    prompt.trim(),
  ].join(", ");
}

export function buildImageLineartPrompt(styleId: string) {
  const style =
    imageStylePresets.find((item) => item.id === styleId) ?? imageStylePresets[0];

  return [
    "convert the uploaded image into a printable black and white coloring page",
    "preserve the main subject and pose",
    "clean black outlines only",
    "pure white background",
    "remove complex background clutter",
    "remove shading and gray fills",
    "high contrast line art",
    "smooth continuous contour lines",
    "kid-friendly coloring book style",
    style.promptHint,
  ].join(", ");
}

export function buildImageAnimePrompt(styleId: string) {
  const style =
    animeStylePresets.find((item) => item.id === styleId) ?? animeStylePresets[0];

  return [
    "transform the uploaded image into a polished anime illustration",
    "preserve the original person's identity, face shape, expression, pose, framing, and key accessories",
    "keep the original eye state, gaze direction, mouth shape, and head tilt",
    "if the eyes are closed in the source image, keep them closed",
    "do not change the facial expression or invent a new expression",
    "anime-style facial features while keeping the original expression",
    "smooth skin and hair rendering",
    "cohesive anime color palette",
    "high quality illustration",
    "detailed but clean background",
    "avoid realistic photo texture",
    "avoid changing facial proportions",
    "avoid opening closed eyes",
    "avoid altering hand pose or instrument shape",
    style.promptHint,
  ].join(", ");
}

export function buildImageRestorePrompt(styleId: string) {
  const style =
    restoreStylePresets.find((item) => item.id === styleId) ??
    restoreStylePresets[0];

  return [
    "Professional archival photo restoration",
    "preserve original identity and facial features",
    "realistic skin texture",
    "repair scratches, dust, stains, folds, cracks and damaged areas",
    "recover fine details naturally",
    "balanced exposure and contrast",
    "authentic historical appearance",
    "preserve original hairstyle and clothing",
    "maintain era characteristics",
    "film grain preservation",
    "non-destructive restoration",
    "documentary photography realism",
    "photographic realism",
    "realistic eyes and hands",
    style.promptHint,
    "Avoid anime, cartoon, painting, illustration, CGI, AI face, beauty filter, plastic skin, oversaturated colors, modern appearance, fake smile, distorted anatomy, blurry, low quality, over-sharpening",
  ].join(", ");
}
