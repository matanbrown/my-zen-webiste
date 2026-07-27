import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const lessons = (await getCollection("lessons", ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: "ללא מאמץ — שיעורים",
    description: "שיעורי זן שבועיים",
    site: context.site,
    items: lessons.map((lesson) => ({
      title: lesson.data.title,
      description: lesson.data.summary,
      pubDate: lesson.data.date,
      link: `/lessons/${lesson.id}/`,
    })),
    customData: `<language>he</language>`,
  });
}
