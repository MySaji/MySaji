"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Save, Award, MapPin, Loader2 } from "lucide-react"
import Link from "next/link"
import { getMySkills, updateMySkills } from "@/backend/actions/provider-credentials"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function SkillsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [skills, setSkills] = useState<string[]>([])
  const [workAreas, setWorkAreas] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState("")
  const [newArea, setNewArea] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getMySkills().then((data) => {
      if (data) { setSkills(data.skills); setWorkAreas(data.workAreas) }
    }).finally(() => setIsLoading(false))
  }, [])

  const addSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()])
      setNewSkill("")
    }
  }

  const removeSkill = (name: string) => setSkills(skills.filter((s) => s !== name))

  const addWorkArea = () => {
    if (newArea.trim() && !workAreas.includes(newArea.trim())) {
      setWorkAreas([...workAreas, newArea.trim()])
      setNewArea("")
    }
  }

  const removeWorkArea = (area: string) => setWorkAreas(workAreas.filter((a) => a !== area))

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateMySkills({ skills, workAreas })
    setIsSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider/profile" className="lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-bold">{t("provider.skills.title")}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6">
        {/* Skills Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5" />
            {t("provider.skills.professionalSkillsTitle")}
          </h2>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              placeholder={t("provider.skills.addSkillPlaceholder")}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              onKeyDown={(e) => e.key === "Enter" && addSkill()}
            />
            <button onClick={addSkill} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">{t("provider.skills.addButton")}</button>
          </div>

          <div className="space-y-2">
            {skills.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.skills.noSkillsYet")}</p>}
            {skills.map((skill) => (
              <div key={skill} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <span className="text-gray-900 dark:text-white font-medium">{skill}</span>
                <button onClick={() => removeSkill(skill)} className="text-red-600 dark:text-red-400 hover:text-red-700 text-xs font-medium">{t("provider.skills.removeButton")}</button>
              </div>
            ))}
          </div>
        </div>

        {/* Work Areas Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {t("provider.skills.workAreasTitle")}
          </h2>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              placeholder={t("provider.skills.addLocationPlaceholder")}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              onKeyDown={(e) => e.key === "Enter" && addWorkArea()}
            />
            <button onClick={addWorkArea} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">{t("provider.skills.addButton")}</button>
          </div>

          <div className="flex flex-wrap gap-2">
            {workAreas.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.skills.noWorkAreasYet")}</p>}
            {workAreas.map((area) => (
              <div key={area} className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 px-3 py-2 rounded-full">
                <span className="text-blue-900 dark:text-blue-400 font-medium">{area}</span>
                <button onClick={() => removeWorkArea(area)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <button onClick={handleSave} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSaving ? t("provider.skills.saving") : saved ? t("provider.skills.saved") : t("provider.skills.saveChanges")}
        </button>
      </div>
    </div>
  )
}
