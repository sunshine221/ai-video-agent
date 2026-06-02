'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Images, Code2, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';
import type { ProjectType } from '@/types';

interface ModeCard {
  type: ProjectType;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
}

const modes: ModeCard[] = [
  {
    type: 'image',
    title: '图片轮播模式',
    subtitle: 'AI 自动生成画面图片',
    description: 'AI 文生图生成多张高质量图片，配上语音旁白与字幕，快速生成知识讲解类视频。',
    features: ['文生图 · 多分镜', 'TTS 旁白', '字幕自动同步', '淡入淡出转场'],
    icon: <Images className="h-7 w-7" />,
    gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent',
    iconBg: 'bg-blue-500/10 text-blue-600',
  },
  {
    type: 'html',
    title: 'HTML 动画模式',
    subtitle: 'AI 自动生成网页动画',
    description: 'AI 为每个分镜生成专属 HTML/CSS/JS 动画，专业感更强，适合科技讲解、动态可视化场景。',
    features: ['网页动画 · 多风格', 'TTS 旁白', '字幕自动同步', '3 套内置视觉风格'],
    icon: <Code2 className="h-7 w-7" />,
    gradient: 'from-purple-500/10 via-fuchsia-500/5 to-transparent',
    iconBg: 'bg-purple-500/10 text-purple-600',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<ProjectType | null>(null);

  async function handleCreate(type: ProjectType) {
    setLoading(type);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建项目失败');
      toast.success('项目创建成功');
      router.push(`/projects/${data.uuid}`);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/60 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-none">{env.APP_NAME}</div>
              <div className="text-xs text-muted-foreground mt-0.5">AI 视频创作一站式</div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="container py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            输入提示词 · AI 全流程生成
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            让 AI 帮你<span className="text-primary"> 创作视频</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            从脚本、分镜、画面到旁白，AI 全程自动化。
            <br />
            选择一种创作模式，几分钟内生成完整视频。
          </p>
        </div>

        {/* Mode Cards */}
        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-2">
          {modes.map(mode => (
            <Card
              key={mode.type}
              className="group relative overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${mode.gradient} opacity-50`} />
              <div className="relative">
                <CardHeader>
                  <div
                    className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl ${mode.iconBg}`}
                  >
                    {mode.icon}
                  </div>
                  <CardTitle className="text-xl">{mode.title}</CardTitle>
                  <CardDescription className="text-sm">{mode.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{mode.description}</p>
                  <ul className="grid grid-cols-2 gap-y-1.5 text-sm">
                    {mode.features.map(f => (
                      <li key={f} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={loading !== null}
                    onClick={() => handleCreate(mode.type)}
                  >
                    {loading === mode.type ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        创建项目中...
                      </>
                    ) : (
                      <>
                        开始创作
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>

        {/* Footer hint */}
        <p className="mt-12 text-center text-xs text-muted-foreground">
          首次使用请先在 <code className="rounded bg-muted px-1.5 py-0.5">.env</code> 中配置 AI API Key
        </p>
      </main>
    </div>
  );
}
