import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const lessons = (await getCollection("lessonsEn", ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: "Without Effort — Lessons",
    description: "Weekly Zen lessons",
    site: context.site,
    items: lessons.map((lesson) => ({
      title: lesson.data.title,
      description: lesson.data.summary,
      pubDate: lesson.data.date,
      link: `/en/lessons/${lesson.id}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
