## 1、AI编程工具
+ **Codex**
+ **Claude Code**
+ Antigravity
+ Cursor



推荐方案：

+ Codex + GPT Plus，使用GPT 5.4/5.3-Codex，5.5太贵了不划算
+ Claude Code + Claude Pro，使用Sonnet 4.6
+ 【预算有限考虑】Claude Code + DeepSeek V4 / GLM5.1 / MiniMax M2.7，使用**CCSwitch**切换模型

## 2、AI API
**为什么订阅了OpenAI、Claude的会员，还要买AI API？**



<font style="color:rgb(47, 48, 52);">AI大模型订阅会员和我们项目里面使用AI API完成功能分析这是两个不同的东西。</font>

<font style="color:rgb(47, 48, 52);">前者是让我们可以使用AI来编程，是在Codex、Claude Code里面消耗token。</font>

<font style="color:rgb(47, 48, 52);">后者是为了让我们开发出来的东西能够使用AI完成产品功能，比如生成动画、生成语音、生成图片，是在这些地方消耗token。</font>



推荐使用中转站接入AI模型，因为模型更新迭代很快，不断有新的模型出现，将来有动画效果更好的模型，只需要环境变量改一下模型的名称就可以切换，而不用改代码重新部署。



中转站推荐：

1、OpenRouter，全球Top1中转站，优点是大品牌，质量有保障，掺水少

2、uniapi： [https://uniapi.ai/register?aff=Cb2x](https://uniapi.ai/register?aff=Cb2x)

3、packyapi：[https://www.packyapi.com/register?aff=tP9k](https://www.packyapi.com/register?aff=tP9k)

4、poloai：[https://poloai.top/register?aff=h6rx](https://poloai.top/register?aff=h6rx)



PS：正式做产品，一定要预留多个AI渠道，遇到问题时重试+自动切换。



国内外最新模型价格一览表：

<!-- 这是一张图片，ocr 内容为：$ 主流大模型TOKEN价格对比 仅展示输入/输出价格?统一单位:美元/每100万TOKENS 输入价格 输出价格 GPT-5.5 PRO $60 (长上下文) $270 GPT-5.5 PRO $30 (短上下文) $180 $10 GPT-5.5 (长上下文) $45 GPT-5.5 $5 (短上下文) $30 GPT-5.4 $5 (长上下文) $22.5 GPT-5.4 $2.5 (短上下文) $15 $5 CLAUDE OPUS 4.7 $25 $3 CLAUDE SONNET 4.6 $15 $4 GEMINI 3.1 PRO PREVIEW $18 (>200K) $2 GEMINI 3.1 PRO PREVIEW $12 (<200K) $1.5 GEMINI 3.5 FLASH $9 1 $0.5 GEMINI 3 FLASH PREVIEW $3 $1.4 GLM 5.1 $4.4 $0.95 KIMI K2.6 I$4 $0.3 MINIMAX M2.7 $1.2 $0.435 DEEPSEEK V4 PRO $0.87 1 $0.14 DEEPSEEK V4 FLASH $0.28 0 50 250 270 200 100 150 价格(美元/每100万 TOKENS) 注:OPENAI与GEMINI的分档模型按上下文/请求规模拆分展示; DEEPSEEKV4PRO为当前促销价;MINIMAX 已按1美元:7元人民币换算. -->
![](https://cdn.nlark.com/yuque/0/2026/png/48011955/1779523398271-8f03fb20-082d-443d-9a4c-e003e2172687.png)

**推荐模型：gemini-3-flash-preview，前端能力、价格、吞吐速度综合考虑最好选择。**

## 3、其他准备
+ Google账号，访问国外很多网站服务会方便很多
+ VSCode，管理查看代码
+ Git，代码版本管理的工具，强烈推荐安装，及时回滚代码
+ GitHub账号，可选，但推荐做Vibe Coding的人都要有自己的GitHub账号，主要用户代码托管。
+ Node.js，代码开发必备
+ 数据库MySQL，存储我们的视频项目数据（本地、云端均可）
+ 对象存储（存储TTS语音文件，未来部署产品到线上推荐使用对象存储，本次训练营就直接存储本地文件系统）



大家好，欢迎大家参与本次AI编程项目实战开发训练营，明天就正式发车了！

对于刚刚接触编程开发、AI编程的新同学，请大家做一些下面的准备工作，注册一些必要的网站账号和安装一些必要的软件工具：

1. 注册Google账号，访问国外很多网站服务会方便很多
2. VSCode，管理查看代码
3. Git，代码版本管理的工具，强烈推荐安装，及时回滚代码
4. GitHub账号，可选，但推荐做Vibe Coding的人都要有自己的GitHub账号，主要用于代码托管。
5. Node.js，代码开发必备，安装22以上版本。
6. 数据库MySQL，存储我们的视频项目数据（本地、云端均可）

另外涉及到AI编程工具、AI API服务的内容，明天咱们的视频里面会详细讲解。

