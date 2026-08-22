import { Tooltip } from "antd";

/**
 * 统一的「所有者 / 创建者」显示：圆形首字符头像 + Tooltip 悬浮显示全名。
 * 所有列表页（assets / documents / presentations 等）统一使用本组件。
 * 外观样式由 styles/assets.ts 的 .sg-owner-stack / .sg-owner-avatar 全局样式提供。
 */
export function OwnerAvatar({ name }: { name: string }) {
  return (
    <span className="sg-owner-stack">
      <Tooltip title={name}>
        <span className="sg-owner-avatar" role="img" aria-label={`所有者：${name}`}>
          {name.slice(0, 1)}
        </span>
      </Tooltip>
    </span>
  );
}

export default OwnerAvatar;
