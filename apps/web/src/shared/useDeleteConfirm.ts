import { App } from "antd";

export interface DeleteConfirmOptions {
  title: string;
  content?: string;
  okText?: string;
  onConfirm: () => void;
}

/**
 * 统一的删除二次确认。基于已挂载的 antd <App> 提供的命令式 modal.confirm，
 * 复用 danger 按钮样式，避免在各删除入口重复造弹窗。
 */
export function useDeleteConfirm() {
  const { modal } = App.useApp();
  return {
    confirmDelete(options: DeleteConfirmOptions) {
      modal.confirm({
        title: options.title,
        content: options.content,
        okText: options.okText ?? "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: options.onConfirm,
      });
    },
  };
}
