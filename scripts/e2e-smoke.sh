#!/usr/bin/env bash
# 端到端冒烟：验证 文档→发布→网关 / 知识库→索引→Ask / Research→报告+来源+数据 /
# 演示生成→发布 / 数据集导入→聚合查询 / MCP 工具调用
set -euo pipefail
API=${API_BASE:-http://localhost:3001}
GATEWAY=${GATEWAY_BASE:-http://localhost:3004}
H='x-sg-identity: {"sub":"dev-user"}'
CT='content-type: application/json'
pass=0; fail=0

check() { # check <名称> <命令...>
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "✅ $name"; pass=$((pass+1))
  else
    echo "❌ $name"; fail=$((fail+1))
  fi
}

json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

curl_json() { curl -s -H "$H" -H "$CT" "$@"; }

# 1. 文档 → 发布 → 网关
DOC=$(curl_json -X POST "$API/api/v1/assets" -d '{"type":"document","title":"冒烟测试文档","content":{"markdown":"# 冒烟测试\n\n内容可用。"}}')
ASSET=$(echo "$DOC" | json 'd["id"]')
PUB=$(curl_json -X POST "$API/api/v1/publishes" -d "{\"assetId\":\"$ASSET\",\"visibility\":\"public\"}")
SLUG=$(echo "$PUB" | json 'd["slug"]')
check "文档发布后网关可访问" curl -sf "$GATEWAY/p/$SLUG"

# 2. 知识库 → 索引 → Ask
KB=$(curl_json -X POST "$API/api/v1/knowledge-bases" -d '{"name":"冒烟知识库"}')
KBID=$(echo "$KB" | json 'd["id"]')
curl_json -X POST "$API/api/v1/knowledge-bases/$KBID/sources" -d "{\"sourceType\":\"asset\",\"assetId\":\"$ASSET\"}" >/dev/null
for _ in $(seq 1 10); do
  ST=$(curl -s -H "$H" "$API/api/v1/knowledge-bases/$KBID" | json '[s["status"] for s in d["sources"]][0]' 2>/dev/null || echo pending)
  [ "$ST" = "ready" ] && break
  sleep 2
done
check "知识库来源索引完成" test "$ST" = "ready"
ASK=$(curl_json -X POST "$API/api/v1/knowledge-bases/$KBID/ask" -d '{"query":"内容","topK":3}')
check "知识库 Ask 返回答案" bash -c "echo '$ASK' | grep -q 'insufficient.:false'"

# 3. Research → 报告/来源/数据
TASK=$(curl_json -X POST "$API/api/v1/research/tasks" -d '{"goal":"冒烟调研目标","depth":"quick","outputs":["report","sources"]}')
TID=$(echo "$TASK" | json 'd["task"]["id"]')
for _ in $(seq 1 12); do
  STS=$(curl -s -H "$H" "$API/api/v1/tasks/$TID" | json 'd["status"]')
  case "$STS" in completed*|failed*|partial*|cancelled*) break;; esac
  sleep 2
done
check "Research 任务完成" test "$STS" = "completed"
OUTS=$(curl -s -H "$H" "$API/api/v1/tasks/$TID" | json 'len(d["outputs"])')
check "Research 输出 ≥2 个资产" test "$OUTS" -ge 2

# 4. 演示生成 → 发布 → 网关
PRA_TASK=$(curl_json -X POST "$API/api/v1/presentations/generate" -d "{\"assetId\":\"$ASSET\",\"title\":\"冒烟演示\"}")
PRA_TID=$(echo "$PRA_TASK" | json 'd["task"]["id"]')
for _ in $(seq 1 12); do
  PRA_STS=$(curl -s -H "$H" "$API/api/v1/tasks/$PRA_TID" | json 'd["status"]')
  case "$PRA_STS" in completed*|failed*|partial*|cancelled*) break;; esac
  sleep 2
done
PRA=$(curl -s -H "$H" "$API/api/v1/tasks/$PRA_TID" | json 'd["outputs"][0]["id"]' 2>/dev/null || echo "")
if [ -n "$PRA" ]; then
  PUB2=$(curl_json -X POST "$API/api/v1/publishes" -d "{\"assetId\":\"$PRA\",\"visibility\":\"public\"}")
  SLUG2=$(echo "$PUB2" | json 'd["slug"]')
  check "演示发布后网关可访问" curl -sf "$GATEWAY/p/$SLUG2"
else
  echo "❌ 演示生成无输出"; fail=$((fail+1))
fi

# 5. 数据集导入 → 聚合查询
printf 'city,amount\nA,10\nB,20\nA,30\n' >/tmp/smoke.csv
DSRES=$(curl -s -H "$H" -X POST "$API/api/v1/datasets/import" -F "name=冒烟数据" -F "file=@/tmp/smoke.csv;type=text/csv")
DSID=$(echo "$DSRES" | json 'd["dataset"]["id"]')
for _ in $(seq 1 10); do
  DSV=$(curl -s -H "$H" "$API/api/v1/datasets/$DSID" | json 'd["currentVersion"] and d["currentVersion"]["id"] or ""')
  [ -n "$DSV" ] && break
  sleep 2
done
Q=$(curl_json -X POST "$API/api/v1/datasets/$DSID/query" -d "{\"datasetVersionId\":\"$DSV\",\"groupBy\":[\"city\"],\"aggregations\":[{\"column\":\"amount\",\"op\":\"sum\",\"as\":\"total\"}],\"limit\":10}")
check "数据集聚合查询返回结果" bash -c "echo '$Q' | grep -q '\"total\"'"

# 6. MCP 工具列表
TOK=$(curl -s -H "$H" -H "$CT" -X POST "$API/api/v1/integrations/tokens" -d '{"name":"smoke","scopes":["read"]}' | json 'd["secret"]')
TOOLS=$(curl -s -H "Authorization: Bearer $TOK" -H "$CT" -H "accept: application/json" -X POST "$API/mcp" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | json 'd.get("result",{}).get("tools",[]) and "ok" or ""')
check "MCP tools/list 可用" test "$TOOLS" = "ok"

echo
echo "通过 $pass / $((pass+fail)) 项"
[ "$fail" -eq 0 ]
