import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { prisma } from '@/lib/db';
import { analyzeIntent } from '@/lib/ai/intent';
import { generateOutline } from '@/lib/ai/outline';
import type { IntentResult, ProjectDetail, Outline, VideoSource } from '@/types';

const schema = z.object({
  projectId: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

/**
 * POST /api/agent/chat
 * Agent 入口：接收用户提示词，意图分析后路由到具体能力。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    const { projectId, content } = parsed.data;

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // 1) 写入用户消息
    const userMessage = await prisma.message.create({
      data: {
        projectId,
        role: 'user',
        content,
        metadata: { kind: 'text' },
      },
    });

    // 2) 意图分析
    let intent: IntentResult;
    let assistantContent = '';
    let assistantMetadata: any = { kind: 'text' };
    let projectUpdate: Partial<{ title: string; outline: Outline; videoSource: VideoSource }> = {};

    try {
      intent = await analyzeIntent(projectId, content);
    } catch (err) {
      console.error('[intent] 失败', err);
      intent = { action: 'unknown', reason: '意图分析失败', params: {} };
    }

    // 3) 按 action 路由
    switch (intent.action) {
      case 'generate_outline':
      case 'regenerate_outline': {
        const outline = await generateOutline(project.type as 'image' | 'html', content);
        projectUpdate.outline = outline;
        // 第一次生成大纲时把项目标题也更新
        if (intent.action === 'generate_outline' && !project.outline) {
          projectUpdate.title = outline.title;
        }
        // 新大纲意味着旧的视频源作废
        projectUpdate.videoSource = { frames: outline.frames.map(f => ({ id: f.id })) };
        assistantContent = `已为您生成大纲《${outline.title}》，共 ${outline.frames.length} 个分镜。`;
        assistantMetadata = { kind: 'outline', outline };
        break;
      }
      case 'add_frame':
        assistantContent = '新增分镜功能开发中，您可以先让我"重新生成大纲"，或者在完整大纲弹窗中查看已有分镜。';
        break;
      case 'delete_frame':
        assistantContent = '删除分镜功能开发中。';
        break;
      case 'regenerate_frame':
        assistantContent = '重生成分镜功能开发中。您可以在右侧预览区上方点击"查看完整大纲"逐个重新生成。';
        break;
      default:
        assistantContent = `抱歉，我暂时还不理解您的指令。\n\n我能做的：\n• 创作新视频（输入主题即可）\n• 重新生成大纲\n• 在完整大纲弹窗中逐个重生成画面或旁白\n\n请试试："做一个 3 分钟介绍黑洞的视频"`;
    }

    // 4) 更新项目（如有）
    let updatedProject = project;
    if (Object.keys(projectUpdate).length) {
      updatedProject = await prisma.project.update({
        where: { uuid: projectId },
        data: projectUpdate as any,
      });
    }

    // 5) 写助手消息
    const assistantMessage = await prisma.message.create({
      data: {
        projectId,
        role: 'assistant',
        content: assistantContent,
        metadata: assistantMetadata,
      },
    });

    // 6) 返回
    const detail: ProjectDetail = {
      uuid: updatedProject.uuid,
      title: updatedProject.title,
      type: updatedProject.type as 'image' | 'html',
      styleId: updatedProject.styleId,
      outline: (updatedProject.outline as unknown as Outline) ?? null,
      videoSource: (updatedProject.videoSource as unknown as VideoSource) ?? null,
      createdAt: updatedProject.createdAt.toISOString(),
      updatedAt: updatedProject.updatedAt.toISOString(),
      hasOutline: !!updatedProject.outline,
    };

    return NextResponse.json({
      userMessage: { ...userMessage, createdAt: userMessage.createdAt.toISOString() },
      assistantMessage: { ...assistantMessage, createdAt: assistantMessage.createdAt.toISOString() },
      project: detail,
      intent,
    });
  } catch (err) {
    console.error('[POST /api/agent/chat]', err);
    return NextResponse.json({ error: 'AI 处理失败' }, { status: 500 });
  }
}

// suppress unused import warning for uuid (will be used in extended handlers)
void uuid;
