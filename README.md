# Facial Anatomy Lab · 面部表情解剖实验室

人类面部肌肉与动物面部动作的浏览器交互示意工具。人类页面包含开放头颈解剖网格、29 个肌群控件、下颌开合、表情预设和表皮显示；动物页面包含鱼、蛙、安乐蜥、猫、狗的 19 个动作通道。

## 使用

访问 GitHub Pages 发布的 HTTPS 地址即可使用；首页为人类实验室，animals.html 为动物动作比较。网页由静态托管服务提供，不需要发布者的个人电脑保持开机。首次载入及刷新需要网络，交互在浏览器中执行。

- 拖动模型旋转、滚轮缩放；点击结构或目录查看对应动作。
- 调节单个通道、选择预设、播放或暂停，比较不同组合。
- 切换骨骼、肌群和表皮时保留当前姿态。
- 导出按钮将当前动作参数保存为 JSON。

完整公开说明见 [使用、模型范围与来源](methods.html)。若载入失败，请检查网络并使用支持 WebGL 的新版浏览器；模型较大，首次加载可能需要等待。

## GitHub Pages

这是不需要构建的静态网站，部署内容位于仓库根目录，可使用 GitHub Pages 的根目录发布方式。.nojekyll 保留静态文件的直接发布行为。

应用、数据、模型与文档使用相对路径，兼容 GitHub Pages 的 /仓库名/ 子路径。启用 Pages 后，以仓库 Pages 设置显示的 HTTPS 网址为访问入口。

## 文件

- index.html、app.js、viewer.js：人类实验室、交互控制和三维模型。
- skin-binding.js、muscle-display.js、exploration.js、workbench.js：示意表皮传递、显示、动作比较和组合控制。
- animals.html、animals.js、animal-viewer.js：动物动作比较与程序几何。
- data/：公开运行数据、动作预设和来源条目。
- assets/source-models/head-neck.json：运行时头颈网格；相邻目录保留所需署名和许可。
- vendor/：随附 Three.js 及其许可。
- methods.html：公开使用说明、已知模型范围、书籍引用与来源链接。

此仓库不包含私人研究记录、原书 PDF、扫描图、个人截图、日志、测试产物或完整上游模型归档。

## 模型范围

人类来源网格是静态解剖表面，应用自行增加示意运动。动物头部是程序生成的简化几何，不是扫描或经个体标定的解剖重建。滑块幅度、动作时序和驱动路径用于观察，不代表实测肌力、EMG、组织应变、FACS 强度或独立神经控制量。

本应用不求解真实组织力学、接触和体积守恒。皮肤传递是近似几何对应，大幅组合可能出现穿插。AnimalFACS 描述可见动作，不将单一动作直接翻译为确定情绪；本模型没有通过 AnimalFACS 编码一致性验证。

## 来源与许可

- 人类网格：Écorché（Charleeh），基于 BodyParts3D © The Database Center for Life Science 和 Z-Anatomy（Gauthier Kervyn）。网站选择头颈结构、重组为 JSON 并增加示意运动，衍生网格沿用 CC BY-SA 4.0。[完整署名](assets/source-models/ecorche/ATTRIBUTION.md)、[CC BY-SA 4.0 全文](assets/source-models/ecorche/LICENSES/CC-BY-SA-4.0.txt)、[Z-Anatomy 许可说明](assets/source-models/z-anatomy/License.txt)。
- Three.js：[MIT 许可](vendor/LICENSE-three.txt)。
- 原始应用代码与程序动物几何：[项目 MIT 许可](LICENSE)。第三方模型不因应用采用 MIT 而改变许可。
- 人类动作引用 Uldis Zarins 的 Anatomy of Facial Expression（2017），保留转述和页码，不提供原书或扫描图。各动物动作的公开研究来源列在动物页面内。

公开来源与方法入口：[methods.html](methods.html)。
