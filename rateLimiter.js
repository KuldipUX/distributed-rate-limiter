require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { redisClient } = require('./redis');

const luaScript = fs.readFileSync(
    path.join(__dirname, 'rateLimiter.lua'),
    'utf8'
);

const LIMIT = Number(process.env.RATE_LIMIT) || 5;
const WINDOW = Number(process.env.RATE_WINDOW) || 60;
//console.log('Rate Limit:', LIMIT, 'Window:', WINDOW);
async function rateLimiter(req, res, next) {
     try {
    const ip = req.ip;
    const key = `rate_limit:${ip}`;

    const result = await redisClient.eval(luaScript, {
        keys: [key],
        arguments: [String(WINDOW), String(LIMIT)]
    });

    if (result === 0) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.'
        });
    }

        next();
    } catch (error) {
        console.error('Rate Limiter Error:', error);

        return res.status(503).json({
            success: false,
            message: 'Rate limiter service temporarily unavailable.'
        });
    }
}

module.exports = rateLimiter;