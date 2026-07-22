// Hand-rolled, dependency-free renderer for the "Rendered Preview" toggle.
// Prompt text in this library is plain structured text — paragraphs, "-"
// bullet lists, numbered steps, and occasional """-delimited quoted blocks —
// not rich markdown, so a full markdown parser would be solving a much
// bigger problem than the one that exists. "Raw" mode is just the existing
// plain <pre> treatment; this only powers the "Rendered" alternative.

type Block =
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "paragraph"; text: string };

function parseBlocks(text: string): Block[] {
  const rawBlocks = text.split(/\n{2,}/);
  const blocks: Block[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    if (lines[0].trim() === '"""' && lines[lines.length - 1].trim() === '"""' && lines.length > 1) {
      blocks.push({ kind: "quote", text: lines.slice(1, -1).join("\n") });
      continue;
    }
    if (lines.every((l) => /^-\s+/.test(l.trim()))) {
      blocks.push({ kind: "bullets", items: lines.map((l) => l.trim().replace(/^-\s+/, "")) });
      continue;
    }
    if (lines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
      blocks.push({ kind: "numbered", items: lines.map((l) => l.trim().replace(/^\d+\.\s+/, "")) });
      continue;
    }
    blocks.push({ kind: "paragraph", text: raw });
  }

  return blocks;
}

export function renderMarkdownLite(text: string) {
  const blocks = parseBlocks(text);
  return blocks.map((block, i) => {
    switch (block.kind) {
      case "bullets":
        return (
          <ul key={i} className="list-disc list-inside space-y-0.5 my-2">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        );
      case "numbered":
        return (
          <ol key={i} className="list-decimal list-inside space-y-0.5 my-2">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ol>
        );
      case "quote":
        return (
          <div key={i} className="border-l-2 border-white/15 pl-3 italic text-white/60 my-2 whitespace-pre-wrap">
            {block.text}
          </div>
        );
      case "paragraph":
      default:
        return (
          <p key={i} className="whitespace-pre-wrap my-2">
            {block.text}
          </p>
        );
    }
  });
}
