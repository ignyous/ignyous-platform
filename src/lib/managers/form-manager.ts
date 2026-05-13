/**
 * Form Manager Scanner & Editor
 * 
 * Supports:
 * - Gravity Forms (most comprehensive)
 * - WPForms
 * - Contact Form 7
 * - Fluent Forms
 * - Ninja Forms
 * - Formidable Forms
 * 
 * Operations:
 * - Scan forms on site
 * - Add fields to forms
 * - Update notifications
 * - Update confirmations
 * - Replace form on page
 */

import axios from 'axios'

export interface FormField {
  id: number | string
  label: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'hidden'
  required: boolean
  placeholder?: string
  help_text?: string
  choices?: Array<{ text: string; value: string }>
}

export interface Form {
  id: number | string
  title: string
  type: 'gravity_forms' | 'wpforms' | 'cf7' | 'fluent_forms' | 'ninja_forms' | 'formidable' | string
  description?: string
  fields: FormField[]
  pages: number[] // Page IDs where form appears
  notifications?: Array<{
    id: string
    name: string
    to: string
    subject: string
  }>
  confirmation?: string
}

/**
 * Detect which form plugins are active
 */
export async function detectFormPlugins(
  siteUrl: string,
  apiKey: string
): Promise<string[]> {
  const activePlugins: string[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  // Check Gravity Forms
  try {
    const gfRes = await axios.get(
      `${cleanUrl}/wp-json/gf/v2/forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    if (gfRes.status === 200) {
      activePlugins.push('gravity_forms')
    }
  } catch {}

  // Check WPForms
  try {
    const wpfRes = await axios.get(
      `${cleanUrl}/wp-json/wpforms-api/v1/forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    if (wpfRes.status === 200) {
      activePlugins.push('wpforms')
    }
  } catch {}

  // Check Contact Form 7
  try {
    const cf7Res = await axios.get(
      `${cleanUrl}/wp-json/contact-form-7/v1/contact_forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    if (cf7Res.status === 200) {
      activePlugins.push('cf7')
    }
  } catch {}

  // Check Fluent Forms
  try {
    const fluentRes = await axios.get(
      `${cleanUrl}/wp-json/fluent-forms/v1/forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    if (fluentRes.status === 200) {
      activePlugins.push('fluent_forms')
    }
  } catch {}

  return activePlugins
}

/**
 * Get all forms from Gravity Forms
 */
export async function getGravityForms(
  siteUrl: string,
  apiKey: string
): Promise<Form[]> {
  const forms: Form[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    const response = await axios.get(
      `${cleanUrl}/wp-json/gf/v2/forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status === 200 && Array.isArray(response.data)) {
      for (const gfForm of response.data) {
        const fields: FormField[] = gfForm.fields.map((field: any) => ({
          id: field.id,
          label: field.label,
          type: field.type || 'text',
          required: field.isRequired || false,
          placeholder: field.placeholder,
          help_text: field.description,
          choices: field.choices,
        }))

        const notifications = gfForm.notifications?.map((n: any) => ({
          id: n.id,
          name: n.name,
          to: n.to,
          subject: n.subject,
        }))

        forms.push({
          id: gfForm.id,
          title: gfForm.title,
          type: 'gravity_forms',
          description: gfForm.description,
          fields,
          pages: gfForm.page_ids || [],
          notifications,
          confirmation: gfForm.confirmation?.message,
        })
      }
    }
  } catch (error) {
    console.error('Error fetching Gravity Forms:', error)
  }

  return forms
}

/**
 * Get all forms from WPForms
 */
export async function getWPForms(
  siteUrl: string,
  apiKey: string
): Promise<Form[]> {
  const forms: Form[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    const response = await axios.get(
      `${cleanUrl}/wp-json/wpforms-api/v1/forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status === 200 && Array.isArray(response.data)) {
      for (const wpf of response.data) {
        const fields: FormField[] = wpf.fields?.map((field: any) => ({
          id: field.id,
          label: field.label,
          type: field.type || 'text',
          required: field.required || false,
          placeholder: field.placeholder,
          help_text: field.description,
        })) || []

        forms.push({
          id: wpf.id,
          title: wpf.post_title || wpf.title,
          type: 'wpforms',
          fields,
          pages: [], // Would need separate lookup
        })
      }
    }
  } catch (error) {
    console.error('Error fetching WPForms:', error)
  }

  return forms
}

/**
 * Get all forms from Contact Form 7
 */
export async function getContactForm7(
  siteUrl: string,
  apiKey: string
): Promise<Form[]> {
  const forms: Form[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    const response = await axios.get(
      `${cleanUrl}/wp-json/contact-form-7/v1/contact_forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status === 200 && Array.isArray(response.data)) {
      for (const cf7 of response.data) {
        // Parse form fields from CF7 form markup
        const fields: FormField[] = []
        const formMarkup = cf7.form || ''

        // Simple parsing for common field types
        if (formMarkup.includes('[text ')) {
          fields.push({
            id: 'text_field',
            label: 'Text Field',
            type: 'text',
            required: false,
          })
        }
        if (formMarkup.includes('[email ')) {
          fields.push({
            id: 'email_field',
            label: 'Email',
            type: 'email',
            required: true,
          })
        }
        if (formMarkup.includes('[textarea ')) {
          fields.push({
            id: 'message_field',
            label: 'Message',
            type: 'textarea',
            required: false,
          })
        }

        forms.push({
          id: cf7.id,
          title: cf7.title?.rendered || cf7.title,
          type: 'cf7',
          fields,
          pages: [],
        })
      }
    }
  } catch (error) {
    console.error('Error fetching Contact Form 7:', error)
  }

  return forms
}

/**
 * Get all forms from all form plugins
 */
export async function getAllForms(
  siteUrl: string,
  apiKey: string
): Promise<Form[]> {
  const allForms: Form[] = []

  // Get from Gravity Forms
  const gfForms = await getGravityForms(siteUrl, apiKey)
  allForms.push(...gfForms)

  // Get from WPForms
  const wpfForms = await getWPForms(siteUrl, apiKey)
  allForms.push(...wpfForms)

  // Get from Contact Form 7
  const cf7Forms = await getContactForm7(siteUrl, apiKey)
  allForms.push(...cf7Forms)

  return allForms
}

/**
 * Add field to a Gravity Form
 */
export async function addFieldToGravityForm(
  siteUrl: string,
  apiKey: string,
  formId: number,
  newField: FormField
): Promise<boolean> {
  try {
    const response = await axios.post(
      `${siteUrl}/wp-json/gf/v2/forms/${formId}`,
      {
        fields: [
          {
            id: newField.id || Math.random() * 1000,
            label: newField.label,
            type: newField.type,
            isRequired: newField.required,
            placeholder: newField.placeholder,
            description: newField.help_text,
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    )

    return response.status === 200
  } catch (error) {
    console.error(`Error adding field to Gravity Form ${formId}:`, error)
    return false
  }
}

/**
 * Update form notifications
 */
export async function updateFormNotification(
  siteUrl: string,
  apiKey: string,
  formId: number,
  formType: string,
  notificationTo: string,
  notificationSubject: string
): Promise<boolean> {
  try {
    if (formType === 'gravity_forms') {
      const response = await axios.post(
        `${siteUrl}/wp-json/gf/v2/forms/${formId}`,
        {
          notifications: [
            {
              id: '1',
              isActive: true,
              to: notificationTo,
              subject: notificationSubject,
              name: 'Admin Notification',
            },
          ],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      )

      return response.status === 200
    }

    return false
  } catch (error) {
    console.error(`Error updating form notification:`, error)
    return false
  }
}

/**
 * Get page IDs where a form appears
 */
export async function findFormInPages(
  siteUrl: string,
  apiKey: string,
  formId: number | string,
  formType: string
): Promise<number[]> {
  const pages: number[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')
  const shortcode = getFormShortcode(formType, formId)

  try {
    // Search pages for form shortcode
    let pageNumber = 1
    let hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/pages?per_page=100&page=${pageNumber}&search=${encodeURIComponent(
          String(shortcode)
        )}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        pages.push(...response.data.map((p: any) => p.id))
        pageNumber++
      } else {
        hasMorePages = false
      }
    }
  } catch (error) {
    console.error('Error finding form in pages:', error)
  }

  return pages
}

/**
 * Get form shortcode based on type
 */
function getFormShortcode(formType: string, formId: number | string): string {
  switch (formType) {
    case 'gravity_forms':
      return `[gravityform id="${formId}"`
    case 'wpforms':
      return `[wpforms id="${formId}"`
    case 'cf7':
      return `[contact-form-7 id="${formId}"`
    case 'fluent_forms':
      return `[fluentform id="${formId}"`
    default:
      return `form id="${formId}"`
  }
}

/**
 * Replace form on a page
 */
export async function replaceFormOnPage(
  siteUrl: string,
  apiKey: string,
  pageId: number,
  oldFormId: number | string,
  newFormId: number | string,
  formType: string
): Promise<boolean> {
  try {
    // Get page content
    const getResponse = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=content`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (getResponse.status !== 200) {
      return false
    }

    const content = getResponse.data.content?.raw || ''
    const oldShortcode = getFormShortcode(formType, oldFormId)
    const newShortcode = getFormShortcode(formType, newFormId)

    // Replace form shortcode
    const newContent = content.replace(
      new RegExp(oldShortcode, 'g'),
      newShortcode
    )

    if (newContent === content) {
      return false // No change made
    }

    // Update page
    const updateResponse = await axios.post(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
      { content: newContent },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    )

    return updateResponse.status === 200
  } catch (error) {
    console.error(`Error replacing form on page ${pageId}:`, error)
    return false
  }
}
