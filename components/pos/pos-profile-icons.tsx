/**
 * Icon-name to component maps for the POS registries.
 *
 * lib/pos-profiles.ts and lib/pos-traits.ts store icons as STRINGS, because
 * they are plain modules that server actions import and must not pull React
 * into a server bundle. Resolving those names to components is a client
 * concern, so it lives here — the same split lib/pro-modules.ts already uses
 * with BUSINESS_TYPE_ICON in the signup page.
 *
 * Every name in both registries is covered. A missing name falls back rather
 * than crashing the picker, but that is a safety net and not a licence: add
 * the icon here when you add a profile there.
 */

import {
  ShoppingBasket, ShoppingCart, Wheat, Apple, Beef, Croissant, Wine,
  Shirt, Footprints, Recycle, Sparkles, SprayCan, Gem, Baby,
  Smartphone, Tv,
  CookingPot, BedDouble, Armchair, Box, Droplets,
  Wrench, Pipette, Zap, Blocks, Car,
  Pill, Sprout, PawPrint,
  Store, PenLine, BookOpen, Gift, Dumbbell, Boxes,
  // Traits
  Scale, Shapes, Fingerprint, CalendarClock, ShieldAlert, FileLock,
  Puzzle, Hammer, PackageOpen, Trash2, Pencil,
  type LucideIcon,
} from "lucide-react"

export const POS_PROFILE_ICON: Record<string, LucideIcon> = {
  ShoppingBasket, ShoppingCart, Wheat, Apple, Beef, Croissant, Wine,
  Shirt, Footprints, Recycle, Sparkles, SprayCan, Gem, Baby,
  Smartphone, Tv,
  CookingPot, BedDouble, Armchair, Box, Droplets,
  Wrench, Pipette, Zap, Blocks, Car,
  Pill, Sprout, PawPrint,
  Store, PenLine, BookOpen, Gift, Dumbbell, Boxes,
}

export const POS_TRAIT_ICON: Record<string, LucideIcon> = {
  Scale, Shapes, Fingerprint, CalendarClock, ShieldAlert, FileLock,
  Puzzle, Hammer, PackageOpen, Trash2, Pencil,
}

export const POS_PROFILE_FALLBACK_ICON: LucideIcon = Store
