import fs from "node:fs"
import test from "node:test"

function embeddedCatalog(sql: string) {
  const match = sql.match(/v_catalog jsonb := \$catalog\$(.*?)\$catalog\$::jsonb/s)
  if (!match?.[1]) throw new Error("embedded catalog missing")
  return JSON.parse(match[1]) as Array<Record<string, any>>
}

test("Fighter catalog probe", () => {
  const classes = embeddedCatalog(fs.readFileSync("supabase/migrations/20260827180000_official_class_catalog.sql", "utf8"))
  const subclasses = embeddedCatalog(fs.readFileSync("supabase/migrations/20260827180100_official_subclass_catalog.sql", "utf8"))
  const payload = {
    base: classes.find((entry) => entry.key === "fighter"),
    subclasses: subclasses.filter((entry) => entry.classKey === "fighter"),
  }
  console.log("FIGHTER_CATALOG_PROBE=" + JSON.stringify(payload))
})
