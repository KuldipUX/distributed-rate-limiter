# Distributed Rate Limiter

A distributed API rate-limiting system built using **Node.js, Express.js, Redis, and Lua scripting**.

This project implements a centralized rate-limiting mechanism that controls incoming API requests across multiple independent backend server instances. By using Redis as a shared data store and Lua scripts for atomic execution, the system ensures that all server instances enforce a common request limit.

The project demonstrates how distributed backend services can coordinate request limits without maintaining separate counters in each server.

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Key Features](#key-features)
4. [System Architecture](#system-architecture)
5. [How It Works](#how-it-works)
6. [Rate Limiting Algorithm](#rate-limiting-algorithm)
7. [Atomic Execution Using Lua](#atomic-execution-using-lua)
8. [Technology Stack](#technology-stack)
9. [Project Structure](#project-structure)
10. [Installation and Setup](#installation-and-setup)
11. [Environment Configuration](#environment-configuration)
12. [Running the Application](#running-the-application)
13. [API Endpoints](#api-endpoints)
14. [Load Testing](#load-testing)
15. [Redis Failure Handling](#redis-failure-handling)
16. [Test Results](#test-results)
17. [Limitations](#limitations)
18. [Future Improvements](#future-improvements)
19. [Learning Outcomes](#learning-outcomes)

---

## Overview

A rate limiter is a backend mechanism that controls how frequently a client can access an API within a specified time interval.

This project implements a **Fixed Window Rate Limiter** with a shared Redis counter.

### Default Configuration

| Parameter | Value |
|---|---|
| Maximum requests | 5 |
| Time window | 60 seconds |
| Server Instance 1 | Port 3000 |
| Server Instance 2 | Port 3001 |
| Redis | Port 6379 |
| Rate limiting algorithm | Fixed Window |
| Counter storage | Redis |
| Atomic execution | Redis Lua Script |

The request limit and time window can be modified through environment variables.

---

## Problem Statement

In a traditional application, each backend server may maintain its own request counter.

Consider an application running two independent server instances:

- Server 1 receives requests on port 3000.
- Server 2 receives requests on port 3001.

If each server maintains a separate in-memory counter, a client can potentially bypass the intended request limit by sending requests to different instances.

For example, if each server allows five requests, a client could make five requests to each server and receive ten requests in total.

This creates an inconsistency in request enforcement.

### Solution

This project solves the problem by introducing Redis as a centralized counter store.

Both server instances communicate with the same Redis database and access the same rate-limit key for a given client IP address.

As a result, the request limit is shared across all instances.

---

## Key Features

- **Distributed Rate Limiting:** Enforces a common request limit across multiple Express server instances.
- **Redis Integration:** Uses Redis for centralized request-counter storage.
- **Atomic Lua Execution:** Prevents race conditions during counter updates and limit checks.
- **Fixed Window Algorithm:** Limits requests within a configurable time interval.
- **Environment-Based Configuration:** Allows request limits and time windows to be changed without modifying application code.
- **Express Middleware:** Implements rate limiting as reusable middleware.
- **Failure Handling:** Returns HTTP 503 when Redis is unavailable instead of exposing internal errors.
- **Concurrent Load Testing:** Uses Artillery to test both server instances simultaneously.

---

## System Architecture

The application consists of two independent Express.js server instances connected to a shared Redis database.

```text
                   Incoming Requests
                           |
                 +---------+---------+
                 |                   |
                 v                   v
          +-------------+     +-------------+
          |  Server 1   |     |  Server 2   |
          | Port: 3000  |     | Port: 3001  |
          +-------------+     +-------------+
                 |                   |
                 +---------+---------+
                           |
                           v
                  +----------------+
                  | Rate Limiter   |
                  | Express        |
                  | Middleware     |
                  +----------------+
                           |
                           v
                  +----------------+
                  | Redis Lua      |
                  | Script         |
                  +----------------+
                           |
                           v
                  +----------------+
                  | Shared Redis   |
                  | Port: 6379     |
                  +----------------+
                           |
                           v
                  +----------------+
                  | Centralized    |
                  | Request Counter|
                  +----------------+
```

### Architecture Explanation

1. Incoming requests reach either Express server.
2. The rate-limiting middleware identifies the client's IP address.
3. A Redis key is generated using that IP address.
4. The middleware executes a Lua script in Redis.
5. Redis atomically increments the counter and checks the configured limit.
6. The request is either allowed or rejected.

Both server instances use the same Redis database, ensuring consistent request counting.

---

## How It Works

The request-processing flow is:

```text
             Incoming API Request
                      |
                      v
              Identify Client IP
                      |
                      v
              Generate Redis Key
                      |
                      v
              Execute Lua Script
                      |
                      v
              Increment Counter
                      |
                      v
              Check Request Limit
                      |
               +------+------+
               |             |
           Within Limit   Limit Exceeded
               |             |
               v             v
          Allow Request   Reject Request
               |             |
               v             v
          HTTP 200       HTTP 429
```

### Request Behavior

With the default configuration:

- Requests 1–5 are allowed.
- Request 6 and subsequent requests are rejected until the current window expires.
- Once the Redis key expires, a new window begins.

---

## Rate Limiting Algorithm

This project uses the **Fixed Window Counter Algorithm**.

The algorithm works using three Redis operations:

1. `INCR` increments the request counter.
2. `EXPIRE` sets the expiration time when the counter is first created.
3. The counter is compared against the configured request limit.

### Example

Assume:

- Request limit = 5
- Time window = 60 seconds

| Request | Counter | Result |
|---|---:|---|
| 1 | 1 | Allowed |
| 2 | 2 | Allowed |
| 3 | 3 | Allowed |
| 4 | 4 | Allowed |
| 5 | 5 | Allowed |
| 6 | 6 | Rejected |
| 7 | 7 | Rejected |

The Redis key expires after 60 seconds, allowing the next window to start with a fresh counter.

**Important:** The expiration is set only when the counter is first created. It is not reset on every incoming request.

---

## Atomic Execution Using Lua

One of the important design decisions in this project is using Redis Lua scripting.

### Why Lua?

Executing Redis commands individually can introduce race conditions when multiple requests arrive simultaneously.

For example, the following operations form one logical process:

- Increment the counter.
- Set the expiration.
- Check the request limit.

If these operations are executed separately, other requests may execute between them.

To avoid this issue, the project uses a Lua script.

### Lua Script

The implementation is available in `rateLimiter.lua`.

```lua
local count = redis.call('INCR', KEYS[1])

if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end

if count > tonumber(ARGV[2]) then
    return 0
end

return 1
```

### How the Script Works

| Expression | Purpose |
|---|---|
| `KEYS[1]` | Redis counter key |
| `ARGV[1]` | Expiration time in seconds |
| `ARGV[2]` | Maximum request limit |
| `INCR` | Increments the counter |
| `EXPIRE` | Sets the counter expiration |
| `return 1` | Allows the request |
| `return 0` | Rejects the request |

Redis executes Lua scripts atomically. Other Redis commands cannot interleave with the script while it is executing.

This ensures that the counter update and limit check are performed as one atomic operation.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend framework |
| Redis | Centralized counter storage |
| Lua | Atomic Redis operations |
| Docker | Redis containerization |
| Artillery | Load and performance testing |
| Git | Version control |
| GitHub | Source code hosting |

---

## Project Structure

```text
distributed-rate-limiter/
│
├── node_modules/
│
├── .env
├── .gitignore
│
├── server.js
├── redis.js
│
├── rateLimiter.js
├── rateLimiter.lua
│
├── load-test.yml
├── load-test-server2.yml
│
├── run-both-tests.ps1
│
├── package.json
├── package-lock.json
│
└── README.md
```

### File Responsibilities

| File | Responsibility |
|---|---|
| `server.js` | Express application and API routes |
| `redis.js` | Redis client configuration and connection |
| `rateLimiter.js` | Rate-limiting middleware |
| `rateLimiter.lua` | Atomic Redis rate-limiting logic |
| `load-test.yml` | Artillery configuration for port 3000 |
| `load-test-server2.yml` | Artillery configuration for port 3001 |
| `run-both-tests.ps1` | Runs both load tests concurrently |
| `.env` | Environment configuration |
| `.gitignore` | Excludes files from Git tracking |

---

## Installation and Setup

### Prerequisites

Install the following tools before running the project:

- Node.js and npm
- Docker Desktop
- Git
- Artillery

Redis runs inside a Docker container, so a separate local Redis installation is not required.

### 1. Clone the Repository

```bash
git clone https://github.com/KuldipUX/distributed-rate-limiter.git
```

Navigate to the project directory:

```bash
cd distributed-rate-limiter
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Redis Using Docker

Pull the Redis image:

```bash
docker pull redis
```

Create and start the Redis container:

```bash
docker run -d --name redis-server -p 6379:6379 redis
```

### 4. Verify Redis

Check running containers:

```bash
docker ps
```

Connect to Redis CLI:

```bash
docker exec -it redis-server redis-cli
```

Test the connection:

```redis
PING
```

Expected response:

```text
PONG
```

---

## Environment Configuration

Create a `.env` file in the root directory.

Add the following configuration:

```env
RATE_LIMIT=5
RATE_WINDOW=60
```

| Variable | Description | Default |
|---|---|---:|
| `RATE_LIMIT` | Maximum allowed requests | 5 |
| `RATE_WINDOW` | Rate-limit window in seconds | 60 |

The application loads these values using `dotenv`.

**Security:** The `.env` file is excluded through `.gitignore`. Never commit sensitive environment variables or credentials.

---

## Running the Application

The project supports multiple Express server instances.

### Terminal 1 — Start Server 1

```bash
node server.js
```

Expected output:

```text
Redis Connected Successfully!
Server running on port 3000
```

### Terminal 2 — Start Server 2

Open another terminal in the same project directory.

Run:

```powershell
$env:PORT=3001; node server.js
```

Expected output:

```text
Redis Connected Successfully!
Server running on port 3001
```

Both servers now run independently while sharing the same Redis database.

---

## API Endpoints

### 1. Health Check

**Endpoint:**

```http
GET /health
```

Checks whether the Express API is running.

Example response:

```json
{
  "message": "API is working",
  "status": "success"
}
```

### 2. Redis Test

**Endpoint:**

```http
GET /redis-test
```

Tests communication between the Express application and Redis by storing and retrieving a test value.

Expected response:

```text
Hello from Redis!
```

### 3. Rate-Limited Endpoint

**Endpoint:**

```http
GET /limited
```

This endpoint is protected by the rate-limiting middleware.

**Successful response — HTTP 200**

```json
{
  "message": "Request successful!",
  "status": "allowed"
}
```

**Rate limit exceeded — HTTP 429**

```json
{
  "success": false,
  "message": "Too many requests. Please try again later."
}
```

**Redis unavailable — HTTP 503**

```json
{
  "success": false,
  "message": "Rate limiter service temporarily unavailable."
}
```

---

## Load Testing

Artillery is used to generate concurrent HTTP requests and evaluate the rate limiter.

### Install Artillery

```bash
npm install -g artillery
```

Verify installation:

```bash
artillery --version
```

### Test Server 1

```bash
artillery run load-test.yml
```

### Test Server 2

```bash
artillery run load-test-server2.yml
```

### Test Both Servers Simultaneously

The project includes a PowerShell script that starts both Artillery tests concurrently.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-both-tests.ps1
```

The script runs both load tests against separate Express instances.

This allows us to verify whether requests received by both servers contribute to the same Redis counter.

---

## Redis Failure Handling

A distributed rate limiter depends on Redis to maintain centralized request counts.

If Redis becomes unavailable, the middleware must handle the failure gracefully.

This project implements error handling using `try...catch`.

When Redis operations fail:

- The application catches the Redis error.
- The error is logged on the server.
- The middleware returns HTTP 503.
- Internal error details are not exposed in the API response.

The implementation follows a **fail-closed approach**: requests are not allowed through when the rate-limiting service is unavailable.

This behavior was tested by stopping the Redis container while the Express servers were running.

---

## Test Results

The following results were observed during project testing.

### Concurrent Load Test

Both Artillery configurations were executed simultaneously.

| Metric | Server 1 | Server 2 | Combined |
|---|---:|---:|---:|
| Total requests | 100 | 100 | 200 |
| HTTP 200 | 2 | 3 | 5 |
| HTTP 429 | 98 | 97 | 195 |
| Failed requests | 0 | 0 | 0 |

### Observations

- Both servers received 100 requests.
- Only five requests were allowed in total.
- The remaining 195 requests were rejected.
- No failed requests were reported by Artillery.

These results demonstrate that both server instances share the same Redis-based request counter and enforce a common limit under concurrent load.

### Redis Failure Test

Redis was stopped while both Express servers were running.

The rate-limited endpoint returned:

```http
503 Service Unavailable
```

After Redis was restarted, both server instances successfully processed requests again.

---

## Limitations

The current implementation has some limitations:

- Uses a fixed-window algorithm, which can allow bursts around window boundaries.
- Uses client IP addresses as rate-limit identifiers.
- Does not currently implement user-based or API-key-based rate limiting.
- Does not include a distributed deployment or production orchestration setup.
- Does not currently expose detailed rate-limit headers such as `X-RateLimit-Remaining`.
- Has not been benchmarked under sustained production-scale traffic.

These are potential areas for further development.

---

## Future Improvements

Planned improvements include:

- Implement Sliding Window or Token Bucket algorithms.
- Add configurable rate limits for individual users and API keys.
- Add standard rate-limit response headers.
- Introduce Redis connection recovery and graceful shutdown handling.
- Add Docker Compose for easier multi-service setup.
- Add automated unit and integration tests.
- Introduce structured logging and monitoring.
- Add authentication and API-level access control.
- Evaluate performance under larger and sustained workloads.

---

## Learning Outcomes

Through this project, I explored and implemented:

- Distributed system fundamentals.
- Backend development using Node.js and Express.js.
- Redis integration and centralized state management.
- Atomic operations using Redis Lua scripting.
- Race conditions and concurrency control.
- Express middleware design.
- Fixed-window rate-limiting algorithms.
- Docker-based infrastructure setup.
- Concurrent load testing using Artillery.
- Error handling and service-failure scenarios.
- Git, GitHub, and SSH-based authentication.

---

## Author

**Kuldip Singh**

GitHub: [@KuldipUX](https://github.com/KuldipUX)

Project Repository: [Distributed Rate Limiter](https://github.com/KuldipUX/distributed-rate-limiter)

---

If you find this project useful, feel free to explore the repository and share your feedback.

**Built to understand distributed systems, one request at a time.**
