/**
 * @module 「文本」页签的批量编辑面板
 *
 * <p>剧情列表里选中 2 条以上记录时，「文本」页签不再显示单条记录的表单，而是换成这个面板：
 * 一次改**所有选中记录**的说话人名称 / 阵营 / 对话内容 / 场景名称 / 显示速度。
 *
 * <h3>为什么是"逐项点应用"而不是"边打字边生效"</h3>
 * 批量改动一次可能动几十条记录，而且"把 20 条台词全换成同一段"是不可逆的破坏性操作
 * （只能靠 Ctrl+Z）。所以每个字段都是「填值 → 点『应用到 N 条』」，
 * 用户能先填好再决定要不要落盘；每次点击整批算**一步**撤销。
 *
 * <h3>几个刻意的取舍</h3>
 * <ul>
 *   <li>说话人 / 阵营 / 场景 的输入框初值取"选中的记录在这项上的**共同值**"，
 *       不一致时留空并用占位文字说明"多条记录不同"——不猜用户想统一成哪一个；</li>
 *   <li>**自由文本记录跳过说话人与阵营**（它们没有说话人名片，与单条面板不显示这两个输入框一致），
 *       跳过几条写在字段下方；</li>
 *   <li>对话内容提供两种改法：「统一设置为」（整段替换）与「查找替换」（只改命中的文字，
 *       适合批量改错别字 / 称呼）；查找替换会**先算出影响范围**再让用户点确认；</li>
 *   <li>留空 = 不修改（说话人名称 / 对话内容），而阵营与场景"留空 = 清空"——
 *       这两个字段空着本来就是合法状态。</li>
 * </ul>
 *
 * @see module:properties/batchEdit 逐条改写器（纯函数）
 * @see module:properties/BatchEffectsEditor 「特效」页签的批量面板
 */
import React, { useMemo, useState } from "react";
import {
  TEXT_SPEED_MAX,
  TEXT_SPEED_MIN,
  TEXT_SPEED_STEP,
  normalizeTextSpeed,
} from "@features/common/utils/projectSettings";
import { BatchEditBar, useBatchEditStatus } from "./BatchEditBar";
import {
  BatchEditContext,
  batchDialogueMutator,
  commonDialogueValue,
  commonTextSpeed,
  countFreeTextRecords,
  planTextReplace,
  replaceDialogueTextMutator,
} from "./batchEdit";
import "./BatchEdit.css";

/** 对话内容的两种批量改法 */
type TextMode = "set" | "replace";

/** 选中记录在这个字段上的值不一致时，输入框的占位文字 */
const MIXED_PLACEHOLDER = "多条记录不同（留空则不修改）";

export interface BatchTextEditorProps {
  /** 选中的记录与写回函数（由 RecordEditor 组装） */
  batch: BatchEditContext;
  /** 与单条「文本」面板同一个入口：跳到「全局设置」的「文字显示速度（全局）」 */
  onOpenGlobalSpeed?: () => void;
}

/**
 * @component 文本页签的批量编辑面板
 */
const BatchTextEditor: React.FC<BatchTextEditorProps> = ({
  batch,
  onOpenGlobalSpeed,
}) => {
  const { records, apply, exit } = batch;
  const { status, report } = useBatchEditStatus();

  const count = records.length;
  const freeTextCount = countFreeTextRecords(records);
  const speakerEditableCount = count - freeTextCount;

  // 共同值：undefined = 选中的记录在这项上不一致（输入框留空，靠 placeholder 说明）
  const commonSpeaker = commonDialogueValue(records, "speakerName");
  const commonFaction = commonDialogueValue(records, "faction");
  const commonLocation = commonDialogueValue(records, "location");
  const commonText = commonDialogueValue(records, "text");
  const commonSpeed = commonTextSpeed(records);
  // 速度不一致时先用"第 1 条记录"的值，并把这件事写在提示里
  const firstSpeed = normalizeTextSpeed(records[0]?.dialogue?.speed);

  const [speakerDraft, setSpeakerDraft] = useState(commonSpeaker ?? "");
  const [factionDraft, setFactionDraft] = useState(commonFaction ?? "");
  const [locationDraft, setLocationDraft] = useState(commonLocation ?? "");
  const [textDraft, setTextDraft] = useState(commonText ?? "");
  const [speedDraft, setSpeedDraft] = useState(commonSpeed ?? firstSpeed);
  const [textMode, setTextMode] = useState<TextMode>("set");
  const [findDraft, setFindDraft] = useState("");
  const [replaceDraft, setReplaceDraft] = useState("");
  const [matchCase, setMatchCase] = useState(false);

  /**
   * 查找替换的影响范围：边打字边算（纯计算，不发请求、不改记录），
   * 让用户点"替换"之前就知道会改到几条、几处。
   */
  const replacePlan = useMemo(
    () => planTextReplace(records, findDraft, { matchCase }),
    [records, findDraft, matchCase],
  );

  /** @function 报告一次批量改动的结果 */
  const reportApplied = (changed: number) => {
    if (changed > 0) {
      report(`已修改 ${changed} 条记录`);
      return;
    }
    report(`没有变化：这 ${count} 条记录已经是这个值`, "info");
  };

  const applySpeaker = () => {
    const name = speakerDraft.trim();
    if (!name || speakerEditableCount === 0) return;
    reportApplied(apply(batchDialogueMutator({ speakerName: name })));
  };

  const applyFaction = () => {
    if (speakerEditableCount === 0) return;
    reportApplied(apply(batchDialogueMutator({ faction: factionDraft.trim() })));
  };

  const applyLocation = () => {
    reportApplied(apply(batchDialogueMutator({ location: locationDraft.trim() })));
  };

  const applyText = () => {
    if (!textDraft.trim()) return;
    // 台词支持换行：原样写回，只拒绝"全是空白"的输入（与单条面板不 trim 一致）
    reportApplied(apply(batchDialogueMutator({ text: textDraft })));
  };

  const applyReplace = () => {
    if (!findDraft) return;
    reportApplied(
      apply(
        replaceDialogueTextMutator(findDraft, replaceDraft, {
          matchCase,
        }),
      ),
    );
  };

  const applySpeed = () => {
    reportApplied(apply(batchDialogueMutator({ speed: speedDraft })));
  };

  return (
    <div className="batch-edit batch-text-editor">
      <BatchEditBar
        count={count}
        hint={`下面的修改会同时写入选中的 ${count} 条记录，整批算一步（Ctrl+Z 一次撤销）。`}
        note={
          freeTextCount > 0
            ? `其中 ${freeTextCount} 条是「自由文本」：没有说话人名片，所以「说话人名称 / 阵营」不会改到它们。`
            : undefined
        }
        status={status}
        onExit={exit}
      />

      {/* 说话人名称 */}
      <div className="batch-edit-field">
        <label htmlFor="batch-dialogue-speaker">说话人名称</label>
        <div className="batch-edit-row">
          <input
            id="batch-dialogue-speaker"
            type="text"
            value={speakerDraft}
            placeholder={
              commonSpeaker === undefined ? MIXED_PLACEHOLDER : "留空则不修改"
            }
            onChange={(e) => setSpeakerDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySpeaker();
              }
            }}
            disabled={speakerEditableCount === 0}
          />
          <button
            type="button"
            className="batch-edit-apply"
            onClick={applySpeaker}
            disabled={speakerEditableCount === 0 || !speakerDraft.trim()}
            aria-label={`说话人名称：应用到 ${speakerEditableCount} 条`}
            title="把上面填的名字写到选中的记录上（会清掉旧的角色名片，由后端按名字生成临时名片）"
          >
            应用到 {speakerEditableCount} 条
          </button>
        </div>
        <p className="batch-edit-field-hint">
          {speakerEditableCount === 0
            ? "选中的记录都是自由文本：没有说话人名片，名称与阵营无法修改。"
            : "改名字会清掉这条记录原来的角色名片（改名后由后端按名字生成临时名片）。"}
        </p>
      </div>

      {/* 说话人阵营 */}
      <div className="batch-edit-field">
        <label htmlFor="batch-dialogue-faction">说话人阵营</label>
        <div className="batch-edit-row">
          <input
            id="batch-dialogue-faction"
            type="text"
            value={factionDraft}
            placeholder={
              commonFaction === undefined
                ? "多条记录不同（留空 = 清空阵营）"
                : "留空 = 清空阵营"
            }
            onChange={(e) => setFactionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyFaction();
              }
            }}
            disabled={speakerEditableCount === 0}
          />
          <button
            type="button"
            className="batch-edit-apply"
            onClick={applyFaction}
            disabled={speakerEditableCount === 0}
            aria-label={`说话人阵营：应用到 ${speakerEditableCount} 条`}
            title="阵营留空 = 把选中的记录阵营清空"
          >
            应用到 {speakerEditableCount} 条
          </button>
        </div>
      </div>

      {/* 对话内容：统一设置 / 查找替换 */}
      <div className="batch-edit-field">
        <span className="batch-edit-field-label">对话内容</span>
        <div
          className="batch-edit-modes"
          role="radiogroup"
          aria-label="对话内容的批量改法"
        >
          <label>
            <input
              type="radio"
              name="batch-dialogue-mode"
              checked={textMode === "set"}
              onChange={() => setTextMode("set")}
            />
            统一设置为
          </label>
          <label>
            <input
              type="radio"
              name="batch-dialogue-mode"
              checked={textMode === "replace"}
              onChange={() => setTextMode("replace")}
            />
            查找替换
          </label>
        </div>

        {textMode === "set" ? (
          <>
            <div className="batch-edit-row">
              <textarea
                aria-label="对话内容"
                value={textDraft}
                rows={5}
                placeholder={
                  commonText === undefined
                    ? MIXED_PLACEHOLDER
                    : "输入要统一设置的台词；按 Enter 换行"
                }
                onChange={(e) => setTextDraft(e.target.value)}
              />
            </div>
            <div className="batch-edit-row">
              <button
                type="button"
                className="batch-edit-apply"
                onClick={applyText}
                disabled={!textDraft.trim()}
                aria-label={`对话内容：应用到 ${count} 条`}
                title={`把这 ${count} 条记录的台词都替换成上面这一段`}
              >
                应用到 {count} 条
              </button>
            </div>
            <p className="batch-edit-field-hint">
              整段替换：原有台词会丢（可按 Ctrl+Z 撤销）。只想改其中几个字，用「查找替换」。
            </p>
          </>
        ) : (
          <>
            <div className="batch-edit-row">
              <input
                type="text"
                aria-label="查找内容"
                value={findDraft}
                placeholder="要查找的文字"
                onChange={(e) => setFindDraft(e.target.value)}
              />
              <input
                type="text"
                aria-label="替换为"
                value={replaceDraft}
                placeholder="替换成（留空 = 删除）"
                onChange={(e) => setReplaceDraft(e.target.value)}
              />
            </div>
            <div className="batch-edit-row">
              <label className="batch-edit-inline-check">
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={(e) => setMatchCase(e.target.checked)}
                />
                区分大小写
              </label>
              <button
                type="button"
                className="batch-edit-apply"
                onClick={applyReplace}
                disabled={!findDraft}
                aria-label="对话内容：替换"
                title="只替换命中的文字，其余内容原样保留"
              >
                替换
              </button>
            </div>
            <p className="batch-edit-field-hint">
              {findDraft
                ? replacePlan.occurrences > 0
                  ? `将在 ${replacePlan.records} 条记录里替换 ${replacePlan.occurrences} 处`
                  : "选中的记录里没有找到这段文字"
                : "输入要查找的文字后会先算出影响范围"}
            </p>
          </>
        )}
      </div>

      {/* 场景名称 */}
      <div className="batch-edit-field">
        <label htmlFor="batch-dialogue-location">场景名称</label>
        <div className="batch-edit-row">
          <input
            id="batch-dialogue-location"
            type="text"
            value={locationDraft}
            placeholder={
              commonLocation === undefined
                ? "多条记录不同（留空 = 清空场景）"
                : "留空 = 清空场景"
            }
            onChange={(e) => setLocationDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLocation();
              }
            }}
          />
          <button
            type="button"
            className="batch-edit-apply"
            onClick={applyLocation}
            aria-label={`场景名称：应用到 ${count} 条`}
            title="地点牌上的场景名称；留空 = 清空"
          >
            应用到 {count} 条
          </button>
        </div>
        <p className="batch-edit-field-hint">
          对话内容上方的地点牌文字；留空则这几条记录都不显示地点牌。
        </p>
      </div>

      {/* 显示速度 */}
      <div className="batch-edit-field">
        <label htmlFor="batch-dialogue-speed">显示速度</label>
        <div className="batch-edit-row">
          <input
            id="batch-dialogue-speed"
            type="range"
            min={TEXT_SPEED_MIN}
            max={TEXT_SPEED_MAX}
            step={TEXT_SPEED_STEP}
            value={speedDraft}
            onChange={(e) => setSpeedDraft(normalizeTextSpeed(e.target.value))}
          />
          <span className="batch-edit-value">{speedDraft}</span>
          <button
            type="button"
            className="batch-edit-apply"
            onClick={applySpeed}
            disabled={commonSpeed === speedDraft}
            aria-label={`显示速度：应用到 ${count} 条`}
            title={`把这 ${count} 条记录的显示速度都改成 ${speedDraft} 档`}
          >
            应用到 {count} 条
          </button>
        </div>
        <p className="batch-edit-field-hint">
          {commonSpeed === undefined
            ? `选中的记录速度不一致，滑杆先停在第一条的 ${firstSpeed} 档`
            : `选中的记录现在都是 ${commonSpeed} 档`}
          {onOpenGlobalSpeed && (
            <>
              {" · "}
              <button
                type="button"
                className="batch-edit-link"
                onClick={onOpenGlobalSpeed}
                title="前往「全局设置」统一修改所有文本的显示速度"
              >
                ⚙️ 全局显示速度设置
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default BatchTextEditor;
