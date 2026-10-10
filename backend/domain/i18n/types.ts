export const languages = ["en", "sw", "fr"] as const
export type Language = (typeof languages)[number]

export const languageNames: Record<Language, string> = {
  en: "English",
  sw: "Kiswahili",
  fr: "Français",
}
