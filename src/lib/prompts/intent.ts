/**
 * 意图路由：function-calling 版（收敛工具集）
 *
 * 设计要点：意图是开放的，交给 AI 推理；能力是有限的，用工具枚举。
 * 一切“大纲的文字/结构编辑”（创作、重做、增删镜、改数量、改文字、重排）
 * 都收敛到一个通用工具 edit_outline，不再为每种编辑说法单开动作。
 * 只有“重做画面/配音”这种昂贵且有副作用的能力单独保留（regenerate_media）。
 */
import type { AIToolDef } from '@/lib/ai/client';
import type { IntentAction } from '@/types';

export const INTENT_SYSTEM_PROMPT = `你是一个视频创作智能体的“意图路由器”。请根据用户最新输入，从提供的工具中选择**最合适的一个**来调用，并填好参数。

## 核心原则（务必遵守）
- **大纲的一切文字/结构编辑都用 edit_outline**：创作新视频、重新生成大纲、新增/删除分镜、改变分镜总数、修改某镜的标题/旁白/画面文字、调整顺序……只要是改“大纲内容或结构”，都调用 edit_outline，把用户这句话原样放进 request。
- **edit_outline 绝不重做画面/配音**：改文字/结构不会动已经生成好的画面和音频。
- **只有明确要“重做画面/图/视觉/配音/出图/重新渲染”时**才调用 regenerate_media，并指出是哪几镜（支持一次多镜）。
- **信息不足或有真歧义才调用 ask_user**：例如“改一下”“再来一个”这种缺主语、无法判断改哪里的指令。但只要能明确要做什么（哪怕涉及数字，如“3镜改2镜”“重新生成2个分镜”），就直接用 edit_outline，不要反问。
- **与视频创作无关**（打招呼、闲聊、导出等做不到的事）就调用 not_supported。
- frameIndex 是 **1-based**（用户看到的编号）。`;

/**
 * 工具集（4 个）。工具名 → IntentAction：
 *   edit_outline → edit_outline
 *   regenerate_media → regenerate_media
 *   ask_user → clarify
 *   not_supported → unknown
 */
export const INTENT_TOOLS: AIToolDef[] = [
  {
    name: 'edit_outline',
    description:
      '对视频大纲做任何文字或结构上的创建/修改。涵盖：创作新视频、整体重新生成大纲、新增分镜、删除分镜、改变分镜总数（如“3 镜改 2 镜”）、修改某一镜的标题/旁白/画面描述文字、调整分镜顺序等。只动大纲内容，不会重做已生成的画面和配音。',
    parameters: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: '把用户的修改/创作要求原样或稍加归纳地填在这里，供大纲编辑器执行。',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'regenerate_media',
    description:
      '用户明确要求重新生成某一镜或多镜的画面或配音（重做视觉/重新出图/重新配音/重新渲染）。这是昂贵且会覆盖已有产物的操作，只有用户明说时才用。支持一次多镜。例：“第 5 镜画面重新生成”“这一镜的图重画一下”“第 3 镜配音重录”“1、2、3 镜的旁白和画面都重新生成”。',
    parameters: {
      type: 'object',
      properties: {
        frameIndexes: {
          type: 'array',
          items: { type: 'integer' },
          description: '要重做的分镜编号列表（1-based）。用户说“第 1、2、3 镜”就填 [1,2,3]；单镜就填 [5]。',
        },
        modification: {
          type: 'string',
          description: '对画面/配音的具体要求；只说“重新生成”就填空字符串。',
        },
      },
      required: ['frameIndexes', 'modification'],
    },
  },
  {
    name: 'ask_user',
    description:
      '指令模糊、有歧义、或信息不足以确定要做什么时调用，向用户提出澄清问题。例：“改一下”“再来一个”“这里不太对”这类缺主语、无法判断改哪里的指令。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '向用户确认的问题（中文，一句话，尽量给出可选项）。' },
      },
      required: ['question'],
    },
  },
  {
    name: 'not_supported',
    description: '与视频创作完全无关，或当前无法执行的请求。例：“你好”“今天天气怎么样”“把视频导出”。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

/** 工具名 → IntentAction 映射（ask_user→clarify、not_supported→unknown） */
export function toolNameToAction(toolName: string): IntentAction {
  if (toolName === 'ask_user') return 'clarify';
  if (toolName === 'not_supported') return 'unknown';
  return toolName as IntentAction;
}

export function buildIntentUserPrompt(opts: {
  userInput: string;
  hasOutline: boolean;
  frameCount: number;
  frameTitles: string[];
}): string {
  const ctx = opts.hasOutline
    ? `当前项目已有大纲，共 ${opts.frameCount} 个分镜：\n${opts.frameTitles.map((t, i) => `  #${i + 1} ${t}`).join('\n')}`
    : '当前项目还没有大纲。';
  return `${ctx}\n\n用户最新输入：\n"${opts.userInput}"\n\n请选择合适的工具并调用。`;
}
