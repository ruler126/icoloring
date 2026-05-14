import { Studio } from "@/components/studio";

const highlights = [
  "提示词生成完整图片",
  "文本生成可打印线稿",
  "照片一键转换黑白线稿",
  "照片生成动漫风格",
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <section className="py-4 sm:py-7">
        <div className="max-w-4xl">
          <div className="text-sm font-semibold text-sky-700">
            AI 生图创作台
          </div>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            更快生成图片、线稿和动漫化效果
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            输入想法即可生成图片或涂色页，也可以上传照片转换成线稿或动漫风格。界面已按常用流程整理：选模式、填内容、生成、预览、下载。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {highlights.map((item) => (
              <span
                key={item}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-3">
        <Studio />
      </section>
    </main>
  );
}
