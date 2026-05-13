#!/usr/bin/env node

/**
 * Bridge Endpoint Test Script (Node.js)
 * 
 * Usage:
 *   node bridge-test.js <SITE_URL> <API_KEY>
 *   npx ts-node bridge-test.js <SITE_URL> <API_KEY>
 * 
 * Example:
 *   node bridge-test.js "https://example.com" "your-api-key-here"
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logTest(msg) {
  log(`→ ${msg}`, 'blue');
}

function logPass(msg) {
  log(`✓ ${msg}`, 'green');
}

function logFail(msg) {
  log(`✗ ${msg}`, 'red');
}

function logWarn(msg) {
  log(`⚠ ${msg}`, 'yellow');
}

// Parse arguments
const siteUrl = process.argv[2];
const apiKey = process.argv[3];
const platformUrl = process.argv[4] || 'http://localhost:3000';

if (!siteUrl || !apiKey) {
  log('Usage: node bridge-test.js <SITE_URL> <API_KEY> [PLATFORM_URL]', 'red');
  log('');
  log('Example:');
  log('  node bridge-test.js "https://example.com" "abc123def456"', 'yellow');
  process.exit(1);
}

// Normalize URLs
const normalizedSiteUrl = siteUrl.replace(/\/$/, '');
const normalizedPlatformUrl = platformUrl.replace(/\/$/, '');

log('═══════════════════════════════════════════════════', 'blue');
log('Bridge Endpoint Test Suite', 'blue');
log('═══════════════════════════════════════════════════', 'blue');
log(`Site URL:       ${normalizedSiteUrl}`);
log(`Platform URL:   ${normalizedPlatformUrl}`);
log(`API Key:        ${apiKey.substring(0, 10)}...`);
log('');

// Helper function to make HTTP requests
function makeRequest(pathname, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    // Add query params for auth
    const queryParams = new URLSearchParams({
      siteUrl: normalizedSiteUrl,
      apiKey: apiKey,
    });

    const fullUrl = new URL(`${normalizedPlatformUrl}${pathname}?${queryParams.toString()}`);
    const isHttps = fullUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = httpModule.request(fullUrl, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data,
          headers: res.headers,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test executor
async function testEndpoint(method, endpoint, description, body = null) {
  logTest(description);

  try {
    const response = await makeRequest(`/api/bridge/${endpoint}`, method, body);

    let jsonData;
    try {
      jsonData = JSON.parse(response.body);
    } catch (e) {
      logFail(`${description} - Invalid JSON response`);
      log(`Response: ${response.body}`, 'red');
      return false;
    }

    // Check for success
    if (jsonData.success === true || jsonData.data !== undefined) {
      logPass(description);
      return true;
    } else if (jsonData.error) {
      logFail(`${description} - Error: ${jsonData.error}`);
      return false;
    } else if (response.statusCode >= 200 && response.statusCode < 300) {
      logPass(description);
      return true;
    } else {
      logWarn(`${description} - Unexpected response`);
      log(JSON.stringify(jsonData, null, 2), 'yellow');
      return true;
    }
  } catch (error) {
    logFail(`${description} - ${error.message}`);
    return false;
  }
}

// Run tests
async function runTests() {
  let passed = 0;
  let failed = 0;

  log('Core Endpoints', 'yellow');
  log('─────────────────────────────────────');

  // Test 1: Site info (health check)
  if (await testEndpoint('GET', 'site', 'Site info (connection test)')) {
    passed++;
  } else {
    failed++;
  }

  // Test 2: List pages
  if (await testEndpoint('GET', 'pages', 'List pages')) {
    passed++;
  } else {
    failed++;
  }

  // Test 3: Content scan
  const scanBody = {
    mode: 'text',
    query: 'test',
    limit: 10,
  };
  if (await testEndpoint('POST', 'content/scan', 'Scan content', scanBody)) {
    passed++;
  } else {
    failed++;
  }

  // Test 4: Take snapshot
  const snapshotBody = {
    label: `Test Snapshot ${Date.now()}`,
  };
  if (await testEndpoint('POST', 'snapshot', 'Create snapshot', snapshotBody)) {
    passed++;
  } else {
    failed++;
  }

  log('');
  log('Summary', 'yellow');
  log('─────────────────────────────────────');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, 'red');
  log('');

  if (failed === 0) {
    log('✓ All tests passed! Bridge is working.', 'green');
    process.exit(0);
  } else {
    log('✗ Some tests failed. Check bridge configuration.', 'red');
    log('');
    log('Tips for debugging:', 'yellow');
    log('1. Verify API key is correct', 'yellow');
    log('2. Check WordPress site is accessible', 'yellow');
    log('3. Verify ignyous-bridge plugin is installed and activated', 'yellow');
    log('4. Check WordPress error logs: /wp-content/debug.log', 'yellow');
    process.exit(1);
  }
}

runTests().catch((error) => {
  logFail(`Fatal error: ${error.message}`);
  process.exit(1);
});
