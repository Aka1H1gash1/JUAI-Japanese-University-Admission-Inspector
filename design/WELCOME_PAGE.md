# JapanGrad 进入页

## 方向

独立的单屏入口，面向日本升学准备者。保留 JapanGrad 名称与书本品牌标记、现有靛蓝色，使用同一套冷色中性色。页面只展示标题、短说明、一个进入工作区入口。现有应用路由与导航不变，新增 `/welcome`，网站根地址进入此页。

- DESIGN_VARIANCE: 6。左文右景，主图与细节图构成不对称视觉。
- MOTION_INTENSITY: 4。文字按层级轻缓入场；画面缓慢缩放与小幅指针景深，不拦截滚动。
- VISUAL_DENSITY: 2。没有功能卡、统计、装饰性标签或重复入口。

使用现有 Vue / Vue Router，不新增动效依赖。原生 CSS 负责 transform / opacity 动画，指针位置通过一帧一次 DOM CSS 变量更新，避免连续响应式重渲染。按钮为胶囊，图片为 18px 圆角。只使用既有图标家族与品牌标记。OS reduced-motion、用户暂停、后台标签页均停止自动动态；卸载时清理媒体监听、可见性监听、预加载元素与 RAF。

## 视觉资源

通过内置 imagegen 生成，两张最终图片保存为本地 JPEG，保留原始生成文件不覆盖。素材为虚构的校园建筑意象，不声明对应任何真实学校。

- `apps/web-antd/public/images/welcome/campus-passage.jpg`
- `apps/web-antd/public/images/welcome/campus-light.jpg`

主图提示：Create a portrait 4:5 premium editorial photograph-style image for a minimal Japanese graduate-school planning website. A quiet contemporary Japanese university garden passage: pale architectural concrete, a shallow still reflecting pool, a gently curving stone walkway, a single elegant tree with sparse leaves and fine shadows, distant academic buildings reduced to simple forms. Morning atmosphere, poetic but physically believable architectural photography, natural subtle film texture, restrained cool silver-grey and very muted indigo blue, off-white daylight, no warm beige and no yellow. Sophisticated balanced composition with clear depth and open sky in the upper third, lovely soft reflections. No people, no identifiable real university, no signage, no text, no letters, no logo, no frames, no UI, no collage. Photorealistic image, not illustration, clean unobstructed photograph, thoughtfully composed for an immersive calm entrance page.

细节图提示：Create a landscape 3:2 premium editorial photograph-style image for the same minimal Japanese graduate-school planning website. A close architectural view through a pale concrete university window opening toward softly lit water and a distant elegant tree, delicate reflected daylight on a pale wall and a narrow ledge. Intimate quiet framing, real natural surface texture, sophisticated Japanese contemporary architecture, restrained cool silver-grey and very muted indigo blue with off-white daylight. Dreamlike calm but physically believable architectural photography, a consistent visual world with a contemporary Japanese campus garden, no warm beige and no yellow. No people, no identifiable real university, no signage, no text, no letters, no logos, no frames, no UI, no collage. Focus on light, reflection and depth. A simple uncluttered photograph with clear dark-light structure.

字体：本地 Manrope 可变字体用于拉丁字符，中文沿用系统无衬线字体。来源为 google/fonts 的 ofl/manrope，授权随 `public/fonts/Manrope-OFL.txt` 保存。没有运行时字体或图片 CDN 依赖。

## 检查范围

检查单屏布局、两种配色、减少动态、触控布局、入口链接、图像尺寸与本地素材路径。页面没有表单、数据统计或社会证明，相应营销页检查项不适用。保留现有工作区应用的加载 / 空数据 / 错误处理。进入页自身提供图片失败重载与导航失败提示。

实际查看：1440×900 浅色与深色、390×844 手机布局。两张图片与本地字体加载完成，手机无横向溢出，进入按钮在首屏内；减少动态模式下活动动画数量为 0。根地址转到 `/welcome`，进入按钮转到 `/japan-grad/overview`，进入页不挂载工作区侧栏。正文对比度浅色 5.83:1、深色 9.18:1，主按钮浅色 6.38:1、深色 7.71:1。Vue 类型检查与 Vite 构建通过。

页面截图位于 `design/screenshots/welcome-desktop-light.png`、`welcome-desktop-dark.png`、`welcome-mobile.png`。没有新增测试文件或运行自动化测试套件。
