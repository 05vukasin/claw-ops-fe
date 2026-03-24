/**
 * Z-index layering system for the Open Canvas.
 *
 * All z-index values are defined here to prevent
 * conflicts and ensure consistent stacking order.
 */

export const Z_INDEX = {
  /** Background canvas layer — dot grid */
  CANVAS: 0,
  /** Primary content overlay */
  OVERLAY: 10,
  /** Floating panels and widgets */
  FLOATING: 20,
  /** Fixed header navigation */
  HEADER: 30,
  /** Dropdown menus and popovers */
  DROPDOWN: 40,
  /** Modal backdrops and dialogs */
  MODAL: 50,
  /** Toast notifications */
  TOAST: 60,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX;
