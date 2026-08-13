export interface Chunk {
  ordinal: number;
  headingPath: string;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

const MAX_CHUNK = 1200;
const DEFAULT_OVERLAP = 120;

export function chunkText(input: string, options: ChunkOptions = {}): Chunk[] {
  const chunkSize = Math.min(options.chunkSize ?? 800, MAX_CHUNK);
  const overlap = Math.min(options.overlap ?? DEFAULT_OVERLAP, chunkSize / 2);
  const text = input.replace(/\r\n/g, "\n");
  const sections = splitSections(text);
  const chunks: Chunk[] = [];
  let ordinal = 0;
  for (const section of sections) {
    let cursor = 0;
    const body = section.body.trim();
    if (body.length === 0) continue;
    while (cursor < body.length) {
      const end = Math.min(cursor + chunkSize, body.length);
      let cut = end;
      if (end < body.length) {
        const newline = body.lastIndexOf("\n", end);
        const period = body.lastIndexOf("。", end);
        const mark = Math.max(newline, period);
        if (mark > cursor + chunkSize / 2) cut = mark + 1;
      }
      const piece = body.slice(cursor, cut).trim();
      if (piece.length > 0) {
        chunks.push({
          ordinal,
          headingPath: section.headingPath,
          text: piece,
          charStart: section.charStart + cursor,
          charEnd: section.charStart + cut,
        });
        ordinal += 1;
      }
      if (cut >= body.length) break;
      cursor = Math.max(cut - overlap, cursor + 1);
    }
  }
  return chunks;
}

interface Section {
  headingPath: string;
  body: string;
  charStart: number;
}

function splitSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let buffer: string[] = [];
  let start = 0;
  let offset = 0;
  const flush = () => {
    if (buffer.join("").trim().length > 0) {
      sections.push({ headingPath: currentHeading, body: buffer.join("\n"), charStart: start });
    }
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1]?.length ?? 1;
      const title = heading[2]?.trim() ?? "";
      currentHeading = level <= 1 ? title : `${currentHeading} / ${title}`;
      buffer = [line];
      start = offset;
    } else {
      buffer.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return sections;
}

export function extractPlainText(input: string, format: "markdown" | "html" | "text"): string {
  if (format === "markdown") {
    return input
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```.*$/gm, "").trim())
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/[*_`~>|]/g, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\n{3,}/g, "\n\n");
  }
  if (format === "html") {
    return input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
  return input;
}
