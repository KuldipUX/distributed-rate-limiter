const { createClient } = require('redis');

const redisClient = createClient({
    url: 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
    console.log('Redis Error:', err);
});

async function connectRedis() {
    await redisClient.connect();
    console.log('Redis Connected Successfully!');

    
}


module.exports = { redisClient, connectRedis };