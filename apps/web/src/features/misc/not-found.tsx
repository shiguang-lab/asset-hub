import { Empty } from "@shiguang/ui";
import { Button } from "antd";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <Empty
      title="页面不存在"
      hint="该页面不存在或链接已失效。"
      action={
        <Link to="/">
          <Button type="primary">返回首页</Button>
        </Link>
      }
    />
  );
}
