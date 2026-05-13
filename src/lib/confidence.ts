/**
 * Confidence Scoring System
 * 
 * Calculates confidence score (0-100) for content matches
 * Takes into account:
 * - Field type (known phone field vs generic text)
 * - Context (surrounding text that indicates content type)
 * - Format (does it match expected format)
 * - Builder maturity (how well we support this builder)
 * - Location (what page/section is it in)
 * - Data integrity (will replacement break anything)
 * - Verification ability (can we verify changes worked)
 */

export type RecommendationType = 'safe' | 'review' | 'skip'

export interface ConfidenceFactor {
  name: string
  score: number // 0-100
  weight: number // 0-1
  reason: string
}

export interface ContentConfidenceResult {
  overallScore: number // 0-100
  recommendation: RecommendationType
  factors: ConfidenceFactor[]
  risks: string[]
  notes: string[]
  shouldAutoCheck: boolean // Should checkbox be auto-checked in preview?
}

/**
 * Calculate overall confidence for a content match
 */
export function calculateConfidence(params: {
  fieldName?: string
  fieldType?: string
  currentValue: string
  searchTerm: string
  context?: string // Surrounding text
  pageTitle?: string
  pageType?: string
  builderType?: 'elementor' | 'gutenberg' | 'divi' | 'other' | 'unknown'
  builderVersion?: string
  location?: string
  elementType?: string
  isInFormField?: boolean
  canVerifyPostChange?: boolean
}): ContentConfidenceResult {
  const factors: ConfidenceFactor[] = []
  const risks: string[] = []
  const notes: string[] = []

  // ═══ FACTOR 1: Field Type Confidence (20% weight) ═══
  const fieldTypeFactor = calculateFieldTypeConfidence(
    params.fieldName,
    params.fieldType,
    params.searchTerm
  )
  factors.push({
    name: 'Field Type',
    score: fieldTypeFactor.score,
    weight: 0.2,
    reason: fieldTypeFactor.reason,
  })

  // ═══ FACTOR 2: Context Confidence (15% weight) ═══
  const contextFactor = calculateContextConfidence(
    params.currentValue,
    params.context,
    params.searchTerm
  )
  factors.push({
    name: 'Context',
    score: contextFactor.score,
    weight: 0.15,
    reason: contextFactor.reason,
  })

  // ═══ FACTOR 3: Format Confidence (15% weight) ═══
  const formatFactor = calculateFormatConfidence(
    params.currentValue,
    params.searchTerm
  )
  factors.push({
    name: 'Format Match',
    score: formatFactor.score,
    weight: 0.15,
    reason: formatFactor.reason,
  })

  // ═══ FACTOR 4: Builder Support Maturity (20% weight) ═══
  const builderFactor = calculateBuilderConfidence(
    params.builderType,
    params.builderVersion
  )
  factors.push({
    name: 'Builder Support',
    score: builderFactor.score,
    weight: 0.2,
    reason: builderFactor.reason,
  })

  // ═══ FACTOR 5: Page Type Expectations (10% weight) ═══
  const locationFactor = calculateLocationConfidence(
    params.pageTitle,
    params.pageType,
    params.searchTerm
  )
  factors.push({
    name: 'Page Type',
    score: locationFactor.score,
    weight: 0.1,
    reason: locationFactor.reason,
  })

  // ═══ FACTOR 6: Data Integrity (10% weight) ═══
  const integrityFactor = calculateIntegrityConfidence(
    params.builderType,
    params.isInFormField,
    params.fieldType
  )
  factors.push({
    name: 'Data Integrity',
    score: integrityFactor.score,
    weight: 0.1,
    reason: integrityFactor.reason,
  })

  // ═══ FACTOR 7: Verification Ability (10% weight) ═══
  const verificationFactor = calculateVerificationConfidence(
    params.canVerifyPostChange,
    params.builderType
  )
  factors.push({
    name: 'Verification',
    score: verificationFactor.score,
    weight: 0.1,
    reason: verificationFactor.reason,
  })

  // Calculate weighted average
  const overallScore = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0)
  )

  // Determine recommendation
  let recommendation: RecommendationType
  if (overallScore >= 85) {
    recommendation = 'safe'
  } else if (overallScore >= 70) {
    recommendation = 'review'
  } else {
    recommendation = 'skip'
  }

  // Identify risks
  if (contextFactor.score < 60) {
    risks.push('Context is ambiguous — content might not be what you think')
  }
  if (formatFactor.score < 75) {
    risks.push('Format is unusual — might not be a phone number')
  }
  if (builderFactor.score < 80) {
    risks.push('Builder support is new — test changes carefully')
  }
  if (integrityFactor.score < 85) {
    risks.push('Data structure might be affected by replacement')
  }
  if (params.isInFormField && overallScore < 85) {
    risks.push('This is in a form field — changes might affect form validation')
  }

  // Add notes
  if (overallScore >= 95) {
    notes.push('✅ Extremely confident in this match')
  }
  if (params.builderType === 'elementor' && overallScore >= 85) {
    notes.push('✅ Elementor support is mature and well-tested')
  }

  return {
    overallScore,
    recommendation,
    factors,
    risks,
    notes,
    shouldAutoCheck: recommendation === 'safe' || recommendation === 'review',
  }
}

// ═══════════════════════════════════════════════════════════
// INDIVIDUAL FACTOR CALCULATIONS
// ═══════════════════════════════════════════════════════════

function calculateFieldTypeConfidence(
  fieldName?: string,
  fieldType?: string,
  searchTerm?: string
): ConfidenceFactor {
  const knownPhoneFields = [
    'phone',
    'tel',
    'telephone',
    'phone_number',
    'contact_phone',
    'business_phone',
    'mobile',
    'mobile_phone',
    'cell',
    'contact',
  ]

  const knownEmailFields = [
    'email',
    'email_address',
    'contact_email',
    'business_email',
    'support_email',
    'admin_email',
  ]

  const fieldNameLower = fieldName?.toLowerCase() || ''
  const fieldTypeLower = fieldType?.toLowerCase() || ''

  // Determine if this is a known field
  const isKnownPhoneField = knownPhoneFields.some(
    kf => fieldNameLower.includes(kf) || fieldTypeLower.includes(kf)
  )
  const isKnownEmailField = knownEmailFields.some(
    kf => fieldNameLower.includes(kf) || fieldTypeLower.includes(kf)
  )
  const isTextarea = fieldTypeLower.includes('textarea') || fieldTypeLower.includes('text')
  const isRichText = fieldTypeLower.includes('rich') || fieldTypeLower.includes('wysiwyg')

  let score = 50
  let reason = 'Generic text field'

  if (isKnownPhoneField) {
    score = 95
    reason = 'Known phone number field'
  } else if (isKnownEmailField) {
    score = 95
    reason = 'Known email field'
  } else if (isTextarea) {
    score = 70
    reason = 'Text area — likely contains content'
  } else if (isRichText) {
    score = 65
    reason = 'Rich text field — might contain formatted content'
  } else if (fieldType === 'input' || fieldType === 'text') {
    score = 60
    reason = 'Generic input field'
  }

  return { name: 'Field Type', score, weight: 0.2, reason }
}

function calculateContextConfidence(
  currentValue: string,
  context?: string,
  searchTerm?: string
): ConfidenceFactor {
  const contextLower = context?.toLowerCase() || ''
  const currentValueLower = currentValue.toLowerCase()

  let score = 60
  let reason = 'Limited context available'

  // Check for clear phone context
  const phoneContextIndicators = [
    'call',
    'phone',
    'tel',
    'mobile',
    'contact',
    'reach',
    'dial',
    'number',
  ]
  const hasPhoneContext = phoneContextIndicators.some(
    indicator => contextLower.includes(indicator) || currentValueLower.includes(indicator)
  )

  // Check for clear email context
  const emailContextIndicators = [
    'email',
    'mail',
    'contact',
    'reach',
    'send',
    '@',
    'address',
  ]
  const hasEmailContext = emailContextIndicators.some(
    indicator => contextLower.includes(indicator) || currentValueLower.includes(indicator)
  )

  if (hasPhoneContext || hasEmailContext) {
    score = 90
    reason = 'Clear context indicating phone/email'
  } else if (context) {
    score = 75
    reason = 'Some context available'
  } else if (currentValue === searchTerm) {
    score = 70
    reason = 'Exact match without surrounding context'
  }

  return { name: 'Context', score, weight: 0.15, reason }
}

function calculateFormatConfidence(
  currentValue: string,
  searchTerm: string
): ConfidenceFactor {
  let score = 70
  let reason = 'Matches search term'

  // Phone number patterns
  const phonePatterns = [
    /^\(\d{3}\)\s?\d{3}-\d{4}$/, // (555) 123-4567
    /^\d{3}-\d{3}-\d{4}$/, // 555-123-4567
    /^\d{10}$/, // 5551234567
    /^\+1\s?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/, // +1 555 123 4567
  ]

  // Email patterns
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const isPhoneFormat = phonePatterns.some(pattern => pattern.test(currentValue))
  const isEmailFormat = emailPattern.test(currentValue)

  if (isPhoneFormat) {
    score = 98
    reason = 'Matches standard phone format'
  } else if (isEmailFormat) {
    score = 98
    reason = 'Matches standard email format'
  } else if (currentValue.includes('.') || currentValue.includes('-') || currentValue.includes('(')) {
    score = 85
    reason = 'Has structured format'
  } else if (currentValue.length < 5) {
    score = 40
    reason = 'Very short value — might not be phone/email'
  }

  return { name: 'Format Match', score, weight: 0.15, reason }
}

function calculateBuilderConfidence(
  builderType?: string,
  builderVersion?: string
): ConfidenceFactor {
  let score = 50
  let reason = 'Unknown builder'

  switch (builderType) {
    case 'elementor':
      score = 99
      reason = 'Elementor — well-tested, 7M+ sites'
      break
    case 'gutenberg':
      score = 95
      reason = 'Gutenberg — WordPress native, very stable'
      break
    case 'divi':
      score = 85
      reason = 'Divi — tested, widely used'
      break
    case 'other':
      score = 70
      reason = 'Page builder support is new'
      break
    case 'unknown':
      score = 40
      reason = 'Unknown builder — limited testing'
      break
  }

  return { name: 'Builder Support', score, weight: 0.2, reason }
}

function calculateLocationConfidence(
  pageTitle?: string,
  pageType?: string,
  searchTerm?: string
): ConfidenceFactor {
  const pageTitleLower = pageTitle?.toLowerCase() || ''
  const pageTypeLower = pageType?.toLowerCase() || ''

  let score = 60
  let reason = 'Generic page location'

  // Pages where you'd expect phone numbers
  const phoneExpectedPages = [
    'contact',
    'about',
    'footer',
    'header',
    'call',
    'reach',
    'business',
  ]

  // Pages where you'd expect emails
  const emailExpectedPages = ['contact', 'about', 'support', 'footer', 'email']

  const isPhonePage = phoneExpectedPages.some(
    p => pageTitleLower.includes(p) || pageTypeLower.includes(p)
  )
  const isEmailPage = emailExpectedPages.some(
    p => pageTitleLower.includes(p) || pageTypeLower.includes(p)
  )

  if (isPhonePage || isEmailPage) {
    score = 92
    reason = `Expected location for content type`
  } else if (pageTypeLower.includes('post') || pageTypeLower.includes('page')) {
    score = 70
    reason = 'Standard page — might contain content'
  } else if (pageTypeLower.includes('archive') || pageTypeLower.includes('listing')) {
    score = 45
    reason = 'Archive page — unusual location for this content'
  }

  return { name: 'Page Type', score, weight: 0.1, reason }
}

function calculateIntegrityConfidence(
  builderType?: string,
  isInFormField?: boolean,
  fieldType?: string
): ConfidenceFactor {
  let score = 85
  let reason = 'Safe to replace'

  // Form fields are riskier
  if (isInFormField) {
    score -= 10
    reason = 'In form field — might affect validation'
  }

  // JSON data is safer than code
  if (builderType === 'elementor' || builderType === 'gutenberg') {
    score += 10
    reason = 'Well-structured data format'
  }

  // Rich text/code fields are riskier
  if (fieldType?.includes('code') || fieldType?.includes('script')) {
    score -= 25
    reason = 'In code field — replacement might break syntax'
  }

  // Ensure score stays in range
  score = Math.max(30, Math.min(100, score))

  return { name: 'Data Integrity', score, weight: 0.1, reason }
}

function calculateVerificationConfidence(
  canVerifyPostChange?: boolean,
  builderType?: string
): ConfidenceFactor {
  let score = 85
  let reason = 'Can verify changes'

  if (!canVerifyPostChange) {
    score -= 20
    reason = 'Limited verification possible'
  }

  if (builderType === 'elementor' || builderType === 'gutenberg') {
    score += 5
    reason = 'Builder has reliable verification'
  }

  score = Math.max(30, Math.min(100, score))

  return { name: 'Verification', score, weight: 0.1, reason }
}
