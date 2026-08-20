import { Modal, Radio } from "antd";
import { useEffect, useState } from "react";

export type ImportResolutionValue = "skip" | "replace" | "rename";

export interface ImportConflict {
  title: string;
  existingId: string;
}

/**
 * 导入前检测到同名文档时，逐项让用户选择：保留原有（跳过）/ 替换原有内容 / 重命名后导入。
 * 用户点「继续导入」回传决议表，点「取消」回传 null（调用方应中止导入）。
 */
export function ImportConflictModal({
  open,
  conflicts,
  onResolve,
}: {
  open: boolean;
  conflicts: ImportConflict[];
  onResolve: (resolutions: Record<string, ImportResolutionValue> | null) => void;
}) {
  const [resolutions, setResolutions] = useState<Record<string, ImportResolutionValue>>({});

  useEffect(() => {
    setResolutions(Object.fromEntries(conflicts.map((c) => [c.title, "skip"])));
  }, [conflicts]);

  return (
    <Modal
      open={open}
      title={`检测到 ${conflicts.length} 个同名文档`}
      okText="继续导入"
      cancelText="取消"
      width={540}
      onOk={() => onResolve(resolutions)}
      onCancel={() => onResolve(null)}
    >
      <p style={{ marginTop: 0, color: "var(--sg-text-muted, #888)" }}>
        以下文档与当前 workspace 已有文档重名，请为每一项选择处理方式：
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 380,
          overflowY: "auto",
        }}
      >
        {conflicts.map((conflict) => (
          <div
            key={conflict.title}
            style={{ padding: "10px 0", borderBottom: "1px solid var(--sg-border, #eee)" }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{conflict.title}</div>
            <Radio.Group
              value={resolutions[conflict.title]}
              onChange={(e) =>
                setResolutions((prev) => ({ ...prev, [conflict.title]: e.target.value }))
              }
            >
              <Radio value="skip">保留原有（跳过）</Radio>
              <Radio value="replace">替换原有内容</Radio>
              <Radio value="rename">重命名后导入</Radio>
            </Radio.Group>
          </div>
        ))}
      </div>
    </Modal>
  );
}
