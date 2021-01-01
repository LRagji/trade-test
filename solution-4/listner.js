const fs = require("fs");
const path = require('path');
const JSONBigIntNativeParser = require('json-bigint')({ useNativeBigInt: true });
const redisType = require("ioredis");
const brokerType = require('redis-streams-broker').StreamChannelBroker;
const defaultRedisConnectionString = "redis://127.0.0.1:6379/";
const redisClient = new redisType(defaultRedisConnectionString);
const streamPublishKey = 'SINK';
const consumerGroupName = 'GRP1';
const consumerName = 'CON-' + Date.now();
const broker = new brokerType(redisClient, streamPublishKey);
const debounceInterval = 2000;
const debounceMessagesCount = 2000;

async function listen() {
    const consumerGroup = await broker.joinConsumerGroup(consumerGroupName);
    await consumerGroup.subscribe(consumerName, processNotifications, debounceInterval, debounceMessagesCount);
    //NON-PROD Performance Monitoring
    setInterval(() => { redisClient.xlen(streamPublishKey, (err, data) => console.log("Pending Trades:" + data)) }, 10000)
}

async function processNotifications(payload) {
    const debounceCache = new Set();
    for (let index = 0; index < payload.length; index++) {
        try {
            const element = payload[index];
            const barKey = element.payload.UPDATE;
            if (!debounceCache.has(barKey)) {
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
                debounceCache.add(barKey);
            }
            await element.markAsRead(true); //Payload is marked as delivered or Acked also optionaly the message can be dropped.
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
    fs.appendFileSync(path.join(__dirname,process.argv[2], (bar.symbol + ".txt")), JSONBigIntNativeParser.stringify(bar) + '\r\n');
}

listen()
console.log(consumerName + " is active.");