# Distributed Rate Limiter

A distributed rate limiting system built using Node.js, Express.js, Redis, and Lua scripting.

This project implements a fixed-window rate limiting algorithm to control incoming API requests across multiple backend server instances.

By using Redis as a centralized data store and Lua scripts for atomic execution, the system ensures that multiple server instances share the same request limit.

## Key Features

- Distributed rate limiting across multiple server instances.
- Redis-based centralized request counting.
- Atomic operations using Redis Lua scripts.
- Fixed-window rate limiting algorithm.
- Configurable request limits and time windows.
- Graceful handling of Redis failures.
- Concurrent load testing using Artillery.
