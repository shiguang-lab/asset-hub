import bash from "refractor/bash";
import c from "refractor/c";
import { refractor, type Syntax } from "refractor/core";
import cpp from "refractor/cpp";
import csharp from "refractor/csharp";
import css from "refractor/css";
import docker from "refractor/docker";
import go from "refractor/go";
import graphql from "refractor/graphql";
import java from "refractor/java";
import javascript from "refractor/javascript";
import json from "refractor/json";
import jsx from "refractor/jsx";
import markdown from "refractor/markdown";
import markup from "refractor/markup";
import python from "refractor/python";
import rust from "refractor/rust";
import sql from "refractor/sql";
import tsx from "refractor/tsx";
import typescript from "refractor/typescript";
import yaml from "refractor/yaml";

// XMarkdown's default highlighter imports refractor/all. Register the common
// document languages explicitly so uncommon Prism grammars do not block the
// initial reader render.
const commonSyntaxes: Syntax[] = [
  markup,
  css,
  javascript,
  jsx,
  typescript,
  tsx,
  json,
  bash,
  yaml,
  markdown,
  sql,
  python,
  java,
  go,
  rust,
  c,
  cpp,
  csharp,
  docker,
  graphql,
];

for (const syntax of commonSyntaxes) refractor.register(syntax);

export { refractor };
