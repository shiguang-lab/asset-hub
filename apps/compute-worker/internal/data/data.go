package data

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type Chunk struct {
	Ordinal     int    `json:"ordinal"`
	HeadingPath string `json:"headingPath"`
	Text        string `json:"text"`
	CharStart   int    `json:"charStart"`
	CharEnd     int    `json:"charEnd"`
}

// Normalize converts untrusted content into normalized text + plain text.
func Normalize(content, format string) (normalized, plain string, warnings []string) {
	switch format {
	case "html":
		plain = stripHTML(content)
		return content, plain, nil
	case "json":
		return content, content, nil
	default:
		plain = stripMarkdown(content)
		return content, plain, nil
	}
}

func ChunkText(text string, chunkSize int) []Chunk {
	if chunkSize <= 0 {
		chunkSize = 800
	}
	overlap := chunkSize / 6
	if overlap > 120 {
		overlap = 120
	}
	sections := splitSections(text)
	var chunks []Chunk
	ordinal := 0
	for _, section := range sections {
		body := strings.TrimSpace(section.body)
		if body == "" {
			continue
		}
		cursor := 0
		for cursor < len(body) {
			end := cursor + chunkSize
			if end > len(body) {
				end = len(body)
			}
			cut := end
			if end < len(body) {
				nl := strings.LastIndex(body[:end], "\n")
				dot := strings.LastIndex(body[:end], "。")
				if nl > cursor+chunkSize/2 {
					cut = nl + 1
				} else if dot > cursor+chunkSize/2 {
					cut = dot + 1
				}
			}
			piece := strings.TrimSpace(body[cursor:cut])
			if piece != "" {
				chunks = append(chunks, Chunk{
					Ordinal:     ordinal,
					HeadingPath: section.headingPath,
					Text:        piece,
					CharStart:   section.charStart + cursor,
					CharEnd:     section.charStart + cut,
				})
				ordinal++
			}
			if cut >= len(body) {
				break
			}
			next := cut - overlap
			if next <= cursor {
				next = cursor + 1
			}
			cursor = next
		}
	}
	return chunks
}

type section struct {
	headingPath string
	body        string
	charStart   int
}

func splitSections(text string) []section {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	var sections []section
	heading := ""
	var buffer []string
	start := 0
	offset := 0
	flush := func() {
		if strings.TrimSpace(strings.Join(buffer, "\n")) != "" {
			sections = append(sections, section{headingPath: heading, body: strings.Join(buffer, "\n"), charStart: start})
		}
	}
	for _, line := range lines {
		var match []string
		if idx := strings.Index(line, "#"); idx == 0 {
			rest := line[1:]
			level := 1
			for level < len(rest) && rest[level-1] == '#' {
				level++
			}
			match = []string{line, strings.TrimSpace(strings.TrimLeft(rest, "# "))}
			_ = level
		}
		if len(match) > 0 {
			flush()
			title := match[1]
			heading = title
			buffer = []string{line}
			start = offset
		} else {
			buffer = append(buffer, line)
		}
		offset += len(line) + 1
	}
	flush()
	return sections
}

func stripMarkdown(md string) string {
	md = strings.ReplaceAll(md, "\r\n", "\n")
	var lines []string
	for _, line := range strings.Split(md, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			lines = append(lines, "")
			continue
		}
		line = regexReplace(line, `^#{1,6}\s+`, "")
		line = strings.ReplaceAll(line, "*", "")
		line = strings.ReplaceAll(line, "`", "")
		line = strings.ReplaceAll(line, "~", "")
		line = regexReplace(line, `!\[([^\]]*)\]\([^)]*\)`, "$1")
		line = regexReplace(line, `\[([^\]]*)\]\([^)]*\)`, "$1")
		line = strings.ReplaceAll(line, ">", "")
		line = strings.TrimSpace(line)
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func stripHTML(html string) string {
	var b strings.Builder
	inTag := false
	inScript := 0
	for i := 0; i < len(html); i++ {
		c := html[i]
		if inScript > 0 {
			if strings.HasPrefix(html[i:], "</script") {
				inScript = 0
				inTag = true
			}
			continue
		}
		if c == '<' {
			lower := strings.ToLower(html[i:])
			if strings.HasPrefix(lower, "<script") {
				inScript = 1
				inTag = true
				continue
			}
			inTag = true
			continue
		}
		if c == '>' {
			inTag = false
			continue
		}
		if !inTag {
			if c == ' ' {
				if b.Len() > 0 && b.String()[b.Len()-1] != ' ' {
					b.WriteByte(' ')
				}
			} else {
				b.WriteByte(c)
			}
		}
	}
	return strings.TrimSpace(b.String())
}

func regexReplace(s, pattern, replacement string) string {
	// Minimal regex-free helpers for common markdown patterns.
	switch pattern {
	case `^#{1,6}\s+`:
		for i := 0; i < len(s) && s[i] == '#'; i++ {
			if i+1 < len(s) && s[i+1] == ' ' {
				return strings.TrimSpace(s[i+2:])
			}
		}
	case `!\[([^\]]*)\]\([^)]*\)`:
		if i := strings.Index(s, "!["); i >= 0 {
			if j := strings.Index(s[i:], "]("); j >= 0 {
				text := s[i+2 : i+j]
				return strings.TrimSpace(text)
			}
		}
	case `\[([^\]]*)\]\([^)]*\)`:
		if i := strings.Index(s, "["); i >= 0 {
			if j := strings.Index(s[i:], "]("); j >= 0 {
				text := s[i+1 : i+j]
				return strings.TrimSpace(text)
			}
		}
	}
	return s
}

/* ---------------- dataset query engine ---------------- */

type Row map[string]any

type Filter struct {
	Column string `json:"column"`
	Op     string `json:"op"`
	Value  any    `json:"value,omitempty"`
}

type Sort struct {
	Column    string `json:"column"`
	Direction string `json:"direction"`
}

type Agg struct {
	Column string `json:"column"`
	Op     string `json:"op"`
	As     string `json:"as"`
}

type Column struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type QueryResult struct {
	Columns   []Column `json:"columns"`
	Rows      []Row    `json:"rows"`
	Total     int      `json:"total"`
	Limited   bool     `json:"limited"`
	ElapsedMs int64    `json:"elapsedMs"`
	Warnings  []string `json:"warnings"`
}

func LoadRows(objectRoot, dataKey string) ([]Row, error) {
	path := filepath.Join(objectRoot, filepath.Clean(dataKey))
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read dataset: %w", err)
	}
	return ParseRows(contents)
}

// ParseRows parses the canonical dataset object returned by the API-backed
// object store. Keeping parsing independent of storage lets production use S3
// without sharing a filesystem with the compute worker.
func ParseRows(contents []byte) ([]Row, error) {
	text := string(contents)
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "[") || strings.HasPrefix(trimmed, "{") {
		var parsed []Row
		if err := json.Unmarshal(contents, &parsed); err != nil {
			var obj map[string]any
			if err2 := json.Unmarshal(contents, &obj); err2 != nil {
				return nil, fmt.Errorf("invalid json: %w", err)
			}
			if rows, ok := obj["rows"].([]any); ok {
				for _, r := range rows {
					if m, ok := r.(map[string]any); ok {
						parsed = append(parsed, Row(m))
					}
				}
			}
		}
		return parsed, nil
	}
	delimiter := ','
	firstLine := strings.SplitN(text, "\n", 2)[0]
	if strings.Count(firstLine, "\t") > strings.Count(firstLine, ",") {
		delimiter = '\t'
	}
	reader := csv.NewReader(strings.NewReader(text))
	reader.Comma = delimiter
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parse csv: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("empty dataset")
	}
	headers := records[0]
	var rows []Row
	for _, rec := range records[1:] {
		row := Row{}
		for i, h := range headers {
			var v any
			if i < len(rec) {
				v = coerce(rec[i])
			}
			row[h] = v
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func coerce(raw string) any {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if n, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
		return float64(n)
	}
	if f, err := strconv.ParseFloat(trimmed, 64); err == nil {
		return f
	}
	if trimmed == "true" {
		return true
	}
	if trimmed == "false" {
		return false
	}
	return trimmed
}

func ExecuteQuery(rows []Row, selectCols []string, filters []Filter, sortCols []Sort, groupBy []string, aggs []Agg, limit, offset int) (QueryResult, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	// validate columns
	known := knownColumns(rows)
	validate := func(col string) error {
		if _, ok := known[col]; !ok {
			return fmt.Errorf("unknown column: %s", col)
		}
		return nil
	}
	for _, f := range filters {
		if err := validate(f.Column); err != nil {
			return QueryResult{}, err
		}
	}
	for _, s := range sortCols {
		if err := validate(s.Column); err != nil {
			return QueryResult{}, err
		}
	}
	for _, g := range groupBy {
		if err := validate(g); err != nil {
			return QueryResult{}, err
		}
	}
	for _, a := range aggs {
		if err := validate(a.Column); err != nil {
			return QueryResult{}, err
		}
	}

	filtered := rows[:0:0]
	for _, row := range rows {
		if match(row, filters) {
			filtered = append(filtered, row)
		}
	}
	total := len(filtered)

	if len(sortCols) > 0 {
		sort.SliceStable(filtered, func(i, j int) bool {
			for _, s := range sortCols {
				cmp := compare(filtered[i][s.Column], filtered[j][s.Column])
				if cmp != 0 {
					if s.Direction == "desc" {
						return cmp > 0
					}
					return cmp < 0
				}
			}
			return false
		})
	}

	var outRows []Row
	var columns []Column
	columnSet := map[string]bool{}
	for _, c := range selectCols {
		columns = append(columns, Column{ID: c, Name: c, Type: "any"})
		columnSet[c] = true
	}

	if len(groupBy) > 0 || len(aggs) > 0 {
		groups := map[string][]Row{}
		for _, row := range filtered {
			key := groupKey(row, groupBy)
			groups[key] = append(groups[key], row)
		}
		for _, c := range groupBy {
			if !columnSet[c] {
				columns = append(columns, Column{ID: c, Name: c, Type: "any"})
				columnSet[c] = true
			}
		}
		for _, a := range aggs {
			columns = append(columns, Column{ID: a.As, Name: a.As, Type: "number"})
		}
		for key, group := range groups {
			out := Row{}
			parts := strings.Split(key, "\x01")
			for i, g := range groupBy {
				if i < len(parts) {
					out[g] = parts[i]
				}
			}
			for _, a := range aggs {
				out[a.As] = aggregate(group, a.Column, a.Op)
			}
			outRows = append(outRows, out)
		}
	} else {
		start := offset
		end := offset + limit
		if start > len(filtered) {
			start = len(filtered)
		}
		if end > len(filtered) {
			end = len(filtered)
		}
		cols := selectCols
		if len(cols) == 0 {
			for k := range known {
				cols = append(cols, k)
			}
			sort.Strings(cols)
			for _, c := range cols {
				columns = append(columns, Column{ID: c, Name: c, Type: "any"})
			}
		}
		for _, row := range filtered[start:end] {
			out := Row{}
			for _, c := range cols {
				if v, ok := row[c]; ok {
					out[c] = v
				} else {
					out[c] = nil
				}
			}
			outRows = append(outRows, out)
		}
	}
	return QueryResult{
		Columns:  columns,
		Rows:     outRows,
		Total:    total,
		Limited:  len(filtered) > offset+limit || len(outRows) > limit,
		Warnings: []string{},
	}, nil
}

func knownColumns(rows []Row) map[string]bool {
	out := map[string]bool{}
	for _, r := range rows {
		for k := range r {
			out[k] = true
		}
	}
	return out
}

func match(row Row, filters []Filter) bool {
	for _, f := range filters {
		v := row[f.Column]
		switch f.Op {
		case "eq":
			if fmt.Sprint(v) != fmt.Sprint(f.Value) {
				return false
			}
		case "neq":
			if fmt.Sprint(v) == fmt.Sprint(f.Value) {
				return false
			}
		case "gt":
			if !(compare(v, f.Value) > 0) {
				return false
			}
		case "gte":
			if compare(v, f.Value) < 0 {
				return false
			}
		case "lt":
			if !(compare(v, f.Value) < 0) {
				return false
			}
		case "lte":
			if compare(v, f.Value) > 0 {
				return false
			}
		case "contains":
			if !strings.Contains(fmt.Sprint(v), fmt.Sprint(f.Value)) {
				return false
			}
		case "in":
			if !containsValue(f.Value, v) {
				return false
			}
		case "is_null":
			if v != nil {
				return false
			}
		}
	}
	return true
}

func containsValue(list any, v any) bool {
	switch arr := list.(type) {
	case []any:
		for _, item := range arr {
			if fmt.Sprint(item) == fmt.Sprint(v) {
				return true
			}
		}
	case []string:
		for _, item := range arr {
			if item == fmt.Sprint(v) {
				return true
			}
		}
	}
	return false
}

func compare(a, b any) int {
	af, aok := toFloat(a)
	bf, bok := toFloat(b)
	if aok && bok {
		switch {
		case af < bf:
			return -1
		case af > bf:
			return 1
		default:
			return 0
		}
	}
	return strings.Compare(fmt.Sprint(a), fmt.Sprint(b))
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case string:
		f, err := strconv.ParseFloat(t, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func groupKey(row Row, cols []string) string {
	parts := make([]string, len(cols))
	for i, c := range cols {
		parts[i] = fmt.Sprint(row[c])
	}
	return strings.Join(parts, "\x01")
}

func aggregate(group []Row, column, op string) any {
	var values []float64
	for _, r := range group {
		if f, ok := toFloat(r[column]); ok {
			values = append(values, f)
		}
	}
	if len(values) == 0 {
		return nil
	}
	switch op {
	case "sum":
		sum := 0.0
		for _, v := range values {
			sum += v
		}
		return sum
	case "avg":
		sum := 0.0
		for _, v := range values {
			sum += v
		}
		return sum / float64(len(values))
	case "count":
		return float64(len(values))
	case "min":
		m := values[0]
		for _, v := range values {
			if v < m {
				m = v
			}
		}
		return m
	case "max":
		m := values[0]
		for _, v := range values {
			if v > m {
				m = v
			}
		}
		return m
	default:
		return nil
	}
}
