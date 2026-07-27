import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

const lessons = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/lessons" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(), // free-form topic tags, e.g. ["zazen", "kinhin"]
    audioUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    coverImage: z.string().optional(), // path under /media/ synced from Drive
    draft: z.boolean().default(false),
  }),
});

const poems = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/poems" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    form: z.enum(["haiku", "poem", "quote"]).default("poem"),
    author: z.string().optional(), // למילים של אחרים, אם ציין
    translator: z.string().optional(),
    source: z.string().optional(),
    externalUrl: z.string().url().optional(),
    externalLabel: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const retreats = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/retreats" }),
  schema: z.object({
    title: z.string(),
    place: z.string(), // e.g. "טושיטה, דרמסלה"
    year: z.number().optional(),
    order: z.number().default(0), // manual display order
    coverImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const inspirations = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/inspirations" }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    translator: z.string().optional(),
    source: z.string().optional(), // book/collection title
    date: z.coerce.date(),
    externalUrl: z.string().url().optional(),
    externalLabel: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const practices = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/practices" }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(), // תיאור קצר, שורה אחת
    order: z.number().default(0), // סדר תצוגה ברשימה
    draft: z.boolean().default(false),
  }),
});

// ---------------------------------------------------------------------------
// English mirrors. Same schemas, same IDs/slugs as their Hebrew counterparts
// (so the language switcher can map /x/slug/ <-> /en/x/slug/ directly),
// sourced from src/content/en/<name> instead of src/content/<name>.
// ---------------------------------------------------------------------------

const lessonsEn = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/en/lessons" }),
  schema: lessons.schema,
});

const poemsEn = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/en/poems" }),
  schema: poems.schema,
});

const retreatsEn = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/en/retreats" }),
  schema: retreats.schema,
});

const inspirationsEn = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/en/inspirations" }),
  schema: inspirations.schema,
});

const practicesEn = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/en/practices" }),
  schema: practices.schema,
});

export const collections = { lessons, poems, retreats, inspirations, practices, lessonsEn, poemsEn, retreatsEn, inspirationsEn, practicesEn };
