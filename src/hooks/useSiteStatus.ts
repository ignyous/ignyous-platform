import { useState, useEffect, useCallback } from 'react'

export interface SiteStatus {
  success: boolean
  status: 'connected' | 'slow' | 'unreachable' | 'invalid_key' | 'bridge_missing' | 'server_error' | 'checking' | 'error'
  statusCode: 'green' | 'yellow' | 'red'
  message: string
  responseTime: number
  siteUrl: string
  lastChecked: string
  lastAction?: {
    type: string
    message: string
    timestamp: string
  }
}

const DEFAULT_STATUS: SiteStatus = {
  success: false,
  status: 'checking',
  statusCode: 'yellow',
  message: 'Checking connection...',
  responseTime: 0,
  siteUrl: '',
  lastChecked: new Date().toISOString(),
}

/**
 * Hook to monitor WordPress site status
 * 
 * Polls every 30 seconds for:
 * - Bridge connectivity
 * - API key validity
 * - Response time
 * - Cache status
 */
export function useSiteStatus(siteUrl: string, apiKey: string) {
  const [status, setStatus] = useState<SiteStatus>(DEFAULT_STATUS)
  const [isManualTesting, setIsManualTesting] = useState(false)

  const checkStatus = useCallback(async () => {
    if (!siteUrl || !apiKey) return

    try {
      const params = new URLSearchParams({
        siteUrl,
        apiKey,
      })

      const response = await fetch(`/api/wordpress/status?${params}`)
      const data = await response.json()

      setStatus({
        ...data,
        siteUrl,
        lastChecked: new Date().toISOString(),
      } as SiteStatus)
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        success: false,
        status: 'error',
        statusCode: 'red',
        message: 'Failed to check status',
        siteUrl,
      }))
    }
  }, [siteUrl, apiKey])

  // Auto-check on mount and every 30 seconds
  useEffect(() => {
    if (!siteUrl || !apiKey) return

    // Initial check
    checkStatus()

    // Poll every 30 seconds
    const interval = setInterval(checkStatus, 30000)

    return () => clearInterval(interval)
  }, [siteUrl, apiKey, checkStatus])

  const manualTest = useCallback(async () => {
    setIsManualTesting(true)
    await checkStatus()
    setIsManualTesting(false)
  }, [checkStatus])

  return {
    status,
    isChecking: status.status === 'checking',
    isManualTesting,
    manualTest,
    isConnected: status.success,
    isSlow: status.status === 'slow',
    isUnreachable: status.status === 'unreachable',
    isInvalidKey: status.status === 'invalid_key',
  }
}
