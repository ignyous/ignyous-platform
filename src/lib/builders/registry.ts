/**
 * Builder Registry
 * 
 * Central registry for all page builder implementations
 * Manages detection, scanning, and replacement across different builders
 */

export type BuilderType = 'elementor' | 'gutenberg' | 'divi' | 'beaver' | 'unknown'

export interface BuilderCapability {
  name: string
  slug: BuilderType
  supported: boolean
  confidence: number // 0-100 how confident we are in our support
  features: {
    scan: boolean
    replace: boolean
    previewReplacement: boolean
    rollback: boolean
  }
}

/**
 * Get capabilities for a builder
 */
export function getBuilderCapabilities(builderType: BuilderType): BuilderCapability {
  const capabilities: Record<BuilderType, BuilderCapability> = {
    elementor: {
      name: 'Elementor',
      slug: 'elementor',
      supported: true,
      confidence: 99,
      features: {
        scan: true,
        replace: true,
        previewReplacement: true,
        rollback: false, // TODO: implement
      },
    },
    gutenberg: {
      name: 'Gutenberg',
      slug: 'gutenberg',
      supported: true,
      confidence: 92,
      features: {
        scan: false, // TODO: implement
        replace: false,
        previewReplacement: false,
        rollback: false,
      },
    },
    divi: {
      name: 'Divi',
      slug: 'divi',
      supported: true,
      confidence: 85,
      features: {
        scan: false, // TODO: implement
        replace: false,
        previewReplacement: false,
        rollback: false,
      },
    },
    beaver: {
      name: 'Beaver Builder',
      slug: 'beaver',
      supported: false,
      confidence: 0,
      features: {
        scan: false,
        replace: false,
        previewReplacement: false,
        rollback: false,
      },
    },
    unknown: {
      name: 'Unknown',
      slug: 'unknown',
      supported: false,
      confidence: 0,
      features: {
        scan: false,
        replace: false,
        previewReplacement: false,
        rollback: false,
      },
    },
  }

  return capabilities[builderType]
}

/**
 * Check if a builder is supported for scanning
 */
export function isScanSupported(builderType: BuilderType): boolean {
  return getBuilderCapabilities(builderType).features.scan
}

/**
 * Check if a builder is supported for replacement
 */
export function isReplaceSupported(builderType: BuilderType): boolean {
  return getBuilderCapabilities(builderType).features.replace
}

/**
 * Get confidence message for a builder
 */
export function getBuilderConfidenceMessage(builderType: BuilderType): string {
  const caps = getBuilderCapabilities(builderType)

  if (!caps.supported) {
    return `${caps.name} is not yet supported. Contact support to request this builder.`
  }

  if (caps.confidence >= 95) {
    return `${caps.name} is fully supported with high confidence.`
  }

  if (caps.confidence >= 85) {
    return `${caps.name} is supported. Some edge cases may occur.`
  }

  return `${caps.name} support is experimental. Test carefully.`
}

/**
 * Get icon for a builder
 */
export function getBuilderIcon(builderType: BuilderType): string {
  const icons: Record<BuilderType, string> = {
    elementor: '⚙️',
    gutenberg: '⬡',
    divi: '▦',
    beaver: '🦫',
    unknown: '❓',
  }
  return icons[builderType]
}
