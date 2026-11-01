# AGENTS.md — 本仓库协作约定

本仓库由多个模型先后维护。**动手之前先读 `HANDOFF.md`**，它记录了基线、已具备的能力、已知不足和完整改动日志。

## 硬性约定

1. **基线**：`5d4e0ce`，标签 `baseline-codex-5d4e0ce`。基线之前是 Codex 的工作成果。
2. **归属可辨**：`baseline-codex-5d4e0ce` 之后的提交里，凡以 `[WB]` 开头的，均为 WorkBuddy（DeepSeek-V4.1）所做，不属于 Codex 的历史。看到 `[WB]` 先查 `HANDOFF.md` 改动日志，不要当成自己的旧实现去重写或回退。
3. **每次改动都要记账**：在 `HANDOFF.md`「改动日志」追加一条（日期、改了哪些文件、为什么、怎么验证、怎么回滚）。
4. **不要动**：`baseline-codex-5d4e0ce` 标签、`docs/baseline-manifest-5d4e0ce.txt`。不要 force push，不要 squash 基线之后的提交。
5. **前端与评分是两套逻辑**：`scripts/slopeDrivingConfig.js` 定义工况与评分项，`scripts/slopeDrivingAssessment.js` 是判分实现。改评分先改 config 的语义，再动 assessment。
6. **归档目录只读**：`E:\100-工作\110-课程建设\publish-hxd1c-slope-driving-training-pages` 已冻结，仅作素材参考，不在其中改代码。

## 开工前先自查，避免重复劳动

- 手柄贴图帧、单阀 12 帧、单缓按住式、两站一区间场景、桥梁/轨面接头——这些**已经修过**，不要再"发现"并重做一遍。
- 已知未解决的是：评分绑死固定距离与级位、单质点动力学、参数未实证校准、首屏 12.5 MiB、真机与并发未验证。详细清单见 `HANDOFF.md` 第 4 节。

## 验证

```powershell
npm test          # 基线 7/7 通过，改动后不得减少
npm run serve     # http://127.0.0.1:4194/
```

三维线路资源通过 `fetch()` 加载，不能直接双击 `index.html`。

## 本项目的既有风格

- 注释、文档、界面文案用中文；变量与文件名用英文。
- 参数不写死魔法数：工况参数集中在 `slopeDrivingConfig.js`。
- 教学声明要诚实：仿真参数不等于规章条文，页面与文档都要保留「教学标定值，需按真实操纵示意图校准」这类边界说明。
