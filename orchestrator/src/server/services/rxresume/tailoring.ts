import { createId } from "@paralleldrive/cuid2";
import type { ResumeProjectCatalogItem } from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

type RecordLike = Record<string, unknown>;

export type TailoredSkillsInput =
  | Array<{ name: string; keywords: string[] }>
  | string
  | null
  | undefined;

export type TailorChunkInput = {
  headline?: string | null;
  summary?: string | null;
  skills?: TailoredSkillsInput;
};

export type ResumeProjectSelectionItem = ResumeProjectCatalogItem & {
  summaryText: string;
};

export function cloneResumeData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function parseTailoredSkills(
  skills: TailoredSkillsInput,
): Array<RecordLike> | null {
  if (!skills) return null;
  const parsed = Array.isArray(skills)
    ? skills
    : typeof skills === "string"
      ? (JSON.parse(skills) as unknown)
      : null;
  if (!Array.isArray(parsed)) return null;
  return parsed.filter(
    (item) => item && typeof item === "object",
  ) as RecordLike[];
}

export function applyTailoredHeadline(
  resumeData: RecordLike,
  headline?: string | null,
): void {
  if (!headline) return;
  const basics = asRecord(resumeData.basics);
  if (!basics) return;
  basics.headline = headline;
  // Preserve current behavior for legacy consumers/templates that use label.
  basics.label = headline;
}

// Tags allowed in tailored rich-text fields. Matches the Tiptap extension
// surface that RxResume v5 PDF templates render correctly. Headings, links,
// images, scripts, and styles are stripped (text content kept where present).
const RICH_TEXT_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "code",
  "blockquote",
];

// Configure marked once at module load. GFM gives us list/strikethrough
// support; `breaks: true` mirrors Tiptap's behavior of treating a single
// newline as a `<br>` (Tiptap's "hardBreak" extension).
marked.setOptions({ gfm: true, breaks: true });

// RxResume v5 spec requires rich-text fields (summary.content, skills
// description, experience.summary, etc.) to be HTML strings because the
// editor (Tiptap) and the PDF templates render them via dangerouslySetInnerHTML.
// The LLM emits markdown-flavored plain text, so writing it raw makes the PDF
// fall back to browser default typography (or render literal `**asterisks**`)
// instead of inheriting the template's `<p>` styling.
//
// Pipeline: trim -> passthrough if already valid HTML -> markdown to HTML
// (marked) -> sanitize against the Tiptap-allowed tag whitelist (sanitize-html).
export function toRichTextHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Passthrough for content that is already wrapped HTML. Detect by matching
  // an opening tag with a corresponding closing tag from the allowed set.
  // Avoids false positives like "C++ <dev>" or "List<Integer>" in plain text.
  const openTag =
    /<(p|br|strong|em|u|s|ul|ol|li|h[1-6]|span|div|a|b|i|code|blockquote)\b[^>]*>/i;
  const closeTag =
    /<\/(p|strong|em|u|s|ul|ol|li|h[1-6]|span|div|a|b|i|code|blockquote)>/i;
  if (openTag.test(trimmed) && closeTag.test(trimmed)) {
    return sanitizeHtml(trimmed, {
      allowedTags: RICH_TEXT_ALLOWED_TAGS,
      allowedAttributes: {},
    });
  }

  const rendered =
    typeof marked.parse === "function"
      ? (marked.parse(trimmed, { async: false }) as string)
      : "";
  const sanitized = sanitizeHtml(rendered, {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: {},
  });
  return sanitized.trim();
}

// Backwards-compatible alias. Prefer `toRichTextHtml` in new code.
export function toSummaryHtml(value: string): string {
  return toRichTextHtml(value);
}

export function applyTailoredSummary(
  resumeData: RecordLike,
  summary?: string | null,
): void {
  if (!summary) return;
  const html = toRichTextHtml(summary);
  if (!html) return;
  const topSummary = asRecord(resumeData.summary);
  if (topSummary) {
    if (
      typeof topSummary.content === "string" ||
      topSummary.content === undefined
    ) {
      topSummary.content = html;
      return;
    }
    if (
      typeof topSummary.value === "string" ||
      topSummary.value === undefined
    ) {
      topSummary.value = html;
      return;
    }
  }

  const sections = asRecord(resumeData.sections);
  const summarySection = asRecord(sections?.summary);
  if (summarySection) {
    summarySection.content = html;
    return;
  }
}

export function applyTailoredSkills(
  resumeData: RecordLike,
  tailoredSkills?: TailoredSkillsInput,
): void {
  const skills = parseTailoredSkills(tailoredSkills);
  if (!skills) return;

  const sections = asRecord(resumeData.sections);
  const skillsSection = asRecord(sections?.skills);
  const existingItems = asArray(skillsSection?.items);
  if (!skillsSection || !existingItems) return;
  const existing = existingItems
    .map((item) => asRecord(item))
    .filter((item): item is RecordLike => Boolean(item));

  const template = existing[0] ?? null;
  if (!template) return;

  skillsSection.items = skills.map((newSkill) => {
    const match =
      existing.find((item) => item.name === newSkill.name) ?? template;
    const next: RecordLike = { ...match };

    if ("id" in next) {
      next.id =
        (typeof newSkill.id === "string" && newSkill.id) ||
        (typeof match.id === "string" ? match.id : "") ||
        createId();
    }
    if ("name" in next) {
      next.name =
        (typeof newSkill.name === "string" ? newSkill.name : "") ||
        (typeof match.name === "string" ? match.name : "");
    }
    if ("keywords" in next) {
      next.keywords = Array.isArray(newSkill.keywords)
        ? newSkill.keywords.filter((k) => typeof k === "string")
        : Array.isArray(match.keywords)
          ? match.keywords.filter((k) => typeof k === "string")
          : [];
    }

    if ("description" in next) {
      const rawDescription =
        typeof newSkill.description === "string"
          ? newSkill.description
          : typeof match.description === "string"
            ? match.description
            : "";
      next.description = rawDescription ? toRichTextHtml(rawDescription) : "";
    }
    if ("proficiency" in next) {
      next.proficiency =
        typeof newSkill.proficiency === "string"
          ? newSkill.proficiency
          : typeof newSkill.description === "string"
            ? newSkill.description
            : typeof match.proficiency === "string"
              ? match.proficiency
              : "";
    }
    if ("level" in next) {
      next.level =
        typeof newSkill.level === "number"
          ? newSkill.level
          : typeof match.level === "number"
            ? match.level
            : next.level;
    }
    if ("hidden" in next) {
      next.hidden =
        typeof newSkill.hidden === "boolean"
          ? newSkill.hidden
          : typeof match.hidden === "boolean"
            ? match.hidden
            : next.hidden;
    }

    return next;
  });
}

export function extractProjectsFromResume(resumeData: RecordLike): {
  catalog: ResumeProjectCatalogItem[];
  selectionItems: ResumeProjectSelectionItem[];
} {
  const sections = asRecord(resumeData.sections);
  const projectsSection = asRecord(sections?.projects);
  const items = asArray(projectsSection?.items);
  if (!items) return { catalog: [], selectionItems: [] };

  const catalog: ResumeProjectCatalogItem[] = [];
  const selectionItems: ResumeProjectSelectionItem[] = [];

  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;

    const name = typeof item.name === "string" ? item.name : id;
    const description =
      typeof item.description === "string"
        ? stripHtmlTags(item.description)
        : "";
    const date = typeof item.period === "string" ? item.period : "";

    const isVisibleInBase = !(typeof item.hidden === "boolean"
      ? item.hidden
      : false);

    const summaryRaw = description;

    const base: ResumeProjectCatalogItem = {
      id,
      name,
      description,
      date,
      isVisibleInBase,
    };
    catalog.push(base);
    selectionItems.push({
      ...base,
      summaryText: stripHtmlTags(summaryRaw),
    });
  }

  return { catalog, selectionItems };
}

export function applyProjectVisibility(args: {
  resumeData: RecordLike;
  selectedProjectIds: ReadonlySet<string>;
  forceVisibleProjectsSection?: boolean;
}): void {
  const sections = asRecord(args.resumeData.sections);
  const projectsSection = asRecord(sections?.projects);
  const items = asArray(projectsSection?.items);
  if (!projectsSection || !items) return;

  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;

    if ("hidden" in item) {
      item.hidden = !args.selectedProjectIds.has(id);
    }
  }

  if (args.forceVisibleProjectsSection !== false) {
    if ("hidden" in projectsSection) {
      projectsSection.hidden = false;
    }
  }
}

export function applyTailoredChunks(args: {
  resumeData: RecordLike;
  tailoredContent: TailorChunkInput;
}): void {
  applyTailoredSkills(args.resumeData, args.tailoredContent.skills);
  applyTailoredSummary(args.resumeData, args.tailoredContent.summary);
  applyTailoredHeadline(args.resumeData, args.tailoredContent.headline);
}
