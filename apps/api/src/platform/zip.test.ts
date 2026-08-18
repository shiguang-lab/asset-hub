import { describe, expect, it } from "vitest";
import { readZipEntries } from "./zip.js";

// 由 Python zipfile 生成的独立夹具（ZIP_DEFLATED），含嵌套目录与 __MACOSX 资源叉。
const FIXTURE_ZIP_BASE64 =
  "UEsDBBQAAAAIAAx7EV1D/VDzPQAAADoAAAAJAAAAUkVBRE1FLm1kU1Z4snfB06V7ubgUo5/O3herkVhcnFpSrJ+Zm65XkJeuycUV/Wzqhme962I1UvKTi/VTEksS9ZKLyzS5AFBLAwQUAAAACAAMexFdQ1dH1yMAAAAhAAAADgAAAGFzc2V0cy9pbWcucG5n6wzwc+flkuJKS8xO1S3IS9dNqixJLdY1NDI2MTUzt7A0AABQSwMEFAAAAAgADHsRXT5rAT8VAAAAEwAAAA0AAABkb2NzL2RhdGEuY3N2y0vMTdUpS8wpTeVK1DHkStIx4gIAUEsDBBQAAAAIAAx7EV0yfXXFFAAAABIAAAAZAAAAYXNzZXRzL19fTUFDT1NYLy5faW1nLnBuZ8sqzcvWLUotzi8tSk7VTcsvygYAUEsBAhQDFAAAAAgADHsRXUP9UPM9AAAAOgAAAAkAAAAAAAAAAAAAAIABAAAAAFJFQURNRS5tZFBLAQIUAxQAAAAIAAx7EV1DV0fXIwAAACEAAAAOAAAAAAAAAAAAAACAAWQAAABhc3NldHMvaW1nLnBuZ1BLAQIUAxQAAAAIAAx7EV0+awE/FQAAABMAAAANAAAAAAAAAAAAAACAAbMAAABkb2NzL2RhdGEuY3N2UEsBAhQDFAAAAAgADHsRXTJ9dcUUAAAAEgAAABkAAAAAAAAAAAAAAIAB8wAAAGFzc2V0cy9fX01BQ09TWC8uX2ltZy5wbmdQSwUGAAAAAAQABAD1AAAAPgEAAAAA";

describe("readZipEntries", () => {
  it("extracts files from a real deflated zip, skipping directories", () => {
    const buffer = Buffer.from(FIXTURE_ZIP_BASE64, "base64");
    const entries = readZipEntries(buffer);
    expect([...entries.keys()].sort()).toEqual([
      "README.md",
      "assets/__MACOSX/._img.png",
      "assets/img.png",
      "docs/data.csv",
    ]);
    expect(entries.get("README.md")?.toString("utf8")).toContain("![图](assets/img.png)");
    expect(entries.get("docs/data.csv")?.toString("utf8")).toBe("name,value\na,1\nb,2\n");
    expect(entries.get("assets/img.png")?.subarray(0, 8).toString("latin1")).toBe(
      "\u0089PNG\r\n\u001a\n",
    );
  });

  it("rejects non-zip input", () => {
    expect(() => readZipEntries(Buffer.from("not a zip file at all"))).toThrowError(
      /不是有效的 ZIP 归档/,
    );
  });
});
