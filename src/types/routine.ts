/**
 * Routine Framework
 * 
 * Routines are automated workflows that handle common WordPress tasks:
 * - Phone Manager: Find, group, replace phone numbers
 * - Email Manager: Find, export, update email addresses
 * - Image Manager: Batch resize, compress, optimize
 * - Form Manager: List forms, collect submissions, export
 * 
 * Each routine has:
 * - Scan phase: Find all instances
 * - Preview phase: Show what will change
 * - Execute phase: Apply changes
 * - Verify phase: Confirm success
 */

export type RoutineStatus = 'idle' | 'scanning' | 'previewing' | 'executing' | 'verifying' | 'complete' | 'error'

export type RoutineType = 'phone' | 'email' | 'images' | 'forms' | 'backup'

export interface RoutineInstance {
  id: string
  type: RoutineType
  status: RoutineStatus
  progress: number // 0-100
  message: string
  results?: RoutineResults
  error?: string
}

export interface RoutineResults {
  found: number
  grouped?: Record<string, any[]>
  preview?: Array<{
    id: string
    location: string
    current: string
    proposed: string
    checked?: boolean
  }>
  changed?: number
  verified?: boolean
}

/**
 * Phone Manager Routine
 * 
 * Scan: Find all phone numbers in pages, posts, custom fields
 * Group: Group by phone number
 * Preview: Show all instances before changing
 * Execute: Replace with new number everywhere
 */
export interface PhoneRoutineData {
  type: 'phone'
  action: 'scan' | 'replace'
  oldNumber?: string
  newNumber?: string
  preview?: Array<{
    id: string
    type: 'page' | 'post' | 'widget' | 'custom_field'
    title: string
    location: string
    phoneNumber: string
  }>
  grouped?: Record<string, Array<{
    id: string
    type: string
    title: string
    location: string
  }>>
}

/**
 * Email Manager Routine
 * 
 * Scan: Find all email addresses in pages, posts, forms
 * Export: Get list of all emails
 * Update: Replace with new email everywhere
 */
export interface EmailRoutineData {
  type: 'email'
  action: 'scan' | 'export' | 'replace'
  oldEmail?: string
  newEmail?: string
  preview?: Array<{
    id: string
    type: 'page' | 'post' | 'form' | 'contact'
    title: string
    location: string
    email: string
  }>
  emails?: string[]
}

/**
 * Image Manager Routine
 * 
 * Scan: Find all images
 * Optimize: Compress and optimize
 * Resize: Batch resize to specific dimensions
 */
export interface ImageRoutineData {
  type: 'images'
  action: 'scan' | 'optimize' | 'resize'
  quality?: number // 0-100
  targetWidth?: number
  targetHeight?: number
  preview?: Array<{
    id: string
    type: string
    title: string
    url: string
    currentSize: string
    projectedSize?: string
  }>
}

/**
 * Form Manager Routine
 * 
 * List: Show all forms on site
 * Collect: Gather submissions
 * Export: Export to CSV
 */
export interface FormRoutineData {
  type: 'forms'
  action: 'list' | 'export' | 'settings'
  formId?: string
  exportFormat?: 'csv' | 'json'
  preview?: Array<{
    id: string
    name: string
    type: string
    submissions: number
    fields: string[]
  }>
}

export type RoutineData = PhoneRoutineData | EmailRoutineData | ImageRoutineData | FormRoutineData

/**
 * Routine definitions with metadata
 */
export const ROUTINES: Record<RoutineType, {
  id: RoutineType
  name: string
  icon: string
  description: string
  action: string
  color: string
  estimatedTime: string
}> = {
  phone: {
    id: 'phone',
    name: 'Phone Manager',
    icon: '☎️',
    description: 'Find and replace phone numbers across your entire site',
    action: 'Find & replace phone numbers',
    color: 'hsl(248 79% 60%)',
    estimatedTime: '2-3 min',
  },
  email: {
    id: 'email',
    name: 'Email Manager',
    icon: '✉️',
    description: 'Find, export, and update email addresses everywhere',
    action: 'Find & replace email addresses',
    color: 'hsl(209 96% 51%)',
    estimatedTime: '2-3 min',
  },
  images: {
    id: 'images',
    name: 'Image Manager',
    icon: '🖼️',
    description: 'Optimize, resize, and compress all images',
    action: 'Batch image operations',
    color: 'hsl(142 71% 45%)',
    estimatedTime: '5-10 min',
  },
  forms: {
    id: 'forms',
    name: 'Form Manager',
    icon: '📋',
    description: 'Manage forms, view submissions, export data',
    action: 'Manage forms and submissions',
    color: 'hsl(37 92% 50%)',
    estimatedTime: '3-5 min',
  },
  backup: {
    id: 'backup',
    name: 'Backup Manager',
    icon: '💾',
    description: 'Create and manage site backups',
    action: 'Backup your site',
    color: 'hsl(0 84% 62%)',
    estimatedTime: '5-15 min',
  },
}
