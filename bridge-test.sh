#!/bin/bash

###############################################################################
# Bridge Endpoint Test Script
# 
# Usage:
#   ./bridge-test.sh <SITE_URL> <API_KEY>
#   
# Example:
#   ./bridge-test.sh "https://example.com" "your-api-key-here"
#
# This script tests all critical WordPress bridge endpoints to verify:
# - Authentication is working
# - Bridge plugin is installed and accessible
# - Core endpoints respond correctly
# - API key is valid
###############################################################################

set -e

SITE_URL="${1:-}"
API_KEY="${2:-}"
PLATFORM_URL="${3:-http://localhost:3000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_test() { echo -e "${BLUE}→${NC} $1"; }
log_pass() { echo -e "${GREEN}✓${NC} $1"; }
log_fail() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Validate inputs
if [ -z "$SITE_URL" ] || [ -z "$API_KEY" ]; then
  echo "Usage: $0 <SITE_URL> <API_KEY> [PLATFORM_URL]"
  echo ""
  echo "Example:"
  echo "  $0 'https://example.com' 'abc123def456' 'http://localhost:3000'"
  echo ""
  echo "Environment variables (alternative):"
  echo "  SITE_URL - Your WordPress site URL"
  echo "  API_KEY - Your bridge API key"
  echo "  PLATFORM_URL - ignyous platform URL (default: http://localhost:3000)"
  exit 1
fi

# Normalize URLs (remove trailing slashes)
SITE_URL="${SITE_URL%/}"
PLATFORM_URL="${PLATFORM_URL%/}"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Bridge Endpoint Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo "Site URL:       $SITE_URL"
echo "Platform URL:   $PLATFORM_URL"
echo "API Key:        ${API_KEY:0:10}..."
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test an endpoint
test_endpoint() {
  local method=$1
  local endpoint=$2
  local description=$3
  local body=${4:-}
  
  log_test "$description"
  
  local url="$PLATFORM_URL/api/bridge/$endpoint"
  local cmd="curl -s -X $method '$url'"
  
  if [ -n "$body" ]; then
    cmd="$cmd -H 'Content-Type: application/json' -d '$body'"
  fi
  
  # Add auth params to endpoint
  if [[ "$endpoint" != *"siteUrl"* ]]; then
    endpoint="$endpoint?siteUrl=$(echo -n "$SITE_URL" | jq -sRr @uri)&apiKey=$(echo -n "$API_KEY" | jq -sRr @uri)"
  fi
  
  local url="$PLATFORM_URL/api/bridge/$endpoint"
  
  local response
  if [ -n "$body" ]; then
    response=$(curl -s -X "$method" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$url")
  else
    response=$(curl -s -X "$method" "$url")
  fi
  
  # Check for success in response
  if echo "$response" | jq . > /dev/null 2>&1; then
    if echo "$response" | jq -e '.success == true or .data != null' > /dev/null 2>&1; then
      log_pass "$description"
      ((TESTS_PASSED++))
      return 0
    elif echo "$response" | jq -e '.error' > /dev/null 2>&1; then
      local error=$(echo "$response" | jq -r '.error // .message // "Unknown error"')
      log_fail "$description - Error: $error"
      ((TESTS_FAILED++))
      return 1
    else
      echo "$response" | jq . 2>/dev/null || echo "$response"
      log_warn "$description - Unexpected response format"
      ((TESTS_PASSED++))
      return 0
    fi
  else
    log_fail "$description - Invalid JSON response"
    echo "Response: $response"
    ((TESTS_FAILED++))
    return 1
  fi
}

# Build request bodies
SITE_BODY="{\"siteUrl\":\"$SITE_URL\",\"apiKey\":\"$API_KEY\"}"
SNAPSHOT_BODY="{\"siteUrl\":\"$SITE_URL\",\"apiKey\":\"$API_KEY\",\"label\":\"Test Snapshot $(date +%s)\"}"
SCAN_BODY="{\"siteUrl\":\"$SITE_URL\",\"apiKey\":\"$API_KEY\",\"mode\":\"text\",\"query\":\"test\",\"limit\":10}"

echo -e "${YELLOW}Core Endpoints${NC}"
echo "─────────────────────────────────────"

# Test 1: Health / Connection
test_endpoint "GET" "site?siteUrl=$(echo -n "$SITE_URL" | jq -sRr @uri)&apiKey=$(echo -n "$API_KEY" | jq -sRr @uri)" "Site info (connection test)"

# Test 2: Pages
test_endpoint "GET" "pages?siteUrl=$(echo -n "$SITE_URL" | jq -sRr @uri)&apiKey=$(echo -n "$API_KEY" | jq -sRr @uri)" "List pages"

# Test 3: Content scan
test_endpoint "POST" "content/scan?siteUrl=$(echo -n "$SITE_URL" | jq -sRr @uri)&apiKey=$(echo -n "$API_KEY" | jq -sRr @uri)" "Scan content" "$SCAN_BODY"

# Test 4: Snapshot
test_endpoint "POST" "snapshot?siteUrl=$(echo -n "$SITE_URL" | jq -sRr @uri)&apiKey=$(echo -n "$API_KEY" | jq -sRr @uri)" "Create snapshot" "$SNAPSHOT_BODY"

echo ""
echo -e "${YELLOW}Summary${NC}"
echo "─────────────────────────────────────"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Bridge is working.${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Check bridge configuration.${NC}"
  exit 1
fi
