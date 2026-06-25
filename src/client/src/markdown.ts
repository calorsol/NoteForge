// 极简 Markdown -> HTML 渲染器（无第三方依赖）。
// 支持：标题、粗体/斜体、行内代码、代码块、有序/无序列表、引用、分割线、链接、段落。
// 所有文本先做 HTML 转义，避免 XSS。

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );
  return out;
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // 代码块 ```
    if (/^```/.test(line)) {
      closeList();
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buffer.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // 跳过结束的 ```
      html.push(`<pre><code>${buffer.join("\n")}</code></pre>`);
      continue;
    }

    // 空行
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      html.push("<hr />");
      i++;
      continue;
    }

    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      closeList();
      const buffer: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buffer.push(renderInline(lines[i].replace(/^>\s?/, "")));
        i++;
      }
      html.push(`<blockquote>${buffer.join("<br />")}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      i++;
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      i++;
      continue;
    }

    // 普通段落（合并连续非空行）
    closeList();
    const buffer: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buffer.push(renderInline(lines[i]));
      i++;
    }
    html.push(`<p>${buffer.join("<br />")}</p>`);
  }

  closeList();
  return html.join("\n");
}

export function countWords(source: string): number {
  // 中文按字计，英文按词计
  const cjk = (source.match(/[一-龥]/g) || []).length;
  const words = (source.replace(/[一-龥]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + words;
}
