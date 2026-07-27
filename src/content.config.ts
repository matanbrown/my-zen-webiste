import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

const lessons = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/lessons" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string().optional(),
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

export const collections = { lessons, poems, retreats, inspirations, practices };
