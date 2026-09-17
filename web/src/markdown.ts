// Just enough Markdown for our marketing posts: headings, paragraphs, lists,
// tables, block quotes, rules, bold, italics and links. Input is trusted repo
// content, but text is still escaped so stray characters render literally.
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text: string) {
  return escape(text)
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, href) =>
        `<a href="${href.replace(/"/g, "&quot;")}"${/^https?:/.test(href) ? ' rel="noopener"' : ""}>${label}</a>`,
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,:;!?]|$)/g, "$1<em>$2</em>");
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(" ");
      html.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
      i++;
    } else if (/^-{3,}$/.test(line.trim())) {
      html.push("<hr>");
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|"))
        rows.push(lines[i++]);
      const align = cells(rows[1]).map((c) => (c.endsWith(":") ? "right" : ""));
      const td = (tag: string, row: string) =>
        `<tr>${cells(row)
          .map(
            (c, j) =>
              `<${tag}${align[j] ? ` class="${align[j]}"` : ""}>${inline(c)}</${tag}>`,
          )
          .join("")}</tr>`;
      html.push(
        `<div class="table"><table><thead>${td("th", rows[0])}</thead><tbody>${rows
          .slice(2)
          .map((row) => td("td", row))
          .join("")}</tbody></table></div>`,
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- "))
        items.push(`<li>${inline(lines[i++].slice(2))}</li>`);
      html.push(`<ul>${items.join("")}</ul>`);
    } else if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> "))
        quote.push(lines[i++].slice(2));
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
    } else {
      const paragraph: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,3} |- |> |\||-{3,}$)/.test(lines[i])
      )
        paragraph.push(lines[i++]);
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    }
  }
  return html.join("\n");
}
