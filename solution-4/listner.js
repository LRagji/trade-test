const fs = require("fs");
const JSONBigIntNativeParser = require('json-bigint')({ useNativeBigInt: true });
const redisType = require("ioredis");
const brokerType = require('redis-streams-broker').StreamChannelBroker;
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const streamPublishKey = 'SINK';
const consumerGroupName = 'GRP1';
const consumerName = 'CON-' + Date.now();
const broker = new brokerType(redisClient, streamPublishKey);

async function listen() {
    const consumerGroup = await broker.joinConsumerGroup(consumerGroupName);
    await consumerGroup.subscribe(consumerName, processNotifications, 2000, 1000);
}

async function processNotifications(payload) {
    const processedCache = new Set();
    for (let index = 0; index < payload.length; index++) {
        try {
            const element = payload[index];
            const barKey = element.payload.UPDATE;
            if (!processedCache.has(barKey)) {
                const symbol = barKey.split('-')[0];
                const barNumber = BigInt(barKey.split('-')[1]);
                const openKey = `${barKey}-O`;
                const rangeKey = `${barKey}-HL`;
                const closeKey = `${barKey}-C`;
                const volumeKey = `${barKey}-V`;
                let barData = await redisClient.multi()
                    .get(openKey)
                    .zrange(rangeKey, 0, 1, 'WITHSCORES')
                    .get(closeKey)
                    .get(volumeKey)
                    .exec();
                const bar = {
                    "o": parseFloat(barData[0][1]),
                    "l": parseFloat(barData[1][1][1]),
                    "h": barData[1][1].length !== 4 ? parseFloat(barData[1][1][1]) : parseFloat(barData[1][1][3]),
                    "c": parseFloat(barData[2][1]),
                    "v": parseFloat(barData[3][1]),
                    "bar_num": barNumber,
                    "symbol": symbol
                };
                sinkDataToFile(bar);
            }
            await element.markAsRead(); //Payload is marked as delivered or Acked also optionaly the message can be dropped.
        }
        catch (exception) {
            console.error(exception);
        }
    }
}

function sinkDataToConsole(bar) {
    //Sinking data to console but can be sinked into WS is required.
    console.log(bar);
}

function sinkDataToFile(bar) {
    //Sinking data to File but can be sinked into WS is required.
    fs.appendFileSync(__dirname + "/../test/output/" + bar.symbol + ".txt", JSONBigIntNativeParser.stringify(bar) + '\r\n');
}

listen()
console.log(consumerName + " is active.");