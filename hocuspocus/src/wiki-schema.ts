// MUST stay in sync with frontend/src/components/wiki/wiki-editor.tsx.
// Adding/changing a node there requires updating this file.
//
// This schema is used only for encoding markdown → Y.js binary inside the
// import flow. It is not used to render anything; the frontend's TipTap
// extensions own rendering. Therefore we only need to declare the node
// types, attributes, and content models — not toDOM/parseDOM details that
// the editor cares about. The toDOM/parseDOM stubs here exist to satisfy
// prosemirror-model's API; the values they produce are never inspected.
//
// The markdown parser falls back to a plain paragraph for any token shape
// it doesn't recognise (see markdown-parser.ts), so a node added to the
// editor without being added here degrades to a styling regression on
// import — never lost text content.

import { Schema } from "prosemirror-model";

export const wikiSchema = new Schema({
  nodes: {
    doc: { content: "block+" },

    paragraph: {
      group: "block",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },

    text: { group: "inline" },

    heading: {
      group: "block",
      content: "inline*",
      defining: true,
      attrs: { level: { default: 1 } },
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } },
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },

    blockquote: {
      group: "block",
      content: "block+",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    },

    codeBlock: {
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      attrs: {
        language: { default: null },
        wrap: { default: false },
      },
      parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
      toDOM: (node) => [
        "pre",
        node.attrs.wrap ? { class: "is-wrapped" } : {},
        ["code", 0],
      ],
    },

    horizontalRule: {
      group: "block",
      attrs: { variant: { default: "line" } },
      parseDOM: [{ tag: "hr" }],
      toDOM: (node) =>
        node.attrs.variant && node.attrs.variant !== "line"
          ? ["hr", { "data-variant": node.attrs.variant }]
          : ["hr"],
    },

    bulletList: {
      group: "block",
      content: "listItem+",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    },

    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { start: { default: 1 } },
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (el) => {
            const start = (el as HTMLElement).getAttribute("start");
            return { start: start ? parseInt(start, 10) : 1 };
          },
        },
      ],
      toDOM: (node) =>
        node.attrs.start === 1
          ? ["ol", 0]
          : ["ol", { start: String(node.attrs.start) }, 0],
    },

    listItem: {
      content: "paragraph block*",
      defining: true,
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0],
    },

    taskList: {
      group: "block",
      content: "taskItem+",
      parseDOM: [{ tag: 'ul[data-type="taskList"]' }],
      toDOM: () => ["ul", { "data-type": "taskList" }, 0],
    },

    taskItem: {
      content: "paragraph block*",
      defining: true,
      attrs: { checked: { default: false } },
      parseDOM: [
        {
          tag: 'li[data-type="taskItem"]',
          getAttrs: (el) => ({
            checked: (el as HTMLElement).getAttribute("data-checked") === "true",
          }),
        },
      ],
      toDOM: (node) => [
        "li",
        {
          "data-type": "taskItem",
          "data-checked": String(Boolean(node.attrs.checked)),
        },
        0,
      ],
    },

    image: {
      group: "block",
      atom: true,
      attrs: {
        src: { default: null },
        alt: { default: null },
        title: { default: null },
        width: { default: null },
        height: { default: null },
      },
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (el) => {
            const e = el as HTMLElement;
            const w = e.getAttribute("width");
            const h = e.getAttribute("height");
            return {
              src: e.getAttribute("src"),
              alt: e.getAttribute("alt"),
              title: e.getAttribute("title"),
              width: w ? parseInt(w, 10) : null,
              height: h ? parseInt(h, 10) : null,
            };
          },
        },
      ],
      toDOM: (node) => [
        "img",
        {
          src: node.attrs.src,
          alt: node.attrs.alt,
          title: node.attrs.title,
          width: node.attrs.width != null ? String(node.attrs.width) : null,
          height: node.attrs.height != null ? String(node.attrs.height) : null,
        },
      ],
    },

    hardBreak: {
      group: "inline",
      inline: true,
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },

    table: {
      group: "block",
      content: "tableRow+",
      tableRole: "table",
      isolating: true,
      parseDOM: [{ tag: "table" }],
      toDOM: () => ["table", ["tbody", 0]],
    },

    tableRow: {
      content: "(tableCell | tableHeader)*",
      tableRole: "row",
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    },

    tableCell: {
      content: "block+",
      tableRole: "cell",
      isolating: true,
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
      parseDOM: [{ tag: "td" }],
      toDOM: () => ["td", 0],
    },

    tableHeader: {
      content: "block+",
      tableRole: "header_cell",
      isolating: true,
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
      parseDOM: [{ tag: "th" }],
      toDOM: () => ["th", 0],
    },

    wikiNotice: {
      group: "block",
      content: "block+",
      defining: true,
      attrs: { variant: { default: "info" } },
      parseDOM: [{ tag: 'div[data-type="wiki-notice"]' }],
      toDOM: (node) => [
        "div",
        { "data-type": "wiki-notice", "data-variant": node.attrs.variant },
        0,
      ],
    },

    wikiFile: {
      group: "block",
      atom: true,
      attrs: {
        fileId: { default: null },
        url: { default: null },
        filename: { default: "" },
        size: { default: 0 },
        contentType: { default: "application/octet-stream" },
      },
      parseDOM: [{ tag: "div[data-wiki-file]" }],
      toDOM: (node) => [
        "div",
        {
          "data-wiki-file": "true",
          "data-file-id": node.attrs.fileId,
          "data-url": node.attrs.url,
          "data-filename": node.attrs.filename,
          "data-size": String(node.attrs.size ?? 0),
          "data-content-type":
            node.attrs.contentType ?? "application/octet-stream",
        },
      ],
    },
  },

  marks: {
    link: {
      attrs: {
        href: { default: null },
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (el) => ({
            href: (el as HTMLElement).getAttribute("href"),
            title: (el as HTMLElement).getAttribute("title"),
          }),
        },
      ],
      toDOM: (mark) => [
        "a",
        { href: mark.attrs.href, title: mark.attrs.title },
        0,
      ],
    },

    bold: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        { style: "font-weight=bold" },
      ],
      toDOM: () => ["strong", 0],
    },

    italic: {
      parseDOM: [
        { tag: "em" },
        { tag: "i" },
        { style: "font-style=italic" },
      ],
      toDOM: () => ["em", 0],
    },

    code: {
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },

    strike: {
      parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }],
      toDOM: () => ["s", 0],
    },
  },
});
