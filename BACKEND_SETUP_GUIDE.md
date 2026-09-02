# Zyphora Backend Setup & Debugging Guide

## 🔴 Current Issue
Error: "Cannot reach the auth backend at http://localhost:8080"

The backend PHP server IS running, but the frontend can't connect to it. This is likely due to:
1. **MySQL database not initialized** (schema not created)
2. **CORS configuration** not allowing Electron app
3. **Database connection error** causing 500 responses

---

## ✅ Step 1: Set Up MySQL Database

### 1a. Start MySQL Service
```powershell
# If using XAMPP
"C:\xampp\mysql\bin\mysqld.exe"

# Or if using MySQL service
Get-Service MySQL80 | Start-Service  # Adjust version if needed
```

### 1b. Initialize Database Schema
```powershell
cd E:\zyphora_backend\zyphora_backend

# Option 1: Using MySQL client (if installed)
mysql -u root -p < database/schema.sql

# Option 2: Using PHP CLI
php -r "
    \$pdo = new PDO('mysql:host=127.0.0.1:3306', 'root', '');
    \$sql = file_get_contents('database/schema.sql');
    \$pdo->exec(\$sql);
    echo 'Database initialized!';
"

# Option 3: Manual - Copy/paste SQL directly into MySQL client
```

### 1c. Verify Database
```bash
mysql -u root
> SHOW DATABASES;
> USE zyphora;
> SHOW TABLES;
```

Should see these 9 tables:
- ✅ users
- ✅ devices
- ✅ sessions
- ✅ browsing_history
- ✅ bookmarks
- ✅ user_settings
- ✅ auth_providers
- ✅ user_social_accounts
- ✅ oauth_states

---

## ✅ Step 2: Fix CORS for Electron

Electron apps don't have a traditional `origin` header. Update the CORS middleware:

**File**: `E:\zyphora_backend\zyphora_backend\src\Http\Middleware\CorsMiddleware.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Http\Server\MiddlewareInterface;

final class CorsMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($request->getMethod() === 'OPTIONS') {
            $response = new \Slim\Psr7\Response(204);
        } else {
            $response = $handler->handle($request);
        }
        
        $allowedOrigins = [
            env('FRONTEND_ORIGIN', 'http://localhost:5500'),  // Web frontend
            'http://localhost:3000',                          // Vite dev server
            'file://',                                        // Electron file protocol
            'null',                                           // Electron without origin
        ];
        
        $origin = (string) ($request->getHeaderLine('Origin') ?? '');
        $allowOrigin = in_array($origin, $allowedOrigins, true) ? $origin : '*';
        
        return $response
            ->withHeader('Access-Control-Allow-Origin', $allowOrigin)
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            ->withHeader('Access-Control-Allow-Credentials', 'true');
    }
}
```

---

## ✅ Step 3: Verify Backend Routes

Create this test file to verify endpoints are working:

**File**: `E:\zyphora_backend\test_endpoints.php`

```php
<?php

$endpoints = [
    'GET /health' => 'http://localhost:8080/health',
    'GET /' => 'http://localhost:8080/',
    'POST /auth/social/initiate' => [
        'url' => 'http://localhost:8080/auth/social/initiate',
        'method' => 'POST',
        'body' => ['provider' => 'google']
    ],
    'POST /auth/login' => [
        'url' => 'http://localhost:8080/auth/login',
        'method' => 'POST',
        'body' => ['email' => 'test@example.com', 'password' => 'testpassword123']
    ],
];

foreach ($endpoints as $label => $endpoint) {
    $url = is_string($endpoint) ? $endpoint : $endpoint['url'];
    $method = is_array($endpoint) && isset($endpoint['method']) ? $endpoint['method'] : 'GET';
    $body = is_array($endpoint) && isset($endpoint['body']) ? json_encode($endpoint['body']) : null;
    
    $opts = [
        'http' => [
            'method' => $method,
            'header' => "Content-Type: application/json\r\n",
            'timeout' => 5,
        ]
    ];
    
    if ($body) {
        $opts['http']['content'] = $body;
    }
    
    $context = stream_context_create($opts);
    
    echo "Testing: $label\n";
    $response = @file_get_contents($url, false, $context);
    
    if ($response === false) {
        echo "  ❌ FAILED - Connection refused or timeout\n";
    } else {
        echo "  ✅ SUCCESS\n";
        echo "  Response: " . substr($response, 0, 100) . "...\n";
    }
    echo "\n";
}
?>
```

**Run it**:
```powershell
php E:\zyphora_backend\test_endpoints.php
```

---

## ✅ Step 4: Update Backend Environment

Verify these in `.env`:

```env
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=zyphora
DB_USER=root
DB_PASSWORD=

# Frontend/App origins (for CORS)
FRONTEND_ORIGIN=http://localhost:5500
FRONTEND_BASE_URL=http://localhost:5500
APP_BASE_URL=http://localhost:8080

# OAuth credentials (already set in your .env)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8080/auth/social/google/callback
```

---

## ✅ Step 5: Restart Backend

```powershell
# Kill existing PHP server (if running)
Get-Process php | Stop-Process -Force

# Start fresh
cd E:\zyphora_backend\zyphora_backend
php -S localhost:8080 -t public

# You should see:
# [Mon Aug 31 22:03:44 2026] PHP 8.5.9 Development Server (http://localhost:8080) started
```

---

## ✅ Step 6: Test from Electron App

1. **Open Electron App** - `npm run dev`
2. **Open DevTools** - Press `F12`
3. **Go to Console tab**
4. **Run this test**:

```javascript
// Test if backend is reachable
fetch('http://localhost:8080/health')
  .then(r => r.json())
  .then(d => console.log('✅ Backend OK:', d))
  .catch(e => console.error('❌ Backend error:', e))

// Test OAuth endpoint
fetch('http://localhost:8080/auth/social/initiate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'google' })
})
  .then(r => r.json())
  .then(d => console.log('✅ OAuth endpoint OK:', d))
  .catch(e => console.error('❌ OAuth error:', e))
```

---

## 🔧 Common Issues & Solutions

### Issue: "Cannot connect to database"
```
Solution:
1. Make sure MySQL is running: Get-Service MySQL80 | Start-Service
2. Check credentials in .env match your MySQL setup
3. Run the schema.sql file to create tables
```

### Issue: "CORS error - Origin not allowed"
```
Solution:
1. Update CorsMiddleware.php with the fix above
2. Include file:// and null origins for Electron
3. Restart PHP server
```

### Issue: "OAuth state invalid"
```
Solution:
1. Check oauth_states table exists (run schema.sql)
2. Check backend time is in sync with client
3. Increase OAUTH_STATE_EXPIRY in backend config
```

### Issue: "Cannot GET /health"
```
Solution:
1. PHP server might be crashed - restart it
2. Check public/index.php is being served correctly
3. Run: php -S localhost:8080 -t public
```

---

## 📊 Architecture Verification

### Frontend → Backend Flow
```
Electron App (http://localhost:3000)
    ↓
API Client (src/renderer/lib/apiClient.ts)
    ↓
Backend Server (http://localhost:8080)
    ↓
MySQL Database (zyphora)
    ↓
OAuth Providers (Google, GitHub)
```

### Required for OAuth to Work
- ✅ MySQL database with oauth_states table
- ✅ Backend routes: /auth/social/initiate, /auth/social/{provider}/callback
- ✅ OAuth credentials in .env (GOOGLE_CLIENT_ID, etc.)
- ✅ CORS headers allowing Electron origin
- ✅ Network connectivity between localhost:3000 and localhost:8080

---

## 🚀 Complete Startup Checklist

- [ ] MySQL service started
- [ ] Database schema initialized (`schema.sql` executed)
- [ ] `.env` file configured with OAuth credentials
- [ ] CORS middleware updated for Electron
- [ ] PHP server running: `php -S localhost:8080 -t public`
- [ ] Frontend app running: `npm run dev`
- [ ] DevTools showing successful API calls
- [ ] OAuth flow initiates without "Cannot reach backend" error

---

## 📝 Testing OAuth Flow

Once everything is set up:

1. **Start backend**: `php -S localhost:8080 -t public`
2. **Start frontend**: `npm run dev`
3. **In app, click "Sign up with Google"**
4. **DevTools should show**:
   ```
   POST /auth/social/initiate → 200 OK
   {
     "ok": true,
     "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
     "state": "abc123...",
     "expires_in": 600
   }
   ```
5. **OAuth popup opens** (inside app, not external browser)
6. **After auth, popup sends tokens back** to main window
7. **Main app receives tokens** and signs you in

---

**Version**: 1.0  
**Last Updated**: 2026-08-31  
**Status**: Production Setup Guide ✅
