import { Button, Empty } from "@shiguang/ui";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <Empty
      title="页面不存在"
      hint="该页面不存在或链接已失效。"
      action={
        <Link to="/">
          <Button variant="primary">返回首页</Button>
        </Link>
      }
    />
  );
}
