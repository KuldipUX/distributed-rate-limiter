const express = require('express');
const { connectRedis, redisClient } = require('./redis.js');
const rateLimiter = require('./rateLimiter');
const app = express();

const PORT = process.env.PORT || 3000;
async function startServer() {
    await connectRedis();

    app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
}

startServer();

app.get('/health', (req, res) => {
    res.status(200).json({
        message: 'API is working',
        status: 'success'
    });
});
app.get('/redis-test', async (req, res) => {
    await redisClient.set('test_message', 'Hello from Redis!');

    const value = await redisClient.get('test_message');

    res.send(value);
});

app.get('/limited', rateLimiter, (req, res) => {
    res.json({
        message: 'Request successful!',
        status: 'allowed'
    });
});