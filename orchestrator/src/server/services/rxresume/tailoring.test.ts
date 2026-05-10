import { describe, expect, it } from "vitest";
import {
  applyTailoredSkills,
  applyTailoredSummary,
  extractProjectsFromResume,
  toRichTextHtml,
  toSummaryHtml,
} from "./tailoring";

describe("rxresume tailoring", () => {
  it("strips html from project catalog descriptions", () => {
    const { catalog, selectionItems } = extractProjectsFromResume({
      sections: {
        projects: {
          items: [
            {
              id: "p1",
              name: "Analytics",
              description:
                "<ul><li><p><strong>Built analytics</strong> using FastAPI.</p></li></ul>",
              hidden: false,
              period: "2024",
            },
          ],
        },
      },
    });

    expect(catalog[0].description).toBe("Built analytics using FastAPI.");
    expect(selectionItems[0].summaryText).toBe(
      "Built analytics using FastAPI.",
    );
  });
});

describe("toRichTextHtml", () => {
  it("wraps a plain paragraph in <p> tags", () => {
    expect(
      toRichTextHtml("Senior Java engineer with 10 years experience."),
    ).toBe("<p>Senior Java engineer with 10 years experience.</p>");
  });

  it("returns empty string for empty input", () => {
    expect(toRichTextHtml("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(toRichTextHtml("   \n  \n  ")).toBe("");
  });

  it("converts markdown bold to <strong>", () => {
    expect(toRichTextHtml("This is **bold** text.")).toBe(
      "<p>This is <strong>bold</strong> text.</p>",
    );
  });

  it("converts markdown italic to <em>", () => {
    expect(toRichTextHtml("This is *italic* text.")).toBe(
      "<p>This is <em>italic</em> text.</p>",
    );
  });

  it("converts markdown unordered lists", () => {
    expect(toRichTextHtml("- item one\n- item two\n- item three")).toBe(
      "<ul>\n<li>item one</li>\n<li>item two</li>\n<li>item three</li>\n</ul>",
    );
  });

  it("converts markdown ordered lists", () => {
    expect(toRichTextHtml("1. first\n2. second")).toBe(
      "<ol>\n<li>first</li>\n<li>second</li>\n</ol>",
    );
  });

  it("converts inline code", () => {
    expect(toRichTextHtml("Use `npm install` to install.")).toBe(
      "<p>Use <code>npm install</code> to install.</p>",
    );
  });

  it("splits double newlines into multiple paragraphs", () => {
    expect(toRichTextHtml("Para one.\n\nPara two.")).toBe(
      "<p>Para one.</p>\n<p>Para two.</p>",
    );
  });

  it("strips markdown links but keeps anchor text", () => {
    expect(
      toRichTextHtml("See [my site](https://example.com) for more."),
    ).toBe("<p>See my site for more.</p>");
  });

  it("strips h1 wrapper but keeps text content", () => {
    expect(toRichTextHtml("# Big Heading\n\nBody text.")).toBe(
      "Big Heading\n<p>Body text.</p>",
    );
  });

  it("strips <script> tags entirely (incl. content)", () => {
    expect(
      toRichTextHtml("<p>Safe</p><script>alert('xss')</script>"),
    ).toBe("<p>Safe</p>");
  });

  it("strips <style> tags entirely (incl. content)", () => {
    expect(
      toRichTextHtml("<p>ok</p><style>body{color:red}</style>"),
    ).toBe("<p>ok</p>");
  });

  it("strips inline event handlers (onclick)", () => {
    expect(toRichTextHtml('<p onclick="alert(1)">Click</p>')).toBe(
      "<p>Click</p>",
    );
  });

  it("preserves existing safe HTML structure (passthrough)", () => {
    expect(
      toRichTextHtml("<p>Already <strong>wrapped</strong> content.</p>"),
    ).toBe("<p>Already <strong>wrapped</strong> content.</p>");
  });

  it("preserves <ul><li> structure when input is HTML (passthrough)", () => {
    expect(toRichTextHtml("<ul><li>one</li><li>two</li></ul>")).toBe(
      "<ul><li>one</li><li>two</li></ul>",
    );
  });

  it("does not treat 'C++ <dev>' plain text as HTML passthrough", () => {
    expect(toRichTextHtml("Use C++ <dev> tools.")).toBe(
      "<p>Use C++  tools.</p>",
    );
  });

  it("strips <img> tags and their attributes", () => {
    expect(
      toRichTextHtml('<p>caption</p><img src="x" onerror="alert(1)">'),
    ).toBe("<p>caption</p>");
  });

  it("toSummaryHtml is a backwards-compat alias for toRichTextHtml", () => {
    const input = "**bold** text";
    expect(toSummaryHtml(input)).toBe(toRichTextHtml(input));
  });
});

describe("applyTailoredSummary", () => {
  it("writes html-wrapped summary to top-level summary.content", () => {
    const resumeData: Record<string, unknown> = {
      summary: { content: "" },
    };
    applyTailoredSummary(resumeData, "Plain summary text.");
    expect((resumeData.summary as { content: string }).content).toBe(
      "<p>Plain summary text.</p>",
    );
  });

  it("converts markdown bold in summary", () => {
    const resumeData: Record<string, unknown> = {
      summary: { content: "" },
    };
    applyTailoredSummary(resumeData, "Senior **Java** engineer.");
    expect((resumeData.summary as { content: string }).content).toBe(
      "<p>Senior <strong>Java</strong> engineer.</p>",
    );
  });

  it("preserves existing safe HTML in tailored summary input", () => {
    const resumeData: Record<string, unknown> = {
      summary: { content: "" },
    };
    applyTailoredSummary(resumeData, "<p>Pre-formatted</p>");
    expect((resumeData.summary as { content: string }).content).toBe(
      "<p>Pre-formatted</p>",
    );
  });

  it("falls back to sections.summary.content when top-level absent", () => {
    const resumeData: Record<string, unknown> = {
      sections: { summary: { content: "" } },
    };
    applyTailoredSummary(resumeData, "Fallback path.");
    expect(
      (
        (resumeData.sections as Record<string, { content: string }>).summary
      ).content,
    ).toBe("<p>Fallback path.</p>");
  });

  it("is a no-op for empty/null summary", () => {
    const resumeData: Record<string, unknown> = {
      summary: { content: "original" },
    };
    applyTailoredSummary(resumeData, null);
    applyTailoredSummary(resumeData, "");
    applyTailoredSummary(resumeData, "   ");
    expect((resumeData.summary as { content: string }).content).toBe(
      "original",
    );
  });
});

describe("applyTailoredSkills description rich-text", () => {
  it("converts markdown bold in skill description", () => {
    const resumeData: Record<string, unknown> = {
      sections: {
        skills: {
          items: [
            { id: "s1", name: "Backend", description: "", keywords: [] },
          ],
        },
      },
    };
    applyTailoredSkills(resumeData, [
      {
        name: "Backend",
        keywords: ["Java", "Spring"],
        description: "Strong **Java** experience.",
      } as never,
    ]);
    const items = (
      resumeData.sections as {
        skills: { items: Array<{ description: string }> };
      }
    ).skills.items;
    expect(items[0].description).toBe(
      "<p>Strong <strong>Java</strong> experience.</p>",
    );
  });

  it("falls back to existing description when not in tailored input", () => {
    const resumeData: Record<string, unknown> = {
      sections: {
        skills: {
          items: [
            {
              id: "s1",
              name: "Backend",
              description: "old text",
              keywords: [],
            },
          ],
        },
      },
    };
    applyTailoredSkills(resumeData, [
      { name: "Backend", keywords: ["Java"] },
    ]);
    const items = (
      resumeData.sections as {
        skills: { items: Array<{ description: string }> };
      }
    ).skills.items;
    expect(items[0].description).toBe("<p>old text</p>");
  });
});
